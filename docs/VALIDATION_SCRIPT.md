# Pre-Start Infrastructure Validation Script

`deploy/scripts/validate-infra-before-start.sh` runs health checks on critical infrastructure before the application is considered ready. Use it to fail fast on misconfigurations and get clear remediation steps.

## Usage

Run from project root on the VPS:

```bash
./deploy/scripts/validate-infra-before-start.sh
```

### Flags

| Flag | Description |
|------|-------------|
| `--fix` | Attempt auto-corrections when safe (e.g. runs `fix-nginx-voice.sh` if nginx voice route returns HTML) |
| `--ci` | Machine-readable output for GitHub Actions (`VALIDATE_OK=...`, `VALIDATE_FAIL=...`) |
| `--pre-start` | Skip PM2 and port checks; run env, Telnyx, nginx, and Cloudflare checks only |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VALIDATE_DOMAIN` | `echodesk.us` | Domain for public URL checks |
| `SKIP_CLOUDFLARE_CHECK` | (unset) | Set to `1` to skip Cloudflare Tunnel checks |

## Checks Performed

1. **Cloudflare Tunnel**
   - `cloudflared` process running
   - Tunnel health endpoint reachable (ports 2000, 8080, 20241–20245)
   - Tunnel config targets nginx (port 80/443), not Next.js (3000)

2. **Nginx**
   - nginx active and config valid
   - Local `/api/telnyx/voice` returns JSON (not HTML)
   - Public `https://echodesk.us/api/telnyx/voice` returns JSON

3. **Telnyx**
   - `TELNYX_PUBLIC_KEY` or `TELNYX_WEBHOOK_SECRET` set
   - `TELNYX_WEBHOOK_BASE_URL` set and points to public URL (not localhost)
   - Optional: Telnyx API credentials valid

4. **Environment Variables**
   - Runs `npm run validate:env` (Next.js)
   - Runs `python3 scripts/validate-env.py` (backend)
   - Runs `npm run validate:env:crosscheck` (shared config)

5. **Service Health** (skipped with `--pre-start`)
   - PM2: `callbot` and `callbot-voice` online
   - Ports 8000 and 3000 listening

## Integration

### deploy.sh

The script runs automatically **after** PM2 start in `deploy/scripts/deploy.sh`. If validation fails, the deploy exits with code 1.

### GitHub Actions

When `GITHUB_ACTIONS` is set, deploy.sh passes `--ci` for machine-readable output. No workflow changes required.

### Manual / Pre-Start

For env-only validation before starting apps:

```bash
./deploy/scripts/validate-infra-before-start.sh --pre-start
```

### PM2 / ecosystem.config.cjs

PM2 has no built-in pre-start hook. Validation is invoked by deploy.sh. For custom setups, run the script before `pm2 start` or use a wrapper.

## Output

- `[ OK ]` – Check passed
- `[WARN]` – Warning (continues); includes remediation
- `[FAIL]` – Failure; exits 1 with remediation

Every FAIL and WARN includes a `-> Remediation:` line with next steps.

## See Also

- [CALL_FLOW_DIAGNOSTIC.md](CALL_FLOW_DIAGNOSTIC.md) – Call flow troubleshooting
- [troubleshooting.md](troubleshooting.md) – Common errors
- `./deploy/scripts/diagnose-call-flow.sh` – Manual call flow diagnostics
