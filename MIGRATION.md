# Migration: Node Voice Backend to Python/FastAPI

## Summary

The voice backend (WebSocket + pipeline) has been migrated from Node.js to Python/FastAPI. Next.js now serves only the web dashboard. The Flutter mobile app has been extended with push notifications and CallKit/ConnectionService for background call alerts.

## Migration Steps

### 1. Deploy the Python Backend

```bash
cd backend
pip install -r requirements.txt
# Set env vars (see backend/.env.example)
uvicorn main:app --host 0.0.0.0 --port 8000
```

Or run from project root:
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### 2. Configure Telnyx

Point the Telnyx Call Control webhook for `call.initiated` to your FastAPI backend:
- **URL**: `https://your-voice-backend.domain/api/telnyx/voice`
- Ensure `TELNYX_WEBHOOK_BASE_URL` is set to your FastAPI public URL (e.g. `https://voice.echodesk.us`)

### 3. Run Next.js for Dashboard Only

```bash
npm run build
npm start
```

Next.js now runs on port 3000 (default) for the web dashboard. No custom server or WebSocket.

### 4. Apply Supabase Migration

```bash
supabase db push
# or
supabase migration up
```

This adds the `user_push_tokens` table for FCM token registration.

### 5. Flutter: Firebase Setup

For push notifications:
1. `lib/firebase_options.dart` is generated from `GoogleService-Info.plist` and `google-services.json`. To regenerate: `flutterfire configure` (requires Firebase CLI).
2. The app registers FCM tokens with `/api/mobile/push-token` via the Next.js API.

### 6. Flutter: Production Builds

Release builds default `API_BASE_URL` to `https://echodesk.us`. Override for staging or custom domains:

```bash
# Android APK
flutter build apk --dart-define=SUPABASE_URL=https://xxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=your_anon_key

# iOS (add same dart-defines in Xcode or via flutter build ipa)
flutter build ipa --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
```

Required dart-defines for production: `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Optional: `API_BASE_URL` (defaults to echodesk.us in release), `DEEP_LINK_SCHEME`.

### 7. Environment Variables

**FastAPI (backend/.env or backend/.env.local):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `TELNYX_API_KEY`, `TELNYX_WEBHOOK_SECRET`, `TELNYX_WEBHOOK_BASE_URL`
- `DEEPGRAM_API_KEY`, `GROK_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
- `VOICE_SERVER_API_KEY` (for prompt/calendar API auth)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` (for calendar)

## Removed (Node Voice Stack)

- `server.js` – custom Next.js server with WebSocket
- `server/` – voice handler, sendMedia, etc.
- `app/lib/voicePipeline/` – Deepgram → Grok → ElevenLabs pipeline
- `app/lib/deepgram.ts`, `app/lib/grok.ts`, `app/lib/elevenlabs.ts`, `app/lib/calendarTools.ts`, `app/lib/promptCache.ts`
- `app/api/telnyx/voice/route.ts` – moved to FastAPI
- `tsconfig.server.json`

## New Structure

```
backend/           # Python FastAPI voice backend
├── main.py
├── voice/         # Pipeline, Deepgram, Grok, ElevenLabs
├── prompts/       # Prompt builder, fetch
├── telnyx/        # Webhook
├── calendar_api/  # Google Calendar
└── ...
```

## Run Both (Development)

```bash
# Terminal 1: Next.js dashboard
npm run dev

# Terminal 2: Python voice backend
cd backend && uvicorn main:app --reload --port 8000
```

Set `TELNYX_WEBHOOK_BASE_URL=http://localhost:8000` (or use ngrok) for local Telnyx webhook testing.
