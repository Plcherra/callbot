from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from api.auth import get_user_from_request

router = APIRouter()


def _require_auth(request: Request) -> tuple[dict | None, object | None]:
    user, supabase = get_user_from_request(request)
    if not user or not supabase:
        return (None, None)
    return (user, supabase)


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

