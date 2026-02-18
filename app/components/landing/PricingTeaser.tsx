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
import { subscriptionPlans } from "@/app/lib/plans";

function SignupLink({ planId, children }: { planId: string; children: React.ReactNode }) {
  return (
    <Button asChild className="w-full" size="sm">
      <Link href={`/signup?plan=${encodeURIComponent(planId)}`}>{children}</Link>
    </Button>
  );
}

const FREE_TRIAL_PLAN = {
  id: "starter",
  name: "Free",
  priceCents: 0,
  includedMinutes: 0,
};

export function PricingTeaser() {
  const teaserPlans = [FREE_TRIAL_PLAN, ...subscriptionPlans.slice(0, 3)];

  return (
    <section className="px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {teaserPlans.map((plan) => (
            <Card
              key={plan.id}
              className="flex flex-col border-2 border-primary/10 shadow-md transition-colors hover:border-primary/20"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{plan.name}</CardTitle>
                <CardDescription>
                  {plan.includedMinutes > 0
                    ? `${plan.includedMinutes.toLocaleString()} min included`
                    : "Try free"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">
                    ${(plan.priceCents / 100).toFixed(0)}
                  </span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                {plan.includedMinutes > 0 && (
                  <ul className="mt-4 space-y-1.5 text-xs">
                    <li className="flex items-center gap-2">✓ AI answers 24/7</li>
                    <li className="flex items-center gap-2">✓ Google Calendar</li>
                    <li className="flex items-center gap-2">✓ Your phone number</li>
                  </ul>
                )}
              </CardContent>
              <CardFooter>
                <SignupLink planId={plan.id}>
                  {plan.priceCents === 0 ? "Start free trial" : "Get Started"}
                </SignupLink>
              </CardFooter>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-center">
          <Link
            href="#pricing"
            className="text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/90"
          >
            See all plans →
          </Link>
        </p>
      </div>
    </section>
  );
}
