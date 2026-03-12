"""PAYG and overage billing. Run on 1st of month before reset-usage."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import stripe

from supabase_client import create_service_role_client

logger = logging.getLogger(__name__)
MIN_INVOICE_CENTS = 500


def _get_previous_month_period() -> tuple[str, str]:
    now = datetime.utcnow()
    if now.month == 1:
        y, m = now.year - 1, 12
    else:
        y, m = now.year, now.month - 1
    from calendar import monthrange
    last_day = monthrange(y, m)[1]
    start = f"{y:04d}-{m:02d}-01"
    end = f"{y:04d}-{m:02d}-{last_day:02d}"
    return start, end


def invoice_payg_for_previous_month(supabase, stripe_mod) -> dict[str, int]:
    period_start, period_end = _get_previous_month_period()
    r = supabase.table("users").select("id, stripe_customer_id").eq("billing_plan", "subscription_payg").not_.is_("stripe_customer_id", "null").execute()
    users = r.data or []
    invoiced = skipped = errors = 0

    for u in users:
        customer_id = u.get("stripe_customer_id")
        if not customer_id:
            continue
        existing = supabase.table("billing_invoices").select("stripe_invoice_id").eq("user_id", u["id"]).eq("period_start", period_start).eq("invoice_type", "payg").limit(1).execute()
        if existing.data and len(existing.data) > 0:
            skipped += 1
            continue

        usage = supabase.table("call_usage").select("payg_minutes, billed_minutes, duration_seconds").eq("user_id", u["id"]).gte("ended_at", f"{period_start}T00:00:00.000Z").lte("ended_at", f"{period_end}T23:59:59.999Z").execute()
        rows = usage.data or []
        total_minutes = sum(
            float(r.get("payg_minutes") or r.get("billed_minutes") or (r.get("duration_seconds") or 0) / 60)
            for r in rows
        )
        if total_minutes <= 0:
            skipped += 1
            continue

        subtotal = int(total_minutes * 20) + (1 if total_minutes * 20 % 1 else 0)
        amount_cents = max(MIN_INVOICE_CENTS, subtotal)
        try:
            inv = stripe_mod.Invoice.create(
                customer=customer_id,
                collection_method="charge_automatically",
                description=f"PAYG minutes {period_start} to {period_end}",
                metadata={"userId": u["id"], "period_start": period_start},
            )
            stripe_mod.InvoiceItem.create(
                customer=customer_id,
                amount=amount_cents,
                currency="usd",
                description=f"Pay As You Go ({total_minutes:.1f} min @ $0.20/min)",
                invoice=inv.id,
            )
            stripe_mod.Invoice.finalize_invoice(inv.id)
            supabase.table("billing_invoices").insert({
                "user_id": u["id"],
                "period_start": period_start,
                "invoice_type": "payg",
                "stripe_invoice_id": inv.id,
            }).execute()
            invoiced += 1
        except Exception as e:
            logger.error("[usageBilling] PAYG invoice failed: user=%s error=%s", u["id"], e)
            errors += 1
    return {"invoiced": invoiced, "skipped": skipped, "errors": errors}


def invoice_overage_for_fixed_plans(supabase, stripe_mod) -> dict[str, int]:
    period_start, period_end = _get_previous_month_period()
    r = supabase.table("user_plans").select("user_id, allocated_inbound_minutes, allocated_outbound_minutes, used_inbound_minutes, used_outbound_minutes, overage_rate_cents").not_.is_("allocated_inbound_minutes", "null").execute()
    plans = r.data or []
    invoiced = skipped = errors = 0

    for p in plans:
        alloc = (p.get("allocated_inbound_minutes") or 0) + (p.get("allocated_outbound_minutes") or 0)
        used = float(p.get("used_inbound_minutes") or 0) + float(p.get("used_outbound_minutes") or 0)
        overage = max(0, used - alloc)
        if overage <= 0:
            skipped += 1
            continue

        ur = supabase.table("users").select("stripe_customer_id").eq("id", p["user_id"]).limit(1).execute()
        customer_id = (ur.data[0].get("stripe_customer_id") if ur.data else None)
        if not customer_id:
            skipped += 1
            continue

        existing = supabase.table("billing_invoices").select("stripe_invoice_id").eq("user_id", p["user_id"]).eq("period_start", period_start).eq("invoice_type", "overage").limit(1).execute()
        if existing.data and len(existing.data) > 0:
            skipped += 1
            continue

        rate = p.get("overage_rate_cents") or 25
        subtotal = int(overage * rate) + (1 if (overage * rate) % 1 else 0)
        amount_cents = max(MIN_INVOICE_CENTS, subtotal)
        try:
            inv = stripe_mod.Invoice.create(
                customer=customer_id,
                collection_method="charge_automatically",
                description=f"Overage minutes {period_start} to {period_end}",
                metadata={"userId": p["user_id"], "period_start": period_start},
            )
            stripe_mod.InvoiceItem.create(
                customer=customer_id,
                amount=amount_cents,
                currency="usd",
                description=f"Overage ({overage:.1f} min @ ${rate/100:.2f}/min)",
                invoice=inv.id,
            )
            stripe_mod.Invoice.finalize_invoice(inv.id)
            supabase.table("billing_invoices").insert({
                "user_id": p["user_id"],
                "period_start": period_start,
                "invoice_type": "overage",
                "stripe_invoice_id": inv.id,
            }).execute()
            invoiced += 1
        except Exception as e:
            logger.error("[usageBilling] Overage invoice failed: user=%s error=%s", p["user_id"], e)
            errors += 1
    return {"invoiced": invoiced, "skipped": skipped, "errors": errors}
