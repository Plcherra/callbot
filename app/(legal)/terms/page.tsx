import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">← Back to home</Link>
        </Button>
      </div>
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-muted-foreground">Last updated: January 2026</p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Agreement</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none space-y-4 text-sm">
          <p>
            By using this service, you agree to these terms. If you do not agree, do not use the service.
          </p>

          <h3 className="font-semibold">Service</h3>
          <p>
            We provide an AI receptionist service for small businesses. The service includes call answering, appointment booking, and Google Calendar integration.
          </p>

          <h3 className="font-semibold">Subscription</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Paid plans: see <Link href="/#pricing" className="text-primary underline">Pricing</Link> (subscription plans with included minutes, or per-minute plans with base fee + usage).</li>
            <li>You can cancel anytime via the Stripe billing portal.</li>
            <li>No refunds after 7 days of initial subscription.</li>
            <li>We may change pricing with 30 days notice.</li>
          </ul>

          <h3 className="font-semibold">Your responsibilities</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide accurate business information (phone, calendar).</li>
            <li>Use the service lawfully; do not abuse or spam.</li>
            <li>Secure your account credentials.</li>
          </ul>

          <h3 className="font-semibold">Limitations</h3>
          <p>
            The service is provided "as is" without warranties. We are not liable for missed calls, booking errors, or downtime beyond reasonable efforts to maintain uptime.
          </p>

          <h3 className="font-semibold">Termination</h3>
          <p>
            We may suspend or terminate accounts that violate these terms. You may cancel your subscription at any time.
          </p>

          <h3 className="font-semibold">Changes</h3>
          <p>
            We may update these terms. Continued use after changes means you accept the new terms.
          </p>

          <h3 className="font-semibold">Contact</h3>
          <p>
            Questions? <Link href="/contact" className="text-primary underline">Contact us</Link>.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
