import { createSuperdevClient } from "npm:@superdevhq/client@0.1.56";

const MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY = "marketing-clinic-template" as const;
const CUSTOMER_EMAIL_LOGO_URL = "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/f4527f39-6b5f-4fae-b77d-5735fe1452b8-pasted-image-1789671955012.png";

type CustomerEmailTemplateKey = "current-clinic-template" | "marketing-clinic-template";
type CustomerEmailDetail = { label: string; value: unknown };
type CustomerEmailAction = { label: string; url: string; variant?: "primary" | "secondary" | "danger" };
type CustomerEmailOptions = {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  statusColor?: string;
  body?: string;
  details?: CustomerEmailDetail[];
  actions?: CustomerEmailAction[];
  clinicName?: string;
  clinicTagline?: string;
};

function resolveCustomerEmailTemplateSelection(value: unknown, emailType: string): CustomerEmailTemplateKey {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return source[emailType] === MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY ? MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY : "current-clinic-template";
}

function customerEmailText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function customerEmailEscapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] || character));
}

function customerEmailMultiline(value: unknown): string {
  return customerEmailEscapeHtml(value).replace(/\r?\n/g, "<br />");
}

function customerEmailSafeUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 2048) return "";
  try {
    const parsed = new URL(raw, SITE_URL);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    const hostname = parsed.hostname.toLowerCase();
    const clinic = hostname === "sivanshanivet.com" || hostname.endsWith(".sivanshanivet.com");
    const calendar = hostname === "calendar.google.com" || hostname === "www.google.com";
    return clinic || calendar ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function customerEmailColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallback;
}

function customerEmailDetailsHtml(details: CustomerEmailDetail[]): string {
  const visible = details.filter((detail) => detail && customerEmailText(detail.label));
  if (!visible.length) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:rgba(244,249,250,0.82);border:1px solid #dce9ee;border-radius:16px;overflow:hidden;">${visible.map((detail, index) => `<tr><td style="padding:11px 14px;${index < visible.length - 1 ? "border-bottom:1px solid #dce9ee;" : ""}width:36%;vertical-align:top;color:#718792;font-size:11px;font-weight:800;">${customerEmailEscapeHtml(detail.label)}</td><td style="padding:11px 14px;${index < visible.length - 1 ? "border-bottom:1px solid #dce9ee;" : ""}vertical-align:top;color:#0f2842;font-size:13px;font-weight:800;line-height:1.65;white-space:pre-wrap;word-break:break-word;">${customerEmailMultiline(detail.value)}</td></tr>`).join("")}</table>`;
}

function customerEmailActionsHtml(actions: CustomerEmailAction[]): string {
  const visible = actions.map((action) => ({ ...action, url: customerEmailSafeUrl(action?.url) })).filter((action) => action.url && customerEmailText(action.label)).slice(0, 2);
  if (!visible.length) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:25px;"><tr><td align="center">${visible.map((action) => { const background = action.variant === "danger" ? "#b83b4b" : action.variant === "secondary" ? "#0f2842" : "#1d6472"; return `<a href="${customerEmailEscapeHtml(action.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0 4px 8px;padding:12px 22px;border-radius:12px;background:${background};color:#ffffff;text-decoration:none;font-size:13px;font-weight:900;line-height:1.2;">${customerEmailEscapeHtml(action.label)}</a>`; }).join("")}</td></tr></table>`;
}

function buildMarketingAppointmentEmailHtml(appointment: AnyRecord, options: CustomerEmailOptions): string {
  const clientName = customerEmailText(appointment.client_name, "לקוח יקר");
  const dateValue = customerEmailText(appointment.date, "לא צוין");
  const details: CustomerEmailDetail[] = [
    { label: "שם הלקוח", value: clientName },
    { label: "חיית המחמד", value: customerEmailText(appointment.pet_name, "-") },
    { label: "סוג הטיפול", value: customerEmailText(appointment.appointment_type, "-") },
    { label: "תאריך", value: dateValue.includes("-") ? dateValue.split("-").reverse().join("/") : dateValue },
    { label: "שעה", value: `${customerEmailText(appointment.start_time, "-")}${customerEmailText(appointment.end_time) ? ` - ${customerEmailText(appointment.end_time)}` : ""}` },
  ];
  if (customerEmailText(appointment.phone)) details.push({ label: "טלפון", value: customerEmailText(appointment.phone) });
  if (customerEmailText(appointment.email)) details.push({ label: "דוא״ל", value: customerEmailText(appointment.email) });
  if (customerEmailText(appointment.notes)) details.push({ label: "הערות נוספות", value: customerEmailText(appointment.notes) });
  const title = customerEmailText(options.title, "עדכון מהמרפאה");
  const subtitle = customerEmailText(options.subtitle);
  const body = customerEmailText(options.body, `שלום ${clientName},\n\n${subtitle || "אלה פרטי התור שלך במרפאה."}`);
  const statusLabel = customerEmailText(options.statusLabel);
  const statusColor = customerEmailColor(options.statusColor, "#2f90a1");
  const clinicName = customerEmailText(options.clinicName, "ד״ר סיון שני");
  const clinicTagline = customerEmailText(options.clinicTagline, "מרפאה וטרינרית · טיפול אישי ומקצועי");
  const detailsHtml = customerEmailDetailsHtml(details);
  const actionsHtml = customerEmailActionsHtml(Array.isArray(options.actions) ? options.actions : []);
  return `<!doctype html><html lang="he" dir="rtl"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${customerEmailEscapeHtml(title)}</title></head><body style="margin:0;padding:0;background:#ecf5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;direction:rtl;text-align:right;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ecf5f7;padding:22px 10px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d5e2e7;border-radius:24px;overflow:hidden;"><tr><td background="${customerEmailEscapeHtml(CUSTOMER_EMAIL_LOGO_URL)}" bgcolor="#ffffff" style="padding:0;background-color:#ffffff;background-image:url('${customerEmailEscapeHtml(CUSTOMER_EMAIL_LOGO_URL)}');background-position:center 52%;background-repeat:no-repeat;background-size:88% auto;overflow:hidden;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="position:relative;z-index:1;background:transparent;"><tr><td style="padding:28px 30px 22px;background:rgba(244,249,250,0.82);border-bottom:1px solid #dce9ee;"><div style="font-size:18px;line-height:1.35;font-weight:900;letter-spacing:-0.02em;color:#0f2842;">${customerEmailEscapeHtml(clinicName)}</div><div style="margin-top:5px;font-size:12px;line-height:1.6;font-weight:700;color:#52717d;">${customerEmailEscapeHtml(clinicTagline)}</div><div style="margin-top:18px;width:58px;height:4px;border-radius:99px;background:#2f90a1;"></div></td></tr><tr><td style="padding:30px;background:rgba(255,255,255,0.72);"><div style="font-size:10px;line-height:1.4;font-weight:900;letter-spacing:0.16em;color:#2f90a1;">נושא ההודעה</div><div style="margin-top:11px;font-size:25px;line-height:1.35;font-weight:900;letter-spacing:-0.03em;color:#0f2842;">${customerEmailEscapeHtml(title)}</div>${subtitle ? `<div style="margin-top:10px;font-size:13px;line-height:1.75;font-weight:700;color:#52717d;">${customerEmailMultiline(subtitle)}</div>` : ""}${statusLabel ? `<div style="margin-top:18px;display:inline-block;padding:6px 11px;border:1px solid #c9dde3;border-radius:999px;background:#eaf6f7;color:${statusColor};font-size:11px;line-height:1.2;font-weight:900;">${customerEmailEscapeHtml(statusLabel)}</div>` : ""}<div style="margin-top:22px;border-top:1px solid #dce9ee;padding-top:22px;color:#405a67;font-size:14px;line-height:1.9;font-weight:600;">${customerEmailMultiline(body)}</div><div style="margin-top:22px;">${detailsHtml}</div>${actionsHtml}</td></tr><tr><td style="padding:18px 30px 22px;background:rgba(248,251,252,0.86);border-top:1px solid #dce9ee;text-align:center;"><div style="font-size:11px;line-height:1.6;font-weight:900;color:#0f2842;">בברכה, ${customerEmailEscapeHtml(clinicName)}</div><div style="margin-top:4px;font-size:10px;line-height:1.6;font-weight:600;color:#718792;">כאן עבורכם ועבור חיות המחמד שלכם</div><div style="margin-top:9px;font-size:10px;line-height:1.5;color:#8aa0a8;">sivanshanivet.com · כל הזכויות שמורות © 2026</div></td></tr></table></td></tr></table><div style="height:26px;"></div></td></tr></table></body></html>`;
}

