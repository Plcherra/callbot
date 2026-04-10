#!/usr/bin/env bash
# Scan recent PM2 (or explicit) voice logs for EchoDesk health signals.
# Uses commit_id correlation: dispatch_started path=process implies TTS or terminal skip.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAIL_LINES="${TAIL_LINES:-12000}"
PM2_LOG_DIR="${PM2_LOG_DIR:-$HOME/.pm2/logs}"
# Defaults match PM2 fork/instance logs (e.g. callbot-voice-out-0.log); override with PM2_OUT_LOG / PM2_ERR_LOG or --out / --err.
PM2_OUT_LOG="${PM2_OUT_LOG:-}"
PM2_ERR_LOG="${PM2_ERR_LOG:-}"
BOOKING_WARN_MS="${BOOKING_WARN_MS:-8000}"
BOOKING_FAST_WARN_MS="${BOOKING_FAST_WARN_MS:-3000}"

usage() {
  echo "Usage: $0 [--root DIR] [--tail N] [--out LOG] [--err LOG]"
  echo "  Env: TAIL_LINES, PM2_LOG_DIR, PM2_OUT_LOG, PM2_ERR_LOG, BOOKING_WARN_MS, BOOKING_FAST_WARN_MS"
}

pick_pm2_log() {
  # Args: basename prefix (e.g. callbot-voice-out) — picks -0.log, .log, or newest matching *.log
  local prefix="$1"
  local dir="$PM2_LOG_DIR"
  local f
  for f in "$dir/${prefix}-0.log" "$dir/${prefix}.log"; do
    if [[ -f "$f" ]]; then
      echo "$f"
      return 0
    fi
  done
  f=$(ls -t "$dir/${prefix}"*.log 2>/dev/null | head -1 || true)
  if [[ -n "$f" && -f "$f" ]]; then
    echo "$f"
    return 0
  fi
  echo "$dir/${prefix}.log"
  return 1
}

OUT_SPECIFIED=0
ERR_SPECIFIED=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --tail) TAIL_LINES="$2"; shift 2 ;;
    --out) PM2_OUT_LOG="$2"; OUT_SPECIFIED=1; shift 2 ;;
    --err) PM2_ERR_LOG="$2"; ERR_SPECIFIED=1; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$OUT_SPECIFIED" -eq 0 && -z "$PM2_OUT_LOG" ]]; then
  PM2_OUT_LOG="$(pick_pm2_log callbot-voice-out || true)"
fi
if [[ "$ERR_SPECIFIED" -eq 0 && -z "$PM2_ERR_LOG" ]]; then
  PM2_ERR_LOG="$(pick_pm2_log callbot-voice-error || true)"
fi
[[ -z "$PM2_OUT_LOG" ]] && PM2_OUT_LOG="$PM2_LOG_DIR/callbot-voice-out.log"
[[ -z "$PM2_ERR_LOG" ]] && PM2_ERR_LOG="$PM2_LOG_DIR/callbot-voice-error.log"

collect_logs() {
  local chunk=""
  local read_any=0
  if [[ -f "$PM2_OUT_LOG" ]]; then
    chunk+=$(tail -n "$TAIL_LINES" "$PM2_OUT_LOG" 2>/dev/null || true)
    chunk+=$'\n'
    read_any=1
  else
    echo "Note: missing out log: $PM2_OUT_LOG" >&2
  fi
  if [[ -f "$PM2_ERR_LOG" ]]; then
    chunk+=$(tail -n "$TAIL_LINES" "$PM2_ERR_LOG" 2>/dev/null || true)
    read_any=1
  else
    echo "Note: missing err log: $PM2_ERR_LOG" >&2
  fi
  if [[ "$read_any" -eq 0 ]]; then
    echo "Note: no PM2 log files found (set PM2_LOG_DIR or PM2_OUT_LOG / PM2_ERR_LOG)" >&2
  fi
  printf '%s' "$chunk"
}

LOG_SOURCES=""
[[ -f "$PM2_OUT_LOG" ]] && LOG_SOURCES="$PM2_OUT_LOG"
[[ -f "$PM2_ERR_LOG" ]] && LOG_SOURCES="${LOG_SOURCES:+$LOG_SOURCES;}$PM2_ERR_LOG"

REPORT_PY="$ROOT/scripts/_health_monitor_report.py"
if [[ ! -f "$REPORT_PY" ]]; then
  echo "Missing $REPORT_PY" >&2
  exit 1
fi

PY="python3"
[[ -x "$ROOT/venv/bin/python" ]] && PY="$ROOT/venv/bin/python"

collect_logs | "$PY" "$REPORT_PY" \
  --log-sources "$LOG_SOURCES" \
  --booking-warn-ms "$BOOKING_WARN_MS" \
  --booking-fast-warn-ms "$BOOKING_FAST_WARN_MS"
