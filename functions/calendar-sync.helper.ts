import { createSuperdevClient } from "npm:@superdevhq/client@0.1.56";
import { JWT } from "npm:google-auth-library@9.14.1";

const TIME_ZONE = "Asia/Jerusalem";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const APPOINTMENT_MARKER = "buildyAppointmentId";
const israelDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type AnyRecord = Record<string, any>;
type CalendarEvent = {
  id?: unknown;
  status?: unknown;
  summary?: unknown;
  start?: { date?: unknown; dateTime?: unknown; timeZone?: unknown };
  end?: { date?: unknown; dateTime?: unknown; timeZone?: unknown };
  extendedProperties?: { private?: Record<string, unknown> };
};

export class CalendarRequestError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "CalendarRequestError";
  }
}

export class CalendarReviewRequired extends Error {
  constructor(message = "Several Google Calendar events could match this appointment.") {
    super(message);
    this.name = "CalendarReviewRequired";
  }
}

class GoogleCalendarError extends Error {
  constructor(public statusCode: number) {
    super(`Google Calendar returned ${statusCode}.`);
    this.name = "GoogleCalendarError";
  }
}

export type CalendarSyncKind = "created" | "linked_existing" | "updated" | "skipped";
export type CalendarSyncResult = { kind: CalendarSyncKind; eventId?: string };
export type CalendarRemoveResult = "removed" | "already_removed" | "not_linked";

export interface CalendarRuntime {
  client: any;
  calendarId: string;
  accessToken: string;
  internal: boolean;
}

const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

function unwrap(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === "string") {
      try { current = JSON.parse(current); continue; } catch { return null; }
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    const record = current as AnyRecord;
    if (Object.prototype.hasOwnProperty.call(record, "data")) { current = record.data; continue; }
    if (Object.prototype.hasOwnProperty.call(record, "body")) { current = record.body; continue; }
    return record;
  }
  return null;
}

function timingSafeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function createCalendarRuntime(req: Request): Promise<CalendarRuntime> {
  const appId = Deno.env.get("SUPERDEV_APP_ID");
  if (!appId) throw new CalendarRequestError(503, "Calendar access is not configured.");

  const client = createSuperdevClient({ appId });
  const serviceRoleKey = Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY") || "";
  const internalKey = req.headers.get("X-Superdev-Internal-Key") || "";
  let internal = false;

  if (serviceRoleKey && timingSafeEqual(internalKey, serviceRoleKey)) {
    client.auth.setToken(serviceRoleKey);
    internal = true;
  } else {
    const authorization = req.headers.get("Authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (!match?.[1]) throw new CalendarRequestError(401, "Authentication required.");

    client.auth.setToken(match[1].trim());
    let user: AnyRecord | null = null;
    try {
      user = unwrap(await client.auth.me()) as AnyRecord | null;
    } catch {
      throw new CalendarRequestError(401, "Authentication required.");
    }
    const role = text(user?.role).toLowerCase();
    if (!user || !["administrator", "user"].includes(role)) {
      throw new CalendarRequestError(403, "Clinic staff access is required.");
    }
  }

  const serviceAccountRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  const rawCalendarId = Deno.env.get("GOOGLE_CALENDAR_ID");
  if (!serviceAccountRaw || !rawCalendarId) throw new CalendarRequestError(503, "Google Calendar is not configured.");

  let serviceAccount: { client_email?: string; private_key?: string };
  try {
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch {
    throw new CalendarRequestError(503, "Google Calendar credentials are invalid.");
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new CalendarRequestError(503, "Google Calendar credentials are incomplete.");
  }

  const calendarId = resolveCalendarId(rawCalendarId);
  if (!calendarId) throw new CalendarRequestError(503, "Google Calendar is not configured.");

  let accessToken: string | undefined;
  try {
    const jwt = new JWT({ email: serviceAccount.client_email, key: serviceAccount.private_key, scopes: [CALENDAR_SCOPE] });
    const tokenResponse = await jwt.getAccessToken();
    accessToken = tokenResponse.token || undefined;
  } catch {
    throw new CalendarRequestError(503, "Google Calendar authentication failed.");
  }
  if (!accessToken) throw new CalendarRequestError(503, "Google Calendar authentication failed.");

  return { client, calendarId, accessToken, internal };
}

function resolveCalendarId(raw: string): string {
  const first = raw.split(/[;,\n]/).map((item) => item.trim()).find(Boolean) || "";
  if (!first.startsWith("http")) return first;
  try { return new URL(first).searchParams.get("src") || first; } catch { return first; }
}

function googleEventsEndpoint(runtime: CalendarRuntime): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(runtime.calendarId)}/events`;
}

async function googleRequest<T>(runtime: CalendarRuntime, url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${runtime.accessToken}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new GoogleCalendarError(response.status);
  return await response.json().catch(() => ({})) as T;
}

async function getGoogleEvent(runtime: CalendarRuntime, eventId: string): Promise<CalendarEvent | null> {
  const response = await fetch(`${googleEventsEndpoint(runtime)}/${encodeURIComponent(eventId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${runtime.accessToken}`, "Content-Type": "application/json" },
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new GoogleCalendarError(response.status);
  return await response.json().catch(() => null) as CalendarEvent | null;
}

async function listGoogleEvents(runtime: CalendarRuntime, query: URLSearchParams): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken = "";
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams(query);
    if (pageToken) params.set("pageToken", pageToken);
    const data = await googleRequest<{ items?: unknown; nextPageToken?: unknown }>(runtime, `${googleEventsEndpoint(runtime)}?${params.toString()}`);
    if (Array.isArray(data.items)) events.push(...data.items as CalendarEvent[]);
    const next = text(data.nextPageToken);
    if (!next || next === pageToken) return events;
    pageToken = next;
  }
  throw new CalendarReviewRequired("The Google Calendar result is too large to reconcile safely.");
}

async function listEventsForAppointment(runtime: CalendarRuntime, appointmentId: string): Promise<CalendarEvent[]> {
  const query = new URLSearchParams();
  query.set("maxResults", "2500");
  query.set("showDeleted", "false");
  query.set("singleEvents", "true");
  query.set("privateExtendedProperty", `${APPOINTMENT_MARKER}=${appointmentId}`);
  query.set("fields", "nextPageToken,items(id,status,summary,start(date,dateTime,timeZone),end(date,dateTime,timeZone),extendedProperties(private))");
  return listGoogleEvents(runtime, query);
}

function validDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function daySearchBounds(date: string): { timeMin: string; timeMax: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || !validDateKey(date)) throw new CalendarRequestError(400, "Appointment date is invalid.");
  const midnightUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return {
    timeMin: new Date(midnightUtc - 6 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(midnightUtc + 30 * 60 * 60 * 1000).toISOString(),
  };
}

async function listEventsForDate(runtime: CalendarRuntime, date: string): Promise<CalendarEvent[]> {
  const { timeMin, timeMax } = daySearchBounds(date);
  const query = new URLSearchParams();
  query.set("timeMin", timeMin);
  query.set("timeMax", timeMax);
  query.set("singleEvents", "true");
  query.set("orderBy", "startTime");
  query.set("showDeleted", "false");
  query.set("timeZone", TIME_ZONE);
  query.set("maxResults", "2500");
  query.set("fields", "nextPageToken,items(id,status,summary,start(date,dateTime,timeZone),end(date,dateTime,timeZone),extendedProperties(private))");
  return listGoogleEvents(runtime, query);
}

function appointmentDate(record: AnyRecord): string { return text(record.date); }
function appointmentTime(record: AnyRecord, field: "start_time" | "end_time"): string { return text(record[field]).slice(0, 5); }

function appointmentTitle(record: AnyRecord): string {
  return `תור: ${text(record.pet_name) || "חיה"} (${text(record.client_name) || ""}) - ${text(record.appointment_type) || ""}`;
}

function appointmentDescription(record: AnyRecord): string {
  return `לקוח: ${text(record.client_name)}\nטלפון: ${text(record.phone) || "-"}\nחיה: ${text(record.pet_name) || "-"}\nסוג: ${text(record.appointment_type) || "-"}\nהערות: ${text(record.notes) || "אין"}`;
}

function validateConfirmedAppointment(record: AnyRecord): void {
  const date = appointmentDate(record);
  const start = appointmentTime(record, "start_time");
  const end = appointmentTime(record, "end_time");
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const startMinutes = timePattern.test(start) ? Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) : Number.NaN;
  const endMinutes = timePattern.test(end) ? Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5)) : Number.NaN;
  if (!validDateKey(date) || !timePattern.test(start) || !timePattern.test(end) || endMinutes <= startMinutes) {
    throw new CalendarRequestError(409, "The confirmed appointment has invalid date or time fields.");
  }
}

function eventPrivateProperties(event?: CalendarEvent | null): Record<string, unknown> {
  const value = event?.extendedProperties?.private;
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function appointmentEventBody(record: AnyRecord, existing?: CalendarEvent | null): AnyRecord {
  const privateProperties = eventPrivateProperties(existing);
  privateProperties[APPOINTMENT_MARKER] = text(record.id);
  return {
    summary: appointmentTitle(record),
    description: appointmentDescription(record),
    start: { dateTime: `${appointmentDate(record)}T${appointmentTime(record, "start_time")}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${appointmentDate(record)}T${appointmentTime(record, "end_time")}:00`, timeZone: TIME_ZONE },
    reminders: { useDefault: true },
    extendedProperties: { private: privateProperties },
  };
}

function eventMarker(event: CalendarEvent): string {
  return text(event.extendedProperties?.private?.[APPOINTMENT_MARKER]);
}

function eventDateTimeParts(value: unknown): { date: string; time: string } | null {
  const raw = text(value);
  if (!raw) return null;
  let instant: Date | null = null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const parsed = new Date(raw);
    instant = Number.isNaN(parsed.getTime()) ? null : parsed;
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6] || "0");
    const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
    for (const offsetMinutes of [120, 180]) {
      const candidate = new Date(wallClock - offsetMinutes * 60_000);
      const parts = israelDateTimeFormatter.formatToParts(candidate);
      const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || "NaN");
      if (read("year") === year && read("month") === month && read("day") === day && read("hour") === hour && read("minute") === minute) {
        instant = candidate;
        break;
      }
    }
  }
  if (!instant) return null;
  const parts = israelDateTimeFormatter.formatToParts(instant);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const date = `${read("year")}-${read("month")}-${read("day")}`;
  const time = `${read("hour")}:${read("minute")}`;
  return date && time ? { date, time } : null;
}

function matchesAppointment(event: CalendarEvent, record: AnyRecord): boolean {
  if (!text(event.id) || ["cancelled", "canceled"].includes(text(event.status).toLowerCase())) return false;
  if (text(event.summary) !== appointmentTitle(record)) return false;
  const start = eventDateTimeParts(event.start?.dateTime);
  const end = eventDateTimeParts(event.end?.dateTime);
  return Boolean(
    start && end &&
    start.date === appointmentDate(record) &&
    end.date === appointmentDate(record) &&
    start.time === appointmentTime(record, "start_time") &&
    end.time === appointmentTime(record, "end_time"),
  );
}

async function deterministicEventId(appointmentId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(appointmentId));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  // Google-generated event IDs accept lowercase a-v and digits. Hex keeps the id in that alphabet.
  return `b${hex}`;
}

async function updateGoogleEvent(runtime: CalendarRuntime, event: CalendarEvent, record: AnyRecord): Promise<CalendarEvent> {
  const eventId = text(event.id);
  if (!eventId) throw new CalendarRequestError(502, "Google Calendar returned an event without an id.");
  const marker = eventMarker(event);
  if (marker && marker !== text(record.id)) throw new CalendarReviewRequired("The linked Google Calendar event belongs to another appointment.");
  return googleRequest<CalendarEvent>(runtime, `${googleEventsEndpoint(runtime)}/${encodeURIComponent(eventId)}`, "PATCH", appointmentEventBody(record, event));
}

async function attachMarkerOnly(runtime: CalendarRuntime, event: CalendarEvent, appointmentId: string): Promise<CalendarEvent> {
  const eventId = text(event.id);
  if (!eventId) throw new CalendarRequestError(502, "Google Calendar returned an event without an id.");
  const marker = eventMarker(event);
  if (marker && marker !== appointmentId) throw new CalendarReviewRequired("The matching Google event is already linked to another appointment.");
  if (marker === appointmentId) return event;
  const privateProperties = eventPrivateProperties(event);
  privateProperties[APPOINTMENT_MARKER] = appointmentId;
  return googleRequest<CalendarEvent>(runtime, `${googleEventsEndpoint(runtime)}/${encodeURIComponent(eventId)}`, "PATCH", {
    extendedProperties: { private: privateProperties },
  });
}

function isMissingGoogleEvent(error: unknown): boolean {
  return error instanceof GoogleCalendarError && (error.statusCode === 404 || error.statusCode === 410);
}

async function loadAppointment(runtime: CalendarRuntime, appointmentId: string): Promise<AnyRecord | null> {
  try {
    const loaded = unwrap(await runtime.client.entities.Appointment.get(appointmentId));
    return loaded && typeof loaded === "object" && !Array.isArray(loaded) ? loaded as AnyRecord : null;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("404") || message.includes("not found") || message.includes("does not exist")) return null;
    console.error("Failed to read appointment for Google Calendar sync.");
    throw new CalendarRequestError(503, "The appointment could not be verified.");
  }
}

async function storeEventLink(runtime: CalendarRuntime, appointmentId: string, eventId: string): Promise<void> {
  const latest = await loadAppointment(runtime, appointmentId);
  if (!latest) throw new CalendarRequestError(404, "Appointment not found.");
  if (text(latest.status).toLowerCase() !== "confirmed") {
    throw new CalendarRequestError(409, "The appointment changed before its calendar link could be saved.");
  }
  const currentEventId = text(latest.google_event_id);
  if (currentEventId && currentEventId !== eventId) {
    throw new CalendarReviewRequired("The appointment already points to another Google Calendar event.");
  }
  if (currentEventId === eventId) return;

  try {
    await runtime.client.entities.Appointment.update(appointmentId, { google_event_id: eventId });
  } catch {
    console.error("Google Calendar event exists, but the appointment link could not be saved.");
    throw new CalendarRequestError(503, "The Google event exists, but its appointment link could not be saved.");
  }
  const verified = await loadAppointment(runtime, appointmentId);
  if (!verified || text(verified.google_event_id) !== eventId) {
    throw new CalendarRequestError(503, "The Google event exists, but its appointment link could not be verified.");
  }
}

async function insertDeterministicEvent(runtime: CalendarRuntime, record: AnyRecord): Promise<{ event: CalendarEvent; alreadyExisted: boolean }> {
  const appointmentId = text(record.id);
  const eventId = await deterministicEventId(appointmentId);
  try {
    const event = await googleRequest<CalendarEvent>(runtime, googleEventsEndpoint(runtime), "POST", {
      id: eventId,
      ...appointmentEventBody(record),
    });
    return { event, alreadyExisted: false };
  } catch (error) {
    if (!(error instanceof GoogleCalendarError) || error.statusCode !== 409) throw error;
    const existing = await getGoogleEvent(runtime, eventId);
    if (!existing || eventMarker(existing) !== appointmentId) {
      throw new CalendarReviewRequired("A stable Google event id is occupied by an unrelated event.");
    }
    return { event: await updateGoogleEvent(runtime, existing, record), alreadyExisted: true };
  }
}

export async function syncAppointmentCalendar(
  runtime: CalendarRuntime,
  appointmentId: string,
  options: { backfill?: boolean } = {},
): Promise<CalendarSyncResult> {
  const id = text(appointmentId);
  const record = await loadAppointment(runtime, id);
  if (!record) throw new CalendarRequestError(404, "Appointment not found.");
  if (text(record.status).toLowerCase() !== "confirmed") return { kind: "skipped" };
  const recordId = text(record.id);
  if (!recordId) throw new CalendarRequestError(409, "Appointment has no stable id.");
  if (options.backfill && text(record.google_event_id)) return { kind: "skipped", eventId: text(record.google_event_id) };
  validateConfirmedAppointment(record);

  const linkedId = text(record.google_event_id);
  if (linkedId) {
    const linkedEvent = await getGoogleEvent(runtime, linkedId);
    if (linkedEvent) {
      try {
        const updated = await updateGoogleEvent(runtime, linkedEvent, record);
        const updatedId = text(updated.id) || linkedId;
        await storeEventLink(runtime, recordId, updatedId);
        return { kind: "updated", eventId: updatedId };
      } catch (error) {
        if (!isMissingGoogleEvent(error)) throw error;
      }
    }
  }

  const markedEvents = await listEventsForAppointment(runtime, recordId);
  if (markedEvents.length > 1) throw new CalendarReviewRequired();
  if (markedEvents.length === 1) {
    const event = markedEvents[0];
    const updated = await updateGoogleEvent(runtime, event, record);
    const eventId = text(updated.id) || text(event.id);
    await storeEventLink(runtime, recordId, eventId);
    return { kind: "linked_existing", eventId };
  }

  const byDate = await listEventsForDate(runtime, appointmentDate(record));
  const legacyMatches = byDate.filter((event) => {
    const marker = eventMarker(event);
    return (!marker || marker === recordId) && matchesAppointment(event, record);
  });
  if (legacyMatches.length > 1) throw new CalendarReviewRequired();
  if (legacyMatches.length === 1) {
    const event = legacyMatches[0];
    // A title and time match can identify a legacy appointment event, but without an existing
    // Buildy link it is not safe to overwrite event details that may belong to the clinic.
    const resolved = await attachMarkerOnly(runtime, event, recordId);
    const eventId = text(resolved.id);
    if (!eventId) throw new CalendarRequestError(502, "Google Calendar returned an event without an id.");
    await storeEventLink(runtime, recordId, eventId);
    return { kind: "linked_existing", eventId };
  }

  const inserted = await insertDeterministicEvent(runtime, record);
  const eventId = text(inserted.event.id);
  if (!eventId) throw new CalendarRequestError(502, "Google Calendar returned an event without an id.");
  await storeEventLink(runtime, recordId, eventId);
  return { kind: inserted.alreadyExisted ? "linked_existing" : "created", eventId };
}

export async function removeAppointmentCalendarEvent(runtime: CalendarRuntime, appointmentId: string): Promise<CalendarRemoveResult> {
  const id = text(appointmentId);
  const record = await loadAppointment(runtime, id);
  if (!record) throw new CalendarRequestError(404, "Appointment not found.");
  if (text(record.status).toLowerCase() !== "cancelled") {
    throw new CalendarRequestError(409, "Only a cancelled appointment can be removed from Google Calendar.");
  }
  const recordId = text(record.id);
  if (!recordId) throw new CalendarRequestError(409, "Appointment has no stable id.");

  const linkedId = text(record.google_event_id);
  if (linkedId) {
    const linkedEvent = await getGoogleEvent(runtime, linkedId);
    if (linkedEvent) {
      const marker = eventMarker(linkedEvent);
      if (marker && marker !== recordId) throw new CalendarReviewRequired("The linked Google Calendar event belongs to another appointment.");
      const response = await fetch(`${googleEventsEndpoint(runtime)}/${encodeURIComponent(linkedId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${runtime.accessToken}` },
      });
      if (response.status === 404 || response.status === 410) return "already_removed";
      if (!response.ok) throw new GoogleCalendarError(response.status);
      return "removed";
    }
  }

  const markedEvents = await listEventsForAppointment(runtime, recordId);
  if (markedEvents.length > 1) throw new CalendarReviewRequired();
  if (markedEvents.length === 0) return linkedId ? "already_removed" : "not_linked";
  const markerEvent = markedEvents[0];
  if (eventMarker(markerEvent) !== recordId) throw new CalendarReviewRequired();
  const eventId = text(markerEvent.id);
  if (!eventId) throw new CalendarRequestError(502, "Google Calendar returned an event without an id.");
  const response = await fetch(`${googleEventsEndpoint(runtime)}/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${runtime.accessToken}` },
  });
  if (response.status === 404 || response.status === 410) return "already_removed";
  if (!response.ok) throw new GoogleCalendarError(response.status);
  return "removed";
}

export function calendarHttpError(error: unknown): { status: number; message: string; needsReview?: boolean } {
  if (error instanceof CalendarRequestError) return { status: error.statusCode, message: error.message };
  if (error instanceof CalendarReviewRequired) return { status: 409, message: "Several Google Calendar events could match this appointment.", needsReview: true };
  if (error instanceof GoogleCalendarError) {
    console.error("Google Calendar API request failed with status", error.statusCode);
    return { status: 502, message: "Google Calendar could not complete the request." };
  }
  console.error("Clinic calendar sync failed.");
  return { status: 500, message: "Calendar sync could not be completed." };
}
