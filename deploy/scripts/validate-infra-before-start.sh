#!/bin/bash
# Pre-start infrastructure validation for callbot (Next.js + Python backend).
# Run from project root: ./deploy/scripts/validate-infra-before-start.sh
#
# Checks: Cloudflare Tunnel, nginx, Telnyx config, env vars, PM2/ports.
# Flags: --fix (attempt auto-corrections), --ci (machine-readable), --pre-start (skip PM2/ports)
#
# Exit: 0 = pass, 1 = fail

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

DOMAIN="${VALIDATE_DOMAIN:-echodesk.us}"
FAIL_COUNT=0
WARN_COUNT=0
FIX_MODE=false
CI_MODE=false
PRE_START=false

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --fix)       FIX_MODE=true ;;
    --ci)        CI_MODE=true ;;
    --pre-start) PRE_START=true ;;
    -h|--help)
      echo "Usage: $0 [--fix] [--ci] [--pre-start]"
      echo "  --fix       Attempt auto-corrections (e.g. fix-nginx-voice.sh)"
      echo "  --ci        Machine-readable output for GitHub Actions"
      echo "  --pre-start Skip PM2 and port checks (env/nginx/Telnyx only)"
      exit 0
      ;;
  esac
done

# Colors (disabled in CI)
red=''
green=''
yellow=''
reset=''
if [ "$CI_MODE" = false ] && [ -t 1 ] 2>/dev/null; then
  red=$(tput setaf 1 2>/dev/null || true)
  green=$(tput setaf 2 2>/dev/null || true)
  yellow=$(tput setaf 3 2>/dev/null || true)
  reset=$(tput sgr0 2>/dev/null || true)
fi

ok() {
  local msg="$*"
  if [ "$CI_MODE" = true ]; then
    echo "VALIDATE_OK=$1"
  else
    echo "${green}[ OK ]${reset} $msg"
  fi
}

warn() {
  local msg="$*"
  WARN_COUNT=$((WARN_COUNT + 1))
  if [ "$CI_MODE" = true ]; then
    echo "VALIDATE_WARN=$1|$msg"
  else
    echo "${yellow}[WARN]${reset} $msg"
  fi
}

fail() {
  local check="$1"
  local msg="$2"
  local remediation="$3"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  if [ "$CI_MODE" = true ]; then
    echo "VALIDATE_FAIL=$check|$msg|$remediation"
  else
    echo "${red}[FAIL]${reset} $msg"
    echo "  -> Remediation: $remediation"
  fi
}

