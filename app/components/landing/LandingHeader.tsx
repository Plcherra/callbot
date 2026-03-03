import Link from "next/link";
import { Button } from "@/app/components/ui/button";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-semibold">
          AI Receptionist
        </Link>
        <nav className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Get Started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
