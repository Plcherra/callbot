"""Fetch receptionist prompt from cache or Supabase."""

from __future__ import annotations

import asyncio
from prompts.builder import build_receptionist_prompt

# In-memory prompt cache: call_control_id -> (prompt, greeting)
_prompt_cache: dict[str, tuple[str, str]] = {}

DEFAULT = (
    "You are an AI receptionist. Be helpful and concise.",
    "Hello! Thanks for calling. How can I help you today?",
)


def set_prompt(call_control_id: str, prompt: str, greeting: str) -> None:
    _prompt_cache[call_control_id] = (prompt, greeting)


def get_cached_prompt(call_control_id: str) -> tuple[str, str] | None:
    return _prompt_cache.get(call_control_id)


async def fetch_prompt(receptionist_id: str, supabase) -> tuple[str, str]:
    """Fetch prompt for receptionist from Supabase."""
    if not receptionist_id or not receptionist_id.strip():
        return DEFAULT
    return await asyncio.to_thread(_build_from_supabase_sync, receptionist_id, supabase)


def _build_from_supabase_sync(receptionist_id: str, supabase) -> tuple[str, str]:
    default = DEFAULT
    if not receptionist_id or not receptionist_id.strip():
        return default

    rec_res = supabase.table("receptionists").select(
        "id, name, phone_number, calendar_id, payment_settings, website_content, extra_instructions"
    ).eq("id", receptionist_id).execute()

    if not rec_res.data or len(rec_res.data) == 0:
        return default

    rec = rec_res.data[0]
    name = rec.get("name", "Receptionist")

    staff_res = supabase.table("staff").select("name, role, specialties").eq("receptionist_id", receptionist_id).order("name").execute()
    services_res = supabase.table("services").select("name, description, price_cents, duration_minutes, category").eq("receptionist_id", receptionist_id).execute()
    locations_res = supabase.table("locations").select("name, address, notes").eq("receptionist_id", receptionist_id).execute()
    promos_res = supabase.table("promos").select("description, code, discount_type, discount_value").eq("receptionist_id", receptionist_id).execute()
    rules_res = supabase.table("reminder_rules").select("type, content").eq("receptionist_id", receptionist_id).execute()

    staff = staff_res.data or []
    services = services_res.data or []
    locations = locations_res.data or []
    promos = promos_res.data or []
    reminder_rules = rules_res.data or []

    prompt = build_receptionist_prompt(
        name=name,
        phone_number=rec.get("phone_number", ""),
        calendar_id=rec.get("calendar_id", "primary") or "primary",
        staff=staff,
        services=services,
        locations=locations,
        promos=promos,
        reminder_rules=reminder_rules,
        payment_settings=rec.get("payment_settings"),
        website_content=rec.get("website_content"),
        extra_instructions=rec.get("extra_instructions"),
        compact=True,
    )
    greeting = f"Hello! Thanks for calling. I'm {name}. How can I help you today?"
    return prompt, greeting
