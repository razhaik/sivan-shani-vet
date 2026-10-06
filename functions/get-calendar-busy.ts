import { JWT } from "npm:google-auth-library@9.14.1";

const TIME_ZONE = "Asia/Jerusalem";
const CALENDAR_READ_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const MAX_RANGE_DAYS = 62;
const MAX_PAGES_PER_CALENDAR = 20;
const MAX_EVENTS_PER_CALENDAR = 10000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

type AnyRecord = Record<string, unknown>;
type BusyInterval = { date: string; start: string; end: string };
type CalendarEventItem = {
  start?: unknown;
  end?: unknown;
};
type CalendarParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
type LookupDiagnostics = {
  requested_date: string;
  requested_date_to: string;
  configured_calendars: number;
  successful_calendars: number;
  successful_pages: number;
  failed_calendars: number;
  event_count: number;
  interval_count: number;
  rejected_interval_count: number;
};
type CalendarFetchResult = {
  items: CalendarEventItem[];
  pages: number;
};

class CalendarLookupError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "CalendarLookupError";
  }
}

class CalendarDataError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "CalendarDataError";
  }
}

const israelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : null;
}

function validDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2200) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function dateKeyToUtc(value: string): Date | null {
  if (!validDateKey(value)) return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function utcToDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function nextDateKey(value: string): string {
  const date = dateKeyToUtc(value);
  if (!date) throw new CalendarDataError("invalid_date_range");
  date.setUTCDate(date.getUTCDate() + 1);
  const result = utcToDateKey(date);
  if (!validDateKey(result)) throw new CalendarDataError("date_range_overflow");
  return result;
}

function dateKeysBetween(start: string, end: string): string[] {
  const first = dateKeyToUtc(start);
  const last = dateKeyToUtc(end);
  if (!first || !last || first.getTime() > last.getTime()) return [];
  const keys: string[] = [];
  for (const cursor = new Date(first); cursor.getTime() <= last.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    keys.push(utcToDateKey(cursor));
  }
  return keys;
}

function israelParts(value: Date): CalendarParts | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const values: Record<string, string> = {};
  for (const part of israelFormatter.formatToParts(value)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  const result = {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
  return Object.values(result).every((part) => Number.isFinite(part)) ? result : null;
}

function israelDate(value: Date): string | null {
  const parts = israelParts(value);
  if (!parts) return null;
  const result = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return validDateKey(result) ? result : null;
}

function israelTime(value: Date): string | null {
  const parts = israelParts(value);
  if (!parts) return null;
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function israelOffsetMs(instant: Date): number | null {
  const parts = israelParts(instant);
  if (!parts) return null;
  const rounded = Math.floor(instant.getTime() / 1000) * 1000;
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - rounded;
}

function localIsraelToInstant(dateValue: string, timeValue: string): Date | null {
  if (!validDateKey(dateValue) || !TIME_PATTERN.test(timeValue)) return null;
  const dateMatch = DATE_PATTERN.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, 0);
  const candidates: number[] = [];

  for (const dayOffset of [-3, -2, -1, 0, 1, 2, 3]) {
    const probe = new Date(wallClock + dayOffset * 24 * 60 * 60 * 1000);
    const offset = israelOffsetMs(probe);
    if (offset === null) continue;
    const candidateMs = wallClock - offset;
    const candidate = new Date(candidateMs);
    const parts = israelParts(candidate);
    if (parts && parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute) {
      candidates.push(candidateMs);
    }
  }

  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

function parseLocalIsraelDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(value);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const time = `${match[4]}:${match[5]}`;
  if (!validDateKey(date) || !TIME_PATTERN.test(time)) return null;
  const second = Number(match[6] || "0");
  const milliseconds = Number((match[7] || "").slice(0, 3).padEnd(3, "0") || "0");
  if (second < 0 || second > 59 || milliseconds < 0 || milliseconds > 999) return null;
  const base = localIsraelToInstant(date, time);
  if (!base) return null;
  const parsed = new Date(base.getTime() + second * 1000 + milliseconds);
  const parts = israelParts(parsed);
  if (!parts || parts.year !== Number(match[1]) || parts.month !== Number(match[2]) || parts.day !== Number(match[3]) || parts.hour !== Number(match[4]) || parts.minute !== Number(match[5]) || parts.second !== second) return null;
  return parsed;
}

function parseGoogleDateTime(value: unknown, timeZoneValue: unknown): Date | null {
  const raw = text(value);
  if (!raw || raw.length > 80) return null;
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  if (!hasOffset) {
    const suppliedZone = text(timeZoneValue);
    if (suppliedZone && suppliedZone !== TIME_ZONE) return null;
    return parseLocalIsraelDateTime(raw);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function timeToMinutes(value: string): number {
  if (!TIME_PATTERN.test(value)) return Number.NaN;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function validRange(start: number, end: number): boolean {
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= 23 * 60 + 59;
}

function normalizeCalendarId(value: string): string {
  if (!value.startsWith("http")) return value;
  try {
    const source = new URL(value).searchParams.get("src");
    return source || value;
  } catch {
    return value;
  }
}

function calendarIdsFromConfig(raw: string): string[] {
  return [...new Set(raw.split(/[;,\n]/).map((value) => normalizeCalendarId(value.trim())).filter(Boolean))];
}

function normalizeEvent(item: CalendarEventItem, visibleDates: string[], diagnostics: LookupDiagnostics): BusyInterval[] {
  const start = asRecord(item.start);
  const end = asRecord(item.end);
  if (!start || !end) {
    diagnostics.rejected_interval_count += 1;
    throw new CalendarDataError("event_missing_bounds");
  }

  const startDate = text(start.date);
  const endDate = text(end.date);
  const startDateTime = text(start.dateTime);
  const endDateTime = text(end.dateTime);
  const hasAllDayBounds = Boolean(startDate || endDate);
  const hasTimedBounds = Boolean(startDateTime || endDateTime);

  if (hasAllDayBounds && hasTimedBounds) {
    diagnostics.rejected_interval_count += 1;
    throw new CalendarDataError("event_mixed_bounds");
  }

  if (hasAllDayBounds) {
    if (!startDate || !endDate || !validDateKey(startDate) || !validDateKey(endDate) || startDate >= endDate) {
      diagnostics.rejected_interval_count += 1;
      throw new CalendarDataError("event_invalid_all_day_range");
    }
    return visibleDates
      .filter((date) => date >= startDate && date < endDate)
      .map((date) => ({ date, start: "00:00", end: "23:59" }));
  }

  if (!startDateTime || !endDateTime) {
    diagnostics.rejected_interval_count += 1;
    throw new CalendarDataError("event_missing_timed_bounds");
  }
  const startInstant = parseGoogleDateTime(startDateTime, start.timeZone);
  const endInstant = parseGoogleDateTime(endDateTime, end.timeZone);
  if (!startInstant || !endInstant || endInstant.getTime() <= startInstant.getTime()) {
    diagnostics.rejected_interval_count += 1;
    throw new CalendarDataError("event_invalid_timed_range");
  }

  const firstDate = israelDate(startInstant);
  const lastDate = israelDate(new Date(endInstant.getTime() - 1));
  if (!firstDate || !lastDate) {
    diagnostics.rejected_interval_count += 1;
    throw new CalendarDataError("event_invalid_local_date");
  }

  const intervals: BusyInterval[] = [];
  for (const date of visibleDates) {
    if (date < firstDate || date > lastDate) continue;
    const dayStart = localIsraelToInstant(date, "00:00");
    const dayEnd = localIsraelToInstant(nextDateKey(date), "00:00");
    if (!dayStart || !dayEnd) {
      diagnostics.rejected_interval_count += 1;
      throw new CalendarDataError("local_day_boundary_failed");
    }
    if (startInstant >= dayEnd || endInstant <= dayStart) continue;

    const clippedStart = startInstant > dayStart ? startInstant : dayStart;
    const clippedEnd = endInstant < dayEnd ? endInstant : dayEnd;
    const startLabel = startInstant <= dayStart ? "00:00" : israelTime(clippedStart);
    const endLabel = endInstant >= dayEnd ? "23:59" : israelTime(clippedEnd);
    if (!startLabel || !endLabel || !TIME_PATTERN.test(startLabel) || !TIME_PATTERN.test(endLabel) || !validRange(timeToMinutes(startLabel), timeToMinutes(endLabel))) {
      diagnostics.rejected_interval_count += 1;
      throw new CalendarDataError("event_interval_not_representable");
    }
    intervals.push({ date, start: startLabel, end: endLabel });
  }
  return intervals;
}

async function listCalendarEvents(calendarId: string, accessToken: string, date: string, dateTo: string): Promise<CalendarFetchResult> {
  const items: CalendarEventItem[] = [];
  let pageToken = "";
  let pages = 0;
  const timeMin = localIsraelToInstant(date, "00:00");
  const timeMax = localIsraelToInstant(nextDateKey(dateTo), "00:00");
  if (!timeMin || !timeMax) throw new CalendarLookupError("local_day_bounds_failed");

  for (let page = 0; page < MAX_PAGES_PER_CALENDAR; page += 1) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", timeMin.toISOString());
    url.searchParams.set("timeMax", timeMax.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("timeZone", TIME_ZONE);
    url.searchParams.set("fields", "nextPageToken,items(start(date,dateTime,timeZone),end(date,dateTime,timeZone))");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
    } catch {
      throw new CalendarLookupError("google_request_failed");
    }

    const rawBody = await response.text().catch(() => "");
    if (!response.ok) throw new CalendarLookupError("google_http_failure");
    let data: AnyRecord;
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      const record = asRecord(parsed);
      if (!record) throw new Error("invalid_json_shape");
      data = record;
    } catch {
      throw new CalendarLookupError("google_response_not_json");
    }

    if (!Array.isArray(data.items)) throw new CalendarLookupError("google_items_not_array");
    for (const item of data.items) {
      if (!asRecord(item)) throw new CalendarLookupError("google_event_not_object");
      items.push(item as CalendarEventItem);
    }
    pages += 1;
    if (items.length > MAX_EVENTS_PER_CALENDAR) throw new CalendarLookupError("google_event_limit_reached");

    const nextPageToken = data.nextPageToken;
    if (nextPageToken !== undefined && typeof nextPageToken !== "string") throw new CalendarLookupError("google_page_token_invalid");
    if (!nextPageToken) break;
    if (nextPageToken === pageToken) throw new CalendarLookupError("google_page_token_repeated");
    pageToken = nextPageToken;
    if (page === MAX_PAGES_PER_CALENDAR - 1) throw new CalendarLookupError("google_page_limit_reached");
  }

  return { items, pages };
}

function diagnosticLog(level: "info" | "error", outcome: string, diagnostics: LookupDiagnostics) {
  const payload = JSON.stringify({ outcome, ...diagnostics });
  if (level === "error") console.error("[CalendarBusy]", payload);
  else console.log("[CalendarBusy]", payload);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: AnyRecord | null = null;
  try {
    const parsed = await req.json();
    payload = asRecord(parsed);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const date = text(payload?.date);
  const dateToValue = text(payload?.dateTo);
  const dateTo = dateToValue || date;
  if (!validDateKey(date) || (dateToValue && !validDateKey(dateToValue))) {
    return json({ error: "Invalid or missing date. Format: YYYY-MM-DD" }, 400);
  }
  const visibleDates = dateKeysBetween(date, dateTo);
  if (!visibleDates.length || visibleDates.length > MAX_RANGE_DAYS) return json({ error: "Invalid or too-large date range" }, 400);

  const diagnostics: LookupDiagnostics = {
    requested_date: date,
    requested_date_to: dateTo,
    configured_calendars: 0,
    successful_calendars: 0,
    successful_pages: 0,
    failed_calendars: 0,
    event_count: 0,
    interval_count: 0,
    rejected_interval_count: 0,
  };

  const serviceAccountKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  const rawCalendarId = Deno.env.get("GOOGLE_CALENDAR_ID");
  if (!serviceAccountKeyRaw || !rawCalendarId) {
    diagnosticLog("error", "lookup_failure", diagnostics);
    return json({ error: "Calendar configuration unavailable" }, 503);
  }

  const calendarIds = calendarIdsFromConfig(rawCalendarId);
  diagnostics.configured_calendars = calendarIds.length;
  if (!calendarIds.length) {
    diagnosticLog("error", "lookup_failure", diagnostics);
    return json({ error: "Calendar configuration unavailable" }, 503);
  }

  let key: { client_email?: unknown; private_key?: unknown };
  try {
    const parsed = JSON.parse(serviceAccountKeyRaw) as unknown;
    const record = asRecord(parsed);
    if (!record) throw new Error("invalid_key_shape");
    key = { client_email: record.client_email, private_key: record.private_key };
    if (!text(key.client_email) || !text(key.private_key)) throw new Error("missing_key_fields");
  } catch {
    diagnosticLog("error", "lookup_failure", diagnostics);
    return json({ error: "Calendar configuration unavailable" }, 503);
  }

  try {
    const auth = new JWT({
      email: text(key.client_email),
      key: text(key.private_key),
      scopes: [CALENDAR_READ_SCOPE],
    });
    const tokenResponse = await auth.getAccessToken();
    const accessToken = tokenResponse.token;
    if (!accessToken) throw new CalendarLookupError("access_token_unavailable");

    const results = await Promise.all(calendarIds.map(async (calendarId) => {
      try {
        const result = await listCalendarEvents(calendarId, accessToken, date, dateTo);
        return { ok: true, ...result } as const;
      } catch {
        return { ok: false, items: [] as CalendarEventItem[], pages: 0 } as const;
      }
    }));

    diagnostics.successful_calendars = results.filter((result) => result.ok).length;
    diagnostics.failed_calendars = results.filter((result) => !result.ok).length;
    diagnostics.successful_pages = results.reduce((total, result) => total + result.pages, 0);
    diagnostics.event_count = results.reduce((total, result) => total + result.items.length, 0);

    if (diagnostics.failed_calendars > 0) {
      diagnosticLog("error", "lookup_failure", diagnostics);
      return json({ error: "Calendar temporarily unavailable" }, 503);
    }

    const busy: BusyInterval[] = [];
    for (const result of results) {
      for (const item of result.items) busy.push(...normalizeEvent(item, visibleDates, diagnostics));
    }
    diagnostics.interval_count = busy.length;
    diagnosticLog("info", busy.length ? "verified_busy" : "verified_empty", diagnostics);
    return json({ busy });
  } catch (error) {
    if (error instanceof CalendarDataError) diagnosticLog("error", "malformed_response", diagnostics);
    else diagnosticLog("error", "lookup_failure", diagnostics);
    return json({ error: "Calendar temporarily unavailable" }, 503);
  }
});
