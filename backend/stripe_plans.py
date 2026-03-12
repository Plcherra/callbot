"""Stripe plan mapping: price ID -> billing_plan. Used by webhook and checkout."""

from __future__ import annotations

import os
from typing import Any

PLAN_DEFS = [
    {"id": "starter", "env_key": "STRIPE_PRICE_STARTER", "included_minutes": 300, "per_minute_cents": 35, "billing_plan_id": "subscription_starter"},
    {"id": "pro", "env_key": "STRIPE_PRICE_PRO", "included_minutes": 800, "per_minute_cents": 30, "billing_plan_id": "subscription_pro"},
    {"id": "business", "env_key": "STRIPE_PRICE_BUSINESS", "included_minutes": 1500, "per_minute_cents": 25, "billing_plan_id": "subscription_business"},
    {"id": "enterprise", "env_key": "STRIPE_PRICE_ENTERPRISE", "included_minutes": 5000, "per_minute_cents": 20, "billing_plan_id": "subscription_enterprise"},
    {"id": "dev_test", "env_key": "STRIPE_PRICE_DEV_TEST", "included_minutes": 50, "per_minute_cents": 20, "billing_plan_id": "subscription_dev_test"},
    {"id": "payg", "env_key": "STRIPE_PRICE_PAYG", "included_minutes": 0, "per_minute_cents": 20, "billing_plan_id": "subscription_payg"},
]


def _get_price_to_plan_map() -> dict[str, dict[str, Any]]:
    out = {}
    for p in PLAN_DEFS:
        price_id = os.environ.get(p["env_key"], "").strip()
        if price_id:
            out[price_id] = {
                "billing_plan": p["billing_plan_id"],
                "billing_plan_metadata": {
                    "included_minutes": p["included_minutes"],
                    "per_minute_cents": p["per_minute_cents"],
                    "overage_rate_cents": 25,
                    "payg_rate_cents": 20,
                    "phone_extra_cents": 0,
                },
            }
    return out


def plan_from_subscription(subscription: Any) -> dict[str, Any] | None:
    """Resolve billing_plan and metadata from a Stripe subscription."""
    items = getattr(subscription, "items", None) or []
    data = getattr(items, "data", []) if hasattr(items, "data") else []
    price = data[0].price if data else None
    if not price:
        return None
    price_id = price.id if hasattr(price, "id") else str(price)
    if isinstance(price_id, str) and not price_id:
        return None

    m = _get_price_to_plan_map()
    if price_id in m:
        return m[price_id]

    # Fallback: Price metadata
    meta = getattr(price, "metadata", None) or {}
    plan = meta.get("plan")
    if not plan:
        return None
    result = {"billing_plan": str(plan), "billing_plan_metadata": {}}
    if meta.get("included_minutes") is not None:
        try:
            result["billing_plan_metadata"]["included_minutes"] = int(meta["included_minutes"])
        except (ValueError, TypeError):
            pass
    if meta.get("monthly_fee_cents") is not None:
        try:
            result["billing_plan_metadata"]["monthly_fee_cents"] = int(meta["monthly_fee_cents"])
        except (ValueError, TypeError):
            pass
    if meta.get("per_minute_cents") is not None:
        try:
            result["billing_plan_metadata"]["per_minute_cents"] = int(meta["per_minute_cents"])
        except (ValueError, TypeError):
            pass
    return result


def get_price_id_for_plan_id(plan_id: str) -> str | None:
    """Resolve Stripe price ID from plan id (e.g. starter, pro)."""
    for p in PLAN_DEFS:
        if p["id"] == plan_id:
            price_id = os.environ.get(p["env_key"], "").strip()
            if price_id:
                return price_id
            if plan_id == "starter":
                fallback = os.environ.get("STRIPE_PRICE_ID", "").strip()
                if fallback:
                    return fallback
    return None
