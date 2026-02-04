import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { AppNav } from "@/app/components/dashboard/AppNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

export default async function HelpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signup");
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Help</h1>
        <div className="flex items-center gap-2">
          <AppNav />
          <SignOutButton />
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">
        Guides and support for your AI receptionist.
      </p>

      <div className="mt-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Getting started</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Complete onboarding: connect Google Calendar and add a default phone in{" "}
            <Link href="/settings" className="text-primary underline">
              Settings → Integrations
            </Link>
            , then create your first receptionist from{" "}
            <Link href="/receptionists" className="text-primary underline">
              My Receptionists
            </Link>
            . Each receptionist gets a dedicated phone number for inbound calls.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect Google Calendar</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Go to{" "}
            <Link href="/settings" className="text-primary underline">
              Settings → Integrations
            </Link>
            and click Connect Google Calendar. Authorize with the account that
            holds the calendar you use for appointments. The calendar ID is
            used for availability and booking.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billing and plans</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Subscription plans include a set number of minutes per month.
            Usage is tracked per receptionist; you can see &quot;Minutes this
            period&quot; on the dashboard and on each receptionist. Overage
            may be billed. Manage your subscription in{" "}
            <Link href="/settings" className="text-primary underline">
              Settings → Billing
            </Link>
            .
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact support</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Link href="/contact" className="text-primary underline">
              Contact us
            </Link>{" "}
            with questions or issues. You can also email{" "}
            <a
              href="mailto:echodesk2@gmail.com?subject=AI%20Receptionist%20Support"
              className="text-primary underline"
            >
              echodesk2@gmail.com
            </a>{" "}
            with a prefilled subject.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
