# AI Receptionist – Subscription Platform

Next.js + Supabase + Stripe + Twilio app for selling and auto-managing AI receptionists for salons, barbers, spas, and handymen.

## Features

- **Landing page**: Hero, subscription pricing (Starter, Pro, Business), demo video, testimonials
- **Free signup**: Email/password + Google OAuth → redirect to dashboard (no payment required)
- **Dashboard** (protected): Free mode shows plan picker (subscription plans); after payment, full setup (Google Calendar, phone, Activate assistant)
- **Upgrade**: Plan selection opens Stripe Checkout for the chosen tier (or optional Stripe Buy Button embed)
- **Assistant activation**: Create receptionist from Receptionists page; provisions Twilio number and configures voice webhook. After payment, redirect to `/dashboard`.

## Tech Stack

- Next.js 14 (App Router)
- Supabase (auth, users table)
- Stripe (recurring subscription, prebuilt checkout / Buy Button)
- Twilio (phone provisioning, voice webhooks)
- Tailwind CSS + shadcn/ui (Card, Button, Input, Skeleton, Alert)

## Quick Start

```bash
npm install
cp .env.local.example .env.local
# Fill in .env.local (see Setup below)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). For Twilio voice, deploy the voice server ([docs/VOICE_SETUP.md](docs/VOICE_SETUP.md)).

## Setup

### 1. Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Stripe**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and price IDs:
  - `STRIPE_PRICE_DEV_TEST` ($1/mo for testing, hidden from public)
  - `STRIPE_PRICE_STARTER` ($69/mo), `STRIPE_PRICE_PRO` ($149/mo), `STRIPE_PRICE_BUSINESS` ($249/mo)
  - Legacy: `STRIPE_PRICE_ID` (treated as Starter if `STRIPE_PRICE_STARTER` is not set)
- **Optional Stripe Buy Button**: Create a Payment Link in Stripe → Buy button → copy embed code and set `NEXT_PUBLIC_STRIPE_BUY_BUTTON_ID` (buy-button-id from the embed)
- **Twilio**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_BASE_URL`, `VOICE_SERVER_WS_URL` (see [docs/NUMBERS.md](docs/NUMBERS.md), [docs/VOICE_SETUP.md](docs/VOICE_SETUP.md), [docs/TWILIO_SETUP.md](docs/TWILIO_SETUP.md))
- **Google OAuth**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` (e.g. `http://localhost:3000/api/google/callback`)
- **App**: `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000`)

### 2. Supabase

1. Create a project and enable Email auth and Google OAuth.
2. Run the migration: in Supabase SQL Editor, run `supabase/migrations/001_initial_schema.sql`.
3. Add redirect URL for Google OAuth: `http://localhost:3000/api/google/callback` (and your production URL).

### 3. Stripe

1. **Subscription prices**: Create 4 recurring prices: DEV Test $1/mo, Starter $69/mo, Pro $149/mo, Business $249/mo. Set `STRIPE_PRICE_DEV_TEST`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`. Optionally set Price metadata: `plan=subscription_starter`, `included_minutes=300` (and similarly for dev_test/pro/business).
2. **Legacy**: A single `STRIPE_PRICE_ID` is supported and treated as Starter (300 min @ $69) when the dedicated Starter env is not set.
3. **Optional Buy Button**: Create a Payment Link for a plan → **Buy button** → copy `buy-button-id` into `NEXT_PUBLIC_STRIPE_BUY_BUTTON_ID`. Set the Payment Link success URL to your `/dashboard`.

### 4. Twilio and voice server

1. Create a Twilio account and set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`.
2. Deploy the voice server (see [docs/VOICE_SETUP.md](docs/VOICE_SETUP.md)) and set `VOICE_SERVER_WS_URL`.
3. Set `TWILIO_WEBHOOK_BASE_URL` to your public app URL. Phone numbers are provisioned per receptionist when you create them.

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

- **Tests**: `npm run test` or `npm run test:run`
- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Stripe permissions**: [docs/STRIPE_PERMISSIONS.md](docs/STRIPE_PERMISSIONS.md)
- **Error monitoring**: [docs/ERROR_MONITORING.md](docs/ERROR_MONITORING.md)

## Test flow

1. **Free signup**: Go to `/signup`, enter email/password (or “Continue with Google”) → redirect to `/dashboard`.
2. **Dashboard (free)**: See plan picker (Starter, Pro, Business). Select a plan → redirect to Stripe Checkout.
3. **Pay**: Use test card `4242 4242 4242 4242`; complete checkout → redirect to `/dashboard?session_id=...`.
4. **Create receptionist**: Connect Google Calendar, then go to Receptionists and use the Add Receptionist wizard. Pay with test card → redirect to /dashboard (no crash).

## File summary

- `app/page.tsx` – Landing (Hero, video, Pricing, Testimonials)
- `app/(auth)/signup/page.tsx` – Free signup (email/password + Google), redirect to dashboard
- `app/(auth)/login/page.tsx` – Login (email/password + Google)
- `app/(protected)/dashboard/page.tsx` – Protected dashboard; free mode (Upgrade card) vs Pro (Calendar, phone, Activate assistant)
- `app/api/google/callback/route.ts` – Google OAuth callback
- `app/actions/upgrade.ts` – Create Stripe Checkout session for current user (server-side)
- `app/actions/createReceptionist.ts` – Create receptionist (Twilio provisioning)
- `app/actions/google.ts` – Google OAuth URL
- `app/actions/dashboard.ts` – Save phone
- `app/components/dashboard/UpgradeCard.tsx` – “Upgrade to Pro” button + optional `<stripe-buy-button>` embed
- `app/components/ui/alert.tsx` – Alert (loading/error/success)
- `types/stripe-buy-button.d.ts` – Type for `<stripe-buy-button>` custom element
- `supabase/migrations/001_initial_schema.sql` – Users table + RLS + trigger
- `middleware.ts` – Supabase session refresh
