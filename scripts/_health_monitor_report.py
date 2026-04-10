#!/usr/bin/env python3
"""Stdin: concatenated log lines. Stdout: EchoDesk health report (text)."""
from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict

RE_ENQUEUE = re.compile(r"commit_enqueued commit_id=(\d+)")
RE_PROCESS = re.compile(r"\[TURN_GUARD\] dispatch_started path=process commit_id=(\d+)")
RE_CANCELLED = re.compile(r"dispatch_cancelled.*commit_id=(\d+)")
RE_SKIPPED = re.compile(r"dispatch_skipped reason=(\S+)\s+commit_id=(\d+)")
RE_TTS = re.compile(r"\[turn\] TTS started commit_id=(\d+)")
RE_BOOKING_END = re.compile(r"\[BOOKING_LATENCY\] turn_end total_ms=(\d+)(?:\s+.*fast_path=true)?")
RE_DELIVERY_FAILED = re.compile(r"delivery_failed", re.I)
RE_SMS_DOWNSTREAM = re.compile(r"sms_api_accepted_downstream_unknown")
RE_VERIFY_FAIL = re.compile(r"Telnyx webhook verification failed|webhook_verification_outcome", re.I)
RE_RECORDING_SAVED = re.compile(r"call\.recording\.saved|\[CALL_DIAG\] call\.recording\.saved", re.I)
RE_PIPELINE_ERR = re.compile(r"Pipeline error|\[voice/stream\] Pipeline error", re.I)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--log-sources",
        default="",
        help="Semicolon-separated log file paths actually read (stdin is still their concatenated content).",
    )
    p.add_argument("--booking-warn-ms", type=int, default=8000)
    p.add_argument("--booking-fast-warn-ms", type=int, default=3000)
    args = p.parse_args()
    text = sys.stdin.read()
    lines = text.splitlines()

    enqueued: set[int] = set()
    expecting_tts: dict[int, bool] = {}
    had_process: set[int] = set()
    had_tts: set[int] = set()
    booking_slow = 0
    booking_fast_slow = 0
    delivery_failed = 0
    sms_downstream = 0
    verify_fail = 0
    recording_saved = 0
    pipeline_err = 0
    stale_enqueue: set[int] = set()

    for line in lines:
        if RE_DELIVERY_FAILED.search(line):
            delivery_failed += 1
        if RE_SMS_DOWNSTREAM.search(line):
            sms_downstream += 1
        if RE_VERIFY_FAIL.search(line):
            verify_fail += 1
        if RE_RECORDING_SAVED.search(line):
            recording_saved += 1
        if RE_PIPELINE_ERR.search(line):
            pipeline_err += 1

        m = RE_BOOKING_END.search(line)
        if m:
            ms = int(m.group(1))
            is_fast = "fast_path=true" in line
            if is_fast and ms > args.booking_fast_warn_ms:
                booking_fast_slow += 1
            elif not is_fast and ms > args.booking_warn_ms:
                booking_slow += 1

        m = RE_ENQUEUE.search(line)
        if m:
            cid = int(m.group(1))
            enqueued.add(cid)
            stale_enqueue.add(cid)

        m = RE_CANCELLED.search(line)
        if m:
            cid = int(m.group(1))
            expecting_tts.pop(cid, None)
            stale_enqueue.discard(cid)

        m = RE_SKIPPED.search(line)
        if m:
            reason, cid_s = m.group(1), m.group(2)
            cid = int(cid_s)
            if reason in ("guard_reject", "low_confidence"):
                expecting_tts.pop(cid, None)
                stale_enqueue.discard(cid)
            elif reason in ("queued_for_after_processing", "queued_after_debounce"):
                pass

        m = RE_PROCESS.search(line)
        if m:
            cid = int(m.group(1))
            had_process.add(cid)
            expecting_tts[cid] = True
            stale_enqueue.discard(cid)

        m = RE_TTS.search(line)
        if m:
            cid = int(m.group(1))
            had_tts.add(cid)
            expecting_tts.pop(cid, None)
            stale_enqueue.discard(cid)

    critical: list[str] = []
    warnings: list[str] = []
    healthy: list[str] = []

    stuck = sorted(cid for cid, pending in expecting_tts.items() if pending)
    for cid in stuck:
        critical.append(
            f"commit_id={cid}: dispatch_started path=process but no matching "
            f"[turn] TTS started commit_id= and no terminal dispatch_skipped (guard/low) afterward "
            f"(user-spoke → no audible response — check this first)"
        )

    for cid in sorted(stale_enqueue):
        if cid not in had_process and cid not in had_tts:
            warnings.append(
                f"commit_id={cid}: commit_enqueued but no path=process in this window "
                f"(short log tail or turn still queued — not necessarily failure)"
            )

    if pipeline_err:
        critical.append(f"Pipeline / stream errors (lines matching pattern): {pipeline_err}")
    if verify_fail:
        warnings.append(f"Webhook verification failures (log hits): {verify_fail}")
    if delivery_failed:
        warnings.append(f"delivery_failed mentions: {delivery_failed}")
    if sms_downstream:
        warnings.append(f"sms_api_accepted_downstream_unknown: {sms_downstream}")
    if booking_slow:
        warnings.append(f"booking turn_end > {args.booking_warn_ms}ms (non-fast): {booking_slow}")
    if booking_fast_slow:
        warnings.append(
            f"booking turn_end > {args.booking_fast_warn_ms}ms (fast_path): {booking_fast_slow}"
        )

    healthy.append(f"commit_ids seen (enqueue): {len(enqueued)}")
    healthy.append(f"path=process seen: {len(had_process)}")
    healthy.append(f"TTS with commit_id seen: {len(had_tts)}")
    healthy.append(f"call.recording.saved (log hits): {recording_saved}")

    src = (args.log_sources or "").strip()
    if src:
        src_display = src.replace(";", " + ")
    else:
        src_display = "(paths unknown — pipe stdin only)"
    print("EchoDesk Health Report")
    print(f"Log files: {src_display}")
    print(f"Lines parsed: {len(lines)}")
    print()
    print("Critical")
    if critical:
        for item in critical:
            print(f"- {item}")
    else:
        print("- (none)")
    print()
    print("Warnings")
    if warnings:
        for item in warnings:
            print(f"- {item}")
    else:
        print("- (none)")
    print()
    print("Healthy / counts")
    for item in healthy:
        print(f"- {item}")
    print()
    print(
        "Note: dispatch_started path=process + dispatch_skipped guard_reject/low_confidence "
        "= valid terminal (no TTS). Queued skips are non-terminal until flush."
    )
    print(
        "Recording: flag rows with recording_status=processing older than ~15–30 min in Supabase "
        "(see RUNBOOK)."
    )


if __name__ == "__main__":
    main()