const APP_ID = Deno.env.get("SUPERDEV_APP_ID");
const SERVICE_ROLE_KEY = Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY");
const SITE_URL = "https://sivanshanivet.com";
const CLINIC_PHONE = "054-4345388";
const TIME_ZONE = "Asia/Jerusalem";
const DEFAULT_MIN_HOURS_BEFORE_BOOKING = 4;
const MAX_BOOKING_MONTHS = 12;
const MAX_NOTIFICATION_WAIT_MS = 4500;
const SMS_CONSENT_LANGUAGE = "אני מסכימ/ה לקבל מהמרפאה הודעות SMS בנוגע לתורים ולעדכונים חשובים. ניתן לבטל את ההסכמה בכל עת.";

const superdev = createSuperdevClient({ appId: APP_ID });
const integrations = createSuperdevClient({ appId: APP_ID });

type AnyRecord = Record<string, any>;
type TimePeriod = { start: string; end: string };
type BusyInterval = { date: string; start: string; end: string };
type AppointmentBlockInterval = { date: string; start: string; end: string };
type ParsedDate = { key: string; year: number; month: number; day: number; weekday: number };
type ResolvedService = {
  id: string;
  name: string;
  durationMinutes: number;
  description: string;
  bookingNote: string;
  windowIds: string[];
  weeklyAvailability: unknown;
};
type FunctionOptions = { headers?: Record<string, string>; signal?: AbortSignal };
type BackendFunction = (payload: Record<string, unknown>, options?: FunctionOptions) => Promise<unknown>;
type CalendarFailureKind = "lookup_failed" | "malformed_response";

class CalendarUnavailableError extends Error {
  constructor(public readonly kind: CalendarFailureKind, public readonly rejectedIntervals = 0) {
    super("calendar_unavailable");
    this.name = "CalendarUnavailableError";
  }
}

const CALENDAR_UNAVAILABLE_MESSAGE = "לא ניתן לאמת את זמינות היומן כרגע. נסו שוב בעוד רגע.";

const LEGACY_SERVICES = [
  { id: "vaccine", name: "חיסון וטיפולים שגרתיים", durationMinutes: 20, description: "טיפול שגרתי, חיסונים שנתיים ובדיקה תקופתית" },
  { id: "general", name: "בדיקה כללית / לקוח חדש", durationMinutes: 30, description: "בדיקה רפואית מקיפה לבעיות ספציפיות או היכרות ראשונה" },
  { id: "surgery", name: "עיקור / סירוס / פרוצדורה אחרת", durationMinutes: 90, description: "ניתוחים ופרוצדורות מורכבות (נא לפרט בהערות)" },
  { id: "dental", name: "ניקוי שיניים בהרדמה", durationMinutes: 90, description: "טיפול שיניים יסודי תחת הרדמה מלאה" },
] as const;

const DEFAULT_WEEKLY_AVAILABILITY: Array<{ weekday: number; enabled: boolean; periods: TimePeriod[] }> = [
  { weekday: 0, enabled: true, periods: [{ start: "16:00", end: "17:30" }] },
  { weekday: 1, enabled: true, periods: [{ start: "09:30", end: "13:30" }, { start: "16:00", end: "19:30" }] },
  { weekday: 2, enabled: true, periods: [{ start: "09:30", end: "10:20" }, { start: "13:00", end: "14:00" }, { start: "16:00", end: "17:30" }] },
  { weekday: 3, enabled: true, periods: [{ start: "16:30", end: "19:30" }] },
  { weekday: 4, enabled: true, periods: [{ start: "09:30", end: "13:30" }, { start: "16:00", end: "19:30" }] },
  { weekday: 5, enabled: true, periods: [{ start: "09:30", end: "15:00" }] },
  { weekday: 6, enabled: false, periods: [] },
];

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    },
  });
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function boundedText(value: unknown, max: number, fallback = "") {
  return text(value, fallback).slice(0, max);
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 180);
}

function requestHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const authorization = req.headers.get("Authorization");
  const origin = req.headers.get("Origin");
  if (authorization) headers.Authorization = authorization;
  if (origin) headers.Origin = origin;
  return headers;
}

