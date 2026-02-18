import Link from "next/link";
import { Button } from "@/app/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 px-6 py-24 text-white sm:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          AI Receptionist – Never Miss a Booking
        </h1>
        <p className="mt-6 text-lg text-white/90 sm:text-xl">
          Your AI answers calls, books appointments, and syncs with Google
          Calendar. Perfect for salons, barbers, spas, and handymen.
        </p>
        <p className="mt-4 text-2xl font-semibold">From $69/mo</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="bg-white text-purple-700 hover:bg-white/90">
            <Link href="/signup">Get Started</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/50 bg-transparent text-white hover:bg-white/10">
            <Link href="/signup?plan=starter">Start free trial</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
