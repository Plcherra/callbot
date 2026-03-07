"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import type { PaymentSettings } from "./types";

type Props = {
  receptionistId: string;
  settings: PaymentSettings;
  onSave: (s: PaymentSettings) => void;
};

export function PaymentTab({ receptionistId, settings, onSave }: Props) {
  const [acceptDeposit, setAcceptDeposit] = useState(settings.accept_deposit ?? false);
  const [depositCents, setDepositCents] = useState(
    settings.deposit_amount_cents != null ? (settings.deposit_amount_cents / 100).toString() : ""
  );
  const [refundPolicy, setRefundPolicy] = useState(settings.refund_policy ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onSave({
      accept_deposit: acceptDeposit,
      deposit_amount_cents: depositCents ? Math.round(parseFloat(depositCents) * 100) : undefined,
      payment_methods: ["card", "venmo", "cash_on_arrival"],
      refund_policy: refundPolicy.trim() || undefined,
    });
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment</CardTitle>
        <CardDescription>
          Deposit, methods, and refund policy. The assistant will tell callers you&apos;ll send a secure
          payment link after booking.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={acceptDeposit}
              onChange={(e) => setAcceptDeposit(e.target.checked)}
            />
            <span className="text-sm">Accept deposit to secure booking</span>
          </label>
          <div>
            <label className="text-sm font-medium">Deposit amount ($)</label>
            <Input
              type="number"
              step="0.01"
              placeholder="10.00"
              value={depositCents}
              onChange={(e) => setDepositCents(e.target.value)}
              className="mt-1 max-w-xs"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Refund policy</label>
            <textarea
              placeholder="e.g. Full refund if cancelled 24h+ before; 50% within 24h."
              value={refundPolicy}
              onChange={(e) => setRefundPolicy(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={loading}>
            Save payment settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
