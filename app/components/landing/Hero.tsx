import { Button } from "@/app/components/ui/button";

const APP_STORE_URL = "https://apps.apple.com/app/echodesk";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.echodesk.app";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 px-6 py-24 text-white sm:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          AI Receptionist – Never Miss a Booking
        </h1>
        <p className="mt-6 text-lg text-white/90 sm:text-xl">
          Your AI answers calls, books appointments, and syncs with Google
          Calendar. For individuals and small businesses—salons, barbers, spas, handymen, and more.
        </p>
        <p className="mt-4 text-2xl font-semibold">From $69/mo</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
          <Button asChild size="lg" className="bg-white text-purple-700 hover:bg-white/90">
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              Download for iOS
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/50 bg-transparent text-white hover:bg-white/10">
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
              Get it on Google Play
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
