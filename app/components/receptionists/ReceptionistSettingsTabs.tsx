"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import {
  listStaff,
  createStaff,
  deleteStaff,
  type StaffRow,
} from "@/app/actions/staff";
import {
  listServices,
  createService,
  deleteService,
  type ServiceRow,
} from "@/app/actions/services";
import {
  listLocations,
  createLocation,
  deleteLocation,
  type LocationRow,
} from "@/app/actions/locations";
import {
  listPromos,
  createPromo,
  deletePromo,
  type PromoRow,
} from "@/app/actions/promos";
import {
  listReminderRules,
  createReminderRule,
  deleteReminderRule,
  type ReminderRuleRow,
} from "@/app/actions/reminderRules";
import { updatePaymentSettings, type PaymentSettings } from "@/app/actions/receptionistSettings";
import { getPromptPreview, applyPromptToVapi } from "@/app/actions/applyReceptionistPrompt";

type Props = {
  receptionistId: string;
  receptionistName: string;
  initialStaff: StaffRow[];
  initialServices: ServiceRow[];
  initialLocations: LocationRow[];
  initialPromos: PromoRow[];
  initialReminderRules: ReminderRuleRow[];
  initialPaymentSettings?: PaymentSettings;
};

export function ReceptionistSettingsTabs({
  receptionistId,
  initialStaff,
  initialServices,
  initialLocations,
  initialPromos,
  initialReminderRules,
  initialPaymentSettings,
}: Props) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);
  const [services, setServices] = useState(initialServices);
  const [locations, setLocations] = useState(initialLocations);
  const [promos, setPromos] = useState(initialPromos);
  const [reminderRules, setReminderRules] = useState(initialReminderRules);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(
    initialPaymentSettings ?? {}
  );
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function refreshAll() {
    const [s, sv, l, p, r] = await Promise.all([
      listStaff(receptionistId),
      listServices(receptionistId),
      listLocations(receptionistId),
      listPromos(receptionistId),
      listReminderRules(receptionistId),
    ]);
    if ("data" in s) setStaff(s.data);
    if ("data" in sv) setServices(sv.data);
    if ("data" in l) setLocations(l.data);
    if ("data" in p) setPromos(p.data);
    if ("data" in r) setReminderRules(r.data);
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-8">
      <PromptPreviewCard
        receptionistId={receptionistId}
        onMessage={setMessage}
        onRefresh={router.refresh}
      />
      <Tabs defaultValue="staff">
      <TabsList className="flex flex-wrap gap-1">
        <TabsTrigger value="staff">Staff</TabsTrigger>
        <TabsTrigger value="services">Services</TabsTrigger>
        <TabsTrigger value="locations">Locations</TabsTrigger>
        <TabsTrigger value="payment">Payment</TabsTrigger>
        <TabsTrigger value="rules">Reminders & rules</TabsTrigger>
        <TabsTrigger value="promos">Promos</TabsTrigger>
      </TabsList>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"} className="mt-4">
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <TabsContent value="staff" className="mt-6">
        <StaffTab
          receptionistId={receptionistId}
          staff={staff}
          onAdd={async (input) => {
            const res = await createStaff(receptionistId, input);
            if ("error" in res) {
              setMessage({ type: "error", text: res.error });
              return;
            }
            setStaff((prev) => [...prev, res.data]);
            setMessage({ type: "success", text: "Staff added." });
            router.refresh();
          }}
          onDelete={async (staffId) => {
            const res = await deleteStaff(receptionistId, staffId);
            if ("error" in res) {
              setMessage({ type: "error", text: res.error });
              return;
            }
            setStaff((prev) => prev.filter((s) => s.id !== staffId));
            router.refresh();
          }}
        />
      </TabsContent>

      <TabsContent value="services" className="mt-6">
        <ServicesTab
          receptionistId={receptionistId}
          services={services}
          onAdd={async (input) => {
            const res = await createService(receptionistId, input);
            if ("error" in res) {
              setMessage({ type: "error", text: res.error });
              return;
            }
            setServices((prev) => [...prev, res.data]);
            setMessage({ type: "success", text: "Service added." });
            router.refresh();
          }}
          onDelete={async (serviceId) => {
            const res = await deleteService(receptionistId, serviceId);
            if ("error" in res) {
              setMessage({ type: "error", text: res.error });
              return;
            }
            setServices((prev) => prev.filter((s) => s.id !== serviceId));
            router.refresh();
          }}
        />
      </TabsContent>

      <TabsContent value="locations" className="mt-6">
        <LocationsTab
          receptionistId={receptionistId}
          locations={locations}
          onAdd={async (input) => {
            const res = await createLocation(receptionistId, input);
            if ("error" in res) {
              setMessage({ type: "error", text: res.error });
              return;
            }
            setLocations((prev) => [...prev, res.data]);
            setMessage({ type: "success", text: "Location added." });
            router.refresh();
          }}
          onDelete={async (locationId) => {
            const res = await deleteLocation(receptionistId, locationId);
            if ("error" in res) {
              setMessage({ type: "error", text: res.error });
              return;
            }
            setLocations((prev) => prev.filter((l) => l.id !== locationId));
            router.refresh();
          }}
        />
      </TabsContent>

      <TabsContent value="payment" className="mt-6">
        <PaymentTab
          receptionistId={receptionistId}
          settings={paymentSettings}
          onSave={async (settings) => {
            const res = await updatePaymentSettings(receptionistId, settings);
            if ("error" in res) {
              setMessage({ type: "error", text: res.error });
              return;
            }
            setPaymentSettings(settings);
            setMessage({ type: "success", text: "Payment settings saved." });
            router.refresh();
          }}
        />
      </TabsContent>

      <TabsContent value="rules" className="mt-6">
        <ReminderRulesTab
          receptionistId={receptionistId}
          rules={reminderRules}
          onAdd={async (input) => {
            const res = await createReminderRule(receptionistId, input);
            if ("error" in res) {
              setMessage({ type: "error", text: res.error });
              return;
            }
            setReminderRules((prev) => [...prev, res.data]);
            setMessage({ type: "success", text: "Rule added." });
            router.refresh();
          }}
          onDelete={async (ruleId) => {
            const res = await deleteReminderRule(receptionistId, ruleId);
            if ("error" in res) {
              setMessage({ type: "error", text: res.error });
              return;
            }
            setReminderRules((prev) => prev.filter((r) => r.id !== ruleId));
            router.refresh();
          }}
        />
      </TabsContent>

      <TabsContent value="promos" className="mt-6">
        <PromosTab
          receptionistId={receptionistId}
          promos={promos}
          onAdd={async (input) => {
            const res = await createPromo(receptionistId, input);
            if ("error" in res) {
              setMessage({ type: "error", text: res.error });
              return;
            }
            setPromos((prev) => [...prev, res.data]);
            setMessage({ type: "success", text: "Promo added." });
            router.refresh();
          }}
          onDelete={async (promoId) => {
            const res = await deletePromo(receptionistId, promoId);
            if ("error" in res) {
              setMessage({ type: "error", text: res.error });
              return;
            }
            setPromos((prev) => prev.filter((p) => p.id !== promoId));
            router.refresh();
          }}
        />
      </TabsContent>
    </Tabs>
    </div>
  );
}

