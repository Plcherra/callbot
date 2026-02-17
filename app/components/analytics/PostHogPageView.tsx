"use client";

import { usePathname } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";

export function PostHogPageView() {
  const pathname = usePathname();
  const posthog = usePostHog();

  useEffect(() => {
    if (pathname && posthog) {
      posthog.capture("$pageview");
    }
  }, [pathname, posthog]);

  return null;
}
