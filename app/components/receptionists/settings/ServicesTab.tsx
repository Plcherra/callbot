"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import type { ServiceRow } from "./types";

type Props = {
  receptionistId: string;
  services: ServiceRow[];
  onAdd: (input: { name: string; description?: string; price_cents?: number; duration_minutes?: number }) => void;
  onDelete: (id: string) => void;
};

export function ServicesTab({ receptionistId, services, onAdd, onDelete }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceCents, setPriceCents] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onAdd({
      name: name.trim(),
      description: description.trim() || undefined,
      price_cents: priceCents ? Math.round(parseFloat(priceCents) * 100) : 0,
      duration_minutes: durationMinutes ? parseInt(durationMinutes, 10) : 0,
    });
    setName("");
    setDescription("");
    setPriceCents("");
    setDurationMinutes("");
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service menu</CardTitle>
        <CardDescription>Services with pricing and duration.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Service name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-48"
            />
            <Input
              placeholder="Price ($)"
              type="number"
              step="0.01"
              value={priceCents}
              onChange={(e) => setPriceCents(e.target.value)}
              className="w-24"
            />
            <Input
              placeholder="Duration (min)"
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-24"
            />
          </div>
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="max-w-md"
          />
          <Button type="submit" disabled={loading}>
            Add service
          </Button>
        </form>
        <ul className="space-y-2">
          {services.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded border px-3 py-2 text-sm"
            >
              <span>
                {s.name}
                {s.price_cents > 0 && ` · $${(s.price_cents / 100).toFixed(2)}`}
                {s.duration_minutes > 0 && ` · ${s.duration_minutes} min`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => onDelete(s.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {services.length === 0 && (
          <p className="text-sm text-muted-foreground">No services added yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
