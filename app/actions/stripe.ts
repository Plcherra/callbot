"use server";

import { getStripe } from "@/app/lib/stripe";

const PRICE_ID = process.env.STRIPE_PRICE_ID!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function createCheckoutSession(email: string, userId: string) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: PRICE_ID,
        quantity: 1,
      },
    ],
    success_url: `${APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/signup`,
    customer_email: email,
    metadata: {
      userId,
      email,
    },
    subscription_data: {
      metadata: {
        userId,
        email,
      },
    },
  });

  return { url: session.url };
}
