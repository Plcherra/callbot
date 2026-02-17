# Analytics (PostHog)

Optional analytics are supported via [PostHog](https://posthog.com) for signup, activation, and usage tracking during beta and launch.

## Setup

1. Create a free account at [posthog.com](https://posthog.com) and create a project.
2. Copy your Project API Key from Project Settings.
3. Add to `.env.local`:
   ```
   NEXT_PUBLIC_POSTHOG_KEY=phc_...
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   ```
4. Restart the dev server. Page views and any custom events will be sent when the key is set.

## Usage

- **Automatic**: With the provider in the root layout, PostHog captures page views when the key is set.
- **Custom events**: In client components, use the `usePostHog` hook from `posthog-js/react` to capture events (e.g. `posthog.capture('receptionist_created')`, `posthog.capture('checkout_started', { plan: 'pro' })`).

If `NEXT_PUBLIC_POSTHOG_KEY` is not set, the app runs without analytics; no data is sent.
