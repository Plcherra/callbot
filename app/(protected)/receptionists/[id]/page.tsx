import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { Button } from "@/app/components/ui/button";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { AppNav } from "@/app/components/dashboard/AppNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { getCurrentPeriod } from "@/app/lib/usage";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
};

export default async function ReceptionistDetailPage({ params, searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  const { id } = await params;
  const { data: receptionist } = await supabase
    .from("receptionists")
    .select("id, name, phone_number, calendar_id, status, vapi_assistant_id, inbound_phone_number")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!receptionist) notFound();

  const { created } = await searchParams;

  const { period_start: usagePeriodStart } = getCurrentPeriod();
  const { data: userRow } = await supabase
    .from("users")
    .select("billing_plan_metadata")
    .eq("id", user.id)
    .single();
  const { data: callHistory } = await supabase
    .from("call_usage")
    .select("id, started_at, ended_at, duration_seconds, transcript")
    .eq("receptionist_id", receptionist.id)
    .order("started_at", { ascending: false })
    .limit(20);

  const { data: snapshot } = await supabase
    .from("usage_snapshots")
    .select("total_seconds, overage_minutes")
    .eq("receptionist_id", receptionist.id)
    .eq("period_start", usagePeriodStart)
    .maybeSingle();
  const usageMinutes = snapshot
    ? Math.ceil((snapshot.total_seconds ?? 0) / 60)
    : 0;
  const metadata = userRow?.billing_plan_metadata as { included_minutes?: number } | null | undefined;
  const includedMinutes = typeof metadata?.included_minutes === "number" ? metadata.included_minutes : null;
  const overageMinutes = snapshot?.overage_minutes ?? 0;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href="/receptionists">← Receptionists</Link>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <AppNav />
          <SignOutButton />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{receptionist.name}</h1>
        <Badge variant={receptionist.status === "active" ? "success" : "secondary"}>
          {receptionist.status}
        </Badge>
      </div>
      <p className="mt-1 text-muted-foreground">
        AI receptionist
        {receptionist.inbound_phone_number
          ? ` · Your number: ${receptionist.inbound_phone_number}`
          : ` · ${receptionist.phone_number}`}
      </p>

      {created === "1" && receptionist.vapi_assistant_id && receptionist.inbound_phone_number && (
        <Alert className="mt-6 border-green-500 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <AlertTitle className="text-green-800 dark:text-green-200">Your AI is live—call now to test!</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            Your receptionist was just created. Call the number below to hear it in action.
          </AlertDescription>
        </Alert>
      )}

      {receptionist.vapi_assistant_id && receptionist.inbound_phone_number && (
        <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-6 text-center dark:border-green-900 dark:bg-green-950/30">
          <h3 className="text-lg font-semibold">Your AI Receptionist is Live!</h3>
          <p className="mt-2">Call this number to test it right now:</p>
          <p className="mt-4 text-2xl font-bold">{receptionist.inbound_phone_number}</p>
          <Button className="mt-6" asChild>
            <a href={`tel:${receptionist.inbound_phone_number}`}>Call Now</a>
          </Button>
          <p className="mt-4 text-sm text-muted-foreground">
            First 2 minutes are free on the Free plan. Try asking it to book an appointment.
          </p>
        </div>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {receptionist.inbound_phone_number ? (
            <p>
              <span className="font-medium">Your number:</span>{" "}
              {receptionist.inbound_phone_number}
            </p>
          ) : (
            <p>
              <span className="font-medium">Phone:</span> {receptionist.phone_number}
            </p>
          )}
          {receptionist.calendar_id && (
            <p>
              <span className="font-medium">Calendar:</span> {receptionist.calendar_id}
            </p>
          )}
          {receptionist.vapi_assistant_id && (
            <p>
              <span className="font-medium">Assistant:</span> Connected
            </p>
          )}
          <p>
            <span className="font-medium">Minutes this period:</span>{" "}
            {includedMinutes != null
              ? `${usageMinutes} / ${includedMinutes}`
              : `${usageMinutes}`}
            {overageMinutes > 0 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                ({overageMinutes} overage)
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      {callHistory && callHistory.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">Call history</CardTitle>
            <p className="text-sm text-muted-foreground">
              Recent calls. Transcripts appear when provided by the voice provider.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {callHistory.map((call) => (
                <li
                  key={call.id}
                  className="rounded-lg border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {new Date(call.started_at).toLocaleString()}
                    </span>
                    <span className="font-medium">
                      {call.duration_seconds != null
                        ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                        : "—"}
                    </span>
                  </div>
                  {call.transcript?.trim() && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        View transcript
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs">
                        {call.transcript}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mt-6">
        <Button asChild>
          <Link href={`/receptionists/${receptionist.id}/settings`}>
            Manage settings
          </Link>
        </Button>
      </div>
    </main>
  );
}
