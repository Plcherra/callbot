"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { createClient } from "@/app/lib/supabase/client";
import { deleteAccount } from "@/app/actions/settings";

export function DeleteAccountTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("Delete your account? This will remove all your data. You can sign up again. This cannot be undone.")) return;
    setError(null); setLoading(true);
    const result = await deleteAccount();
    setLoading(false);
    if (result.success) {
      await createClient().auth.signOut();
      window.location.href = "/signup";
    } else setError(result.error ?? "Failed to delete account.");
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>Permanently delete your account and all associated data.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Button variant="destructive" onClick={handleDelete} disabled={loading}>{loading ? "Deleting…" : "Delete account"}</Button>
      </CardContent>
    </Card>
  );
}
