"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";

export function DashboardRefresh({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      onClick={() => router.refresh()}
    >
      Refresh
    </Button>
  );
}
