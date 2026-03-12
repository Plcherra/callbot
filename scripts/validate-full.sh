#!/bin/bash
# Whole-project validation for callbot (Python FastAPI + static landing).
# Run from project root: ./scripts/validate-full.sh
#
# Checks:
#   1. Backend import (no crash)
#   2. Env vars (via validate-env.py)
#   3. If backend running: HTTP routes, voice webhook, mobile auth, cron auth
#   4. If BASE_URL set: landing HTML
#
# Flags: --ci (machine-readable), --skip-http (skip curl checks)
# Env: BASE_URL (e.g. https://echodesk.us) for landing check. Default: http://localhost:8000 for API.
#
# Exit: 0 = pass, 1 = fail

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL_COUNT=0
CI_MODE=false
SKIP_HTTP=false
BASE_URL="${BASE_URL:-http://localhost:8000}"

for arg in "$@"; do
  case "$arg" in
    --ci)        CI_MODE=true ;;
    --skip-http) SKIP_HTTP=true ;;
    -h|--help)
      echo "Usage: $0 [--ci] [--skip-http]"
      echo "  --ci        Machine-readable output"
      echo "  --skip-http Skip curl checks (backend must be running)"
      echo "Env: BASE_URL for API/landing base (default: http://localhost:8000)"
      exit 0
      ;;
  esac
done

red=''; green=''; yellow=''; reset=''
if [ "$CI_MODE" = false ] && [ -t 1 ] 2>/dev/null; then
  red=$(tput setaf 1 2>/dev/null || true)
  green=$(tput setaf 2 2>/dev/null || true)
  yellow=$(tput setaf 3 2>/dev/null || true)
  reset=$(tput sgr0 2>/dev/null || true)
fi

ok() {
  if [ "$CI_MODE" = true ]; then echo "VALIDATE_OK=$1"; else echo "${green}[ OK ]${reset} $*"; fi
}

warn() {
  if [ "$CI_MODE" = true ]; then echo "VALIDATE_WARN=$1|$2"; else echo "${yellow}[WARN]${reset} $2"; fi
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  if [ "$CI_MODE" = true ]; then
    echo "VALIDATE_FAIL=$1|$2|$3"
  else
    echo "${red}[FAIL]${reset} $2"
    echo "  -> $3"
  fi
}

echo "=== validate-full.sh ==="

# 1. Backend import (no crash)
echo "1. Backend import..."
if ./venv/bin/python -c "import sys; sys.path.insert(0,'backend'); from main import app; assert app" 2>/dev/null; then
  ok "Backend imports without crash"
else
  fail "backend_import" "Backend import failed" "Fix backend/main.py and dependencies"
fi

# 2. Env vars
echo "2. Env validation..."
if ./venv/bin/python scripts/validate-env.py 2>/dev/null; then
  ok "Env vars present"
else
  fail "env" "Env validation failed" "Run: ./venv/bin/python scripts/validate-env.py"
fi

# 3. HTTP checks (if backend reachable)
if [ "$SKIP_HTTP" = true ]; then
  ok "HTTP checks skipped (--skip-http)"
elif curl -sf --connect-timeout 2 "${BASE_URL}/api/health" >/dev/null 2>&1; then
  echo "3. HTTP routes (backend at ${BASE_URL})..."

  # /api/health returns JSON
  if curl -sf "${BASE_URL}/api/health" | grep -q '"status"'; then
    ok "/api/health returns JSON"
  else
    fail "health" "/api/health does not return expected JSON" "Check backend routes"
  fi

  # /api/telnyx/voice returns JSON (not HTML)
  VOICE_RESP=$(curl -sf -X POST "${BASE_URL}/api/telnyx/voice" -H "Content-Type: application/json" -d '{}' 2>/dev/null || true)
  if echo "$VOICE_RESP" | grep -qE '"detail"|"received"|"error"|"verified"'; then
    ok "/api/telnyx/voice returns JSON"
  elif echo "$VOICE_RESP" | grep -q "<!DOCTYPE\|<html"; then
    fail "voice" "/api/telnyx/voice returns HTML (wrong routing)" "Ensure nginx proxies to Python :8000"
  else
    warn "voice" "/api/telnyx/voice response unclear: ${VOICE_RESP:0:80}..."
  fi

  # /api/mobile/google-auth-url returns 401 without Bearer
  MOBILE_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/api/mobile/google-auth-url" 2>/dev/null || echo "000")
  if [ "$MOBILE_STATUS" = "401" ] || [ "$MOBILE_STATUS" = "403" ]; then
    ok "/api/mobile/google-auth-url requires auth (${MOBILE_STATUS})"
  elif [ "$MOBILE_STATUS" = "000" ]; then
    warn "mobile" "Could not reach /api/mobile/google-auth-url"
  else
    fail "mobile" "/api/mobile/google-auth-url returned ${MOBILE_STATUS} (expected 401)" "Check auth middleware"
  fi

  # /api/cron/usage returns 401 or 503 without Bearer
  CRON_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/api/cron/usage" 2>/dev/null || echo "000")
  if [ "$CRON_STATUS" = "401" ] || [ "$CRON_STATUS" = "503" ]; then
    ok "/api/cron/usage requires auth (${CRON_STATUS})"
  elif [ "$CRON_STATUS" = "000" ]; then
    warn "cron" "Could not reach /api/cron/usage"
  else
    fail "cron" "/api/cron/usage returned ${CRON_STATUS} (expected 401/503)" "Check cron routes"
  fi

  # Landing: if BASE_URL is root (no /api), check for HTML
  if [[ "$BASE_URL" != *"/api"* ]]; then
    LANDING_RESP=$(curl -sf --connect-timeout 2 "${BASE_URL}/" 2>/dev/null | head -c 200 || true)
    if echo "$LANDING_RESP" | grep -qE "<!DOCTYPE|<html"; then
      ok "Landing returns HTML"
    else
      warn "landing" "Root / does not return HTML (nginx may serve landing separately)"
    fi
  fi
else
  warn "http" "Backend not reachable at ${BASE_URL} – skip with --skip-http to validate import/env only"
fi

echo "=== Summary ==="
if [ $FAIL_COUNT -gt 0 ]; then
  echo "${red}Failed: $FAIL_COUNT${reset}"
  exit 1
else
  echo "${green}All checks passed${reset}"
  exit 0
fi
