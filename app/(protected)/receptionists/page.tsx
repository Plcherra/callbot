import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { Button } from "@/app/components/ui/button";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { AppNav } from "@/app/components/dashboard/AppNav";
import { ReceptionistsList } from "@/app/components/receptionists/ReceptionistsList";
import { AddReceptionistForm } from "@/app/components/receptionists/AddReceptionistForm";

export default async function ReceptionistsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signup");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, calendar_id, phone")
    .eq("id", user.id)
    .single();

  const isSubscribed = profile?.subscription_status === "active";

  const { data: receptionists } = await supabase
    .from("receptionists")
    .select("id, name, phone_number, vapi_assistant_id, inbound_phone_number, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Receptionists</h1>
        <div className="flex items-center gap-2">
          <AppNav />
          <SignOutButton />
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">
        Manage your AI receptionist assistants.
      </p>

      {!isSubscribed ? (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-medium">Upgrade to Pro</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You need an active subscription to add receptionists.
          </p>
          <Button asChild className="mt-4">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      ) : (
        <>
          <AddReceptionistForm
            defaultCalendarId={profile?.calendar_id ?? ""}
            defaultPhone={profile?.phone ?? null}
          />
          <ReceptionistsList receptionists={receptionists ?? []} />
        </>
      )}
    </main>
  );
}