function unwrap(value: unknown): AnyRecord | null {
  if (typeof value === "string") {
    try { return unwrap(JSON.parse(value)); } catch { return null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as AnyRecord;
  if (Object.prototype.hasOwnProperty.call(record, "data")) return unwrap(record.data);
  if (Object.prototype.hasOwnProperty.call(record, "body")) return unwrap(record.body);
  return record;
}

function calendarEnvelopeFailed(record: AnyRecord) {
  if (Object.prototype.hasOwnProperty.call(record, "error") && record.error !== undefined && record.error !== null && record.error !== "" && record.error !== false) return true;
  if (record.ok === false || record.success === false) return true;
  if (!Object.prototype.hasOwnProperty.call(record, "status")) return false;

  const status = record.status;
  if (typeof status === "number") return !Number.isInteger(status) || status < 200 || status >= 300;
  if (typeof status !== "string") return true;
  const normalized = status.trim().toLowerCase();
  if (!normalized) return true;
  if (/^[0-9]+$/.test(normalized)) {
    const numeric = Number(normalized);
    return numeric < 200 || numeric >= 300;
  }
  return !["ok", "success", "succeeded", "completed"].includes(normalized);
}

function parseBusyPayload(value: unknown, requestedDate: string): BusyInterval[] {
  let current = value;
  let rejectedIntervals = 0;

  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
      } catch {
        throw new CalendarUnavailableError("malformed_response", rejectedIntervals);
      }
    }

    if (!current || typeof current !== "object" || Array.isArray(current)) {
      throw new CalendarUnavailableError("malformed_response", rejectedIntervals);
    }
    const record = current as AnyRecord;
    if (calendarEnvelopeFailed(record)) throw new CalendarUnavailableError("lookup_failed", rejectedIntervals);
    if (Object.prototype.hasOwnProperty.call(record, "data")) {
      current = record.data;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(record, "body")) {
      current = record.body;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(record, "busy") || !Array.isArray(record.busy)) {
      throw new CalendarUnavailableError("malformed_response", rejectedIntervals);
    }

    const intervals: BusyInterval[] = [];
    for (const item of record.busy) {
      const interval = item && typeof item === "object" && !Array.isArray(item) ? item as AnyRecord : null;
      const date = text(interval?.date);
      const start = text(interval?.start);
      const end = text(interval?.end);
      const startMinutes = timeToMinutes(start);
      const endMinutes = timeToMinutes(end);
      if (!interval || date !== requestedDate || !parseDate(date) || !TIME_PATTERN.test(start) || !TIME_PATTERN.test(end) || !validRange(startMinutes, endMinutes)) {
        rejectedIntervals += 1;
        throw new CalendarUnavailableError("malformed_response", rejectedIntervals);
      }
      intervals.push({ date, start, end });
    }
    return intervals;
  }

  throw new CalendarUnavailableError("malformed_response", rejectedIntervals);
}

