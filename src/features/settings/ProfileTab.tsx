"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { createClient } from "@/app/lib/supabase/client";

type Props = { email: string };

export function ProfileTab({ email }: Props) {
  const [passwordVal, setPasswordVal] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordVal !== passwordConfirm) { setMessage({ type: "error", text: "Passwords do not match." }); return; }
    if (passwordVal.length < 6) { setMessage({ type: "error", text: "Password must be at least 6 characters." }); return; }
    setSaving(true); setMessage(null);
    const { error } = await createClient().auth.updateUser({ password: passwordVal });
    setSaving(false);
    if (error) setMessage({ type: "error", text: error.message });
    else { setMessage({ type: "success", text: "Password updated." }); setPasswordVal(""); setPasswordConfirm(""); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Email and password</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium">Email</label>
          <p className="mt-1 text-sm text-muted-foreground">{email}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="new-password" className="text-sm font-medium">New password</label>
            <Input id="new-password" type="password" value={passwordVal} onChange={(e) => setPasswordVal(e.target.value)} placeholder="••••••••" minLength={6} />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirm-password" className="text-sm font-medium">Confirm password</label>
            <Input id="confirm-password" type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="••••••••" minLength={6} />
          </div>
          {message && <Alert variant={message.type === "error" ? "destructive" : "default"}><AlertDescription>{message.text}</AlertDescription></Alert>}
          <Button type="submit" disabled={saving}>{saving ? "Updating…" : "Change password"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
