"""Phone number utilities."""

from __future__ import annotations

import re

E164_REGEX = re.compile(r"^\+[1-9]\d{6,14}$")


def normalize_to_e164(phone: str) -> str | None:
    """Normalize phone string to E.164. Assumes US/CA (+1) for 10-digit."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone.strip())
    if len(digits) < 10:
        return None
    if digits.startswith("1") and len(digits) == 11:
        return f"+{digits}"
    if len(digits) == 10:
        return f"+1{digits}"
    return f"+{digits}"


def get_lookup_variants(phone: str) -> list[str]:
    """Get variants for DB lookup."""
    trimmed = (phone or "").strip()
    if not trimmed:
        return []
    variants = [trimmed]
    e164 = normalize_to_e164(trimmed)
    if e164:
        variants.append(e164)
    digits = re.sub(r"\D", "", trimmed)
    us10 = None
    if len(digits) == 10:
        us10 = digits
    elif len(digits) == 11 and digits.startswith("1"):
        us10 = digits[1:]
    if us10:
        variants.extend([f"+1{us10}", f"1{us10}"])
    return list(dict.fromkeys(variants))
