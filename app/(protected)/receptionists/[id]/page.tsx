import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { Button } from "@/app/components/ui/button";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { AppNav } from "@/app/components/dashboard/AppNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";

type Props = { params: Promise<{ id: string }> };

export default async function ReceptionistDetailPage({ params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  const { id } = await params;
  const { data: receptionist } = await supabase
    .from("receptionists")
    .select("id, name, phone_number, calendar_id, status, vapi_assistant_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!receptionist) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
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
        AI receptionist · {receptionist.phone_number}
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Phone:</span> {receptionist.phone_number}
          </p>
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
        </CardContent>
      </Card>

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
