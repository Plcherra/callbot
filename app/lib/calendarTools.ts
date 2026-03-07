/**
 * Calendar tool definitions for Grok function calling.
 * Used by the voice pipeline to check availability, create, and reschedule appointments.
 */

import type { GrokTool } from "./grok";

export const CALENDAR_TOOLS: GrokTool[] = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Check available time slots in the calendar for a given date. Use when the caller wants to book an appointment and needs to know what times are free.",
      parameters: {
        type: "object",
        properties: {
          start_date: {
            type: "string",
            description: "ISO date (YYYY-MM-DD) or datetime to check availability for",
          },
          end_date: {
            type: "string",
            description: "Optional end date if checking a date range",
          },
          duration_minutes: {
            type: "string",
            description: "Appointment duration in minutes (default 30)",
          },
          timezone: {
            type: "string",
            description: "Timezone e.g. America/New_York (default America/New_York)",
          },
        },
        required: ["start_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_appointment",
      description:
        "Create a new appointment/booking in the calendar. Use after the caller has chosen a time slot.",
      parameters: {
        type: "object",
        properties: {
          start_time: {
            type: "string",
            description: "ISO datetime for appointment start",
          },
          duration_minutes: {
            type: "string",
            description: "Duration in minutes (default 30)",
          },
          summary: {
            type: "string",
            description: "Appointment title/summary (e.g. client name and service)",
          },
          description: {
            type: "string",
            description: "Optional additional details",
          },
          attendees: {
            type: "array",
            description: "Optional array of attendee email addresses",
            items: { type: "string" },
          },
        },
        required: ["start_time", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description:
        "Reschedule an existing appointment to a new time. Use when the caller wants to change an existing booking.",
      parameters: {
        type: "object",
        properties: {
          event_id: {
            type: "string",
            description: "The calendar event ID to reschedule",
          },
          new_start: {
            type: "string",
            description: "New ISO datetime for the appointment",
          },
          duration_minutes: {
            type: "string",
            description: "Duration in minutes (default 30)",
          },
        },
        required: ["event_id", "new_start"],
      },
    },
  },
];

export type CallCalendarToolParams = {
  baseUrl: string;
  apiKey: string;
  receptionistId: string;
};

/**
 * Execute a calendar tool by calling the voice calendar API.
 */
export async function callCalendarTool(
  params: CallCalendarToolParams,
  action: "check_availability" | "create_appointment" | "reschedule_appointment",
  args: Record<string, unknown>
): Promise<string> {
  const { baseUrl, apiKey, receptionistId } = params;
  const url = `${baseUrl.replace(/\/$/, "")}/api/voice/calendar`;

  const normalizedParams: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    if (k === "duration_minutes" && typeof v === "string") {
      const n = parseInt(v, 10);
      normalizedParams[k] = Number.isNaN(n) ? 30 : n;
    } else if (k === "attendees" && Array.isArray(v)) {
      normalizedParams[k] = v.filter((x) => typeof x === "string");
    } else {
      normalizedParams[k] = v;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-voice-server-key": apiKey,
        "x-voice-api-key": apiKey,
      },
      body: JSON.stringify({
        receptionist_id: receptionistId,
        action,
        params: normalizedParams,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const json = (await res.json()) as Record<string, unknown>;
    return JSON.stringify(json);
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ success: false, error: msg });
  }
}
