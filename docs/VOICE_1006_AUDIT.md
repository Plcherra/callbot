# Voice Stream 1006 Audit & Fixes

> **Note:** This doc originally covered `voiceStreamHandler.ts` (Node). The voice pipeline is now Python (`backend/voice/`). The principles (silence intervals, ping, proxy timeouts, logging) still apply. For current call flow troubleshooting, see [CALL_FLOW_DIAGNOSTIC.md](CALL_FLOW_DIAGNOSTIC.md).

Full audit of Telnyx bidirectional RTP 1006/silence drops.

---

## Top 5 Bugs Causing 1006/Silence (Ranked)

### 1. **Silence interval too slow** (FIXED)
- **Was**: 500ms (or 5s in some deployments)
- **Problem**: Telnyx/proxies may kill idle connections in ~10s. Community fixes: silence every 3s prevents 1006.
- **Fix**: `SILENCE_INTERVAL_MS = 3000`, send 160-byte mulaw 0xFF every 3s.

### 2. **No WebSocket-level ping** (FIXED)
- **Problem**: NAT, firewalls, reverse proxies drop "idle" connections. No application traffic → 1006.
- **Fix**: `ws.ping()` every 10s. Keeps connection alive through middleboxes.

### 3. **Pipeline init blocks before first media** (PARTIALLY MITIGATED)
- **Problem**: `initPipeline()` is async (prompt fetch, Deepgram connect, greeting TTS). During 2–5s, only silence keeps connection alive. If silence was sparse, we could hit 1006.
- **Fix**: Send silence packet **immediately** on connect, before any async work. Interval starts right away.

### 4. **Proxy/NAT timeouts** (DOCUMENTED)
- **Problem**: nginx `proxy_read_timeout` default (60s) or Cloudflare/firewall idle kill.
- **Fix**: Set `proxy_read_timeout 3600s`, `proxy_send_timeout 3600s` in nginx. Use ngrok or public IP for dev.

### 5. **Insufficient logging** (FIXED)
- **Problem**: Hard to debug 1006—no timestamps, no close code/reason, no chunk counts.
- **Fix**: Log every event with `ts()`, close with `code`/`reason`, chunk `len` and `msg#`. 1006 logs explicitly with NAT/proxy hints.

---

## Changes in voiceStreamHandler.ts

| Before | After |
|--------|-------|
| Silence 500ms | Silence 3000ms |
| No ping | `ws.ping()` every 10s |
| One-time no-audio timeout | Recurring 5s heartbeat log |
| Minimal logs | Full event logging (ts, code, reason, chunk len) |
| `sendSilenceKeepalive` inline | `sendMedia()` helper, same format |

---

## Test Script

**Prerequisite**: Call your receptionist number from your phone.

```bash
# Terminal 1: Run app
npm run build && npm start

# Terminal 2: Tail logs during call
pm2 logs callbot --lines 0 2>&1 | tee /tmp/voice-test.log
# Or if not using PM2:
# (logs go to stdout; redirect as needed)
```

**During call (20+ seconds, speak a few times):**

```bash
# After call ends, grep for key events
grep -E "OPEN|CLOSE|1006|chunk len|transcript|Grok response|reconnect|silence|ping" /tmp/voice-test.log
```

**Expected output pattern:**
```
[voice/stream] 2025-03-05T... OPEN connected ...
[voice/stream] 2025-03-05T... silence sent (160 bytes mulaw 0xFF)
[voice/stream] 2025-03-05T... message event=connected
[voice/stream] 2025-03-05T... chunk len=... msg#=1
[voice/stream] 2025-03-05T... pipeline ready
[voicePipeline] STT final transcript: ...
[voicePipeline] Grok response len: ...
[voicePipeline] TTS audio generated
[voice/stream] 2025-03-05T... CLOSE code=1000 reason=...
```

**If you see 1006:**
```
[voice/stream] ... CLOSE 1006 (abnormal) ... | Check: proxy_read_timeout, NAT, firewall, ngrok/public IP
```

- Check nginx: `proxy_read_timeout 3600s`, `proxy_send_timeout 3600s`
- Dev: use ngrok or a public IP so Telnyx can reach your WebSocket
- Ensure `TELNYX_WEBHOOK_BASE_URL` is your public URL

---

## If Still Fails

1. **ngrok** for dev: `ngrok http 3000` → use `https://xxx.ngrok.io` as `TELNYX_WEBHOOK_BASE_URL`
2. **Verify WebSocket upgrade**: nginx must pass `Upgrade`, `Connection`
3. **Telnyx docs**: [Media Streaming](https://developers.telnyx.com/docs/voice/programmable-voice/media-streaming) — bidirectional RTP needs constant media flow.
