# VPS Environment Variables Setup

How to update env vars on your production server (echodesk.us).

## 1. SSH into the VPS

Use the same credentials as your deploy (GitHub Actions secrets):

```bash
ssh YOUR_SSH_USER@YOUR_SSH_HOST
```

If you use an SSH key (stored in GitHub as `SSH_PRIVATE_KEY`), make sure it's in your `~/.ssh/` or use:

```bash
ssh -i ~/.path/to/your/key YOUR_SSH_USER@YOUR_SSH_HOST
```

Get `SSH_HOST` and `SSH_USER` from your repo: **Settings → Secrets and variables → Actions**.

## 2. Go to the app directory

```bash
cd /path/to/your/app   # This is APP_PATH from your GitHub secrets
```

## 3. Find where env vars are stored

PM2 (which runs `callbot`) loads env from one of:

**Option A: `.env` file in app root**

```bash
ls -la .env
nano .env   # or: vim .env
```

Add or edit lines (no spaces around `=`):

```
TELNYX_API_KEY=your_telnyx_api_key_here
TELNYX_WEBHOOK_BASE_URL=https://echodesk.us
# ... any other vars from .env.local.example
```

**Option B: PM2 ecosystem file**

The ecosystem config loads `.env` and `.env.local` from the project root. Prefer Option A (files in app root). To override via ecosystem:

```bash
ls ecosystem.config.cjs
nano ecosystem.config.cjs
```

Add `env` block to an app:

```js
{
  name: 'callbot',
  script: '...',
  env: {
    NODE_ENV: 'production',
    TELNYX_API_KEY: 'your_key_here',
    TELNYX_WEBHOOK_BASE_URL: 'https://echodesk.us',
    // ... rest of vars
  }
}
```

**Option C: System env (e.g. systemd or /etc/environment)**

Less common. Check how PM2 was started:

```bash
pm2 show callbot
```

## 4. Restart the app

```bash
pm2 reload callbot callbot-voice --update-env
pm2 save
```

## 5. Verify

```bash
pm2 list
pm2 logs callbot --lines 20
pm2 logs callbot-voice --lines 20
```

Check that both apps start without "TELNYX_API_KEY must be set" or similar.

## Quick checklist for "Create Receptionist"

Ensure these are set on the VPS:

| Variable | Example |
|----------|---------|
| `TELNYX_API_KEY` | From portal.telnyx.com |
| `TELNYX_WEBHOOK_BASE_URL` | `https://echodesk.us` |
| `NEXT_PUBLIC_APP_URL` | `https://echodesk.us` |

Plus all other vars from `.env.local.example` (Supabase, Stripe, Deepgram, ElevenLabs, Grok, Google OAuth).
