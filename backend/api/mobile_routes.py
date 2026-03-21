"""Mobile API routes: auth, push, Stripe, receptionists, settings."""

from __future__ import annotations

import hmac
import hashlib
import logging
import re
import time
from datetime import datetime
from typing import Any

import httpx
import stripe
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

from api.auth import get_user_from_request
from voice_presets import (
    DEFAULT_PRESET_KEY,
    PRESET_KEYS,
    PREVIEW_SAMPLE_TEXT,
    get_preset,
    infer_preset_key_from_voice_id,
    list_presets_for_api,
    resolve_voice_id,
    resolve_tts_voice,
)
from voice.elevenlabs_client import text_to_speech_preview
from voice.tts_facade import google_preview_mp3
from config import settings
from google_oauth_scopes import SCOPES
from prompts.fetch import _build_from_supabase_sync
from quota import check_outbound_quota
from stripe_plans import get_price_id_for_plan_id, plan_from_subscription
from supabase_client import create_service_role_client
from telnyx import provision as telnyx_provision
from utils.phone import normalize_to_e164

from api.mobile.dashboard import router as dashboard_router
from api.mobile.settings import router as settings_router

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mobile", tags=["mobile"])
router.include_router(dashboard_router)
router.include_router(settings_router)


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


# --- Voice presets (receptionist voice selection) ---
@router.get("/voice-presets")
async def list_voice_presets(request: Request):
    """Return curated voice presets for receptionist creation/settings. No raw voice_id exposed."""
    user, _ = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return {"presets": list_presets_for_api()}


