import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Fail fast on missing critical env vars (production or when VALIDATE_ENV=1)
    const shouldValidate =
      process.env.NODE_ENV === "production" || process.env.VALIDATE_ENV === "1";
    if (shouldValidate) {
      const { validateEnvOrThrow } = await import("@/shared/lib/env");
      validateEnvOrThrow();
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
