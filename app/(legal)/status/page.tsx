import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";

export default function StatusPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">← Back to home</Link>
        </Button>
      </div>
      <h1 className="text-3xl font-bold">System Status</h1>
      <p className="mt-2 text-muted-foreground">
        Current status of our app and dependencies. Updated manually; external status pages linked below.
      </p>

      <div className="mt-8 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              App
              <Badge variant="success">Operational</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Core application and API. Check <code className="rounded bg-muted px-1">/api/health</code> for programmatic health.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Voice (Vapi)
              <Badge variant="success">Operational</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            AI voice and phone numbers.{" "}
            <a
              href="https://status.vapi.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Vapi status
            </a>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Payments (Stripe)
              <Badge variant="success">Operational</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Subscriptions and billing.{" "}
            <a
              href="https://status.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Stripe status
            </a>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Calendar (Google)
              <Badge variant="success">Operational</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Google Calendar for availability and bookings.{" "}
            <a
              href="https://www.google.com/appsstatus/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Google Workspace status
            </a>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
