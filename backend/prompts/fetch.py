"""Fetch receptionist prompt from cache or Supabase."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from prompts.builder import build_receptionist_prompt

logger = logging.getLogger(__name__)

# In-memory prompt cache: call_control_id -> (prompt, greeting, voice_id | None)
_prompt_cache: dict[str, tuple[str, str, Optional[str]]] = {}

DEFAULT = (
    "You are an AI receptionist. Be helpful and concise.",
    "Hello! Thanks for calling. How can I help you today?",
    None,
)


def set_prompt(call_control_id: str, prompt: str, greeting: str, voice_id: Optional[str] = None) -> None:
    _prompt_cache[call_control_id] = (prompt, greeting, voice_id)


def get_cached_prompt(call_control_id: str) -> tuple[str, str, Optional[str]] | None:
    return _prompt_cache.get(call_control_id)


async def fetch_prompt(receptionist_id: str, supabase) -> tuple[str, str, Optional[str]]:
    """Fetch prompt for receptionist from Supabase. Returns (prompt, greeting, voice_id)."""
    if not receptionist_id or not receptionist_id.strip():
        return DEFAULT
    return await asyncio.to_thread(_build_from_supabase_sync, receptionist_id, supabase)


def _build_from_supabase_sync(receptionist_id: str, supabase) -> tuple[str, str, Optional[str]]:
    default = DEFAULT
    if not receptionist_id or not receptionist_id.strip():
        return default

    rec_res = supabase.table("receptionists").select(
        "id, name, user_id, phone_number, calendar_id, payment_settings, website_content, "
        "extra_instructions, system_prompt, greeting, voice_id, assistant_identity"
    ).eq("id", receptionist_id).execute()

    if not rec_res.data or len(rec_res.data) == 0:
        return default

    rec = rec_res.data[0]
    name = rec.get("name", "Receptionist")
    identity = (rec.get("assistant_identity") or "").strip() or name

    # Precedence: system_prompt if set, else generated
    custom_prompt = (rec.get("system_prompt") or "").strip()
    if custom_prompt:
        prompt = custom_prompt
        if (rec.get("extra_instructions") or "").strip():
            prompt += f"\n\nAdditional instructions from the business:\n{rec['extra_instructions'].strip()}"
    else:
        staff_res = supabase.table("staff").select("name, role, specialties").eq("receptionist_id", receptionist_id).order("name").execute()
        services_res = supabase.table("services").select("name, description, price_cents, duration_minutes, category, requires_location, default_location_type").eq("receptionist_id", receptionist_id).execute()
        locations_res = supabase.table("locations").select("name, address, notes").eq("receptionist_id", receptionist_id).execute()
        promos_res = supabase.table("promos").select("description, code, discount_type, discount_value").eq("receptionist_id", receptionist_id).execute()
        rules_res = supabase.table("reminder_rules").select("type, content").eq("receptionist_id", receptionist_id).execute()

        staff = staff_res.data or []
        services = services_res.data or []
        locations = locations_res.data or []
        promos = promos_res.data or []
        reminder_rules = rules_res.data or []

        prompt = build_receptionist_prompt(
            name=identity,
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

    # Precedence: greeting if set, else default with identity
    custom_greeting = (rec.get("greeting") or "").strip()
    if custom_greeting:
        greeting = custom_greeting
    else:
        user_id = rec.get("user_id")
        business_name = ""
        if user_id:
            try:
                user_res = supabase.table("users").select("business_name").eq("id", user_id).limit(1).execute()
                if user_res.data and user_res.data[0]:
                    business_name = (user_res.data[0].get("business_name") or "").strip()
            except Exception:
                pass
        if business_name:
            greeting = f"Hello! Thanks for calling {business_name}. I'm {identity}. How can I help you today?"
        else:
            greeting = f"Hello! Thanks for calling. I'm {identity}. How can I help you today?"

    # Precedence: voice_id if set, else None (caller uses env default)
    voice_id = (rec.get("voice_id") or "").strip() or None

    logger.info(
        "[receptionist config] receptionist_id=%s prompt_source=%s greeting_source=%s voice_id=%s assistant_identity=%s",
        receptionist_id,
        "custom" if custom_prompt else "generated",
        "custom" if custom_greeting else "default",
        "custom" if voice_id else "env_default",
        identity or "(name fallback)",
    )
    return prompt, greeting, voice_id
