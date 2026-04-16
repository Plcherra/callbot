"""Minimal business CRUD for multi-location; mobile switcher can use active_business_id later."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from api.auth import get_user_from_request
from communication.ensure import ensure_business_communication

router = APIRouter()


def _require_auth(request: Request):
    user, supabase = get_user_from_request(request)
    if not user or not supabase:
        return None, None
    return user, supabase


@router.post("/businesses")
async def create_business(request: Request):
    """Create an additional business for the authenticated owner (multi-location)."""
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        body = {}
    name = (body.get("name") or "").strip() or None

    now = datetime.utcnow().isoformat() + "Z"
    ins = (
        supabase.table("businesses")
        .insert(
            {
                "owner_user_id": user["id"],
                "name": name,
                "mode": "solo",
                "created_at": now,
                "updated_at": now,
            }
        )
        .execute()
    )
    row = (ins.data or [None])[0]
    if not row:
        return JSONResponse({"error": "Could not create business"}, status_code=500)
    bid = str(row.get("id"))
    try:
        ensure_business_communication(supabase, bid)
    except Exception:
        pass
    return {"success": True, "id": row.get("id"), "name": row.get("name")}