function PromptPreviewCard({
  receptionistId,
  onMessage,
  onRefresh,
}: {
  receptionistId: string;
  onMessage: (m: { type: "success" | "error"; text: string } | null) => void;
  onRefresh: () => void;
}) {
  const [preview, setPreview] = useState<string>("");
  const [charCount, setCharCount] = useState(0);
  const [compact, setCompact] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);

  async function loadPreview() {
    setLoadingPreview(true);
    onMessage(null);
    const res = await getPromptPreview(receptionistId, { compact });
    setLoadingPreview(false);
    if ("error" in res) {
      onMessage({ type: "error", text: res.error });
      return;
    }
    setPreview(res.prompt);
    setCharCount(res.charCount);
  }

  async function handleApply() {
    setApplying(true);
    onMessage(null);
    const res = await applyPromptToVapi(receptionistId, { compact });
    setApplying(false);
    if ("error" in res) {
      onMessage({ type: "error", text: res.error });
      return;
    }
    onMessage({ type: "success", text: "Prompt applied to Vapi assistant." });
    onRefresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>What the bot will know</CardTitle>
        <CardDescription>
          Regenerate prompt from your staff, services, locations, payment, rules, and promos. Then apply it to your Vapi assistant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={compact}
            onChange={(e) => setCompact(e.target.checked)}
          />
          <span className="text-sm">Compact mode (fewer services/staff in prompt)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={loadPreview} disabled={loadingPreview}>
            {loadingPreview ? "Loading…" : "Preview prompt"}
          </Button>
          <Button type="button" onClick={handleApply} disabled={applying}>
            {applying ? "Applying…" : "Apply to Vapi"}
          </Button>
        </div>
        {preview && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              ~{Math.ceil(charCount / 4)} tokens · {charCount} characters
            </p>
            <pre className="max-h-48 overflow-auto rounded border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
              {preview.slice(0, 2000)}
              {preview.length > 2000 ? "\n\n… [truncated for display]" : ""}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StaffTab({
  receptionistId,
  staff,
  onAdd,
  onDelete,
}: {
  receptionistId: string;
  staff: StaffRow[];
  onAdd: (input: { name: string; role?: string }) => void;
  onDelete: (id: string) => void;
}) {
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

function ServicesTab({
  receptionistId,
  services,
  onAdd,
  onDelete,
}: {
  receptionistId: string;
  services: ServiceRow[];
  onAdd: (input: { name: string; description?: string; price_cents?: number; duration_minutes?: number }) => void;
  onDelete: (id: string) => void;
}) {
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

function LocationsTab({
  receptionistId,
  locations,
  onAdd,
  onDelete,
}: {
  receptionistId: string;
  locations: LocationRow[];
  onAdd: (input: { name: string; address?: string; notes?: string }) => void;
  onDelete: (id: string) => void;
}) {
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

function PaymentTab({
  receptionistId,
  settings,
  onSave,
}: {
  receptionistId: string;
  settings: PaymentSettings;
  onSave: (s: PaymentSettings) => void;
}) {
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
          Deposit, methods, and refund policy. The bot will tell callers you&apos;ll send a secure
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

function ReminderRulesTab({
  receptionistId,
  rules,
  onAdd,
  onDelete,
}: {
  receptionistId: string;
  rules: ReminderRuleRow[];
  onAdd: (input: { type: "reminder" | "rule"; content: string; trigger?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [type, setType] = useState<"reminder" | "rule">("rule");
  const [content, setContent] = useState("");
  const [trigger, setTrigger] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onAdd({
      type,
      content: content.trim(),
      trigger: trigger.trim() || undefined,
    });
    setContent("");
    setTrigger("");
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminders & rules</CardTitle>
        <CardDescription>Policy text and reminder config (e.g. 24h before).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "reminder" | "rule")}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="rule">Rule / policy</option>
            <option value="reminder">Reminder</option>
          </select>
          <Input
            placeholder="Trigger (e.g. 24h_before) for reminders"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="max-w-md"
          />
          <textarea
            placeholder="Content (e.g. Cancellations within 12h incur 50% fee)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={loading}>
            Add
          </Button>
        </form>
        <ul className="space-y-2">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded border px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{r.type}:</span> {r.content}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => onDelete(r.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground">No rules or reminders yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PromosTab({
  receptionistId,
  promos,
  onAdd,
  onDelete,
}: {
  receptionistId: string;
  promos: PromoRow[];
  onAdd: (input: { description: string; code: string; discount_type?: string; discount_value?: number }) => void;
  onDelete: (id: string) => void;
}) {
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
