"""Telnyx voice webhook verification orchestrator.

Implements verification strategy chain, rate limiting, IP allowlist,
and structured logging for the /api/telnyx/voice endpoint.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any

from config import settings
from telnyx.webhook import should_skip_verification, verify_ed25519, verify_hmac

logger = logging.getLogger(__name__)

# Rate limiter: per-IP failed verification attempts
# Sliding window 60s, max 10 failures before cooldown
_RATE_LIMIT_WINDOW_SEC = 60
_RATE_LIMIT_MAX_FAILURES = 10
_rate_limit_store: dict[str, list[float]] = {}
_rate_limit_lock = asyncio.Lock()


def get_client_ip(headers: dict[str, str], client_host: str | None) -> str:
    """Resolve client IP from X-Forwarded-For, X-Real-IP, or direct connection."""
    forwarded = headers.get("x-forwarded-for") or headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = headers.get("x-real-ip") or headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return client_host or "unknown"


def _parse_ids_from_body(raw_body: bytes) -> tuple[str | None, str | None]:
    """Best-effort extract webhook_id and call_id for structured logging."""
    try:
        body = json.loads(raw_body.decode("utf-8"))
        data = body.get("data") or {}
        payload = data.get("payload") or data
        webhook_id = data.get("id") or body.get("id")
        call_id = payload.get("call_control_id") or data.get("call_control_id")
        return (str(webhook_id) if webhook_id else None, str(call_id) if call_id else None)
    except Exception:
        return (None, None)


def _log_verification(
    outcome: str,
    strategy: str,
    client_ip: str,
    user_agent: str | None,
    webhook_id: str | None,
    call_id: str | None,
    missing_headers: list[str] | None = None,
) -> None:
    """Structured log for verification outcomes."""
    extra: dict[str, Any] = {
        "webhook_verification_outcome": outcome,
        "verification_strategy": strategy,
        "client_ip": client_ip,
        "user_agent": user_agent or "",
        "webhook_id": webhook_id,
        "call_id": call_id,
    }
    if missing_headers:
        extra["missing_headers"] = missing_headers

    if outcome == "success":
        logger.info(
            "Telnyx webhook verified: strategy=%s",
            strategy,
            extra=extra,
        )
    elif outcome == "skip_verification":
        logger.warning(
            "SECURITY: Telnyx webhook ACCEPTED without verification (TELNYX_SKIP_VERIFY=true, headers stripped). "
            "Use TELNYX_ALLOWED_IPS for defense-in-depth.",
            extra=extra,
        )
    else:
        logger.warning(
            "Telnyx webhook verification failed: strategy=%s outcome=%s",
            strategy,
            outcome,
            extra=extra,
        )


async def check_rate_limit(client_ip: str) -> bool:
    """
    Check if client IP is rate limited due to too many failed verification attempts.
    Returns True if over limit (should reject), False if OK to proceed.
    """
    async with _rate_limit_lock:
        now = time.time()
        timestamps = _rate_limit_store.get(client_ip, [])
        timestamps = [t for t in timestamps if now - t < _RATE_LIMIT_WINDOW_SEC]

        if len(timestamps) >= _RATE_LIMIT_MAX_FAILURES:
            return True

        _rate_limit_store[client_ip] = timestamps
        return False


def record_verification_failure(client_ip: str) -> None:
    """Record a failed verification attempt for rate limiting."""
    now = time.time()
    if client_ip not in _rate_limit_store:
        _rate_limit_store[client_ip] = []
    _rate_limit_store[client_ip].append(now)

    # Prune old entries
    _rate_limit_store[client_ip] = [
        t for t in _rate_limit_store[client_ip]
        if now - t < _RATE_LIMIT_WINDOW_SEC
    ]


def _get_allowed_ips() -> set[str]:
    """Parse TELNYX_ALLOWED_IPS into a set of stripped IPs."""
    raw = (settings.telnyx_allowed_ips or "").strip()
    if not raw:
        return set()
    return {ip.strip() for ip in raw.split(",") if ip.strip()}


@dataclass
class VerificationResult:
    """Result of webhook verification."""

    verified: bool
    strategy: str  # "ed25519" | "hmac" | "skip_verification" | rejection reason
    detail: str = ""  # Safe message for 403 response
    code: str = "webhook_verification_failed"


def verify_webhook_request(
    raw_body: bytes,
    ed25519_sig: str | None,
    timestamp: str | None,
    hmac_sig: str | None,
    client_ip: str,
    user_agent: str | None = None,
) -> VerificationResult:
    """
    Orchestrate webhook verification with precedence:

    1. Ed25519 (if headers present)
    2. Skip (if headers missing AND TELNYX_SKIP_VERIFY=true, optionally with IP allowlist)
    3. HMAC fallback (if TELNYX_WEBHOOK_SECRET and HMAC header present)
    4. Reject
    """
    webhook_id, call_id = _parse_ids_from_body(raw_body)
    ed25519_headers_present = bool(ed25519_sig and timestamp)

    # 0. Early accept when TELNYX_SKIP_VERIFY and no IP restrict (e.g. no TELNYX_PUBLIC_KEY)
    if settings.telnyx_skip_verify:
        allowed_ips = _get_allowed_ips()
        if not allowed_ips or client_ip in allowed_ips:
            _log_verification(
                "skip_verification",
                "skip_verification",
                client_ip,
                user_agent,
                webhook_id,
                call_id,
                missing_headers=["TELNYX_SKIP_VERIFY=true accepted"],
            )
            return VerificationResult(verified=True, strategy="skip_verification")

    # 1. Ed25519 verification
    if ed25519_headers_present and settings.telnyx_public_key:
        if verify_ed25519(
            raw_body,
            timestamp,
            ed25519_sig,
            settings.telnyx_public_key,
        ):
            _log_verification("success", "ed25519", client_ip, user_agent, webhook_id, call_id)
            return VerificationResult(verified=True, strategy="ed25519")

        # Ed25519 failed (e.g. body modified by Cloudflare/proxy)
        if settings.telnyx_skip_verify:
            allowed_ips = _get_allowed_ips()
            if allowed_ips and client_ip not in allowed_ips:
                _log_verification(
                    "rejected_ip_not_allowed",
                    "skip_verification",
                    client_ip,
                    user_agent,
                    webhook_id,
                    call_id,
                    missing_headers=["client_ip not in TELNYX_ALLOWED_IPS"],
                )
                return VerificationResult(
                    verified=False,
                    strategy="ip_not_in_allowlist",
                    detail="Webhook signature verification failed",
                    code="webhook_verification_failed",
                )
            _log_verification(
                "skip_verification",
                "skip_verification",
                client_ip,
                user_agent,
                webhook_id,
                call_id,
                missing_headers=["ed25519 failed; TELNYX_SKIP_VERIFY=true accepted"],
            )
            return VerificationResult(verified=True, strategy="skip_verification")

        _log_verification(
            "invalid_signature",
            "ed25519",
            client_ip,
            user_agent,
            webhook_id,
            call_id,
        )
        return VerificationResult(
            verified=False,
            strategy="invalid_ed25519",
            detail="Webhook signature verification failed",
            code="webhook_verification_failed",
        )

    # 2. Skip fallback: headers missing AND TELNYX_SKIP_VERIFY=true
    skip, reason = should_skip_verification(ed25519_headers_present, settings.telnyx_skip_verify)
    if skip:
        allowed_ips = _get_allowed_ips()
        if allowed_ips and client_ip not in allowed_ips:
            missing = ["telnyx-signature-ed25519", "telnyx-timestamp"]
            _log_verification(
                "rejected_ip_not_allowed",
                "skip_verification",
                client_ip,
                user_agent,
                webhook_id,
                call_id,
                missing_headers=missing,
            )
            return VerificationResult(
                verified=False,
                strategy="ip_not_in_allowlist",
                detail="Webhook signature verification failed",
                code="webhook_verification_failed",
            )

        # SECURITY: Verification bypassed because TELNYX_SKIP_VERIFY=true and Ed25519
        # headers were stripped by proxy. Use TELNYX_ALLOWED_IPS for defense-in-depth.
        missing = ["telnyx-signature-ed25519", "telnyx-timestamp"]
        _log_verification(
            "skip_verification",
            "skip_verification",
            client_ip,
            user_agent,
            webhook_id,
            call_id,
            missing_headers=missing,
        )
        return VerificationResult(verified=True, strategy="skip_verification")

    # 3. HMAC fallback
    if settings.telnyx_webhook_secret and hmac_sig:
        if verify_hmac(raw_body, hmac_sig, settings.telnyx_webhook_secret):
            _log_verification("success", "hmac", client_ip, user_agent, webhook_id, call_id)
            return VerificationResult(verified=True, strategy="hmac")

        _log_verification(
            "invalid_signature",
            "hmac",
            client_ip,
            user_agent,
            webhook_id,
            call_id,
        )
        return VerificationResult(
            verified=False,
            strategy="invalid_hmac",
            detail="Webhook signature verification failed",
            code="webhook_verification_failed",
        )

    # 4. Reject: no valid verification path
    missing = []
    if not ed25519_sig:
        missing.append("telnyx-signature-ed25519")
    if not timestamp:
        missing.append("telnyx-timestamp")
    if not hmac_sig and settings.telnyx_webhook_secret:
        missing.append("x-telnyx-signature (or t-signature)")

    _log_verification(
        "rejected_no_verification",
        "none",
        client_ip,
        user_agent,
        webhook_id,
        call_id,
        missing_headers=missing if missing else ["telnyx-signature-ed25519", "telnyx-timestamp"],
    )

    return VerificationResult(
        verified=False,
        strategy="headers_missing" if not ed25519_headers_present else "no_verification_configured",
        detail="Webhook signature verification failed",
        code="webhook_verification_failed",
    )
