# Service Checklist – 403 Logs and Call Flow

When logs show red (403 Forbidden) on `/api/telnyx/voice`, use this checklist.

---

## 1. Why 403 (Red Logs)?

**Cause:** Telnyx webhook verification failed. The backend rejects the request before answering the call.

### Quick fix on VPS

1. **Ensure `TELNYX_SKIP_VERIFY=1`** in `.env` or `.env.local`
2. **Unset or leave empty `TELNYX_ALLOWED_IPS`** – if set, your request IP must be in the list. With Cloudflare Tunnel, the source IP can be `::1`, `127.0.0.1`, or Cloudflare IPs. If in doubt, leave it empty:
   ```bash
   # In .env – ensure these lines:
   TELNYX_SKIP_VERIFY=1
   # TELNYX_ALLOWED_IPS=   ← comment out or leave empty
   ```
3. **Pull latest code and restart** (fix is in `voice_webhook_verify.py`):
   ```bash
   cd ~/apps/callbot
   git pull
   pm2 restart callbot-voice
   pm2 logs callbot-voice --lines 20
   ```
4. **Place a test call** – you should see `skip_verification` or `Answered call` instead of 403.

---

## 2. Cloudflare (Cloudflared Tunnel)

| Check | Where | Expected |
|-------|-------|----------|
| Tunnel running | `pgrep cloudflared` or systemd | Process is running |
| Ingress target | Tunnel config | `http://127.0.0.1:80` (nginx) |
| Service type | Cloudflare dashboard | HTTP (not HTTPS) for localhost:80 |
| Hostname | Tunnel config | `echodesk.us` |

**Fix:** Tunnel must point at nginx (port 80), not directly at Python. Nginx routes `/api/*` to Python.

---

## 3. Telnyx

| Check | Where | Expected |
|-------|-------|----------|
| Webhook URL | Voice API Application | `https://echodesk.us/api/telnyx/voice` |
| API version | Same | API v2 |
| Numbers → Connection | My Numbers | DIDs assigned to your Voice App |
| CDR webhook | Same app or separate | `https://echodesk.us/api/telnyx/cdr` (for call ended) |
| Env on VPS | `.env` | `TELNYX_API_KEY`, `TELNYX_WEBHOOK_BASE_URL=https://echodesk.us` |

---

## 4. Supabase

| Check | Where | Expected |
|-------|-------|----------|
| URL + keys | `.env` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `receptionists` table | Table Editor | At least one row with `status='active'` |
| Phone match | `receptionists` | `telnyx_phone_number` or `inbound_phone_number` matches your DID |
| `call_usage` table | Table Editor | Exists for CDR inserts |

---

## 5. Deepgram (STT)

| Check | Where | Expected |
|-------|-------|----------|
| API key | `.env` | `DEEPGRAM_API_KEY` |
| Billing | Deepgram dashboard | Account active, credits available |

---

## 6. Grok (LLM)

| Check | Where | Expected |
|-------|-------|----------|
| API key | `.env` | `GROK_API_KEY` |
| Access | x.ai / Grok | API access enabled |

---

## 7. ElevenLabs (TTS)

| Check | Where | Expected |
|-------|-------|----------|
| API key | `.env` | `ELEVENLABS_API_KEY` |
| Voice ID | `.env` (optional) | `ELEVENLABS_VOICE_ID` (default used if omitted) |
| Billing | ElevenLabs dashboard | Credits available |

---

## 8. Firebase (FCM Push)

| Check | Where | Expected |
|-------|-------|----------|
| Service account | `.env` | `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON string) |
| Project | Firebase Console | Same project as `google-services.json` in Flutter |
| Package name | Firebase | Matches `com.echodesk.mobile` (or your app ID) |

**Note:** FCM is for push (incoming call, call ended). Calls still work without it; push notifications won’t.

---

## 9. Nginx

| Check | Command | Expected |
|-------|---------|----------|
| Config | `sudo nginx -t` | Syntax OK |
| Voice route | `grep -A2 "api/telnyx/voice" /etc/nginx/sites-enabled/callbot` | `proxy_pass http://127.0.0.1:8000` |
| Sync | `./deploy/scripts/sync-nginx-config.sh` | Runs without sudo errors |

---

## 10. Verify End-to-End

```bash
# On VPS
curl -s -X POST http://127.0.0.1/api/telnyx/voice -H "Host: echodesk.us" -H "Content-Type: application/json" -d '{}' | head -c 200
# Expected: {"success":true}

# After a real call
pm2 logs callbot-voice --lines 30 | grep -E "Answered|Stream started|skip_verification|403|invalid"
```

---

## Summary

1. **403 → webhook verification:** `TELNYX_SKIP_VERIFY=1`, `TELNYX_ALLOWED_IPS` empty.
2. **Call not answered →** Telnyx webhook URL, nginx routing, receptionist in Supabase.
3. **No AI speech →** Deepgram, Grok, ElevenLabs keys and billing.
4. **No push →** Firebase service account key.