function israelParts(instant: Date) {
  const values: Record<string, string> = {};
  for (const part of israelFormatter.formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function israelOffsetMs(instant: Date) {
  const rounded = Math.floor(instant.getTime() / 1000) * 1000;
  const parts = israelParts(instant);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - rounded;
}

function localIsraelToInstant(dateValue: unknown, timeValue: unknown): Date | null {
  const dateMatch = DATE_PATTERN.exec(text(dateValue));
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(text(timeValue));
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59) return null;

  const wallClock = Date.UTC(year, month - 1, day, hour, minute, 0);
  const candidates: number[] = [];
  for (const dayOffset of [-3, -2, -1, 0, 1, 2, 3]) {
    const probe = new Date(wallClock + dayOffset * 24 * 60 * 60 * 1000);
    const candidateMs = wallClock - israelOffsetMs(probe);
    const candidate = new Date(candidateMs);
    const parts = israelParts(candidate);
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute) candidates.push(candidateMs);
  }
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

function israelDateKey(instant = new Date()) {
  const parts = israelParts(instant);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function parseDate(value: unknown): ParsedDate | null {
  const match = DATE_PATTERN.exec(text(value));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return { key: `${match[1]}-${match[2]}-${match[3]}`, year, month, day, weekday: candidate.getUTCDay() };
}

function dateIsBookable(date: ParsedDate, now = new Date()) {
  const today = parseDate(israelDateKey(now));
  if (!today) return false;
  const requested = Date.UTC(date.year, date.month - 1, date.day);
  const earliest = Date.UTC(today.year, today.month - 1, today.day);
  const maximum = new Date(earliest);
  maximum.setUTCMonth(maximum.getUTCMonth() + MAX_BOOKING_MONTHS);
  return requested >= earliest && requested <= maximum.getTime();
}

function timeToMinutes(value: unknown) {
  const match = /^(\d{2}):(\d{2})$/.exec(text(value));
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(value: number) {
  if (!Number.isFinite(value)) return "";
  const safe = Math.max(0, Math.min(1439, Math.trunc(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function validRange(start: number, end: number) {
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && end > otherStart;
}

function normalizePeriods(value: unknown): TimePeriod[] {
  if (!Array.isArray(value)) return [];
  const periods: TimePeriod[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as AnyRecord;
    const start = text(record.start);
    const end = text(record.end);
    if (TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && timeToMinutes(end) > timeToMinutes(start)) periods.push({ start, end });
  }
  periods.sort((left, right) => timeToMinutes(left.start) - timeToMinutes(right.start));
  return periods.filter((period, index) => index === 0 || timeToMinutes(period.start) >= timeToMinutes(periods[index - 1].end));
}

function fallbackHours(): Record<number, TimePeriod[]> {
  return Object.fromEntries(DEFAULT_WEEKLY_AVAILABILITY.map((day) => [day.weekday, day.enabled ? day.periods.map((period) => ({ ...period })) : []]));
}

function clinicHours(value: unknown): Record<number, TimePeriod[]> {
  if (!Array.isArray(value) || value.length !== 7) return fallbackHours();
  const byWeekday = new Map<number, TimePeriod[]>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fallbackHours();
    const record = item as AnyRecord;
    const weekday = record.weekday;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || typeof record.enabled !== "boolean" || byWeekday.has(weekday)) return fallbackHours();
    const periods = record.enabled ? normalizePeriods(record.periods) : [];
    if (record.enabled && periods.length === 0) return fallbackHours();
    byWeekday.set(weekday, periods);
  }
  if (byWeekday.size !== 7) return fallbackHours();
  const result: Record<number, TimePeriod[]> = {};
  for (let weekday = 0; weekday <= 6; weekday += 1) result[weekday] = byWeekday.get(weekday) || [];
  return result;
}

function serviceHours(value: unknown): Record<number, TimePeriod[]> | null {
  if (!Array.isArray(value) || value.length !== 7) return null;

  const byWeekday = new Map<number, TimePeriod[]>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const day = item as AnyRecord;
    const weekday = day.weekday;
    const enabled = day.enabled;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || typeof enabled !== "boolean" || byWeekday.has(weekday)) return null;
    if (!Array.isArray(day.periods)) return null;

    const periods: TimePeriod[] = [];
    for (const rawPeriod of day.periods) {
      if (!rawPeriod || typeof rawPeriod !== "object" || Array.isArray(rawPeriod)) return null;
      const period = rawPeriod as AnyRecord;
      if (typeof period.start !== "string" || typeof period.end !== "string" || !TIME_PATTERN.test(period.start) || !TIME_PATTERN.test(period.end)) return null;
      const start = timeToMinutes(period.start);
      const end = timeToMinutes(period.end);
      if (!validRange(start, end)) return null;
      periods.push({ start: period.start, end: period.end });
    }

    if ((enabled && periods.length === 0) || (!enabled && periods.length > 0)) return null;
    periods.sort((left, right) => timeToMinutes(left.start) - timeToMinutes(right.start));
    for (let index = 1; index < periods.length; index += 1) {
      if (timeToMinutes(periods[index].start) < timeToMinutes(periods[index - 1].end)) return null;
    }
    byWeekday.set(weekday, enabled ? periods : []);
  }

  const normalized: Record<number, TimePeriod[]> = {};
  for (let weekday = 0; weekday <= 6; weekday += 1) normalized[weekday] = byWeekday.get(weekday) || [];
  return normalized;
}

function intersectPeriods(first: TimePeriod[], second: TimePeriod[]): TimePeriod[] {
  const intersections: TimePeriod[] = [];
  for (const firstPeriod of first) {
    const firstStart = timeToMinutes(firstPeriod.start);
    const firstEnd = timeToMinutes(firstPeriod.end);
    for (const secondPeriod of second) {
      const start = Math.max(firstStart, timeToMinutes(secondPeriod.start));
      const end = Math.min(firstEnd, timeToMinutes(secondPeriod.end));
      if (validRange(start, end)) intersections.push({ start: minutesToTime(start), end: minutesToTime(end) });
    }
  }
  return intersections.sort((left, right) => timeToMinutes(left.start) - timeToMinutes(right.start));
}

function effectiveServicePeriods(settings: AnyRecord, service: ResolvedService, weekday: number): TimePeriod[] {
  const clinicPeriods = clinicHours(settings.weekly_availability)[weekday] || [];
  if (service.weeklyAvailability === undefined || service.weeklyAvailability === null) return clinicPeriods;
  const savedServiceHours = serviceHours(service.weeklyAvailability);
  if (!savedServiceHours) return [];
  return intersectPeriods(clinicPeriods, savedServiceHours[weekday] || []);
}

function minimumHours(settings: AnyRecord) {
  const value = Number(settings.min_hours_before_booking);
  return Number.isFinite(value) && value >= 0 && value <= 720 ? Math.floor(value) : DEFAULT_MIN_HOURS_BEFORE_BOOKING;
}

function normalizeName(value: unknown) {
  return text(value).replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").toLocaleLowerCase("he");
}

const LOOKUP_PHONE_MAX_LENGTH = 40;

function canonicalPhone(value: unknown) {
  const raw = text(value);
  if (!raw || raw.length > LOOKUP_PHONE_MAX_LENGTH) return "";

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Accept both 05X-XXXXXXX and international Israeli forms, including
  // the occasional +972 05X... formatting found in imported files.
  if (digits.startsWith("9720") && digits.length >= 12 && digits.length <= 13) {
    digits = `972${digits.slice(4)}`;
  }
  if (digits.startsWith("972")) return digits.length <= 15 ? digits : "";
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) return `972${digits.slice(1)}`;
  if (digits.length === 9 && /^[2-9]\d{8}$/.test(digits)) return `972${digits}`;
  return digits.length >= 7 && digits.length <= 15 ? digits : "";
}

function activeService(value: AnyRecord) {
  return value.is_active !== false && value.is_active !== 0 && value.is_active !== "false";
}

function noteForLegacyService(settings: AnyRecord, serviceId: string) {
  if (!LEGACY_SERVICES.some((service) => service.id === serviceId)) return "";
  return boundedText(settings[`booking_note_${serviceId}`], 2000);
}

async function resolveService(serviceId: string, serviceName: string, settings: AnyRecord): Promise<ResolvedService | null> {
  let records: AnyRecord[] = [];
  try {
    const result = await superdev.entities.ClinicService.list("sort_order", 500);
    records = Array.isArray(result) ? result.filter((item) => item && typeof item === "object") as AnyRecord[] : [];
  } catch (error) {
    console.warn("[PublicBooking] service catalog unavailable:", safeError(error));
    throw new Error("service_catalog_unavailable");
  }

  const requestedName = normalizeName(serviceName);
  const legacyForId = LEGACY_SERVICES.find((service) => service.id === serviceId);
  const legacyCatalogName = legacyForId ? normalizeName(legacyForId.name) : "";
  const catalogRecord = records.find((record) =>
    text(record.id) === serviceId
      || (requestedName && normalizeName(record.name) === requestedName)
      || (legacyCatalogName && normalizeName(record.name) === legacyCatalogName),
  );
  if (catalogRecord) {
    if (!activeService(catalogRecord)) return null;
    const duration = Number(catalogRecord.duration_minutes);
    const name = boundedText(catalogRecord.name, 200);
    if (!name || !Number.isInteger(duration) || duration <= 0 || duration > 720) return null;
    const catalogId = text(catalogRecord.id);
    const legacy = LEGACY_SERVICES.find((service) => service.id === serviceId || normalizeName(service.name) === normalizeName(name));
    const windowIds = [serviceId, catalogId, legacy?.id].filter((value): value is string => Boolean(value));
    return {
      id: catalogId || serviceId,
      name,
      durationMinutes: duration,
      description: boundedText(catalogRecord.description, 1000),
      bookingNote: noteForLegacyService(settings, legacy?.id || serviceId),
      windowIds: [...new Set(windowIds)],
      weeklyAvailability: catalogRecord.weekly_availability,
    };
  }

  const legacy = LEGACY_SERVICES.find((service) => service.id === serviceId || normalizeName(service.name) === requestedName);
  if (!legacy) return null;
  return {
    id: legacy.id,
    name: legacy.name,
    durationMinutes: legacy.durationMinutes,
    description: legacy.description,
    bookingNote: noteForLegacyService(settings, legacy.id),
    windowIds: [...new Set([serviceId, legacy.id])],
    weeklyAvailability: undefined,
  };
}

function requestedDurationMatches(value: unknown, service: ResolvedService) {
  if (value === undefined) return true;
  const duration = Number(value);
  return Number.isInteger(duration) && duration === service.durationMinutes;
}

async function loadSettings(): Promise<AnyRecord> {
  const result = await superdev.entities.ClinicSettings.list("-created_at", 1);
  return Array.isArray(result) && result[0] && typeof result[0] === "object" ? result[0] as AnyRecord : {};
}

async function loadAppointments(date: string): Promise<AnyRecord[]> {
  const result = await superdev.entities.Appointment.query().where("date", date).limit(1000).exec();
  return Array.isArray(result) ? result.filter((item) => item && typeof item === "object") as AnyRecord[] : [];
}

async function loadAppointmentBlocks(date: string): Promise<AppointmentBlockInterval[]> {
  const result = await superdev.entities.AppointmentBlock.query().where("date", date).limit(1000).exec();
  if (!Array.isArray(result)) return [];
  return result.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as AnyRecord;
    const blockDate = text(record.date);
    const start = text(record.start_time);
    const end = text(record.end_time);
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);
    if (blockDate !== date || !parseDate(blockDate) || !TIME_PATTERN.test(start) || !TIME_PATTERN.test(end) || !validRange(startMinutes, endMinutes)) return [];
    return [{ date: blockDate, start, end }];
  });
}

