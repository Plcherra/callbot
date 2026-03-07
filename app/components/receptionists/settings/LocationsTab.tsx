"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import type { LocationRow } from "./types";

type Props = {
  receptionistId: string;
  locations: LocationRow[];
  onAdd: (input: { name: string; address?: string; notes?: string }) => void;
  onDelete: (id: string) => void;
};

export function LocationsTab({ receptionistId, locations, onAdd, onDelete }: Props) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onAdd({
      name: name.trim(),
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setName("");
    setAddress("");
    setNotes("");
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Locations</CardTitle>
        <CardDescription>Stores or branches for this receptionist.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <Input
            placeholder="Location name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="max-w-md"
          />
          <Input
            placeholder="Address (optional)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="max-w-md"
          />
          <Input
            placeholder="Notes (e.g. parking, accessibility)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="max-w-md"
          />
          <Button type="submit" disabled={loading}>
            Add location
          </Button>
        </form>
        <ul className="space-y-2">
          {locations.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded border px-3 py-2 text-sm"
            >
              <span>
                {l.name}
                {l.address && ` · ${l.address}`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => onDelete(l.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {locations.length === 0 && (
          <p className="text-sm text-muted-foreground">No locations added yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
