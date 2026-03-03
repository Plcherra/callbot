# Echodesk Mobile

Flutter mobile app for the Echodesk AI receptionist platform.

## Prerequisites

- Flutter SDK (3.2+)
- Backend running at `API_BASE_URL`

## Setup

**Quick run** — reads from project `.env.local`:

```bash
cd mobile
./run.sh          # runs on macOS
./run.sh chrome   # or any flutter device
```

**Manual** — pass env explicitly:

```bash
flutter run -d macos \
  --dart-define=API_BASE_URL=http://localhost:3000 \
  --dart-define=SUPABASE_URL=https://xxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=your_anon_key
```

## Deep Links

- `echodesk://checkout?session_id=...` - Stripe Checkout return
- `echodesk://google-callback?success=1` - Google OAuth return

Configure these in Android (AndroidManifest.xml) and iOS (Info.plist) - already added.
