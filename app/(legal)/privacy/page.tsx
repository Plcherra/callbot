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
            <li>Call recordings and transcripts (via our voice AI provider, Vapi.ai). Call audio and text may be processed and stored for quality, training, and support.</li>
            <li>Call metadata (duration, timestamps) and usage for billing</li>
          </ul>

          <h3 className="font-semibold">Call recordings and transcripts</h3>
          <p>
            Calls handled by the AI receptionist may be recorded. Transcripts may be generated and stored. We retain call data as needed for the service, support, and legal obligations; you can request deletion of your account data (including call history) by contacting us. Callers are notified that the call may be recorded; you are responsible for ensuring your use of recording complies with applicable laws (e.g., TCPA, state consent rules).
          </p>

          <h3 className="font-semibold">How we use it</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>To provide the AI receptionist service</li>
            <li>To process payments and manage subscriptions</li>
            <li>To sync appointments with your Google Calendar</li>
            <li>To improve the service</li>
          </ul>

          <h3 className="font-semibold">Third-party services</h3>
          <p>
            We use <strong>Supabase</strong> (database and auth), <strong>Stripe</strong> (payments), and <strong>Vapi.ai</strong> (voice AI and call processing, including recording and transcription). Each has their own privacy policies. Vapi.ai acts as a data processor for call data. We do not sell your data to third parties.
          </p>

          <h3 className="font-semibold">Your rights (GDPR / CCPA)</h3>
          <p>
            You can request access, correction, or deletion of your data at any time by contacting us. We will process requests within 30 days. If you are in the EU/EEA or California, you may have additional rights (e.g., data portability, restriction of processing, object to processing). Contact us to exercise these rights.
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