async function loadBusy(date: string): Promise<BusyInterval[]> {
  const getBusy = superdev.functions["get-calendar-busy"] as unknown as BackendFunction;
  let response: unknown;
  try {
    response = await getBusy({ date });
  } catch {
    console.error("[PublicBooking] calendar_lookup_failed", JSON.stringify({ requested_date: date, requested_date_to: date, failure_kind: "lookup_failed" }));
    throw new CalendarUnavailableError("lookup_failed");
  }

  try {
    const intervals = parseBusyPayload(response, date);
    console.info("[PublicBooking] calendar_verified", JSON.stringify({
      outcome: intervals.length ? "verified_busy" : "verified_empty",
      requested_date: date,
      requested_date_to: date,
      interval_count: intervals.length,
      rejected_interval_count: 0,
    }));
    return intervals;
  } catch (error) {
    if (error instanceof CalendarUnavailableError) {
      console.error("[PublicBooking] calendar_verification_failed", JSON.stringify({
        requested_date: date,
        requested_date_to: date,
        failure_kind: error.kind,
        rejected_interval_count: error.rejectedIntervals,
      }));
      throw error;
    }
    console.error("[PublicBooking] calendar_verification_failed", JSON.stringify({ requested_date: date, requested_date_to: date, failure_kind: "malformed_response", rejected_interval_count: 0 }));
    throw new CalendarUnavailableError("malformed_response");
  }
}

async function loadSchedulingData(date: string) {
  const [windowsResult, appointments, blocks, busy] = await Promise.all([
    superdev.entities.AppointmentWindow.list("-created_at", 1000),
    loadAppointments(date),
    loadAppointmentBlocks(date),
    loadBusy(date),
  ]);
  const windows = Array.isArray(windowsResult) ? windowsResult.filter((item) => item && typeof item === "object") as AnyRecord[] : [];
  return { windows, appointments, blocks, busy };
}

function windowsForService(windows: AnyRecord[], date: ParsedDate, service: ResolvedService) {
  const allowedIds = new Set(service.windowIds);
  return windows.filter((window) => {
    const weekday = Number(window.weekday);
    const start = text(window.start_time);
    const end = text(window.end_time);
    return allowedIds.has(text(window.appointment_type_id)) && weekday === date.weekday && TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && validRange(timeToMinutes(start), timeToMinutes(end));
  });
}

function availableStartTimes({ date, service, settings, windows, appointments, blocks, busy, now = new Date() }: {
  date: ParsedDate;
  service: ResolvedService;
  settings: AnyRecord;
  windows: AnyRecord[];
  appointments: AnyRecord[];
  blocks: AppointmentBlockInterval[];
  busy: BusyInterval[];
  now?: Date;
}) {
  const periods = effectiveServicePeriods(settings, service, date.weekday);
  const typeWindows = windowsForService(windows, date, service);
  const appointmentIntervals = appointments
    .filter((appointment) => !["cancelled", "canceled"].includes(text(appointment.status).toLowerCase()))
    .map((appointment) => ({ start: timeToMinutes(appointment.start_time), end: timeToMinutes(appointment.end_time) }))
    .filter((interval) => validRange(interval.start, interval.end));
  const blockIntervals = blocks
    .filter((block) => block.date === date.key)
    .map((block) => ({ start: timeToMinutes(block.start), end: timeToMinutes(block.end) }))
    .filter((interval) => validRange(interval.start, interval.end));
  const busyIntervals = busy
    .map((interval) => ({ start: timeToMinutes(interval.start), end: timeToMinutes(interval.end) }))
    .filter((interval) => validRange(interval.start, interval.end));
  const minimumInstant = new Date(now.getTime() + minimumHours(settings) * 60 * 60 * 1000);
  const slots: string[] = [];

  for (const period of periods) {
    const periodStart = timeToMinutes(period.start);
    const periodEnd = timeToMinutes(period.end);
    if (!validRange(periodStart, periodEnd)) continue;
    for (let start = periodStart; start + service.durationMinutes <= periodEnd; start += service.durationMinutes) {
      const end = start + service.durationMinutes;
      const time = minutesToTime(start);
      const instant = localIsraelToInstant(date.key, time);
      if (!instant || instant.getTime() < minimumInstant.getTime()) continue;
      if (typeWindows.length > 0 && !typeWindows.some((window) => start >= timeToMinutes(window.start_time) && end <= timeToMinutes(window.end_time))) continue;
      if (appointmentIntervals.some((interval) => overlaps(start, end, interval.start, interval.end))) continue;
      if (blockIntervals.some((interval) => overlaps(start, end, interval.start, interval.end))) continue;
      if (busyIntervals.some((interval) => overlaps(start, end, interval.start, interval.end))) continue;
      slots.push(time);
    }
  }
  return slots;
}

function validEmail(value: string) {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

function normalizePhoneForSms(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/[^0-9]/g, "");
  return digits.length === 10 && digits.startsWith("0") ? `+972${digits.slice(1)}` : raw;
}

function validSmsPhone(value: string | null) {
  return Boolean(value && /^\+[1-9]\d{7,14}$/.test(value));
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}

