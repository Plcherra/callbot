"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { listStaff, createStaff, deleteStaff } from "@/app/actions/staff";
import { listServices, createService, deleteService } from "@/app/actions/services";
import { listLocations, createLocation, deleteLocation } from "@/app/actions/locations";
import { listPromos, createPromo, deletePromo } from "@/app/actions/promos";
import { listReminderRules, createReminderRule, deleteReminderRule } from "@/app/actions/reminderRules";
import { updatePaymentSettings } from "@/app/actions/receptionistSettings";
import type { StaffRow } from "@/app/actions/staff";
import type { ServiceRow } from "@/app/actions/services";
import type { LocationRow } from "@/app/actions/locations";
import type { PromoRow } from "@/app/actions/promos";
import type { ReminderRuleRow } from "@/app/actions/reminderRules";
import type { PaymentSettings } from "@/app/actions/receptionistSettings";
import { WebsiteCard } from "./settings/WebsiteCard";
import { ExtraInstructionsCard } from "./settings/ExtraInstructionsCard";
import { PromptPreviewCard } from "./settings/PromptPreviewCard";
import { StaffTab } from "./settings/StaffTab";
import { ServicesTab } from "./settings/ServicesTab";
import { LocationsTab } from "./settings/LocationsTab";
import { PaymentTab } from "./settings/PaymentTab";
import { ReminderRulesTab } from "./settings/ReminderRulesTab";
import { PromosTab } from "./settings/PromosTab";

type Props = {
  receptionistId: string;
  receptionistName?: string;
  initialStaff: StaffRow[];
  initialServices: ServiceRow[];
  initialLocations: LocationRow[];
  initialPromos: PromoRow[];
  initialReminderRules: ReminderRuleRow[];
  initialPaymentSettings?: PaymentSettings;
  initialWebsiteUrl?: string | null;
  initialWebsiteContentUpdatedAt?: string | null;
  initialExtraInstructions?: string | null;
};

export function ReceptionistSettingsTabs({
  receptionistId,
  initialStaff,
  initialServices,
  initialLocations,
  initialPromos,
  initialReminderRules,
  initialPaymentSettings,
  initialWebsiteUrl,
  initialWebsiteContentUpdatedAt,
  initialExtraInstructions,
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
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl ?? "");
  const [websiteContentUpdatedAt, setWebsiteContentUpdatedAt] = useState<string | null>(
    initialWebsiteContentUpdatedAt ?? null
  );
  const [extraInstructions, setExtraInstructions] = useState(initialExtraInstructions ?? "");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setWebsiteUrl(initialWebsiteUrl ?? "");
    setWebsiteContentUpdatedAt(initialWebsiteContentUpdatedAt ?? null);
  }, [initialWebsiteUrl, initialWebsiteContentUpdatedAt]);
  useEffect(() => {
    setExtraInstructions(initialExtraInstructions ?? "");
  }, [initialExtraInstructions]);

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
      <WebsiteCard
        receptionistId={receptionistId}
        websiteUrl={websiteUrl}
        setWebsiteUrl={setWebsiteUrl}
        websiteContentUpdatedAt={websiteContentUpdatedAt}
        setWebsiteContentUpdatedAt={setWebsiteContentUpdatedAt}
        onMessage={setMessage}
        onRefresh={router.refresh}
      />
      <ExtraInstructionsCard
        receptionistId={receptionistId}
        extraInstructions={extraInstructions}
        setExtraInstructions={setExtraInstructions}
        onMessage={setMessage}
        onRefresh={router.refresh}
      />
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
