"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import type { PromoRow } from "./types";

type Props = {
  receptionistId: string;
  promos: PromoRow[];
  onAdd: (input: { description: string; code: string; discount_type?: string; discount_value?: number }) => void;
  onDelete: (id: string) => void;
};

export function PromosTab({ receptionistId, promos, onAdd, onDelete }: Props) {
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onAdd({
      description: description.trim(),
      code: code.trim(),
      discount_type: discountType.trim() || undefined,
      discount_value: discountValue ? parseFloat(discountValue) : undefined,
    });
    setDescription("");
    setCode("");
    setDiscountType("");
    setDiscountValue("");
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Promos</CardTitle>
        <CardDescription>Discount codes and promotions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <Input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className="max-w-md"
          />
          <Input
            placeholder="Code (e.g. SUMMER25)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            className="max-w-md"
          />
          <div className="flex gap-2">
            <Input
              placeholder="Discount type (e.g. percent)"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value)}
              className="w-32"
            />
            <Input
              placeholder="Value (e.g. 20)"
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="w-24"
            />
          </div>
          <Button type="submit" disabled={loading}>
            Add promo
          </Button>
        </form>
        <ul className="space-y-2">
          {promos.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded border px-3 py-2 text-sm"
            >
              <span>
                {p.code} · {p.description}
                {p.discount_value != null && ` (${p.discount_value}${p.discount_type === "percent" ? "%" : ""})`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => onDelete(p.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {promos.length === 0 && (
          <p className="text-sm text-muted-foreground">No promos yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