function displayDate(value: string) {
  const match = DATE_PATTERN.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function createCancelToken() {
  try { return crypto.randomUUID(); } catch { return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; }
}

function managementUrl(token: string) {
  return `${SITE_URL}/manage-appointment?token=${encodeURIComponent(token)}`;
}

function bookingEmailHtml(appointment: AnyRecord, settings: AnyRecord, token: string) {
  const client = escapeHtml(appointment.client_name);
  const pet = escapeHtml(appointment.pet_name);
  const service = escapeHtml(appointment.appointment_type);
  const date = escapeHtml(displayDate(text(appointment.date)));
  const time = `${escapeHtml(appointment.start_time)} - ${escapeHtml(appointment.end_time)}`;
  const notes = escapeHtml(text(appointment.notes, "אין הערות נוספות"));
  const action = settings.self_service_appointment_management_enabled === true
    ? `<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(managementUrl(token))}" style="display:inline-block;padding:12px 24px;border-radius:12px;background:#1a1a3e;color:#fff;text-decoration:none;font-weight:800;">ניהול התור שלי</a></p>`
    : "";
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>בקשת תור התקבלה</title></head><body style="margin:0;padding:20px 10px;background:#f8fafc;font-family:Arial,'Segoe UI',sans-serif;direction:rtl;text-align:right;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:22px;overflow:hidden"><tr><td style="padding:26px 24px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff"><div style="font-size:24px;font-weight:900;margin-bottom:8px">קיבלנו את בקשתך לתור!</div><div style="font-size:14px;line-height:1.7">בקשתך במרפאת ד"ר סיון שני התקבלה. נאשר את התור בהקדם.</div></td></tr><tr><td style="padding:24px"><div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#fef3c7;color:#b45309;font-size:12px;font-weight:900;margin-bottom:16px">ממתין לאישור</div><p style="color:#334155;font-size:15px;line-height:1.8">שלום ${client},<br>אלו פרטי הבקשה שלך:</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0"><tr><td style="padding:10px 0;color:#64748b;font-size:12px;font-weight:700;width:36%">חיית המחמד</td><td style="padding:10px 0;color:#0f172a;font-weight:800">${pet}</td></tr><tr><td style="padding:10px 0;color:#64748b;font-size:12px;font-weight:700">סוג הטיפול</td><td style="padding:10px 0;color:#0f172a;font-weight:800">${service}</td></tr><tr><td style="padding:10px 0;color:#64748b;font-size:12px;font-weight:700">מועד מבוקש</td><td style="padding:10px 0;color:#0f172a;font-weight:800">${date} בשעה ${time}</td></tr></table><div style="margin-top:18px;padding:14px;border-radius:14px;background:#f8fafc;color:#475569;font-size:13px;line-height:1.7"><strong>הערות:</strong><br>${notes}</div>${action}<p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.7">לשאלות אפשר ליצור קשר עם המרפאה בטלפון ${CLINIC_PHONE}.</p></td></tr><tr><td style="padding:15px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:11px">© 2026 ד"ר סיון שני · מרפאה וטרינרית</td></tr></table></td></tr></table></body></html>`;
}

async function syncContact(req: Request, payload: AnyRecord) {
  const contact = integrations.integrations.core.contacts as unknown as (value: AnyRecord, options?: FunctionOptions) => Promise<unknown>;
  const result = await contact(payload, { headers: requestHeaders(req) });
  if (result && typeof result === "object" && (("error" in result && result.error) || ("success" in result && result.success === false))) throw new Error("Contact service reported an error");
}

async function sendClientEmail(req: Request, appointment: AnyRecord, settings: AnyRecord, token: string) {
  const email = text(appointment.email).toLowerCase();
  if (!validEmail(email)) return;
  const sendEmail = integrations.integrations.core.sendEmail as unknown as (value: AnyRecord, options?: FunctionOptions) => Promise<unknown>;
  const templateKey = resolveCustomerEmailTemplateSelection(settings.customer_email_template_selections, "booking_request");
  const managementLink = settings.self_service_appointment_management_enabled === true ? managementUrl(token) : "";
  const bodyHtml = templateKey === MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY
    ? buildMarketingAppointmentEmailHtml(appointment, {
      title: "קיבלנו את בקשתך לתור!",
      subtitle: 'בקשתך במרפאת ד"ר סיון שני התקבלה. נאשר את התור בהקדם.',
      statusLabel: "ממתין לאישור",
      statusColor: "#2F90A1",
      body: `שלום ${text(appointment.client_name, "לקוח יקר")},\n\nאלו פרטי בקשת התור שלך. נחזור אליך עם אישור בהקדם.\n\nלשאלות אפשר ליצור קשר עם המרפאה בטלפון ${CLINIC_PHONE}.`,
      actions: managementLink ? [{ label: "ניהול התור שלי", url: managementLink, variant: "secondary" }] : [],
      clinicName: text(settings.clinic_name, "ד״ר סיון שני"),
      clinicTagline: "מרפאה וטרינרית · טיפול אישי ומקצועי",
    })
    : bookingEmailHtml(appointment, settings, token);
  const result = await sendEmail({ from_name: 'ד"ר סיון שני', to: email, subject: 'קיבלנו את בקשתך לתור – ד"ר סיון שני', body_html: bodyHtml }, { headers: requestHeaders(req) });
  if (result && typeof result === "object" && (("error" in result && result.error) || ("success" in result && result.success === false))) throw new Error("Email service reported an error");
}

async function sendClientSms(req: Request, appointment: AnyRecord, phone: string | null) {
  if (!phone) return;
  const sendSms = superdev.functions["send-sms"] as unknown as BackendFunction;
  await sendSms({ to: phone, body: `ד"ר סיון שני: קיבלנו את בקשת התור עבור ${text(appointment.pet_name, "חיית המחמד")} ל-${displayDate(text(appointment.date))} בשעה ${text(appointment.start_time)}. נחזור אליך עם אישור בהקדם.` }, { headers: requestHeaders(req) });
}

function notifyOwner(req: Request, appointmentId: string) {
  if (!appointmentId) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_NOTIFICATION_WAIT_MS);
  const notify = superdev.functions["send-business-notification"] as unknown as BackendFunction;
  void notify({ event: "new_appointment", record_id: appointmentId }, { headers: requestHeaders(req), signal: controller.signal })
    .then((result) => {
      const payload = unwrap(result);
      if (payload?.error) console.error("[PublicBooking] owner notification was not accepted:", safeError(payload.error));
    })
    .catch((error) => console.error("[PublicBooking] owner notification failed:", safeError(error)))
    .finally(() => clearTimeout(timeout));
}

function serviceDetails(service: ResolvedService) {
  return { name: service.name, duration_minutes: service.durationMinutes, description: service.description, booking_note: service.bookingNote };
}

function lookupRecordRecency(record: AnyRecord, isAppointment: boolean) {
  const createdAt = Date.parse(text(record.created_at));
  const scheduledAt = isAppointment ? localIsraelToInstant(record.date, text(record.start_time) || "00:00")?.getTime() || 0 : 0;
  return Math.max(Number.isFinite(createdAt) ? createdAt : 0, scheduledAt);
}

