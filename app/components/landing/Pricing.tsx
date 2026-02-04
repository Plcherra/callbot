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
import { subscriptionPlans, perMinutePlans } from "@/app/lib/plans";

function SignupLink({ planId, children }: { planId: string; children: React.ReactNode }) {
  return (
    <Button asChild className="w-full" size="lg">
      <Link href={`/signup?plan=${encodeURIComponent(planId)}`}>{children}</Link>
    </Button>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Simple pricing
        </h2>
        <p className="mt-4 text-center text-muted-foreground">
          Choose a fixed plan with included minutes or pay as you go.
        </p>

        {/* Subscription plans */}
        <div className="mt-12">
          <h3 className="text-center text-lg font-semibold text-muted-foreground">
            Subscription plans (included minutes)
          </h3>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {subscriptionPlans.map((plan) => (
              <Card
                key={plan.id}
                className="flex flex-col border-2 border-primary/20 shadow-lg"
              >
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>
                    {plan.includedMinutes.toLocaleString()} minutes included
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">
                      ${(plan.priceCents / 100).toFixed(0)}
                    </span>
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
                  <SignupLink planId={plan.id}>Get Started</SignupLink>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>

        {/* Per-minute plans */}
        <div className="mt-16">
          <h3 className="text-center text-lg font-semibold text-muted-foreground">
            Pay as you go (base + per minute)
          </h3>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {perMinutePlans.map((plan) => (
              <Card
                key={plan.id}
                className="flex flex-col border-2 border-primary/10 shadow-md"
              >
                <CardHeader>
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  <CardDescription>
                    Monthly base + usage
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-1">
                    <span className="text-2xl font-bold">
                      ${(plan.monthlyFeeCents / 100).toFixed(0)}
                    </span>
                    <span className="text-muted-foreground">/mo</span>
                    <span className="text-muted-foreground">+</span>
                    <span className="text-xl font-bold">
                      ${(plan.perMinuteCents / 100).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">/min</span>
                  </div>
                  <ul className="mt-6 space-y-3 text-sm">
                    <li className="flex items-center gap-2">✓ Same AI features</li>
                    <li className="flex items-center gap-2">✓ Billed on usage</li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <SignupLink planId={plan.id}>Get Started</SignupLink>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
