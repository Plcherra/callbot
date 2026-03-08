# Error Monitoring (Production)

Error tracking is configured for both the Next.js web app and Flutter mobile app.

## Sentry (Next.js)

Sentry is integrated for client, server, and edge runtimes.

1. Create a project at [sentry.io](https://sentry.io) (Next.js).
2. Set environment variables:
   - `NEXT_PUBLIC_SENTRY_DSN` – public DSN (client + server)
   - `SENTRY_DSN` – optional override for server (defaults to `NEXT_PUBLIC_SENTRY_DSN`)
   - `SENTRY_ORG` – Sentry org slug (for source maps)
   - `SENTRY_PROJECT` – Sentry project slug (for source maps)
   - `SENTRY_AUTH_TOKEN` – for source map uploads in CI
3. When DSN is not set, Sentry is disabled (no-op).

The app captures unhandled errors, React render errors (global-error.tsx), and server request errors (onRequestError). User-friendly messages are still shown; Sentry stores the underlying errors for debugging.

## Firebase Crashlytics (Flutter)

Crashlytics captures crashes and non-fatal errors in the Flutter app.

1. Enable Crashlytics in [Firebase Console](https://console.firebase.google.com) (same project as FCM).
2. The app uses `firebase_crashlytics`; unhandled errors are reported automatically.
3. Use `FirebaseCrashlytics.instance.recordError()` for caught exceptions.

## Other options

- **Logtail / Axiom**: If you ship logs to a service, ensure `console.error` from API routes and server actions is included.
- **Vercel**: Logs from serverless functions appear in the Vercel dashboard.
