import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">← Back to home</Link>
        </Button>
      </div>
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-muted-foreground">Last updated: January 2026</p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Your Privacy</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none space-y-4 text-sm">
          <p>
            We respect your privacy. This policy explains what data we collect, how we use it, and your rights.
          </p>

          <h3 className="font-semibold">Data we collect</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Email, password (via Supabase authentication)</li>
            <li>Business phone number, Google Calendar ID (for AI receptionist)</li>
            <li>Payment info (via Stripe; we do not store card details)</li>
            <li>AI call logs (via Vapi.ai)</li>
          </ul>

          <h3 className="font-semibold">How we use it</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>To provide the AI receptionist service</li>
            <li>To process payments and manage subscriptions</li>
            <li>To sync appointments with your Google Calendar</li>
            <li>To improve the service</li>
          </ul>

          <h3 className="font-semibold">Third-party services</h3>
          <p>
            We use <strong>Supabase</strong> (database and auth), <strong>Stripe</strong> (payments), and <strong>Vapi.ai</strong> (AI calls). Each has their own privacy policies. We do not sell your data to third parties.
          </p>

          <h3 className="font-semibold">Your rights</h3>
          <p>
            You can request deletion of your data at any time by emailing us. We will delete your account and associated data within 30 days.
          </p>

          <h3 className="font-semibold">Contact</h3>
          <p>
            For privacy questions, email us at <a href="/contact" className="text-primary underline">our contact page</a>.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
