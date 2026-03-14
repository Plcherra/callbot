"""Phone number utilities."""

from __future__ import annotations

import re

E164_REGEX = re.compile(r"^\+[1-9]\d{6,14}$")


def _digits_only(phone: str | None) -> str:
    """Strip to digits only."""
    if not phone:
        return ""
    return re.sub(r"\D", "", str(phone).strip())


def normalize_to_e164(phone: str) -> str | None:
    """Normalize phone string to E.164. Assumes US/CA (+1) for 10-digit."""
    if not phone:
        return None
    digits = _digits_only(phone)
    if len(digits) < 10:
        return None
    if digits.startswith("1") and len(digits) == 11:
        return f"+{digits}"
    if len(digits) == 10:
        return f"+1{digits}"
    return f"+{digits}"


def to_canonical_digits(phone: str | None) -> str:
    """
    Canonical form for comparison: digits only, US numbers normalized to 11 digits (1 + 10).
    Use this for matching incoming DID against stored receptionist numbers.
    """
    d = _digits_only(phone)
    if not d:
        return ""
    if len(d) == 10 and d.isdigit():
        return f"1{d}"
    if len(d) == 11 and d.startswith("1") and d[1:].isdigit():
        return d
    return d


def phones_match(a: str | None, b: str | None) -> bool:
    """True if both normalize to the same canonical digits."""
    ca = to_canonical_digits(a)
    cb = to_canonical_digits(b)
    if not ca or not cb:
        return False
    return ca == cb


def get_lookup_variants(phone: str) -> list[str]:
    """Get variants for DB lookup."""
    trimmed = (phone or "").strip()
    if not trimmed:
        return []
    variants = [trimmed]
    e164 = normalize_to_e164(trimmed)
    if e164:
        variants.append(e164)
    digits = _digits_only(trimmed)
    us10 = None
    if len(digits) == 10:
        us10 = digits
    elif len(digits) == 11 and digits.startswith("1"):
        us10 = digits[1:]
    if us10:
        variants.extend([f"+1{us10}", f"1{us10}", us10])
    return list(dict.fromkeys(variants))