function lookupField(record: AnyRecord, fields: string[], max: number) {
  for (const field of fields) {
    const value = boundedText(record[field], max);
    if (value) return value;
  }
  return "";
}

function lookupSpecies(value: unknown): "" | "dog" | "cat" | "other" {
  const raw = text(value).toLocaleLowerCase("he");
  if (["dog", "כלב", "כלבה", "כלבים"].includes(raw)) return "dog";
  if (["cat", "חתול", "חתולה", "חתולים"].includes(raw)) return "cat";
  if (["other", "אחר", "אחרת", "ציפור", "מכרסם", "ארנב"].includes(raw)) return "other";
  return "";
}

function lookupCustomerPayload(record: AnyRecord, fallbackPhone: string) {
  return {
    status: "ok",
    found: true,
    name: lookupField(record, ["client_name", "name"], 160),
    phone: lookupField(record, ["phone"], 40) || fallbackPhone,
    email: lookupField(record, ["email"], 254),
    petName: lookupField(record, ["pet_name"], 120),
    petSpecies: lookupSpecies(record.pet_species),
  };
}

async function handleCustomerLookup(rawPhone: string) {
  const requestedPhone = boundedText(rawPhone, LOOKUP_PHONE_MAX_LENGTH);
  const canonical = canonicalPhone(requestedPhone);
  if (!canonical) return json({ error: "invalid_lookup_phone", message: "נא להזין מספר טלפון תקין." }, 400);

  const [appointmentsResult, businessClientsResult] = await Promise.all([
    superdev.entities.Appointment.list("-created_at", 5000),
    superdev.entities.BusinessClient.list("-created_at", 5000),
  ]);
  const appointments = Array.isArray(appointmentsResult)
    ? appointmentsResult.filter((item) => item && typeof item === "object") as AnyRecord[]
    : [];
  const businessClients = Array.isArray(businessClientsResult)
    ? businessClientsResult.filter((item) => item && typeof item === "object") as AnyRecord[]
    : [];

  const matchingAppointments = appointments
    .filter((record) => canonicalPhone(record.phone) === canonical)
    .sort((left, right) => lookupRecordRecency(right, true) - lookupRecordRecency(left, true));
  const matchingBusinessClients = businessClients
    .filter((record) => canonicalPhone(record.phone) === canonical)
    .sort((left, right) => lookupRecordRecency(right, false) - lookupRecordRecency(left, false));

  const preferredAppointment = matchingAppointments.find((record) => !["cancelled", "canceled"].includes(text(record.status).toLowerCase()));
  const candidates = [
    ...matchingAppointments.map((record) => ({ record, isAppointment: true })),
    ...matchingBusinessClients.map((record) => ({ record, isAppointment: false })),
  ];
  const selected = preferredAppointment || candidates
    .sort((left, right) => lookupRecordRecency(right.record, right.isAppointment) - lookupRecordRecency(left.record, left.isAppointment))[0]?.record;

  if (!selected) {
    return json({
      status: "not_found",
      found: false,
      message: "לא מצאנו לקוח עם מספר הטלפון הזה. אפשר להמשיך כלקוח חדש.",
    });
  }

  return json(lookupCustomerPayload(selected, requestedPhone));
}

async function handleAvailability(date: ParsedDate, serviceId: string, serviceName: string, requestedDuration: unknown) {
  const settings = await loadSettings();
  const service = await resolveService(serviceId, serviceName, settings);
  if (!service) return json({ error: "service_unavailable", message: "סוג הטיפול שבחרתם אינו זמין כרגע." }, 400);
  if (!requestedDurationMatches(requestedDuration, service)) return json({ error: "invalid_booking_selection", message: "משך הטיפול שנבחר אינו תואם לשירות. נא לבחור את הטיפול מחדש." }, 400);
  const scheduling = await loadSchedulingData(date.key);
  return json({ status: "ok", available_start_times: availableStartTimes({ date, service, settings, ...scheduling }), service: serviceDetails(service) });
}

const slotLocks = new Map<string, Promise<void>>();
async function withSlotLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = slotLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  slotLocks.set(key, current);
  await previous;
  try { return await work(); } finally { release(); if (slotLocks.get(key) === current) slotLocks.delete(key); }
}

