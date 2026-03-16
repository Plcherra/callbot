"""Mobile API routes: auth, push, Stripe, receptionists, settings."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any

import httpx
import stripe
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse

from api.auth import get_user_from_request
from config import settings
from prompts.fetch import _build_from_supabase_sync
from quota import check_outbound_quota
from stripe_plans import get_price_id_for_plan_id, plan_from_subscription
from supabase_client import create_service_role_client
from telnyx import provision as telnyx_provision
from utils.phone import normalize_to_e164

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mobile", tags=["mobile"])


def _require_auth(request: Request) -> tuple[dict | None, Any]:
    """Return (user, supabase). user is None if unauthorized."""
    user, supabase = get_user_from_request(request)
    if not user or not supabase:
        return (None, None)
    return (user, supabase)


# --- Push token ---
@router.post("/push-token")
async def push_token(request: Request):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    token = (body.get("token") or "").strip()
    if not token:
        return JSONResponse({"error": "token required"}, status_code=400)

    try:
        supabase.table("user_push_tokens").upsert(
            {"user_id": user["id"], "token": token, "updated_at": datetime.utcnow().isoformat() + "Z"},
            on_conflict="user_id",
        ).execute()
        return {"success": True}
    except Exception as e:
        logger.exception("[push-token] %s", e)
        return JSONResponse({"error": "Failed to register token"}, status_code=500)


# --- Sync session (Stripe Checkout session_id) ---
@router.post("/sync-session")
async def sync_session(request: Request):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    session_id = (body.get("session_id") or "").strip()
    if not session_id:
        return JSONResponse({"error": "session_id required"}, status_code=400)

    result = await _sync_subscription_from_session(session_id, user["id"])
    if result.get("error"):
        return JSONResponse({"synced": False, "error": result["error"]}, status_code=400)
    return {"synced": result.get("synced", True)}


async def _sync_subscription_from_session(session_id: str, user_id: str) -> dict:
    """Sync subscription from Stripe Checkout session."""
    sk = (settings.stripe_secret_key or "").strip()
    if not sk:
        return {"synced": False, "error": "Stripe not configured"}
    stripe.api_key = sk
    try:
        session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
        if session.payment_status != "paid" and session.status != "complete":
            return {"synced": False}
        customer_id = session.customer if isinstance(session.customer, str) else (session.customer.id if session.customer else None)
        meta_user_id = (session.metadata or {}).get("userId") or session.client_reference_id
        if not meta_user_id or str(meta_user_id) != str(user_id):
            return {"synced": False}
        updates = {
            "id": user_id,
            "stripe_customer_id": customer_id,
            "subscription_status": "active",
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }
        sub_id = session.subscription
        if sub_id:
            sub_obj = sub_id if hasattr(sub_id, "id") else stripe.Subscription.retrieve(sub_id, expand=["items.data.price"])
            updates["stripe_subscription_id"] = sub_obj.id if hasattr(sub_obj, "id") else str(sub_id)
            plan = plan_from_subscription(sub_obj)
            if plan:
                updates["billing_plan"] = plan["billing_plan"]
                updates["billing_plan_metadata"] = plan.get("billing_plan_metadata")
        supabase = create_service_role_client()
        supabase.table("users").upsert(updates, on_conflict="id").execute()
        return {"synced": True}
    except Exception as e:
        logger.exception("[sync-session] %s", e)
        return {"synced": False, "error": str(e)}


# --- Google Auth URL ---
@router.get("/google-auth-url")
async def google_auth_url(request: Request):
    user, _ = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    return_to = request.query_params.get("return_to", "dashboard")
    try:
        from google_auth_oauthlib.flow import Flow
        redirect_uri = settings.get_google_redirect_uri()
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [redirect_uri],
                }
            },
            scopes=[
                "https://www.googleapis.com/auth/calendar",
                "https://www.googleapis.com/auth/calendar.events",
                "email",
                "profile",
            ],
            redirect_uri=redirect_uri,
            # IMPORTANT: We want pure server-side OAuth for this flow (no PKCE).
            # PKCE requires persisting the code_verifier across request/callback, which we do not do.
            autogenerate_code_verifier=False,
        )
        state = f"{user['id']}:{return_to}" if return_to else user["id"]
        url, _ = flow.authorization_url(
            access_type="offline",
            prompt="consent",
            state=state,
        )
        # Debug: confirm redirect URI and whether PKCE is enabled (it should NOT be)
        pkce_enabled = bool(getattr(flow, "code_verifier", None))
        logger.info(
            "[google-auth-url] redirect_uri=%r pkce_enabled=%s return_to=%s",
            redirect_uri,
            pkce_enabled,
            return_to,
        )
        return {"url": url}
    except Exception as e:
        logger.exception("[google-auth-url] %s", e)
        return JSONResponse({"error": str(e)}, status_code=500)


# --- Checkout ---
@router.post("/checkout")
async def checkout(request: Request):
    user, _ = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    if not user.get("email"):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    plan_id = body.get("plan_id", "starter")
    return_scheme = body.get("return_scheme") or settings.mobile_redirect_scheme

    price_id = get_price_id_for_plan_id(plan_id) or get_price_id_for_plan_id("starter")
    if not price_id:
        return JSONResponse({"error": "Invalid plan. Choose starter, pro, or business."}, status_code=400)

    sk = (settings.stripe_secret_key or "").strip()
    if not sk:
        return JSONResponse({"error": "Stripe not configured"}, status_code=503)
    stripe.api_key = sk

    app_url = settings.get_app_url()
    success_url = f"{return_scheme}://checkout?session_id={{CHECKOUT_SESSION_ID}}" if return_scheme == "echodesk" else f"{app_url}/dashboard?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{return_scheme}://checkout?cancelled=1" if return_scheme == "echodesk" else f"{app_url}/dashboard"

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=user["email"],
            metadata={"userId": user["id"], "email": user["email"]},
            subscription_data={"metadata": {"userId": user["id"], "email": user["email"]}},
        )
        if not session.url:
            return JSONResponse({"error": "Could not create checkout session."}, status_code=500)
        return {"url": session.url}
    except Exception as e:
        logger.exception("[checkout] %s", e)
        return JSONResponse({"error": str(e)}, status_code=500)


# --- Billing portal ---
@router.post("/billing-portal")
async def billing_portal(request: Request):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        body = {}
    return_scheme = body.get("return_scheme") or settings.mobile_redirect_scheme

    row = supabase.table("users").select("stripe_customer_id").eq("id", user["id"]).single().execute()
    profile = (row.data or {}) if row.data else {}
    customer_id = profile.get("stripe_customer_id")
    if not customer_id:
        return JSONResponse({"error": "No billing account. Complete a subscription first."}, status_code=400)

    sk = (settings.stripe_secret_key or "").strip()
    if not sk:
        return JSONResponse({"error": "Stripe not configured"}, status_code=503)
    stripe.api_key = sk

    app_url = settings.get_app_url()
    return_url = f"{return_scheme}://settings" if return_scheme == "echodesk" else f"{app_url}/settings"

    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
        return {"url": session.url}
    except Exception as e:
        logger.exception("[billing-portal] %s", e)
        return JSONResponse({"error": str(e)}, status_code=500)


# --- Receptionists ---
def _assert_receptionist_ownership(receptionist_id: str, user_id: str, supabase) -> str | None:
    """Return None if ok, else error string."""
    r = supabase.table("receptionists").select("user_id").eq("id", receptionist_id).single().execute()
    if not r.data:
        return "Receptionist not found"
    if r.data.get("user_id") != user_id:
        return "Receptionist not found"
    return None


@router.post("/receptionists/create")
async def create_receptionist(request: Request):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    profile = supabase.table("users").select("subscription_status, calendar_refresh_token").eq("id", user["id"]).single().execute()
    p = (profile.data or {}) if profile.data else {}
    if p.get("subscription_status") != "active":
        return JSONResponse({"error": "Active subscription required."}, status_code=400)
    if not p.get("calendar_refresh_token"):
        return JSONResponse({"error": "Please connect Google Calendar first. Go to Settings → Integrations."}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    webhook_base = (settings.telnyx_webhook_base_url or settings.get_app_url()).strip().rstrip("/")
    if not webhook_base or "localhost" in webhook_base or "placeholder" in webhook_base.lower():
        return JSONResponse({"error": "TELNYX_WEBHOOK_BASE_URL must be set before provisioning."}, status_code=400)

    # Wizard or legacy
    phone_strategy = body.get("phone_strategy")
    if phone_strategy == "own":
        own_phone = (body.get("own_phone") or "").strip()
        if not own_phone:
            return JSONResponse({"error": "Phone number is required."}, status_code=400)
        e164 = normalize_to_e164(own_phone)
        if not e164:
            return JSONResponse({"error": "Enter phone in E.164 format (e.g. +15551234567)."}, status_code=400)
        provider_sid = (body.get("provider_sid") or "").strip()
        telnyx_id = provider_sid if provider_sid else None
        inbound_number = e164
        telnyx_phone = inbound_number
        if provider_sid:
            try:
                telnyx_provision.configure_voice_url(provider_sid, f"{webhook_base}/api/telnyx/voice")
            except Exception as ex:
                return JSONResponse({"error": f"Could not configure Telnyx: {ex}"}, status_code=400)
    else:
        area_code = body.get("area_code") or "212"
        if area_code == "other":
            area_code = "212"
        try:
            telnyx_id, telnyx_phone = telnyx_provision.provision_number(area_code)
            telnyx_provision.configure_voice_url(telnyx_id, f"{webhook_base}/api/telnyx/voice")
        except Exception as ex:
            return JSONResponse({"error": str(ex)}, status_code=400)
        inbound_number = telnyx_phone

    name = (body.get("name") or "").strip()
    calendar_id = (body.get("calendar_id") or "").strip()
    if not name:
        return JSONResponse({"error": "Name is required."}, status_code=400)
    if not calendar_id:
        return JSONResponse({"error": "Calendar ID is required."}, status_code=400)

    staff_list = body.get("staff") or []
    extra_instructions = (body.get("extra_instructions") or "").strip() or None
    system_prompt = (body.get("system_prompt") or "").strip() or None
    greeting = (body.get("greeting") or "").strip() or None
    voice_id = (body.get("voice_id") or "").strip() or None
    assistant_identity = (body.get("assistant_identity") or "").strip() or None
    promotions = (body.get("promotions") or body.get("promos") or "").strip()

    insert_data = {
        "user_id": user["id"],
        "name": name,
        "phone_number": inbound_number,
        "inbound_phone_number": inbound_number,
        "telnyx_phone_number_id": telnyx_id,
        "telnyx_phone_number": telnyx_phone or inbound_number,
        "calendar_id": calendar_id,
        "status": "active",
        "extra_instructions": extra_instructions,
        "system_prompt": system_prompt,
        "greeting": greeting,
        "voice_id": voice_id,
        "assistant_identity": assistant_identity,
    }
    try:
        row = supabase.table("receptionists").insert(insert_data).select("id").execute()
        rec_id = (row.data[0]["id"] if row.data and len(row.data) > 0 else None)
        if not rec_id:
            if telnyx_id and phone_strategy != "own":
                try:
                    telnyx_provision.release_number(telnyx_id)
                except Exception:
                    pass
            return JSONResponse({"error": "Failed to create receptionist"}, status_code=500)

        for s in staff_list:
            sn = (s.get("name") or "").strip()
            if sn:
                supabase.table("staff").insert({
                    "receptionist_id": rec_id,
                    "name": sn,
                    "role": (s.get("description") or "").strip() or None,
                    "is_active": True,
                }).execute()
        if promotions:
            supabase.table("promos").insert({"receptionist_id": rec_id, "description": promotions, "code": "WIZARD"}).execute()

        supabase.table("users").update({
            "onboarding_completed_at": datetime.utcnow().isoformat() + "Z",
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }).eq("id", user["id"]).is_("onboarding_completed_at", "null").execute()

        return {"success": True, "id": rec_id, "phoneNumber": inbound_number}
    except Exception as e:
        if telnyx_id and phone_strategy != "own":
            try:
                telnyx_provision.release_number(telnyx_id)
            except Exception:
                pass
        logger.exception("[receptionists/create] %s", e)
        return JSONResponse({"error": str(e)}, status_code=400)


@router.get("/receptionists/{receptionist_id}")
async def get_receptionist(request: Request, receptionist_id: str):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    err = _assert_receptionist_ownership(receptionist_id, user["id"], supabase)
    if err:
        return JSONResponse({"error": err}, status_code=404)

    r = supabase.table("receptionists").select(
        "id, name, phone_number, inbound_phone_number, calendar_id, status, "
        "website_url, extra_instructions, payment_settings, created_at, "
        "system_prompt, greeting, voice_id, assistant_identity"
    ).eq("id", receptionist_id).single().execute()
    if not r.data:
        return JSONResponse({"error": "Receptionist not found"}, status_code=404)
    return r.data


@router.patch("/receptionists/{receptionist_id}")
async def update_receptionist(request: Request, receptionist_id: str):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    err = _assert_receptionist_ownership(receptionist_id, user["id"], supabase)
    if err:
        return JSONResponse({"error": err}, status_code=404)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    updates = {"updated_at": datetime.utcnow().isoformat() + "Z"}
    if "payment_settings" in body:
        updates["payment_settings"] = body["payment_settings"]
    if "extra_instructions" in body:
        updates["extra_instructions"] = (body["extra_instructions"] or "").strip() or None
    if "system_prompt" in body:
        updates["system_prompt"] = (body["system_prompt"] or "").strip() or None
    if "greeting" in body:
        updates["greeting"] = (body["greeting"] or "").strip() or None
    if "voice_id" in body:
        updates["voice_id"] = (body["voice_id"] or "").strip() or None
    if "assistant_identity" in body:
        updates["assistant_identity"] = (body["assistant_identity"] or "").strip() or None

    if len(updates) <= 1:
        return {"ok": True}
    supabase.table("receptionists").update(updates).eq("id", receptionist_id).execute()
    return {"ok": True}


@router.post("/receptionists/{receptionist_id}/delete")
async def delete_receptionist(request: Request, receptionist_id: str):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    err = _assert_receptionist_ownership(receptionist_id, user["id"], supabase)
    if err:
        return JSONResponse({"error": err}, status_code=404)

    rec = supabase.table("receptionists").select("telnyx_phone_number_id").eq("id", receptionist_id).single().execute()
    telnyx_id = (rec.data or {}).get("telnyx_phone_number_id") if rec.data else None
    if telnyx_id:
        try:
            telnyx_provision.release_number(telnyx_id)
        except Exception as ex:
            logger.warning("[delete] Failed to release Telnyx number: %s", ex)
    supabase.table("receptionists").delete().eq("id", receptionist_id).execute()
    return {"success": True}


@router.post("/receptionists/{receptionist_id}/website")
async def receptionist_website(request: Request, receptionist_id: str):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    err = _assert_receptionist_ownership(receptionist_id, user["id"], supabase)
    if err:
        return JSONResponse({"error": err}, status_code=404)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    url = (body.get("url") or "").strip()
    if not url:
        return JSONResponse({"error": "Please enter a website URL."}, status_code=400)

    if not url.startswith("http://") and not url.startswith("https://"):
        return JSONResponse({"error": "Invalid URL."}, status_code=400)

    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; AIReceptionist/1.0)"}, follow_redirects=True)
            if r.status_code != 200:
                return JSONResponse({"error": f"Could not fetch: {r.status_code}"}, status_code=400)
            html = r.text
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    text = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", html, flags=re.I)
    text = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", text, flags=re.I)
    text = re.sub(r"<head[^>]*>[\s\S]*?</head>", "", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()[:15000]
    if not text:
        return JSONResponse({"error": "No text content could be extracted."}, status_code=400)

    supabase.table("receptionists").update({
        "website_url": url,
        "website_content": text,
        "website_content_updated_at": datetime.utcnow().isoformat() + "Z",
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }).eq("id", receptionist_id).execute()
    return {"ok": True}


@router.get("/receptionists/{receptionist_id}/call-history")
async def get_call_history(request: Request, receptionist_id: str):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    err = _assert_receptionist_ownership(receptionist_id, user["id"], supabase)
    if err:
        return JSONResponse({"error": err}, status_code=404)

    limit = min(int(request.query_params.get("limit", 50)), 100)
    offset = max(0, int(request.query_params.get("offset", 0)))

    try:
        rows = (
            supabase.table("call_logs")
            .select("id, call_control_id, from_number, to_number, direction, status, started_at, answered_at, ended_at, duration_seconds, cost_cents, transcript")
            .eq("receptionist_id", receptionist_id)
            .eq("status", "completed")
            .order("started_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        calls = rows.data if rows and rows.data is not None else []
        # Defensive: ensure each row has expected fields, coerce None duration
        safe_calls = []
        for r in (calls or []):
            safe = dict(r) if isinstance(r, dict) else {}
            if safe.get("duration_seconds") is None:
                safe["duration_seconds"] = 0
            safe_calls.append(safe)
        logger.info(
            "[CALL_DIAG] call-history receptionist_id=%s count=%s offset=%s",
            receptionist_id, len(safe_calls), offset,
        )
        return {"calls": safe_calls}
    except Exception as e:
        logger.exception("[CALL_DIAG] call-history failed: %s", e)
        return {"calls": []}


@router.get("/receptionists/{receptionist_id}/prompt-preview")
async def prompt_preview(request: Request, receptionist_id: str):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    err = _assert_receptionist_ownership(receptionist_id, user["id"], supabase)
    if err:
        return JSONResponse({"error": err}, status_code=404)

    try:
        prompt, greeting, _ = _build_from_supabase_sync(receptionist_id, supabase)
        compact = request.query_params.get("compact", "").lower() == "true"
        return {"prompt": prompt, "greeting": greeting, "charCount": len(prompt)}
    except Exception as e:
        logger.exception("[prompt-preview] %s", e)
        return JSONResponse({"error": str(e)}, status_code=400)


@router.get("/dashboard-summary")
async def dashboard_summary(request: Request):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    recs = supabase.table("receptionists").select("id").eq("user_id", user["id"]).execute()
    rec_ids = [r["id"] for r in (recs.data or [])] if recs and recs.data else []
    if not rec_ids:
        logger.info("[CALL_DIAG] dashboard-summary user_id=%s rec_count=0 (no receptionists)", user["id"])
        return {"total_calls": 0, "total_minutes": 0.0, "recent_calls": [], "usage_minutes_realtime": 0}

    # Real-time usage from user_plans (updated by CDR immediately; use when usage_snapshots not yet populated)
    usage_minutes_realtime = 0.0
    try:
        up = supabase.table("user_plans").select("used_inbound_minutes, used_outbound_minutes").eq("user_id", user["id"]).limit(1).execute()
        if up and up.data and len(up.data) > 0:
            row = up.data[0] if isinstance(up.data[0], dict) else {}
            inbound = float(row.get("used_inbound_minutes") or 0)
            outbound = float(row.get("used_outbound_minutes") or 0)
            usage_minutes_realtime = round(inbound + outbound, 2)
    except Exception as e:
        logger.debug("[dashboard-summary] user_plans read failed: %s", e)

    # Aggregate from call_logs via RPC (counts only status='completed')
    total_calls = 0
    total_seconds = 0
    try:
        rpc = supabase.rpc("get_dashboard_summary", {"p_user_id": user["id"]}).execute()
        raw = rpc.data if rpc else None
        if isinstance(raw, list) and len(raw) > 0:
            row = raw[0] if isinstance(raw[0], dict) else {}
        elif isinstance(raw, dict):
            row = raw
        else:
            row = {}
        total_calls = int(row.get("total_calls") or 0)
        total_seconds = int(row.get("total_seconds") or 0)
        logger.info(
            "[CALL_DIAG] dashboard-summary RPC user_id=%s total_calls=%s total_seconds=%s rec_count=%s",
            user["id"], total_calls, total_seconds, len(rec_ids),
        )
    except Exception as e:
        logger.warning("[CALL_DIAG] dashboard-summary RPC failed: %s", e)

    total_minutes = round(total_seconds / 60.0, 2) if total_seconds else 0.0

    recent_calls = []
    try:
        recent = (
            supabase.table("call_logs")
            .select("id, call_control_id, receptionist_id, from_number, to_number, direction, status, started_at, ended_at, duration_seconds")
            .in_("receptionist_id", rec_ids)
            .eq("status", "completed")
            .order("started_at", desc=True)
            .limit(10)
            .execute()
        )
        raw_recent = recent.data if recent and recent.data is not None else []
        for r in (raw_recent or []):
            safe = dict(r) if isinstance(r, dict) else {}
            if safe.get("duration_seconds") is None:
                safe["duration_seconds"] = 0
            recent_calls.append(safe)
    except Exception as e:
        logger.warning("[CALL_DIAG] dashboard-summary recent_calls failed: %s", e)

    return {
        "total_calls": total_calls,
        "total_minutes": total_minutes,
        "recent_calls": recent_calls,
        "usage_minutes_realtime": usage_minutes_realtime,
    }


# --- Settings ---
@router.post("/settings/business")
@router.patch("/settings/business")
async def settings_business(request: Request):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        body = {}
    business_name = (body.get("business_name") or "").strip() or None
    business_address = (body.get("business_address") or "").strip() or None

    supabase.table("users").update({
        "business_name": business_name,
        "business_address": business_address,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }).eq("id", user["id"]).execute()
    return {"success": True}


@router.post("/settings/plan-split")
async def settings_plan_split(request: Request):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    inbound_pct = body.get("inbound_percent")
    if isinstance(inbound_pct, str):
        try:
            inbound_pct = int(inbound_pct)
        except ValueError:
            inbound_pct = None
    if inbound_pct is None or not (0 <= inbound_pct <= 100):
        return JSONResponse({"error": "inbound_percent must be 0-100"}, status_code=400)

    existing = supabase.table("user_plans").select("allocated_inbound_minutes, allocated_outbound_minutes").eq("user_id", user["id"]).limit(1).execute()
    plan_row = existing.data[0] if existing.data and len(existing.data) > 0 else None
    if not plan_row:
        return JSONResponse({"error": "No plan found. Subscribe to a plan first."}, status_code=400)
    total = (plan_row.get("allocated_inbound_minutes") or 0) + (plan_row.get("allocated_outbound_minutes") or 0)
    outbound_pct = 100 - inbound_pct
    updates = {
        "inbound_percent": inbound_pct,
        "outbound_percent": outbound_pct,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    if total > 0:
        updates["allocated_inbound_minutes"] = int((total * inbound_pct) / 100)
        updates["allocated_outbound_minutes"] = total - updates["allocated_inbound_minutes"]
    supabase.table("user_plans").update(updates).eq("user_id", user["id"]).execute()
    return {"success": True}
