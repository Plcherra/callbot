import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getPlanDisplayLabel,
  getPlanPriceLabel,
  getPriceIdForPlanId,
  type BillingPlanMetadata,
} from "./plans";

describe("getPlanDisplayLabel", () => {
  it("returns Free for null billing plan", () => {
    expect(getPlanDisplayLabel(null, null)).toBe("Free");
  });

  it("returns plan name with default minutes for known plans", () => {
    expect(getPlanDisplayLabel("subscription_starter", null)).toBe("Starter (300 min)");
    expect(getPlanDisplayLabel("subscription_pro", null)).toBe("Pro (800 min)");
    expect(getPlanDisplayLabel("subscription_business", null)).toBe("Business (1500 min)");
  });

  it("uses metadata included_minutes when provided", () => {
    const meta: BillingPlanMetadata = { included_minutes: 500 };
    expect(getPlanDisplayLabel("subscription_starter", meta)).toBe("Starter (500 min)");
  });

  it("returns Legacy plan for per_minute", () => {
    expect(getPlanDisplayLabel("per_minute", null)).toBe("Legacy plan");
  });

  it("returns raw billingPlan for unknown", () => {
    expect(getPlanDisplayLabel("unknown_plan", null)).toBe("unknown_plan");
  });
});

describe("getPlanPriceLabel", () => {
  it("returns empty string for null", () => {
    expect(getPlanPriceLabel(null, null)).toBe("");
  });

  it("returns price for known plans", () => {
    expect(getPlanPriceLabel("subscription_starter", null)).toBe("$69/mo");
    expect(getPlanPriceLabel("subscription_pro", null)).toBe("$149/mo");
  });

  it("returns formatted string for per_minute", () => {
    expect(getPlanPriceLabel("per_minute", null)).toBe("$5 + $0.35/min");
  });
});

describe("getPriceIdForPlanId", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns env price ID when set", () => {
    process.env.STRIPE_PRICE_STARTER = "price_starter_123";
    expect(getPriceIdForPlanId("starter")).toBe("price_starter_123");
  });

  it("falls back to STRIPE_PRICE_ID for starter when STRIPE_PRICE_STARTER not set", () => {
    delete process.env.STRIPE_PRICE_STARTER;
    process.env.STRIPE_PRICE_ID = "price_legacy";
    expect(getPriceIdForPlanId("starter")).toBe("price_legacy");
  });

  it("returns null for unknown plan", () => {
    expect(getPriceIdForPlanId("unknown" as "starter")).toBe(null);
  });
});
