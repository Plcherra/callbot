import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { google } from "googleapis";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI;

const DEFAULT_SLOT_MINUTES = 30;
const DEFAULT_TIMEZONE = "America/New_York";

type CalendarAction = "check_availability" | "create_appointment" | "reschedule_appointment";

type CheckAvailabilityParams = {
  start_date: string; // ISO date or datetime
  end_date?: string;
  duration_minutes?: number;
  timezone?: string;
};

type CreateAppointmentParams = {
  start_time: string; // ISO datetime
  duration_minutes: number;
  summary: string;
  description?: string;
  attendees?: string[];
};

type RescheduleAppointmentParams = {
  event_id: string;
  new_start: string; // ISO datetime
  duration_minutes: number;
};

/**
 * Voice server Calendar API.
 * POST body: { receptionist_id, action, params }.
 * Protected by x-voice-server-key. Resolves receptionist -> user calendar tokens, runs Google Calendar API.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.VOICE_SERVER_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json({ error: "Calendar API not configured" }, { status: 503 });
  }
  const provided =
    req.headers.get("x-voice-server-key") ?? req.headers.get("x-voice-api-key");
  if (provided !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { receptionist_id?: string; action?: CalendarAction; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { receptionist_id: receptionistId, action, params } = body;
  if (!receptionistId || typeof receptionistId !== "string") {
    return NextResponse.json({ error: "receptionist_id required" }, { status: 400 });
  }
  if (!action || !["check_availability", "create_appointment", "reschedule_appointment"].includes(action)) {
    return NextResponse.json({ error: "action must be check_availability, create_appointment, or reschedule_appointment" }, { status: 400 });
  }
  const safeParams = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;

  const supabase = createServiceRoleClient();
  const { data: rec, error: recError } = await supabase
    .from("receptionists")
    .select("id, user_id, calendar_id")
    .eq("id", receptionistId)
    .single();

  if (recError || !rec) {
    return NextResponse.json({ error: "Receptionist not found" }, { status: 404 });
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("calendar_refresh_token")
    .eq("id", rec.user_id)
    .single();

  if (userError || !user?.calendar_refresh_token) {
    return NextResponse.json({
      success: false,
      error: "calendar_not_connected",
      message: "Google Calendar is not connected for this receptionist.",
    });
  }

  const calendarId = (rec.calendar_id ?? "primary").trim() || "primary";
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: user.calendar_refresh_token });

  try {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    if (action === "check_availability") {
      return await handleCheckAvailability(calendar, calendarId, safeParams as CheckAvailabilityParams);
    }
    if (action === "create_appointment") {
      return await handleCreateAppointment(calendar, calendarId, safeParams as CreateAppointmentParams);
    }
    return await handleRescheduleAppointment(calendar, calendarId, safeParams as RescheduleAppointmentParams);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("invalid_grant") || message.includes("Token has been expired")) {
      return NextResponse.json({
        success: false,
        error: "calendar_token_expired",
        message: "Calendar access expired. Please reconnect Google Calendar.",
      });
    }
    console.error("[voice/calendar]", action, message);
    return NextResponse.json({
      success: false,
      error: "calendar_error",
      message: "Calendar request failed. Please try again.",
    });
  }
}

function parseDateTime(
  dateStr: string,
  timezone: string = DEFAULT_TIMEZONE
): { timeMin: string; timeMax: string } | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return {
    timeMin: d.toISOString(),
    timeMax: new Date(d.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function getFreeSlots(
  busy: Array<{ start?: string; end?: string }>,
  timeMin: string,
  timeMax: string,
  slotMinutes: number
): string[] {
  const slotMs = slotMinutes * 60 * 1000;
  const min = new Date(timeMin).getTime();
  const max = new Date(timeMax).getTime();
  const busyRanges = busy
    .filter((b) => b.start && b.end)
    .map((b) => ({ start: new Date(b.start!).getTime(), end: new Date(b.end!).getTime() }))
    .sort((a, b) => a.start - b.start);

  const slots: string[] = [];
  let t = min;
  while (t + slotMs <= max) {
    const slotEnd = t + slotMs;
    const overlaps = busyRanges.some(
      (r) => (t >= r.start && t < r.end) || (slotEnd > r.start && slotEnd <= r.end) || (t <= r.start && slotEnd >= r.end)
    );
    if (!overlaps) slots.push(new Date(t).toISOString());
    t = slotEnd;
  }
  return slots;
}

async function handleCheckAvailability(
  calendar: ReturnType<typeof google.calendar>,
  calendarId: string,
  params: CheckAvailabilityParams
): Promise<NextResponse> {
  const startDate = params.start_date as string;
  const endDate = params.end_date as string | undefined;
  const durationMinutes = (params.duration_minutes as number) ?? DEFAULT_SLOT_MINUTES;
  const timezone = (params.timezone as string) ?? DEFAULT_TIMEZONE;

  if (!startDate) {
    return NextResponse.json({ success: false, error: "start_date required" });
  }

  const range = parseDateTime(startDate, timezone);
  if (!range) {
    return NextResponse.json({ success: false, error: "Invalid start_date" });
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime())) range.timeMax = end.toISOString();
  }

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: range.timeMin,
      timeMax: range.timeMax,
      items: [{ id: calendarId }],
    },
  });

  const cal = res.data.calendars?.[calendarId];
  const busy = (cal?.busy ?? []) as Array<{ start?: string; end?: string }>;
  const freeSlots = getFreeSlots(busy, range.timeMin, range.timeMax, durationMinutes);

  return NextResponse.json({
    success: true,
    free_slots: freeSlots,
    busy_slots: busy.map((b) => ({ start: b.start, end: b.end })),
  });
}

async function handleCreateAppointment(
  calendar: ReturnType<typeof google.calendar>,
  calendarId: string,
  params: CreateAppointmentParams
): Promise<NextResponse> {
  const startTime = params.start_time as string;
  const durationMinutes = (params.duration_minutes as number) ?? DEFAULT_SLOT_MINUTES;
  const summary = (params.summary as string) ?? "Appointment";
  const description = params.description as string | undefined;
  const attendees = params.attendees as string[] | undefined;

  if (!startTime) {
    return NextResponse.json({ success: false, error: "start_time required" });
  }

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ success: false, error: "Invalid start_time" });
  }
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const eventBody: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: { email: string }[];
  } = {
    summary,
    start: { dateTime: start.toISOString(), timeZone: DEFAULT_TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: DEFAULT_TIMEZONE },
  };
  if (description) eventBody.description = description;
  if (attendees?.length) eventBody.attendees = attendees.map((e) => ({ email: e }));

  // Check for conflict (busy) before inserting; Google Calendar allows overlaps, so we enforce no-double-book
  const freebusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      items: [{ id: calendarId }],
    },
  });
  const busy = freebusyRes.data.calendars?.[calendarId]?.busy ?? [];
  if (busy.length > 0) {
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayFreebusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: calendarId }],
      },
    });
    const dayBusy = (dayFreebusy.data.calendars?.[calendarId]?.busy ?? []) as Array<{
      start?: string;
      end?: string;
    }>;
    const suggested_slots = getFreeSlots(
      dayBusy,
      dayStart.toISOString(),
      dayEnd.toISOString(),
      durationMinutes
    ).slice(0, 5);
    return NextResponse.json({
      success: false,
      error: "slot_unavailable",
      message: "That time slot is no longer available.",
      suggested_slots,
    });
  }

  const res = await calendar.events.insert({
    calendarId,
    requestBody: eventBody,
    sendUpdates: "none",
  });
  const event = res.data;
  return NextResponse.json({
    success: true,
    event_id: event.id,
    html_link: event.htmlLink,
    start: event.start?.dateTime ?? event.start?.date,
    end: event.end?.dateTime ?? event.end?.date,
    summary: event.summary,
  });
}

async function handleRescheduleAppointment(
  calendar: ReturnType<typeof google.calendar>,
  calendarId: string,
  params: RescheduleAppointmentParams
): Promise<NextResponse> {
  const eventId = params.event_id as string;
  const newStart = params.new_start as string;
  const durationMinutes = (params.duration_minutes as number) ?? DEFAULT_SLOT_MINUTES;

  if (!eventId || !newStart) {
    return NextResponse.json({ success: false, error: "event_id and new_start required" });
  }

  const start = new Date(newStart);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ success: false, error: "Invalid new_start" });
  }
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  try {
    const res = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        start: { dateTime: start.toISOString(), timeZone: DEFAULT_TIMEZONE },
        end: { dateTime: end.toISOString(), timeZone: DEFAULT_TIMEZONE },
      },
      sendUpdates: "none",
    });
    const event = res.data;
    return NextResponse.json({
      success: true,
      event_id: event.id,
      start: event.start?.dateTime ?? event.start?.date,
      end: event.end?.dateTime ?? event.end?.date,
      summary: event.summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Conflict") || message.includes("409") || message.includes("not found")) {
      const range = parseDateTime(newStart);
      if (range) {
        const freebusyRes = await calendar.freebusy.query({
          requestBody: {
            timeMin: range.timeMin,
            timeMax: range.timeMax,
            items: [{ id: calendarId }],
          },
        });
        const busy = (freebusyRes.data.calendars?.[calendarId]?.busy ?? []) as Array<{
          start?: string;
          end?: string;
        }>;
        const suggested_slots = getFreeSlots(busy, range.timeMin, range.timeMax, durationMinutes).slice(0, 5);
        return NextResponse.json({
          success: false,
          error: "slot_unavailable",
          message: "That time slot is not available.",
          suggested_slots,
        });
      }
      return NextResponse.json({
        success: false,
        error: "slot_unavailable",
        message: "That time slot is not available.",
        suggested_slots: [],
      });
    }
    throw err;
  }
}
