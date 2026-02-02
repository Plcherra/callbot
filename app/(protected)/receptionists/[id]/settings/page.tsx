import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { Button } from "@/app/components/ui/button";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { AppNav } from "@/app/components/dashboard/AppNav";
import { listStaff } from "@/app/actions/staff";
import { listServices } from "@/app/actions/services";
import { listLocations } from "@/app/actions/locations";
import { listPromos } from "@/app/actions/promos";
import { listReminderRules } from "@/app/actions/reminderRules";
import { getReceptionist } from "@/app/actions/receptionistSettings";
import { ReceptionistSettingsTabs } from "@/app/components/receptionists/ReceptionistSettingsTabs";
import type { StaffRow } from "@/app/actions/staff";
import type { ServiceRow } from "@/app/actions/services";
import type { LocationRow } from "@/app/actions/locations";
import type { PromoRow } from "@/app/actions/promos";
import type { ReminderRuleRow } from "@/app/actions/reminderRules";

type Props = { params: Promise<{ id: string }> };

export default async function ReceptionistSettingsPage({ params }: Props) {
  const { id } = await params;
  const recResult = await getReceptionist(id);
  if ("error" in recResult) {
    if (recResult.error === "Not authenticated.") redirect("/signup");
    notFound();
  }
  const receptionist = recResult.data;

  const [staffRes, servicesRes, locationsRes, promosRes, rulesRes] = await Promise.all([
    listStaff(id),
    listServices(id),
    listLocations(id),
    listPromos(id),
    listReminderRules(id),
  ]);

  const staff = "data" in staffRes ? staffRes.data : [];
  const services = "data" in servicesRes ? servicesRes.data : [];
  const locations = "data" in locationsRes ? locationsRes.data : [];
  const promos = "data" in promosRes ? promosRes.data : [];
  const reminderRules = "data" in rulesRes ? rulesRes.data : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/receptionists/${id}`}>← {receptionist.name}</Link>
        </Button>
        <div className="flex items-center gap-2">
          <AppNav />
          <SignOutButton />
        </div>
      </div>
      <h1 className="mt-6 text-2xl font-bold">Receptionist settings</h1>
      <p className="mt-1 text-muted-foreground">
        Staff, services, locations, payment, rules, and promos for this AI receptionist.
      </p>

      <ReceptionistSettingsTabs
        receptionistId={id}
        receptionistName={receptionist.name}
        initialStaff={staff as StaffRow[]}
        initialServices={services as ServiceRow[]}
        initialLocations={locations as LocationRow[]}
        initialPromos={promos as PromoRow[]}
        initialReminderRules={reminderRules as ReminderRuleRow[]}
        initialPaymentSettings={receptionist.payment_settings ?? undefined}
      />
    </main>
  );
}
