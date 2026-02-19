import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { google } from "googleapis";

const DEFAULT_TIMEZONE = "America/New_York";

type ToolCall = {
  id: string;
  name: string;
  parameters?: Record<string, unknown>;
};

type VapiToolCallsMessage = {
  type: "tool-calls";
  call?: {
    assistantId?: string;
    assistant_id?: string;
    id?: string;
    [key: string]: unknown;
  };
  toolCallList?: ToolCall[];
  [key: string]: unknown;
};

type VapiToolsBody = {
  message?: VapiToolCallsMessage;
};

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Google OAuth env vars");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function getCalendarClient(
  refreshToken: string,
  calendarId: string
) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  return { calendar, calendarId };
}

async function checkAvailability(
  refreshToken: string,
  calendarId: string,
  params: Record<string, unknown>
): Promise<string> {
  const startStr = params.startDateTime as string;
  const endStr = params.endDateTime as string;
  const timeZone = (params.timeZone as string) || DEFAULT_TIMEZONE;

  if (!startStr || !endStr) {
    return JSON.stringify({ error: "startDateTime and endDateTime required" });
  }

  try {
    const { calendar } = await getCalendarClient(refreshToken, calendarId);
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: startStr,
        timeMax: endStr,
        items: [{ id: calendarId }],
      },
    });

    const busy = res.data.calendars?.[calendarId]?.busy ?? [];
    const slots: string[] = [];
    const start = new Date(startStr);
    const end = new Date(endStr);
    const slotMinutes = 30;

    for (let t = start.getTime(); t < end.getTime(); t += slotMinutes * 60 * 1000) {
      const slotStart = new Date(t);
      const slotEnd = new Date(t + slotMinutes * 60 * 1000);
      const isBusy = busy.some(
        (b) =>
          slotStart < new Date(b.end!) && slotEnd > new Date(b.start!)
      );
      if (!isBusy) {
        slots.push(slotStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }));
      }
    }

    return JSON.stringify({
      available: slots.length > 0,
      slots: slots.slice(0, 20),
      busyCount: busy.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[vapi/tools] checkAvailability error:", msg);
    return JSON.stringify({ error: msg });
  }
}

async function createEvent(
  refreshToken: string,
  calendarId: string,
  params: Record<string, unknown>
): Promise<string> {
  const startStr = params.startDateTime as string;
  const endStr = params.endDateTime as string;
  const summary = (params.summary as string) || "Appointment";
  const attendeesRaw = params.attendees;
  const attendees: string[] = Array.isArray(attendeesRaw)
    ? attendeesRaw.filter((a): a is string => typeof a === "string")
    : typeof attendeesRaw === "string"
      ? [attendeesRaw]
      : [];

  if (!startStr || !endStr) {
    return JSON.stringify({ error: "startDateTime and endDateTime required" });
  }

  try {
    const { calendar } = await getCalendarClient(refreshToken, calendarId);
    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary,
        start: { dateTime: startStr, timeZone: (params.timeZone as string) || DEFAULT_TIMEZONE },
        end: { dateTime: endStr, timeZone: (params.timeZone as string) || DEFAULT_TIMEZONE },
        attendees: attendees.map((email) => ({ email })),
      },
    });

    return JSON.stringify({
      success: true,
      eventId: event.data.id,
      htmlLink: event.data.htmlLink,
      summary: event.data.summary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[vapi/tools] createEvent error:", msg);
    return JSON.stringify({ error: msg });
  }
}

export async function POST(req: NextRequest) {
  let body: VapiToolsBody;
  try {
    body = (await req.json()) as VapiToolsBody;
  } catch {
    console.error("[vapi/tools] Invalid JSON");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body?.message;
  if (!message || message.type !== "tool-calls") {
    return NextResponse.json({ received: true });
  }

  const call = message.call;
  const toolCallList = message.toolCallList ?? [];
  if (toolCallList.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const assistantId =
    (typeof call?.assistantId === "string" ? call.assistantId : undefined) ??
    (typeof (call as { assistant_id?: string })?.assistant_id === "string"
      ? (call as { assistant_id: string }).assistant_id
      : undefined);

  if (!assistantId) {
    console.error("[vapi/tools] Missing assistantId in tool-calls");
    return NextResponse.json(
      { results: toolCallList.map((tc) => ({ name: tc.name, toolCallId: tc.id, result: JSON.stringify({ error: "Missing assistant context" }) })) },
      { status: 200 }
    );
  }

  const supabase = createServiceRoleClient();
  const { data: receptionist } = await supabase
    .from("receptionists")
    .select("id, user_id, calendar_id")
    .eq("vapi_assistant_id", assistantId)
    .maybeSingle();

  if (!receptionist) {
    console.error("[vapi/tools] Receptionist not found for assistant:", assistantId);
    return NextResponse.json({
      results: toolCallList.map((tc) => ({
        name: tc.name,
        toolCallId: tc.id,
        result: JSON.stringify({ error: "Receptionist not found" }),
      })),
    });
  }

  const { data: user } = await supabase
    .from("users")
    .select("calendar_id, calendar_refresh_token")
    .eq("id", receptionist.user_id)
    .single();

  if (!user?.calendar_refresh_token) {
    console.error("[vapi/tools] User has no calendar connected:", receptionist.user_id);
    return NextResponse.json({
      results: toolCallList.map((tc) => ({
        name: tc.name,
        toolCallId: tc.id,
        result: JSON.stringify({ error: "Calendar not connected. Please connect Google Calendar in Settings." }),
      })),
    });
  }

  // Prefer receptionist's calendar_id (e.g. per-receptionist calendar), fall back to user's
  const calendarId = (receptionist.calendar_id?.trim() || user.calendar_id ?? "primary").trim() || "primary";

  const results: { name: string; toolCallId: string; result: string }[] = [];

  for (const tc of toolCallList) {
    const params = (tc.parameters ?? {}) as Record<string, unknown>;
    let result: string;

    if (tc.name === "checkCalendarAvailability") {
      result = await checkAvailability(
        user.calendar_refresh_token,
        calendarId,
        params
      );
    } else if (tc.name === "createCalendarEvent") {
      result = await createEvent(
        user.calendar_refresh_token,
        calendarId,
        params
      );
    } else {
      result = JSON.stringify({ error: `Unknown tool: ${tc.name}` });
    }

    results.push({
      name: tc.name,
      toolCallId: tc.id,
      result,
    });
  }

  return NextResponse.json({ results });
}