async function handleCreate(req: Request, body: AnyRecord, date: ParsedDate, serviceId: string, serviceName: string, requestedDuration: unknown) {
  const clientName = boundedText(body.client_name, 160);
  const phone = boundedText(body.phone, 40);
  const email = boundedText(body.email, 254).toLowerCase();
  const petName = boundedText(body.pet_name, 120);
  const petSpecies = text(body.pet_species);
  const notes = boundedText(body.notes, 2000);
  const startTime = text(body.start_time);
  const smsConsent = body.sms_consent;

  if (typeof smsConsent !== "boolean" || (body.notes !== undefined && typeof body.notes !== "string") || (!smsConsent && body.sms_consent_language !== undefined)) return json({ error: "invalid_customer_fields", message: "נא לבדוק שכל הפרטים החובה מולאו כראוי." }, 400);
  if (!clientName || !phone || phone.length < 9 || !validEmail(email) || !petName || !["dog", "cat", "other"].includes(petSpecies)) return json({ error: "invalid_customer_fields", message: "נא לבדוק שכל הפרטים החובה מולאו כראוי." }, 400);
  if (!TIME_PATTERN.test(startTime)) return json({ error: "invalid_time", message: "השעה שנבחרה אינה תקינה. נא לבחור שעה אחרת." }, 400);
  if (smsConsent && body.sms_consent_language !== SMS_CONSENT_LANGUAGE) return json({ error: "invalid_sms_consent", message: "נוסח הסכמת ה-SMS אינו תקין. אפשר לנסות שוב." }, 400);

  const settings = await loadSettings();
  const service = await resolveService(serviceId, serviceName, settings);
  if (!service) return json({ error: "service_unavailable", message: "סוג הטיפול שבחרתם אינו זמין כרגע." }, 400);
  if (!requestedDurationMatches(requestedDuration, service)) return json({ error: "invalid_booking_selection", message: "משך הטיפול שנבחר אינו תואם לשירות. נא לבחור את הטיפול מחדש." }, 400);

  return withSlotLock(`${date.key}:${startTime}:${service.id}`, async () => {
    const currentSettings = await loadSettings();
    const currentService = await resolveService(serviceId, serviceName, currentSettings);
    if (!currentService) return json({ error: "service_unavailable", message: "סוג הטיפול שבחרתם אינו זמין כרגע." }, 400);
    if (!requestedDurationMatches(requestedDuration, currentService)) return json({ error: "invalid_booking_selection", message: "משך הטיפול שנבחר אינו תואם לשירות. נא לבחור את הטיפול מחדש." }, 400);

    const scheduling = await loadSchedulingData(date.key);
    const available = availableStartTimes({ date, service: currentService, settings: currentSettings, ...scheduling });
    if (!available.includes(startTime)) {
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = startMinutes + currentService.durationMinutes;
      const calendarConflict = scheduling.busy.some((interval) => interval.date === date.key && overlaps(startMinutes, endMinutes, timeToMinutes(interval.start), timeToMinutes(interval.end)));
      if (calendarConflict) {
        console.info("[PublicBooking] verified_slot_conflict", JSON.stringify({ requested_date: date.key, requested_start_time: startTime, requested_end_time: minutesToTime(endMinutes), busy_interval_count: scheduling.busy.length }));
      }
      const instant = localIsraelToInstant(date.key, startTime);
      const currentMinimumHours = minimumHours(currentSettings);
      const minimumInstant = new Date(Date.now() + currentMinimumHours * 60 * 60 * 1000);
      if (!instant || instant.getTime() < minimumInstant.getTime()) return json({ status: "too_soon", error: "too_soon", message: `לא ניתן לקבוע תור בפחות מ-${currentMinimumHours} שעות מראש. אנא בחרו מועד מאוחר יותר.` }, 409);
      return json({ status: "conflict", error: "slot_unavailable", message: "המועד שבחרתם כבר לא פנוי. בחרו שעה אחרת ונסו שוב." }, 409);
    }

    const endTime = minutesToTime(timeToMinutes(startTime) + currentService.durationMinutes);
    const normalizedPhone = normalizePhoneForSms(phone);
    let consentRecorded = false;
    try {
      await syncContact(req, {
        email,
        first_name: clientName,
        phone: normalizedPhone || phone,
        contact_stage: "lead",
        source: "public_booking",
        ...(smsConsent ? { sms_consent: true, sms_consent_language: SMS_CONSENT_LANGUAGE } : {}),
      });
      consentRecorded = smsConsent;
    } catch (error) {
      console.error("[PublicBooking] contact sync failed; appointment will still be saved:", safeError(error));
    }

    const cancelToken = createCancelToken();
    const appointment = await superdev.entities.Appointment.create({
      appointment_type: currentService.name,
      duration_minutes: currentService.durationMinutes,
      date: date.key,
      start_time: startTime,
      end_time: endTime,
      client_name: clientName,
      phone,
      email,
      pet_name: petName,
      pet_species: petSpecies,
      notes,
      status: "requested",
      cancel_token: cancelToken,
      sms_consent: consentRecorded,
      sms_consent_language: consentRecorded ? SMS_CONSENT_LANGUAGE : "",
    });

    const appointmentId = appointment && typeof appointment === "object" ? String((appointment as AnyRecord).id || "") : "";
    notifyOwner(req, appointmentId);
    const emailRecord = { client_name: clientName, phone, email, pet_name: petName, appointment_type: currentService.name, date: date.key, start_time: startTime, end_time: endTime, notes };
    await Promise.allSettled([
      sendClientEmail(req, emailRecord, currentSettings, cancelToken).catch((error) => console.error("[PublicBooking] client email failed:", safeError(error))),
      sendClientSms(req, emailRecord, normalizedPhone).catch((error) => console.error("[PublicBooking] booking SMS failed:", safeError(error))),
    ]);

    return json({ status: "success", success: true, date: date.key, start_time: startTime, end_time: endTime, service_name: currentService.name, sms_consent_sync_warning: smsConsent && !consentRecorded });
  });
}

function allowedKeys(action: unknown) {
  if (action === "lookup_customer") return new Set(["action", "phone"]);
  if (action === "availability") return new Set(["action", "service_id", "service_name", "service_duration_minutes", "date"]);
  if (action === "create") return new Set(["action", "service_id", "service_name", "service_duration_minutes", "date", "start_time", "client_name", "phone", "email", "pet_name", "pet_species", "notes", "sms_consent", "sms_consent_language"]);
  return null;
}

async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SERVICE_ROLE_KEY) {
    console.error("[PublicBooking] missing SUPERDEV_SERVICE_ROLE_KEY");
    return json({ error: "service_unavailable", message: "השירות אינו זמין כרגע." }, 503);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Request body is invalid" }, 400);
  const request = body as AnyRecord;
  const action = request.action;
  const keys = allowedKeys(action);
  if (!keys) return json({ error: "action must be lookup_customer, availability or create" }, 400);
  if (Object.keys(request).some((key) => !keys.has(key))) return json({ error: "Request contains unsupported fields" }, 400);

  if (action === "lookup_customer") {
    const rawPhone = request.phone;
    if (typeof rawPhone !== "string" || rawPhone.trim().length === 0 || rawPhone.length > LOOKUP_PHONE_MAX_LENGTH || !canonicalPhone(rawPhone)) {
      return json({ error: "invalid_lookup_phone", message: "נא להזין מספר טלפון תקין." }, 400);
    }

    try {
      superdev.auth.setToken(SERVICE_ROLE_KEY);
      return await handleCustomerLookup(rawPhone);
    } catch {
      // Never include lookup input or returned customer data in runtime logs.
      console.error("[PublicBooking] customer lookup failed");
      return json({ error: "service_unavailable", message: "לא הצלחנו לחפש את הפרטים כרגע. נסו שוב בעוד רגע." }, 500);
    }
  }

  const serviceId = text(request.service_id);
  const serviceName = boundedText(request.service_name, 200);
  const date = parseDate(request.date);
  if (!serviceId || serviceId.length > 120 || !serviceName || !date || !dateIsBookable(date)) return json({ error: "invalid_booking_selection", message: "הבחירה אינה תקינה. נא לבחור טיפול ותאריך זמינים." }, 400);

  try {
    superdev.auth.setToken(SERVICE_ROLE_KEY);
    return action === "availability"
      ? await handleAvailability(date, serviceId, serviceName, request.service_duration_minutes)
      : await handleCreate(req, request, date, serviceId, serviceName, request.service_duration_minutes);
  } catch (error) {
    if (error instanceof CalendarUnavailableError) {
      return json({ error: "calendar_unavailable", message: CALENDAR_UNAVAILABLE_MESSAGE }, 503);
    }
    console.error("[PublicBooking] request failed:", safeError(error));
    return json({ error: "service_unavailable", message: "לא הצלחנו להשלים את הבקשה כרגע. נסו שוב בעוד רגע." }, 500);
  }
}

Deno.serve(handleRequest);