@router.get("/voice-presets/{key}/preview")
async def voice_preset_preview(request: Request, key: str):
    """Return short preview audio for a voice preset. Requires auth. Lightweight on-demand generation."""
    user, _ = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    preset = get_preset(key)
    if not preset:
        return JSONResponse({"error": "Preset not found"}, status_code=404)
    tts_provider = (settings.tts_provider or "elevenlabs").strip().lower()
    try:
        if tts_provider == "google":
            rv = resolve_tts_voice(key, None)
            audio_bytes = await google_preview_mp3(PREVIEW_SAMPLE_TEXT, rv)
        else:
            api_key = (settings.elevenlabs_api_key or "").strip()
            if not api_key:
                return JSONResponse({"error": "Voice preview not configured"}, status_code=503)
            audio_bytes = await text_to_speech_preview(
                text=PREVIEW_SAMPLE_TEXT,
                voice_id=preset["voice_id"],
                api_key=api_key,
                model_id=preset.get("model_id") or "eleven_flash_v2_5",
            )
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        logger.warning("[voice-presets/preview] %s: %s", key, e)
        return JSONResponse({"error": "Preview failed"}, status_code=502)


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
            scopes=SCOPES,
            redirect_uri=redirect_uri,
            # IMPORTANT: We want pure server-side OAuth for this flow (no PKCE).
            # PKCE requires persisting the code_verifier across request/callback, which we do not do.
            autogenerate_code_verifier=False,
        )
        # Sign state so callback cannot be tricked into associating tokens with wrong user (CSRF).
        timestamp = int(time.time())
        payload = f"{user['id']}:{return_to}:{timestamp}"
        secret = (settings.google_oauth_state_secret or settings.supabase_service_role_key or "").encode("utf-8")
        if not secret:
            logger.error("[google-auth-url] Google OAuth state secret not configured (set GOOGLE_OAUTH_STATE_SECRET or SUPABASE_SERVICE_ROLE_KEY)")
            return JSONResponse({"error": "Server configuration error"}, status_code=500)
        signature = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        state = f"{payload}.{signature}"
        url, _ = flow.authorization_url(
            access_type="offline",
            prompt="consent",
            state=state,
        )
        # Debug: confirm redirect URI and whether PKCE is enabled (it should NOT be)
        pkce_enabled = bool(getattr(flow, "code_verifier", None))
        logger.info(
            "[google-auth-url] redirect_uri=%r pkce_enabled=%s return_to=%s scopes=%s",
            redirect_uri,
            pkce_enabled,
            return_to,
            " ".join(SCOPES),
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
        return JSONResponse(
            {"error": "Invalid plan. Choose starter, growth, pro, business, or payg (configure STRIPE_PRICE_* in env)."},
            status_code=400,
        )

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
    service_list = body.get("services") or []
    extra_instructions = (body.get("extra_instructions") or "").strip() or None
    system_prompt = (body.get("system_prompt") or "").strip() or None
    greeting = (body.get("greeting") or "").strip() or None
    raw_voice_id = (body.get("voice_id") or "").strip() or None  # legacy/admin only
    voice_preset_key = (body.get("voice_preset_key") or "").strip() or None

    # Validate/coerce preset key:
    # - valid key -> use it
    # - invalid key -> default preset (avoid silent/surprising behavior)
    # - missing key -> legacy path (keep raw voice_id if provided)
    if voice_preset_key and voice_preset_key not in PRESET_KEYS:
        voice_preset_key = DEFAULT_PRESET_KEY

    voice_id = resolve_voice_id(voice_preset_key, raw_voice_id)
    if not voice_id:
        return JSONResponse({"error": "Voice configuration missing"}, status_code=400)

    # Ensure mobile-created records always store a preset key.
    # But if caller supplied a raw voice_id (admin/legacy), don't stamp a potentially-wrong preset label.
    if not voice_preset_key and not raw_voice_id:
        voice_preset_key = DEFAULT_PRESET_KEY
    assistant_identity = (body.get("assistant_identity") or "").strip() or None
    promotions = (body.get("promotions") or body.get("promos") or "").strip()
    mode = (body.get("mode") or "personal").strip().lower()
    if mode not in ("personal", "business"):
        mode = "personal"

    insert_data = {
        "user_id": user["id"],
        "name": name,
        "phone_number": inbound_number,
        "inbound_phone_number": inbound_number,
        "telnyx_phone_number_id": telnyx_id,
        "telnyx_phone_number": telnyx_phone or inbound_number,
        "calendar_id": calendar_id,
        "status": "active",
        "mode": mode,
        "extra_instructions": extra_instructions,
        "system_prompt": system_prompt,
        "greeting": greeting,
        "voice_id": voice_id,
        "voice_preset_key": voice_preset_key,
        "assistant_identity": assistant_identity,
    }
    try:
        logger.info("[receptionists/create] receptionist insert starting for user_id=%s name=%s", user["id"], name)
        # Supabase Python sync client does not support .insert(...).select(...); insert then get id from response or follow-up query
        insert_resp = supabase.table("receptionists").insert(insert_data).execute()
        rec_id = None
        if insert_resp.data and len(insert_resp.data) > 0:
            rec_id = insert_resp.data[0].get("id") if isinstance(insert_resp.data[0], dict) else getattr(insert_resp.data[0], "id", None)
        if not rec_id:
            # Fallback: fetch by unique fields for this request
            fetch = (
                supabase.table("receptionists")
                .select("id")
                .eq("user_id", user["id"])
                .eq("name", name)
                .eq("calendar_id", calendar_id)
                .eq("inbound_phone_number", inbound_number)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if fetch.data and len(fetch.data) > 0:
                rec_id = fetch.data[0].get("id") if isinstance(fetch.data[0], dict) else getattr(fetch.data[0], "id", None)
        logger.info(
            "[receptionists/create] insert response type=%s has_data=%s rec_id=%s",
            type(insert_resp).__name__,
            bool(insert_resp.data),
            rec_id,
        )
        if not rec_id:
            if telnyx_id and phone_strategy != "own":
                try:
                    telnyx_provision.release_number(telnyx_id)
                except Exception:
                    pass
            logger.warning("[receptionists/create] failed to resolve rec_id after insert")
            return JSONResponse({"error": "Failed to create receptionist"}, status_code=500)

        logger.info(
            "[receptionists/create] voice resolved rec_id=%s preset_key=%s voice_id=%s",
            rec_id,
            voice_preset_key,
            voice_id,
        )

        staff_done = False
        for s in staff_list:
            sn = (s.get("name") or "").strip()
            if sn:
                supabase.table("staff").insert({
                    "receptionist_id": rec_id,
                    "name": sn,
                    "role": (s.get("description") or "").strip() or None,
                    "is_active": True,
                }).execute()
                staff_done = True
        services_done = False
        for svc in service_list:
            nm = (svc.get("name") or "").strip()
            if not nm:
                continue
            desc = (svc.get("description") or "").strip() or None
            dur = svc.get("duration_minutes")
            price_cents = svc.get("price_cents")
            requires_location = bool(svc.get("requires_location"))
            default_location_type = (svc.get("default_location_type") or "").strip() or None
            try:
                dur_val = int(dur) if dur is not None else 0
            except (TypeError, ValueError):
                dur_val = 0
            try:
                price_val = int(price_cents) if price_cents is not None else 0
            except (TypeError, ValueError):
                price_val = 0
            row = {
                "receptionist_id": rec_id,
                "name": nm,
                "description": desc,
                "duration_minutes": dur_val,
                "price_cents": price_val,
                "requires_location": requires_location,
                "default_location_type": default_location_type,
            }
            supabase.table("services").insert(row).execute()
            services_done = True
        promos_done = False
        if promotions:
            supabase.table("promos").insert({"receptionist_id": rec_id, "description": promotions, "code": "WIZARD"}).execute()
            promos_done = True

        supabase.table("users").update({
            "onboarding_completed_at": datetime.utcnow().isoformat() + "Z",
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }).eq("id", user["id"]).is_("onboarding_completed_at", "null").execute()

        logger.info(
            "[receptionists/create] success rec_id=%s staff_ran=%s services_ran=%s promos_ran=%s",
            rec_id, staff_done, services_done, promos_done,
        )
        return {"success": True, "id": rec_id, "phoneNumber": inbound_number}
    except Exception as e:
        if telnyx_id and phone_strategy != "own":
            try:
                telnyx_provision.release_number(telnyx_id)
            except Exception:
                pass
        logger.exception("[receptionists/create] failure: %s", e)
        logger.info("[receptionists/create] final result: failure reason=%s", str(e))
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
        "id, name, phone_number, inbound_phone_number, calendar_id, status, mode, "
        "website_url, extra_instructions, payment_settings, created_at, "
        "system_prompt, greeting, voice_id, voice_preset_key, assistant_identity"
    ).eq("id", receptionist_id).single().execute()
    if not r.data:
        return JSONResponse({"error": "Receptionist not found"}, status_code=404)
    data = r.data
    if not (data.get("voice_preset_key") or "").strip():
        inferred = infer_preset_key_from_voice_id((data.get("voice_id") or "").strip() or None)
        if inferred:
            data["voice_preset_key"] = inferred
    return data


@router.get("/receptionists/{receptionist_id}/calendar-status")
async def receptionist_calendar_status(request: Request, receptionist_id: str):
    """Return calendar connection details for a given receptionist."""
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    err = _assert_receptionist_ownership(receptionist_id, user["id"], supabase)
    if err:
        return JSONResponse({"error": err}, status_code=404)

    rec = (
        supabase.table("receptionists")
        .select("id, name, user_id, calendar_id, mode")
        .eq("id", receptionist_id)
        .single()
        .execute()
    )
    if not rec.data:
        return JSONResponse({"error": "Receptionist not found"}, status_code=404)

    rec_data = rec.data or {}
    owner_id = rec_data.get("user_id") or user["id"]

    user_row = (
        supabase.table("users")
        .select("email, calendar_id, calendar_refresh_token")
        .eq("id", owner_id)
        .single()
        .execute()
    )
    u = user_row.data or {}

    connected_email = u.get("calendar_id") or u.get("email")
    booking_calendar_id = (rec_data.get("calendar_id") or u.get("calendar_id") or "primary").strip()
    mode = (rec_data.get("mode") or "personal").strip()

    # For now, label is just the ID; can be enhanced later by querying Google Calendar list.
    booking_calendar_label = booking_calendar_id

    return {
        "connected_google_email": connected_email,
        "booking_calendar_id": booking_calendar_id,
        "booking_calendar_label": booking_calendar_label,
        "mode": mode,
        "assistant_name": rec_data.get("name"),
        "calendar_connected": bool(u.get("calendar_refresh_token")),
    }


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
    if "voice_preset_key" in body:
        preset_key = (body.get("voice_preset_key") or "").strip() or None
        if preset_key:
            if preset_key not in PRESET_KEYS:
                preset_key = DEFAULT_PRESET_KEY
            resolved = resolve_voice_id(preset_key, None)
            updates["voice_preset_key"] = preset_key
            if resolved is not None:
                updates["voice_id"] = resolved
        else:
            # Explicitly clearing preset label should not swap voices.
            updates["voice_preset_key"] = None
    elif "voice_id" in body:
        updates["voice_id"] = (body["voice_id"] or "").strip() or None
    if "assistant_identity" in body:
        updates["assistant_identity"] = (body["assistant_identity"] or "").strip() or None

    if len(updates) <= 1:
        return {"ok": True}
    supabase.table("receptionists").update(updates).eq("id", receptionist_id).execute()
    if "voice_preset_key" in updates or "voice_id" in updates:
        logger.info(
            "[receptionists/update] voice resolved rec_id=%s preset_key=%s voice_id=%s",
            receptionist_id,
            updates.get("voice_preset_key"),
            updates.get("voice_id"),
        )
    return {"ok": True}


@router.post("/receptionists/{receptionist_id}/delete")
async def delete_receptionist(request: Request, receptionist_id: str):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    err = _assert_receptionist_ownership(receptionist_id, user["id"], supabase)
    if err:
        return JSONResponse({"error": err}, status_code=404)

    rec = (
        supabase.table("receptionists")
        .select("telnyx_phone_number_id, inbound_phone_number, status, deleted_at, active")
        .eq("id", receptionist_id)
        .single()
        .execute()
    )
    data = rec.data or {}

    # Release Telnyx number if provisioned
    telnyx_id = data.get("telnyx_phone_number_id")
    if telnyx_id:
        try:
            telnyx_provision.release_number(telnyx_id)
        except Exception as ex:
            logger.warning("[delete] Failed to release Telnyx number: %s", ex)

    # Soft delete receptionist: keep history, hide from UI/routing
    now_iso = datetime.utcnow().isoformat() + "Z"
    updates: dict[str, object] = {
        "status": "paused",
        "active": False,
        "deleted_at": now_iso,
        "updated_at": now_iso,
    }
    supabase.table("receptionists").update(updates).eq("id", receptionist_id).execute()

    return {
        "success": True,
        "message": "Assistant deleted. Call history, usage records, and billing data are preserved.",
    }


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


## dashboard-summary and settings routes moved to api/mobile/*
