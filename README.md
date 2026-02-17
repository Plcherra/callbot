# AI Receptionist – Subscription Platform

Next.js + Supabase + Stripe + Vapi.ai app for selling and auto-managing AI receptionists for salons, barbers, spas, and handymen.

## Features

- **Landing page**: Hero, multi-tier pricing (subscription + per-minute), demo video, testimonials
- **Free signup**: Email/password + Google OAuth → redirect to dashboard (no payment required)
- **Dashboard** (protected): Free mode shows plan picker (subscription or per-minute); after payment, full setup (Google Calendar, phone, Activate assistant)
- **Upgrade**: Plan selection opens Stripe Checkout for the chosen tier (or optional Stripe Buy Button embed)
- **Assistant activation**: Manual; creates Vapi assistant; shows status and test call number. After payment, redirect to `/dashboard`.

## Tech Stack

- Next.js 14 (App Router)
- Supabase (auth, users table)
- Stripe (recurring subscription, prebuilt checkout / Buy Button)
- Vapi.ai (assistant API)
- Tailwind CSS + shadcn/ui (Card, Button, Input, Skeleton, Alert)

## Setup

### 1. Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Stripe**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and price IDs:
  - Subscription: `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_ENTERPRISE`
  - Per-minute: `STRIPE_PRICE_PER_MINUTE_1`, `STRIPE_PRICE_PER_MINUTE_2`, `STRIPE_PRICE_PER_MINUTE_3`
  - Legacy single plan: `STRIPE_PRICE_ID` (treated as Starter if `STRIPE_PRICE_STARTER` is not set)
- **Optional Stripe Buy Button**: Create a Payment Link in Stripe → Buy button → copy embed code and set `NEXT_PUBLIC_STRIPE_BUY_BUTTON_ID` (buy-button-id from the embed)
- **Vapi.ai**: `VAPI_API_KEY` (phone numbers are provisioned per receptionist; see [docs/NUMBERS.md](docs/NUMBERS.md) — 10 free US numbers per account)
- **Google OAuth**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` (e.g. `http://localhost:3000/api/google/callback`)
- **App**: `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000`)

### 2. Supabase

1. Create a project and enable Email auth and Google OAuth.
2. Run the migration: in Supabase SQL Editor, run `supabase/migrations/001_initial_schema.sql`.
3. Add redirect URL for Google OAuth: `http://localhost:3000/api/google/callback` (and your production URL).

### 3. Stripe

1. **Subscription prices**: Create 4 recurring products/prices (e.g. $49/mo, $99/mo, $169/mo, $329/mo) and set `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_ENTERPRISE`. Optionally set Price metadata: `plan=subscription_starter`, `included_minutes=300` (and similarly for pro/business/enterprise).
2. **Per-minute prices**: Create 3 recurring base prices ($5/mo, $7/mo, $10/mo) and set `STRIPE_PRICE_PER_MINUTE_1`, `STRIPE_PRICE_PER_MINUTE_2`, `STRIPE_PRICE_PER_MINUTE_3`. Usage is billed separately via the billing cron. Optionally set Price metadata: `plan=per_minute`, `monthly_fee_cents`, `per_minute_cents`.
3. **Legacy**: A single `STRIPE_PRICE_ID` is supported and treated as Starter (300 min @ $49) when the dedicated Starter env is not set.
4. **Optional Buy Button**: Create a Payment Link for a plan → **Buy button** → copy `buy-button-id` into `NEXT_PUBLIC_STRIPE_BUY_BUTTON_ID`. Set the Payment Link success URL to your `/dashboard`.

### 4. Vapi.ai

1. Get your API key and set `VAPI_API_KEY`.
2. Phone numbers are created automatically per receptionist (Vapi free telephony). See [docs/NUMBERS.md](docs/NUMBERS.md) for the 10-number limit and options.

### 5. Google OAuth

1. Create a Google Cloud project, enable Google Calendar API.
2. Create OAuth 2.0 credentials (Web application).
3. Add authorized redirect URI: `http://localhost:3000/api/google/callback` (and production).
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For production error monitoring (e.g. Sentry), see [docs/ERROR_MONITORING.md](docs/ERROR_MONITORING.md).

## Test flow

1. **Free signup**: Go to `/signup`, enter email/password (or “Continue with Google”) → redirect to `/dashboard`.
2. **Dashboard (free)**: See plan picker (subscription and per-minute). Select a plan → redirect to Stripe Checkout.
3. **Pay**: Use test card `4242 4242 4242 4242`; complete checkout → redirect to `/dashboard?session_id=...`.
4. **Manual activation**: When ready, use Connect Google Calendar, phone, and Activate assistant. Pay with test card → redirect to /dashboard (no crash).

## File summary

- `app/page.tsx` – Landing (Hero, video, Pricing, Testimonials)
- `app/(auth)/signup/page.tsx` – Free signup (email/password + Google), redirect to dashboard
- `app/(auth)/login/page.tsx` – Login (email/password + Google)
- `app/(protected)/dashboard/page.tsx` – Protected dashboard; free mode (Upgrade card) vs Pro (Calendar, phone, Activate assistant)
- `app/api/google/callback/route.ts` – Google OAuth callback
- `app/actions/upgrade.ts` – Create Stripe Checkout session for current user (server-side)
- `app/actions/activateBot.ts` – Vapi assistant creation
- `app/actions/google.ts` – Google OAuth URL
- `app/actions/dashboard.ts` – Save phone
- `app/components/dashboard/UpgradeCard.tsx` – “Upgrade to Pro” button + optional `<stripe-buy-button>` embed
- `app/components/ui/alert.tsx` – Alert (loading/error/success)
- `types/stripe-buy-button.d.ts` – Type for `<stripe-buy-button>` custom element
- `supabase/migrations/001_initial_schema.sql` – Users table + RLS + trigger
- `middleware.ts` – Supabase session refresh
