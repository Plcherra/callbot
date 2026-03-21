"""Internal admin: usage ledger and subscription invoices (INTERNAL_API_KEY)."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException

from config import settings
from supabase_client import create_service_role_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin/billing", tags=["admin-billing"])


def _require_internal(authorization: Optional[str]) -> None:
    key = (settings.internal_api_key or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="INTERNAL_API_KEY not configured")
    if (authorization or "") != f"Bearer {key}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/{user_id}/usage-ledger")
async def admin_usage_ledger(
    user_id: str,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    limit: int = 200,
):
    _require_internal(authorization)
    supabase = create_service_role_client()
    r = (
        supabase.table("usage_ledger")
        .select("*")
        .eq("user_id", user_id)
        .limit(min(max(1, limit), 1000))
        .execute()
    )
    rows = r.data or []
    rows.sort(key=lambda x: str(x.get("event_ts") or ""), reverse=True)
    return {"user_id": user_id, "entries": rows}


@router.get("/{user_id}/invoices")
async def admin_subscription_invoices(
    user_id: str,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    limit: int = 50,
):
    _require_internal(authorization)
    supabase = create_service_role_client()
    r = (
        supabase.table("subscription_invoices")
        .select("*")
        .eq("user_id", user_id)
        .limit(min(max(1, limit), 200))
        .execute()
    )
    inv = r.data or []
    inv.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
    return {"user_id": user_id, "invoices": inv}
