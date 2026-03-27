"""In-process SMS delivery status by Telnyx message id (updated by webhooks; read by voice pipeline)."""

from __future__ import annotations

import re
import threading
from typing import Optional

_lock = threading.Lock()
_by_message_id: dict[str, str] = {}


def record_delivery_status(message_id: str, status: str) -> None:
    if not message_id:
        return
    with _lock:
        _by_message_id[message_id] = (status or "").strip().lower()


def get_delivery_status(message_id: str) -> Optional[str]:
    if not message_id:
        return None
    with _lock:
        return _by_message_id.get(message_id)


def is_us_toll_free_e164(number: str) -> bool:
    """Heuristic: US toll-free N11 starts with +1-8XX."""
    s = re.sub(r"\s+", "", (number or "").strip())
    if not s.startswith("+1"):
        return False
    digits = re.sub(r"\D", "", s[2:])
    if len(digits) != 10:
        return False
    return digits[0] == "8"
