# Error Monitoring (Production)

For production, consider adding error tracking so you can see failures (e.g. Vapi API errors, Stripe webhook issues) without exposing raw errors to users.

## Sentry

1. Create a project at [sentry.io](https://sentry.io) (Next.js).
2. Install: `npm install @sentry/nextjs`
3. Run the Sentry wizard: `npx @sentry/wizard@latest -i nextjs`
4. Configure `SENTRY_DSN` in your environment.

The app already returns user-friendly messages for Vapi and checkout failures; Sentry will capture the underlying errors server-side for debugging.

## Other options

- **Logtail / Axiom**: If you ship logs to a service, ensure `console.error` from API routes and server actions is included.
- **Vercel**: Logs from serverless functions appear in the Vercel dashboard.
