import Link from "next/link";
import { Button } from "@/app/components/ui/button";

const APP_STORE_URL = "https://apps.apple.com/app/echodesk";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.echodesk.app";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-semibold">
          AI Receptionist
        </Link>
        <nav className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">iOS</a>
          </Button>
          <Button asChild size="sm">
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">Android</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
