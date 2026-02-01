import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">← Back to home</Link>
        </Button>
      </div>
      <h1 className="text-3xl font-bold">About Us</h1>
      <p className="mt-2 text-muted-foreground">
        We build AI receptionists for small businesses.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Our Mission</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none space-y-4 text-sm">
          <p>
            We help salons, barbers, spas, and handymen never miss a booking. Our AI receptionist answers calls 24/7, books appointments into Google Calendar, and provides a professional experience for your customers.
          </p>
          <p>
            Based in <strong>Massachusetts</strong>, we're a small team focused on making AI accessible and affordable for local businesses.
          </p>

          <h3 className="font-semibold">Why we built this</h3>
          <p>
            Small business owners are busy. Missing calls means lost revenue. We created an AI solution that's simple to set up, works with your existing tools (Google Calendar, your phone number), and costs less than hiring a part-time receptionist.
          </p>

          <h3 className="font-semibold">Technology</h3>
          <p>
            We use <strong>Vapi.ai</strong> for voice AI, <strong>Supabase</strong> for secure data, and <strong>Stripe</strong> for payments. Your data is encrypted and never sold to third parties.
          </p>

          <h3 className="font-semibold">Get started</h3>
          <p>
            <Link href="/signup" className="text-primary underline">Sign up free</Link> and upgrade to Pro ($29/mo) when you're ready. Cancel anytime.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