# Load env from .env and .env.local
load_env() {
  for f in "$ROOT/.env" "$ROOT/.env.local"; do
    [ -f "$f" ] || continue
    while IFS= read -r line || [ -n "$line" ]; do
      [[ "$line" =~ ^#.*$ ]] && continue
      [[ "$line" =~ ^[[:space:]]*$ ]] && continue
      if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
      fi
    done < "$f" 2>/dev/null || true
  done
}
load_env

# ========== 1. Cloudflare Tunnel ==========
check_cloudflare() {
  if [ -n "${SKIP_CLOUDFLARE_CHECK:-}" ]; then
    ok "Cloudflare checks skipped (SKIP_CLOUDFLARE_CHECK=1)"
    return 0
  fi

  if ! command -v cloudflared &>/dev/null; then
    warn "cloudflared not installed; skipping tunnel checks. If using Cloudflare Tunnel, install it."
    return 0
  fi

  if ! pgrep -x cloudflared &>/dev/null; then
    fail "cloudflare_process" "cloudflared is not running" \
      "Start cloudflared: sudo systemctl start cloudflared"
    return 1
  fi
  ok "cloudflared is running"

  # Try common metrics/health ports
  CLOUDFLARED_HEALTH=false
  for port in 2000 8080 20241 20242 20243 20244 20245 ${CLOUDFLARED_METRICS_PORT:-}; do
    [ -n "$port" ] || continue
    if curl -sf "http://127.0.0.1:$port/ready" &>/dev/null || curl -sf "http://127.0.0.1:$port/metrics" &>/dev/null; then
      CLOUDFLARED_HEALTH=true
      ok "Tunnel health endpoint reachable (port $port)"
      break
    fi
  done
  if [ "$CLOUDFLARED_HEALTH" = false ]; then
    warn "Could not reach cloudflared /ready or /metrics on common ports (2000,8080,20241-20245). Metrics port may differ."
    echo "  -> Verify with: cloudflared tunnel run --metrics 127.0.0.1:PORT"
  fi

  # Check tunnel config: hostname should target nginx (80/443), not 3000
  for conf in /etc/cloudflared/config.yml "$HOME/.cloudflared/config.yml"; do
    [ -f "$conf" ] || continue
    if grep -q "service:.*127.0.0.1:3000" "$conf" 2>/dev/null; then
      warn "Tunnel config $conf points echodesk.us to :3000 – voice will fail. Point to :80 or :443 (nginx)."
      echo "  -> Update ingress to service: http://127.0.0.1:80 (nginx), not :3000. Then: sudo systemctl restart cloudflared"
    elif grep -qE "service:.*127.0.0.1:(80|443)" "$conf" 2>/dev/null; then
      ok "Tunnel config targets nginx (80/443)"
      break
    fi
  done
  return 0
}

# ========== 2. Nginx ==========
check_nginx() {
  if ! command -v nginx &>/dev/null; then
    fail "nginx_installed" "nginx not found" "Install nginx: sudo apt install nginx"
    return 1
  fi

  if ! systemctl is-active nginx &>/dev/null 2>/dev/null; then
    fail "nginx_active" "nginx is not running" "sudo systemctl start nginx && sudo nginx -t"
    return 1
  fi
  ok "nginx is active"

  if ! sudo nginx -t &>/dev/null; then
    fail "nginx_config" "nginx config invalid" "Run: sudo nginx -t to see errors, then fix config"
    return 1
  fi
  ok "nginx config valid"

  # Local voice route (bypasses external routing)
  LOCAL_RESP=$(curl -sk -X POST "https://127.0.0.1/api/telnyx/voice" -H "Host: $DOMAIN" -H "Content-Type: application/json" -d '{}' 2>/dev/null | head -c 500)
  if echo "$LOCAL_RESP" | grep -qE '<!DOCTYPE|<html'; then
    if [ "$FIX_MODE" = true ]; then
      ok "Attempting --fix: running fix-nginx-voice.sh"
      "$ROOT/deploy/scripts/fix-nginx-voice.sh" || true
      LOCAL_RESP=$(curl -sk -X POST "https://127.0.0.1/api/telnyx/voice" -H "Host: $DOMAIN" -H "Content-Type: application/json" -d '{}' 2>/dev/null | head -c 500)
    fi
    if echo "$LOCAL_RESP" | grep -qE '<!DOCTYPE|<html'; then
      fail "nginx_voice_local" "Local nginx returns HTML for /api/telnyx/voice (wrong routing)" \
        "Run: ./deploy/scripts/fix-nginx-voice.sh"
      return 1
    fi
  fi
  if echo "$LOCAL_RESP" | grep -qE '"success"|"error"'; then
    ok "Local nginx routes /api/telnyx/voice to Python (JSON)"
  else
    warn "Local voice response unclear: $(echo "$LOCAL_RESP" | head -c 80)..."
  fi

  # Public voice route
  PUBLIC_RESP=$(curl -s --connect-timeout 5 -X POST "https://$DOMAIN/api/telnyx/voice" -H "Content-Type: application/json" -d '{}' 2>/dev/null | head -c 500)
  if echo "$PUBLIC_RESP" | grep -qE '<!DOCTYPE|<html'; then
    if echo "$LOCAL_RESP" | grep -qE '"success"|"error"'; then
      fail "nginx_voice_public" "Public URL returns HTML but local returns JSON – traffic may bypass nginx (e.g. Cloudflare Tunnel to :3000)" \
        "If using cloudflared: point tunnel at http://127.0.0.1:80 (nginx), not :3000. Else: ./deploy/scripts/diagnose-call-flow.sh"
    else
      fail "nginx_voice_public" "Public URL returns HTML for /api/telnyx/voice" \
        "Run: ./deploy/scripts/fix-nginx-voice.sh"
    fi
    return 1
  fi
  if echo "$PUBLIC_RESP" | grep -qE '"success"|"error"|"detail"'; then
    ok "Public $DOMAIN/api/telnyx/voice returns JSON"
  else
    warn "Public voice response unclear: $(echo "$PUBLIC_RESP" | head -c 80)..."
  fi
  return 0
}

# ========== 3. Telnyx ==========
check_telnyx() {
  TELNYX_PK=""
  TELNYX_WS=""
  TELNYX_BASE=""
  for f in "$ROOT/.env" "$ROOT/.env.local"; do
    [ -f "$f" ] || continue
    val=$(grep -E "^TELNYX_PUBLIC_KEY=" "$f" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
    [ -n "$val" ] && TELNYX_PK="$val"
    val=$(grep -E "^TELNYX_WEBHOOK_SECRET=" "$f" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
    [ -n "$val" ] && TELNYX_WS="$val"
    val=$(grep -E "^TELNYX_WEBHOOK_BASE_URL=" "$f" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
    [ -n "$val" ] && TELNYX_BASE="$val"
  done
  TELNYX_PK="${TELNYX_PK:-$TELNYX_PUBLIC_KEY}"
  TELNYX_WS="${TELNYX_WS:-$TELNYX_WEBHOOK_SECRET}"
  TELNYX_BASE="${TELNYX_BASE:-$TELNYX_WEBHOOK_BASE_URL}"

  if [ -z "$TELNYX_PK" ] && [ -z "$TELNYX_WS" ]; then
    warn "TELNYX_PUBLIC_KEY or TELNYX_WEBHOOK_SECRET not set – webhook verification may fail (403 on calls)"
    echo "  -> Add TELNYX_PUBLIC_KEY or TELNYX_WEBHOOK_SECRET for webhook verification"
  else
    ok "TELNYX_PUBLIC_KEY or TELNYX_WEBHOOK_SECRET is set"
  fi

  if [ -z "$TELNYX_BASE" ]; then
    fail "telnyx_webhook_url" "TELNYX_WEBHOOK_BASE_URL is not set" \
      "Set TELNYX_WEBHOOK_BASE_URL=https://$DOMAIN in .env.local"
    return 1
  fi

  if echo "$TELNYX_BASE" | grep -qi localhost; then
    fail "telnyx_webhook_public" "TELNYX_WEBHOOK_BASE_URL contains localhost – Telnyx cannot reach it" \
      "Set TELNYX_WEBHOOK_BASE_URL=https://$DOMAIN in .env.local"
    return 1
  fi

  if echo "$TELNYX_BASE" | grep -qE "https://$DOMAIN|https://www.$DOMAIN"; then
    ok "TELNYX_WEBHOOK_BASE_URL points to $DOMAIN"
  else
    ok "TELNYX_WEBHOOK_BASE_URL is set ($TELNYX_BASE)"
  fi

  # Optional: Telnyx API smoke test
  TELNYX_KEY=$(grep -E "^TELNYX_API_KEY=" "$ROOT/.env" "$ROOT/.env.local" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true)
  TELNYX_KEY="${TELNYX_KEY:-$TELNYX_API_KEY}"
  if [ -n "$TELNYX_KEY" ]; then
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TELNYX_KEY" "https://api.telnyx.com/v2/phone_numbers" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      ok "Telnyx API credentials valid"
    elif [ "$HTTP_CODE" != "000" ]; then
      warn "Telnyx API returned HTTP $HTTP_CODE – check TELNYX_API_KEY"
    fi
  fi
  return 0
}

# ========== 4. Environment variables ==========
check_env() {
  if ! npm run validate:env; then
    fail "env_nextjs" "Next.js env validation failed" \
      "Run: npm run validate:env. Copy deploy/env/.env.example to .env.local and fill values."
    return 1
  fi
  ok "Next.js env vars present"

  if ! python3 scripts/validate-env.py; then
    fail "env_backend" "Backend env validation failed" \
      "Run: python3 scripts/validate-env.py. Copy deploy/env/.env.example to .env.local and fill values."
    return 1
  fi
  ok "Backend env vars present"

  if ! npm run validate:env:crosscheck; then
    warn "Env crosscheck reported warnings (see above)"
  else
    ok "Env crosscheck passed"
  fi
  return 0
}

# ========== 5. Service health (PM2, ports) ==========
check_services() {
  if [ "$PRE_START" = true ]; then
    ok "Skipping PM2/port checks (--pre-start)"
    return 0
  fi

  if ! command -v pm2 &>/dev/null; then
    fail "pm2_installed" "pm2 not found" "Install: npm install -g pm2"
    return 1
  fi

  for app in callbot callbot-voice; do
    if ! pm2 list 2>/dev/null | grep -E "$app.*online" &>/dev/null; then
      fail "pm2_$app" "$app is not online" "Start apps: pm2 start ecosystem.config.cjs"
      return 1
    fi
  done
  ok "PM2: callbot and callbot-voice are online"

  # Port 8000
  if command -v ss &>/dev/null; then
    if ! ss -tlnp 2>/dev/null | grep -q ':8000 '; then
      fail "port_8000" "Port 8000 not listening (callbot-voice)" \
        "pm2 restart callbot-voice"
      return 1
    fi
  else
    if ! netstat -tlnp 2>/dev/null | grep -q ':8000 '; then
      fail "port_8000" "Port 8000 not listening (callbot-voice)" \
        "pm2 restart callbot-voice"
      return 1
    fi
  fi
  ok "Port 8000 listening (callbot-voice)"

  # Port 3000
  if command -v ss &>/dev/null; then
    if ! ss -tlnp 2>/dev/null | grep -q ':3000 '; then
      fail "port_3000" "Port 3000 not listening (callbot)" \
        "pm2 restart callbot"
      return 1
    fi
  else
    if ! netstat -tlnp 2>/dev/null | grep -q ':3000 '; then
      fail "port_3000" "Port 3000 not listening (callbot)" \
        "pm2 restart callbot"
      return 1
    fi
  fi
  ok "Port 3000 listening (callbot)"
  return 0
}

# ========== Main ==========
main() {
  if [ "$CI_MODE" = false ]; then
    echo ""
    echo "=== Pre-start infrastructure validation ==="
    echo "Domain: $DOMAIN | Fix: $FIX_MODE | Pre-start: $PRE_START"
    echo ""
  fi

  check_cloudflare || true
  check_nginx || true
  check_telnyx || true
  check_env || true
  check_services || true

  if [ "$CI_MODE" = false ]; then
    echo ""
    echo "=== Summary ==="
    echo "Failures: $FAIL_COUNT | Warnings: $WARN_COUNT"
  fi

  if [ "$FAIL_COUNT" -gt 0 ]; then
    if [ "$CI_MODE" = false ]; then
      echo ""
      echo "${red}Validation failed. Fix the issues above before starting.${reset}"
    fi
    exit 1
  fi
  exit 0
}

main "$@"
