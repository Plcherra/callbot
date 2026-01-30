"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";

type Receptionist = {
  id: string;
  name: string;
  phone_number: string;
  vapi_assistant_id: string | null;
  status: string;
};

type Props = {
  receptionists: Receptionist[];
  testCallNumber: string | null;
};

export function ReceptionistsList({ receptionists, testCallNumber }: Props) {
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
              <CardTitle className="text-base">{r.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{r.phone_number}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={r.status === "active" ? "success" : "secondary"}>
                  {r.status === "active" ? "Active" : "Paused"}
                </Badge>
              </div>
              {testCallNumber && r.vapi_assistant_id && (
                <Button asChild variant="outline" size="sm">
                  <a href={`tel:${testCallNumber}`}>Test call</a>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
