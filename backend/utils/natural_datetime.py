"""Natural language date/time parsing utilities for calendar tools."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class ParsedDateTime:
    dt: datetime
    is_time_explicit: bool


def _now_in_tz(tz: str) -> datetime:
    return datetime.now(ZoneInfo(tz))


def parse_natural_datetime(
    date_text: str,
    *,
    timezone: str,
    now: Optional[datetime] = None,
) -> ParsedDateTime | None:
    """
    Parse a natural language date/time into a timezone-aware datetime.

    - Uses `timezone` as the business default.
    - Returns ParsedDateTime(dt, is_time_explicit) where is_time_explicit helps decide whether
      to treat the request as "a day" vs "a specific time".
    """
    text = (date_text or "").strip()
    if not text:
        return None

    # Lazy import: keeps app startup lighter and avoids hard dependency during unrelated tests.
    import dateparser

    base = now.astimezone(ZoneInfo(timezone)) if now else _now_in_tz(timezone)
    settings = {
        "TIMEZONE": timezone,
        "RETURN_AS_TIMEZONE_AWARE": True,
        "PREFER_DATES_FROM": "future",
        "RELATIVE_BASE": base,
    }
    dt = dateparser.parse(text, settings=settings)
    if not dt:
        # Some relative phrases parse more reliably with language hint.
        dt = dateparser.parse(text, settings=settings, languages=["en"])
        if not dt:
            # Heuristic for "next <weekday>" which dateparser may not parse reliably.
            t = text.lower().strip()
            if t.startswith("next "):
                rest = t[5:].strip()
                # Try parsing the weekday alone, then ensure it's at least 7 days ahead.
                wd = dateparser.parse(rest, settings=settings)
                if not wd:
                    wd = dateparser.parse(rest, settings=settings, languages=["en"])
                if wd:
                    if wd <= base:
                        # If it landed in the past, push a week.
                        wd = wd.replace(tzinfo=wd.tzinfo)  # keep tz
                    # Enforce 'next' semantics: at least 7 days in future from base.
                    from datetime import timedelta
                    while wd <= base or (wd - base) < timedelta(days=7):
                        wd = wd + timedelta(days=7)
                    dt = wd
            if not dt:
                return None

    # Heuristic: treat as explicit time if text contains typical time markers.
    t = text.lower()
    is_time_explicit = any(
        token in t
        for token in (
            "am",
            "pm",
            ":",
            " at ",
            " noon",
            " midnight",
            "morning",
            "afternoon",
            "evening",
            "tonight",
        )
    )
    return ParsedDateTime(dt=dt, is_time_explicit=is_time_explicit)

