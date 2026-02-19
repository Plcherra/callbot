"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { DeleteReceptionistButton } from "@/app/components/receptionists/DeleteReceptionistButton";

type Receptionist = {
  id: string;
  name: string;
  phone_number: string;
  vapi_assistant_id: string | null;
  inbound_phone_number: string | null;
  status: string;
};

type Props = {
  receptionists: Receptionist[];
};

export function ReceptionistsList({ receptionists }: Props) {
  if (receptionists.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <p>No receptionists yet.</p>
        <p className="mt-1 text-sm">Use the form above to add one.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-lg font-semibold">Your receptionists</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {receptionists.map((r) => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <Link href={`/receptionists/${r.id}`} className="hover:underline">
                  {r.name}
                </Link>
              </CardTitle>
              {r.inbound_phone_number ? (
                <p className="text-sm text-muted-foreground">
                  Your number: {r.inbound_phone_number}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{r.phone_number}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.status === "active" ? "success" : "secondary"}>
                  {r.status === "active" ? "Active" : "Paused"}
                </Badge>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/receptionists/${r.id}/settings`}>Settings</Link>
                </Button>
                {r.inbound_phone_number && r.vapi_assistant_id && (
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${r.inbound_phone_number}`}>Test call</a>
                  </Button>
                )}
                <DeleteReceptionistButton
                  receptionistId={r.id}
                  receptionistName={r.name}
                  variant="destructive"
                  size="sm"
                  iconOnly
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
