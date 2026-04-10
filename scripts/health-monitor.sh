#!/usr/bin/env bash
# Scan recent PM2 (or explicit) voice logs for EchoDesk health signals.
# Uses commit_id correlation: dispatch_started path=process implies TTS or terminal skip.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAIL_LINES="${TAIL_LINES:-12000}"
PM2_OUT_LOG="${PM2_OUT_LOG:-$HOME/.pm2/logs/callbot-voice-out.log}"
PM2_ERR_LOG="${PM2_ERR_LOG:-$HOME/.pm2/logs/callbot-voice-error.log}"
BOOKING_WARN_MS="${BOOKING_WARN_MS:-8000}"
BOOKING_FAST_WARN_MS="${BOOKING_FAST_WARN_MS:-3000}"

usage() {
  echo "Usage: $0 [--root DIR] [--tail N] [--out LOG] [--err LOG]"
  echo "  Env: TAIL_LINES, PM2_OUT_LOG, PM2_ERR_LOG, BOOKING_WARN_MS, BOOKING_FAST_WARN_MS"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --tail) TAIL_LINES="$2"; shift 2 ;;
    --out) PM2_OUT_LOG="$2"; shift 2 ;;
    --err) PM2_ERR_LOG="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

collect_logs() {
  local chunk=""
  if [[ -f "$PM2_OUT_LOG" ]]; then
    chunk+=$(tail -n "$TAIL_LINES" "$PM2_OUT_LOG" 2>/dev/null || true)
    chunk+=$'\n'
  else
    echo "Note: missing out log: $PM2_OUT_LOG" >&2
  fi
  if [[ -f "$PM2_ERR_LOG" ]]; then
    chunk+=$(tail -n "$TAIL_LINES" "$PM2_ERR_LOG" 2>/dev/null || true)
  fi
  printf '%s' "$chunk"
}

REPORT_PY="$ROOT/scripts/_health_monitor_report.py"
if [[ ! -f "$REPORT_PY" ]]; then
  echo "Missing $REPORT_PY" >&2
  exit 1
fi

PY="python3"
[[ -x "$ROOT/venv/bin/python" ]] && PY="$ROOT/venv/bin/python"

collect_logs | "$PY" "$REPORT_PY" \
  --booking-warn-ms "$BOOKING_WARN_MS" \
  --booking-fast-warn-ms "$BOOKING_FAST_WARN_MS"
