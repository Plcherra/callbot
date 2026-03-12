import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { getPublicSubscriptionPlans } from "@/app/lib/plans";

const APP_STORE_URL = "https://apps.apple.com/app/echodesk";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.echodesk.app";

function DownloadLink({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <Button asChild className="flex-1" size="lg">
        <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">{children}</a>
      </Button>
      <Button asChild variant="outline" className="flex-1" size="lg">
        <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">Android</a>
      </Button>
    </div>
  );
}

export function Pricing() {
  const publicPlans = getPublicSubscriptionPlans();

  return (
    <section id="pricing" className="px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Simple pricing
        </h2>
        <p className="mt-4 text-center text-muted-foreground">
          Choose a plan with included minutes. No hidden fees.
        </p>

        <div className="mt-12">
          <h3 className="text-center text-lg font-semibold text-muted-foreground">
            Subscription plans
          </h3>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {publicPlans.filter((p) => p.id !== "payg").map((plan) => (
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
                    <li className="flex items-center gap-2">✓ Your dedicated phone number</li>
                    <li className="flex items-center gap-2">✓ Cancel anytime</li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <DownloadLink>Download App</DownloadLink>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
