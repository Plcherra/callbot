"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import type { StaffRow } from "./types";

type Props = {
  receptionistId: string;
  staff: StaffRow[];
  onAdd: (input: { name: string; role?: string }) => void;
  onDelete: (id: string) => void;
};

export function StaffTab({ receptionistId, staff, onAdd, onDelete }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onAdd({ name: name.trim(), role: role.trim() || undefined });
    setName("");
    setRole("");
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff</CardTitle>
        <CardDescription>Employees and availability for this receptionist.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-40"
          />
          <Input
            placeholder="Role (optional)"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-40"
          />
          <Button type="submit" disabled={loading}>
            Add
          </Button>
        </form>
        <ul className="space-y-2">
          {staff.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded border px-3 py-2 text-sm"
            >
              <span>
                {s.name}
                {s.role && ` · ${s.role}`}
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
        {staff.length === 0 && (
          <p className="text-sm text-muted-foreground">No staff added yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
