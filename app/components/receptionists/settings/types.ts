import type { PaymentSettings } from "@/app/actions/receptionistSettings";
import type { StaffRow } from "@/app/actions/staff";
import type { ServiceRow } from "@/app/actions/services";
import type { LocationRow } from "@/app/actions/locations";
import type { PromoRow } from "@/app/actions/promos";
import type { ReminderRuleRow } from "@/app/actions/reminderRules";

export type SettingsMessage = { type: "success" | "error"; text: string } | null;

export type { PaymentSettings, StaffRow, ServiceRow, LocationRow, PromoRow, ReminderRuleRow };
