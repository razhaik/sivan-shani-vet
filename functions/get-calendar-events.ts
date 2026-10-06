import { createSuperdevClient } from "npm:@superdevhq/client@0.1.56";
import { JWT } from "npm:google-auth-library@9.14.1";

const TIME_ZONE = "Asia/Jerusalem";
const CALENDAR_READ_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const MAX_RANGE_DAYS = 62;
const EMPTY_TITLE = "אירוע ללא כותרת";

type CalendarEventItem = {
  id?: unknown;
  status?: unknown;
  summary?: unknown;
  transparency?: unknown;
  start?: {
    date?: unknown;
    dateTime?: unknown;
    timeZone?: unknown;
  };
  end?: {
    date?: unknown;
    dateTime?: unknown;
    timeZone?: unknown;
  };
};

type CalendarEventSegment = {
  id: string;
  date: string;
  start: string;
  end: string;
  title: string;
  allDay: boolean;
};

type CalendarParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function validDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function dateKeyToUtc(value: string): Date | null {
  if (!validDateKey(value)) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function utcToDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function nextDateKey(value: string): string {
  const date = dateKeyToUtc(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + 1);
  return utcToDateKey(date);
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

const israelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function israelParts(value: Date): CalendarParts | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const parts = israelFormatter.formatToParts(value);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || "NaN");
  const result = {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

function israelDate(value: Date): string | null {
  const parts = israelParts(value);
  if (!parts) return null;
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function israelTime(value: Date): string | null {
  const parts = israelParts(value);
  if (!parts) return null;
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function parseLocalIsraelDateTime(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || "0");
  const milliseconds = Number((match[7] || "").slice(0, 3).padEnd(3, "0") || "0");
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;

  const localNaive = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
  const guess = israelParts(new Date(localNaive));
  if (!guess) return null;
  const renderedNaive = Date.UTC(guess.year, guess.month - 1, guess.day, guess.hour, guess.minute, guess.second, milliseconds);
  const offsetMinutes = Math.round((renderedNaive - localNaive) / 60000);
  const parsed = new Date(localNaive - offsetMinutes * 60000);
  const parsedParts = israelParts(parsed);
  if (!parsedParts) return null;
  return parsed;
}

function parseGoogleDateTime(value: unknown, timeZone: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const zone = text(timeZone) || TIME_ZONE;
  const parsed = hasOffset || zone !== TIME_ZONE
    ? new Date(raw)
    : parseLocalIsraelDateTime(raw);
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function localDayStart(date: string): Date | null {
  return parseLocalIsraelDateTime(`${date}T00:00:00`);
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

function normalizeEvent(item: CalendarEventItem, visibleDates: string[]): CalendarEventSegment[] {
  const id = text(item.id);
  if (!id || text(item.status).toLowerCase() === "cancelled" || text(item.status).toLowerCase() === "canceled") return [];
  const title = text(item.summary) || EMPTY_TITLE;
  const startDate = text(item.start?.date);
  const endDate = text(item.end?.date);

  if (startDate && endDate && validDateKey(startDate) && validDateKey(endDate) && startDate < endDate) {
    return visibleDates
      .filter((date) => date >= startDate && date < endDate)
      .map((date) => ({ id, date, start: "00:00", end: "23:59", title, allDay: true }));
  }

  const start = parseGoogleDateTime(item.start?.dateTime, item.start?.timeZone);
  const end = parseGoogleDateTime(item.end?.dateTime, item.end?.timeZone);
  if (!start || !end || end.getTime() <= start.getTime()) return [];

  const firstDate = israelDate(start);
  const lastDate = israelDate(new Date(end.getTime() - 1));
  if (!firstDate || !lastDate) return [];

  return visibleDates.flatMap((date) => {
    if (date < firstDate || date > lastDate) return [];
    const dayStart = localDayStart(date);
    const dayEnd = localDayStart(nextDateKey(date));
    if (!dayStart || !dayEnd || start >= dayEnd || end <= dayStart) return [];

    const clippedStart = start > dayStart ? start : dayStart;
    const clippedEnd = end < dayEnd ? end : dayEnd;
    if (clippedEnd <= clippedStart) return [];

    const startLabel = start <= dayStart ? "00:00" : israelTime(clippedStart);
    const endLabel = end >= dayEnd ? "23:59" : israelTime(clippedEnd);
    if (!startLabel || !endLabel || startLabel === endLabel) return [];
    return [{ id, date, start: startLabel, end: endLabel, title, allDay: false }];
  });
}

async function authenticate(req: Request): Promise<boolean> {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  const client = createSuperdevClient({ appId: Deno.env.get("SUPERDEV_APP_ID") });
  client.auth.setToken(token);
  try {
    const user = await client.auth.me();
    return Boolean(user?.email);
  } catch {
    console.error("Calendar events authentication failed");
    return false;
  }
}

async function listCalendarEvents(calendarId: string, accessToken: string, date: string, dateTo: string): Promise<CalendarEventItem[]> {
  const items: CalendarEventItem[] = [];
  let pageToken = "";

  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", `${date}T00:00:00+03:00`);
    url.searchParams.set("timeMax", `${nextDateKey(dateTo)}T00:00:00+03:00`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("timeZone", TIME_ZONE);
    url.searchParams.set("fields", "nextPageToken,items(id,status,summary,start(date,dateTime,timeZone),end(date,dateTime,timeZone),transparency)");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json().catch(() => ({})) as { items?: unknown; nextPageToken?: unknown };
    if (!response.ok) throw new Error(`Google Calendar request failed with status ${response.status}`);

    if (Array.isArray(data.items)) items.push(...data.items as CalendarEventItem[]);
    const next = text(data.nextPageToken);
    if (!next || next === pageToken) break;
    pageToken = next;
  }

  return items;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await authenticate(req))) return json({ error: "Authentication required" }, 401);

  try {
    const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
    const date = text(payload?.date);
    const dateToValue = text(payload?.dateTo);
    const dateTo = dateToValue || date;
    if (!validDateKey(date) || (dateToValue && !validDateKey(dateToValue))) {
      return json({ error: "Invalid date range. Use YYYY-MM-DD." }, 400);
    }

    const start = dateKeyToUtc(date);
    const end = dateKeyToUtc(dateTo);
    if (!start || !end || end.getTime() < start.getTime()) return json({ error: "Invalid date range." }, 400);
    const rangeDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (rangeDays > MAX_RANGE_DAYS) return json({ error: "Date range is too large." }, 400);
    const visibleDates = dateKeysBetween(date, dateTo);

    const serviceAccountKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    const rawCalendarId = Deno.env.get("GOOGLE_CALENDAR_ID");
    if (!serviceAccountKeyRaw || !rawCalendarId) return json({ error: "Missing configuration" }, 500);

    const calendarIds = rawCalendarId.split(/[;,\n]/).map((value) => value.trim()).filter(Boolean).map(normalizeCalendarId);
    if (!calendarIds.length) return json({ error: "Invalid calendar configuration" }, 500);

    let key: { client_email?: string; private_key?: string };
    try {
      key = JSON.parse(serviceAccountKeyRaw);
    } catch {
      return json({ error: "Invalid service account key format" }, 500);
    }
    if (!key.client_email || !key.private_key) return json({ error: "Service account key is missing required fields" }, 500);

    const auth = new JWT({ email: key.client_email, key: key.private_key, scopes: [CALENDAR_READ_SCOPE] });
    const tokenResponse = await auth.getAccessToken();
    const accessToken = tokenResponse.token;
    if (!accessToken) throw new Error("Failed to get Google Calendar access token");

    const results = await Promise.all(calendarIds.map(async (calendarId) => {
      try {
        return { ok: true, items: await listCalendarEvents(calendarId, accessToken, date, dateTo) };
      } catch {
        console.error("Google Calendar events request failed for one configured calendar");
        return { ok: false, items: [] as CalendarEventItem[] };
      }
    }));

    if (results.every((result) => !result.ok)) throw new Error("Failed to fetch Google Calendar events");

    const events = results.flatMap((result) => result.items.flatMap((item) => normalizeEvent(item, visibleDates)));
    events.sort((left, right) => left.date.localeCompare(right.date) || Number(left.allDay) - Number(right.allDay) || left.start.localeCompare(right.start) || left.end.localeCompare(right.end) || left.id.localeCompare(right.id));
    const busy = events.map(({ date: eventDate, start, end }) => ({ date: eventDate, start, end }));

    return json({ busy, events });
  } catch (error) {
    console.error("Calendar events lookup failed");
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
