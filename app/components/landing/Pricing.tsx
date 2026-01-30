import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

export function Pricing() {
  return (
    <section className="px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Simple pricing
        </h2>
        <p className="mt-4 text-center text-muted-foreground">
          One plan. Everything you need to never miss a booking.
        </p>
        <div className="mt-12 flex justify-center">
          <Card className="w-full max-w-md border-2 border-primary/20 shadow-lg">
            <CardHeader>
              <CardTitle>AI Receptionist</CardTitle>
              <CardDescription>
                Unlimited calls, Google Calendar sync, custom greeting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">$29</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                <li className="flex items-center gap-2">✓ AI answers 24/7</li>
                <li className="flex items-center gap-2">✓ Books into Google Calendar</li>
                <li className="flex items-center gap-2">✓ Your business phone number</li>
                <li className="flex items-center gap-2">✓ Cancel anytime</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full" size="lg">
                <Link href="/signup">Get Started</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </section>
  );
}
