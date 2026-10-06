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

function buildMarketingAppointmentEmailHtml(appointment: AppointmentRecord, options: CustomerEmailOptions): string {
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
const DEFAULT_MIN_HOURS = 24;
const DEFAULT_BOOKING_MIN_HOURS = 4;
const MAX_BOOKING_MONTHS = 12;
const NOTIFICATION_TIMEOUT_MS = 3500;
const CALENDAR_TIMEOUT_MS = 15000;
const HOUR_MS = 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const RESCHEDULE_SUCCESS_MESSAGE = "בקשתך לשינוי מועד נשלחה וממתינה לאישור המרפאה. תקבל מייל עדכון ברגע שהבקשה תטופל.";

const superdev = createSuperdevClient({ appId: APP_ID });
const integrations = createSuperdevClient({ appId: APP_ID });
const Appointment = superdev.entities.Appointment;
const AppointmentRescheduleRequest = superdev.entities.AppointmentRescheduleRequest;
const tokenLocks = new Map<string, Promise<void>>();

type AppointmentRecord = Record<string, any>;
type SettingsRecord = Record<string, any>;
type RequestRecord = Record<string, any>;
type BackendFunction = (payload: Record<string, unknown>, options?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<unknown>;
type ManagementStatus = "available" | "cancelled" | "already-cancelled" | "disabled" | "cutoff" | "past" | "not-found";
type CalendarRemovalStatus = "removed" | "already_removed" | "not_linked" | "not_attempted" | "failed";
type NotificationStatus = "sent" | "already_sent" | "disabled" | "no_channels" | "no_recipients" | "in_progress" | "failed";

type Policy = {
  enabled: boolean;
  minimumHours: number;
  rescheduleMinimumHours: number;
  cutoffMessage: string;
};

type ParsedDate = {
  key: string;
  year: number;
  month: number;
  day: number;
  weekday: number;
};

type TimePeriod = { start: string; end: string };
type BusyInterval = { date: string; start: string; end: string };
type ResolvedService = { id: string; name: string; durationMinutes: number; windowIds: string[] };
type RescheduleSlot = { startTime: string; endTime: string };

const LEGACY_SERVICES: Array<{ id: string; name: string; durationMinutes: number }> = [
  { id: "vaccine", name: "חיסון וטיפולים שגרתיים", durationMinutes: 20 },
  { id: "general", name: "בדיקה כללית / לקוח חדש", durationMinutes: 30 },
  { id: "surgery", name: "עיקור / סירוס / פרוצדורה אחרת", durationMinutes: 90 },
  { id: "dental", name: "ניקוי שיניים בהרדמה", durationMinutes: 90 },
];

const DEFAULT_WEEKLY_AVAILABILITY: Array<{ weekday: number; enabled: boolean; periods: TimePeriod[] }> = [
  { weekday: 0, enabled: true, periods: [{ start: "16:00", end: "17:30" }] },
  { weekday: 1, enabled: true, periods: [{ start: "09:30", end: "13:30" }, { start: "16:00", end: "19:30" }] },
  { weekday: 2, enabled: true, periods: [{ start: "09:30", end: "10:20" }, { start: "13:00", end: "14:00" }, { start: "16:00", end: "17:30" }] },
  { weekday: 3, enabled: true, periods: [{ start: "16:30", end: "19:30" }] },
  { weekday: 4, enabled: true, periods: [{ start: "09:30", end: "13:30" }, { start: "16:00", end: "19:30" }] },
  { weekday: 5, enabled: true, periods: [{ start: "09:30", end: "15:00" }] },
  { weekday: 6, enabled: false, periods: [] },
];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 180);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] || character));
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 12 && value.trim().length <= 160 && /^[A-Za-z0-9._~-]+$/.test(value.trim());
}

function validEmail(value: unknown) {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function displayDate(value: unknown) {
  const match = DATE_PATTERN.exec(text(value));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text(value, "לא צוין");
}

function timeToMinutes(value: unknown) {
  const match = /^(\d{2}):(\d{2})$/.exec(text(value));
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(value: number) {
  if (!Number.isFinite(value) || value < 0 || value >= 24 * 60) return "";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function validRange(start: number, end: number) {
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && end > otherStart;
}

function normalizeName(value: unknown) {
  return text(value).replace(/\s+/g, " ").toLocaleLowerCase("he");
}

function positiveInteger(value: unknown, maximum = 720) {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(number) && number > 0 && number <= maximum ? number : null;
}

function activeService(value: AppointmentRecord) {
  return value.is_active !== false && value.is_active !== 0 && value.is_active !== "false";
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

function israelParts(instant: Date) {
  const parts: Record<string, string> = {};
  for (const part of israelFormatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function israelOffsetMs(instant: Date) {
  const second = Math.floor(instant.getTime() / 1000) * 1000;
  const parts = israelParts(instant);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - second;
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

  const wallClockMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const candidates: number[] = [];
  for (const dayOffset of [-3, -2, -1, 0, 1, 2, 3]) {
    const probe = new Date(wallClockMs + dayOffset * 24 * HOUR_MS);
    const candidateMs = wallClockMs - israelOffsetMs(probe);
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

function clinicHours(value: unknown): Record<number, TimePeriod[]> {
  const fallback = Object.fromEntries(DEFAULT_WEEKLY_AVAILABILITY.map((day) => [day.weekday, day.enabled ? day.periods.map((period) => ({ ...period })) : []]));
  if (!Array.isArray(value) || value.length !== 7) return fallback;

  const byWeekday = new Map<number, TimePeriod[]>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fallback;
    const record = item as AppointmentRecord;
    const weekday = record.weekday;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || typeof record.enabled !== "boolean" || byWeekday.has(weekday)) return fallback;
    const periods = record.enabled && Array.isArray(record.periods)
      ? record.periods.filter((period: unknown) => {
        if (!period || typeof period !== "object" || Array.isArray(period)) return false;
        const candidate = period as AppointmentRecord;
        const start = text(candidate.start);
        const end = text(candidate.end);
        return TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && timeToMinutes(end) > timeToMinutes(start);
      }).map((period: AppointmentRecord) => ({ start: text(period.start), end: text(period.end) }))
      : [];
    if (record.enabled && periods.length === 0) return fallback;
    byWeekday.set(weekday, periods);
  }
  if (byWeekday.size !== 7) return fallback;
  return Object.fromEntries(Array.from({ length: 7 }, (_, weekday) => [weekday, byWeekday.get(weekday) || []]));
}

function readPolicy(settings: SettingsRecord | null): Policy {
  const rawHours = Number(settings?.self_service_cancellation_min_hours);
  const rawRescheduleHours = Number(settings?.self_service_reschedule_min_hours);
  const minimumHours = Number.isFinite(rawHours) && rawHours >= 0 && rawHours <= 720 ? Math.floor(rawHours) : DEFAULT_MIN_HOURS;
  const rescheduleMinimumHours = Number.isFinite(rawRescheduleHours) && rawRescheduleHours >= 0 && rawRescheduleHours <= 720
    ? Math.floor(rawRescheduleHours)
    : minimumHours;
  const cutoffMessage = text(settings?.self_service_cancellation_cutoff_message, `לא ניתן עוד לבטל את התור באופן עצמאי, כי מועד התור קרוב. לשינוי דחוף אפשר ליצור קשר עם המרפאה בטלפון ${CLINIC_PHONE}.`).slice(0, 1000);
  return {
    enabled: settings?.self_service_appointment_management_enabled === true,
    minimumHours,
    rescheduleMinimumHours,
    cutoffMessage,
  };
}

async function loadClinicSettings(): Promise<SettingsRecord> {
  const records = await superdev.entities.ClinicSettings.list("-created_at", 1);
  return Array.isArray(records) && records[0] && typeof records[0] === "object" ? records[0] as SettingsRecord : {};
}

async function loadPolicy(): Promise<Policy> {
  return readPolicy(await loadClinicSettings());
}

async function findAppointment(token: string): Promise<AppointmentRecord | null> {
  const results = await Appointment.query().where("cancel_token", token).limit(1).exec();
  if (!Array.isArray(results) || !results[0] || results[0].cancel_token !== token) return null;
  return results[0] as AppointmentRecord;
}

function summary(appointment: AppointmentRecord) {
  return {
    clientName: text(appointment.client_name, "לקוח/ה"),
    petName: text(appointment.pet_name, "חיית המחמד"),
    petSpecies: text(appointment.pet_species),
    service: text(appointment.appointment_type, "תור במרפאה"),
    date: text(appointment.date),
    startTime: text(appointment.start_time),
    endTime: text(appointment.end_time),
    status: text(appointment.status, "requested"),
  };
}

function evaluate(appointment: AppointmentRecord, policy: Policy, now = new Date()): { status: ManagementStatus; message?: string } {
  if (text(appointment.status).toLowerCase() === "cancelled") {
    return { status: "already-cancelled", message: "התור הזה כבר בוטל." };
  }

  const start = localIsraelToInstant(appointment.date, text(appointment.start_time).slice(0, 5));
  if (!start) return { status: "past", message: "לא ניתן לנהל את התור משום שחסרים בו פרטי תאריך או שעה תקינים." };
  if (start.getTime() <= now.getTime()) return { status: "past", message: "מועד התור כבר עבר ולכן אי אפשר לבטל אותו דרך הדף." };

  if (policy.minimumHours > 0 && now.getTime() >= start.getTime() - policy.minimumHours * HOUR_MS) {
    return { status: "cutoff", message: policy.cutoffMessage };
  }
  return { status: "available" };
}

function appointmentStart(appointment: AppointmentRecord) {
  return localIsraelToInstant(appointment.date, text(appointment.start_time).slice(0, 5));
}

async function resolveAppointmentService(appointment: AppointmentRecord): Promise<ResolvedService | null> {
  const identifier = text(appointment.service_identifier) || text(appointment.appointment_type_id);
  const appointmentType = text(appointment.appointment_type);
  const names = new Set([normalizeName(appointmentType), normalizeName(identifier)].filter(Boolean));
  let catalog: AppointmentRecord[] = [];

  try {
    const records = await superdev.entities.ClinicService.list("sort_order", 500);
    catalog = Array.isArray(records) ? records.filter((item) => item && typeof item === "object") as AppointmentRecord[] : [];
  } catch (error) {
    console.warn("[ManageAppointment] service catalog unavailable; checking legacy services:", safeError(error));
  }

  const catalogMatches = catalog.filter((item) => {
    const id = text(item.id);
    const name = normalizeName(item.name);
    return (identifier && id === identifier) || (name && names.has(name));
  });
  const uniqueMatches = [...new Map(catalogMatches.map((item) => [text(item.id) || normalizeName(item.name), item])).values()];
  if (uniqueMatches.length > 1) throw new Error("נמצאו כמה שירותים מתאימים לתור המקורי.");
  if (uniqueMatches.length === 1) {
    const service = uniqueMatches[0];
    if (!activeService(service)) return null;
    const duration = positiveInteger(service.duration_minutes);
    const name = text(service.name);
    const id = text(service.id);
    if (!duration || !name || !id) return null;
    return { id, name, durationMinutes: duration, windowIds: [...new Set([id, identifier].filter(Boolean))] };
  }

  const legacyMatches = LEGACY_SERVICES.filter((service) => service.id === identifier || names.has(normalizeName(service.name)) || normalizeName(appointmentType) === normalizeName(service.id));
  if (legacyMatches.length > 1) throw new Error("נמצאו כמה שירותים מתאימים לתור המקורי.");
  if (legacyMatches.length === 1) {
    const service = legacyMatches[0];
    return { ...service, windowIds: [...new Set([service.id, identifier].filter(Boolean))] };
  }
  return null;
}

function serviceForResponse(service: ResolvedService | null) {
  return service ? { identifier: service.id, name: service.name, durationMinutes: service.durationMinutes } : null;
}

async function loadActiveRequest(appointmentId: string): Promise<RequestRecord | null> {
  const records = await AppointmentRescheduleRequest.filter({ appointment_id: appointmentId }, "-created_at", 50);
  if (!Array.isArray(records)) return null;
  return records.find((record) => {
    const status = text(record?.status).toLowerCase();
    return status === "pending" || status === "processing";
  }) as RequestRecord | null;
}

function requestForResponse(request: RequestRecord | null) {
  if (!request) return null;
  const status = text(request.status).toLowerCase();
  if (status !== "pending" && status !== "processing") return null;
  return {
    status,
    proposedDate: text(request.proposed_appointment_date),
    proposedStartTime: text(request.proposed_start_time).slice(0, 5),
    proposedEndTime: text(request.proposed_end_time).slice(0, 5),
  };
}

async function rescheduleSummary(appointment: AppointmentRecord, policy: Policy) {
  const service = await resolveAppointmentService(appointment);
  let activeRequest: RequestRecord | null = null;
  let requestLookupFailed = false;
  try {
    activeRequest = await loadActiveRequest(text(appointment.id));
  } catch (error) {
    console.error("[ManageAppointment] reschedule request lookup failed:", safeError(error));
    requestLookupFailed = true;
  }

  const start = appointmentStart(appointment);
  const status = text(appointment.status).toLowerCase();
  const cutoffPassed = Boolean(start && policy.rescheduleMinimumHours > 0 && Date.now() >= start.getTime() - policy.rescheduleMinimumHours * HOUR_MS);
  let eligible = policy.enabled && !requestLookupFailed && Boolean(service) && status === "confirmed" && Boolean(start) && start!.getTime() > Date.now() && !cutoffPassed;
  let reason = "";
  let message = "";

  if (!policy.enabled) {
    reason = "disabled";
    message = "ניהול תורים עצמאי אינו פעיל כרגע במרפאה.";
  } else if (requestLookupFailed) {
    eligible = false;
    reason = "unavailable";
    message = "לא הצלחנו לבדוק אם קיימת בקשת שינוי מועד. נסו שוב בעוד רגע.";
  } else if (status === "cancelled") {
    eligible = false;
    reason = "cancelled";
    message = "אי אפשר לבקש שינוי מועד לתור שבוטל.";
  } else if (status === "requested") {
    eligible = false;
    reason = "requires-approval";
    message = "בקשת התור עדיין ממתינה לאישור המרפאה. אפשר לבקש שינוי מועד לאחר שהתור יאושר.";
  } else if (status !== "confirmed") {
    eligible = false;
    reason = "not-confirmed";
    message = "אפשר לבקש שינוי מועד רק לתור מאושר.";
  } else if (!start || start.getTime() <= Date.now()) {
    eligible = false;
    reason = "past";
    message = "מועד התור כבר עבר ולכן אי אפשר לבקש שינוי מועד.";
  } else if (cutoffPassed) {
    eligible = false;
    reason = "cutoff";
    message = policy.cutoffMessage;
  } else if (!service) {
    eligible = false;
    reason = "service-unavailable";
    message = "לא הצלחנו לזהות את סוג הטיפול של התור. אפשר ליצור קשר עם המרפאה לעזרה.";
  } else if (activeRequest) {
    eligible = false;
    reason = "pending";
    message = "בקשת שינוי מועד כבר ממתינה לטיפול המרפאה.";
  }

  return {
    enabled: policy.enabled,
    eligible,
    cutoffPassed,
    cutoffMessage: policy.cutoffMessage,
    reason,
    message,
    service: serviceForResponse(service),
    pendingRequest: requestForResponse(activeRequest),
  };
}

function cancellationEmailHtml(appointment: AppointmentRecord): string {
  const client = text(appointment.client_name, "לקוח/ה");
  const pet = text(appointment.pet_name, "חיית המחמד");
  const service = text(appointment.appointment_type, "תור במרפאה");
  const date = displayDate(appointment.date);
  const time = `${text(appointment.start_time, "-")}${appointment.end_time ? ` - ${text(appointment.end_time)}` : ""}`;
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>אישור ביטול תור</title></head><body style="margin:0;background:#f8fafc;font-family:Arial,'Segoe UI',sans-serif;direction:rtl;text-align:right;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:22px 10px;background:#f8fafc;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:22px;overflow:hidden;"><tr><td style="padding:26px 24px;background:#1a1a3e;color:#fff;"><div style="font-size:24px;font-weight:900;margin-bottom:8px;">ביטול התור בוצע</div><div style="font-size:14px;line-height:1.7;color:#f2d162;">ד״ר סיון שני · מרפאה וטרינרית</div></td></tr><tr><td style="padding:24px;"><div style="display:inline-block;padding:7px 12px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:12px;font-weight:900;margin-bottom:16px;">תור מבוטל</div><p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.8;">שלום ${escapeHtml(client)},<br>לבקשתך ביטלנו את התור הבא:</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;"><tr><td style="padding:10px 0;color:#64748b;font-size:12px;font-weight:700;width:36%;">חיית המחמד</td><td style="padding:10px 0;color:#0f172a;font-size:14px;font-weight:800;">${escapeHtml(pet)}</td></tr><tr><td style="padding:10px 0;color:#64748b;font-size:12px;font-weight:700;">סוג הטיפול</td><td style="padding:10px 0;color:#0f172a;font-size:14px;font-weight:800;">${escapeHtml(service)}</td></tr><tr><td style="padding:10px 0;color:#64748b;font-size:12px;font-weight:700;">מועד התור</td><td style="padding:10px 0;color:#0f172a;font-size:14px;font-weight:800;">${escapeHtml(date)} בשעה ${escapeHtml(time)}</td></tr></table><p style="margin:20px 0 0;color:#475569;font-size:13px;line-height:1.8;">אם תרצו לקבוע תור חדש, אפשר לעשות זאת באתר המרפאה או ליצור איתנו קשר בטלפון ${CLINIC_PHONE}.</p></td></tr><tr><td style="padding:15px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:11px;line-height:1.7;">${CLINIC_PHONE} · sivanshanivet.com</td></tr></table></td></tr></table></body></html>`;
}

async function sendCancellationEmail(appointment: AppointmentRecord, settings: SettingsRecord): Promise<"sent" | "skipped" | "failed"> {
  const email = validEmail(appointment.email);
  if (!email) return "skipped";
  if (!SERVICE_ROLE_KEY) return "failed";

  const templateKey = resolveCustomerEmailTemplateSelection(settings.customer_email_template_selections, "client_cancellation");
  const bodyHtml = templateKey === MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY
    ? buildMarketingAppointmentEmailHtml(appointment, {
      title: "ביטול התור בוצע",
      subtitle: "לבקשתך ביטלנו את התור הבא.",
      statusLabel: "תור מבוטל",
      statusColor: "#B83B4B",
      body: `שלום ${text(appointment.client_name, "לקוח/ה")},\n\nלבקשתך ביטלנו את התור של ${text(appointment.pet_name, "חיית המחמד")}. אם תרצו לקבוע תור חדש, אפשר ליצור קשר עם המרפאה בטלפון ${CLINIC_PHONE}.`,
      clinicName: "ד״ר סיון שני",
      clinicTagline: "מרפאה וטרינרית · טיפול אישי ומקצועי",
      footerText: `${CLINIC_PHONE} · sivanshanivet.com`,
    })
    : cancellationEmailHtml(appointment);

  try {
    integrations.auth.setToken(SERVICE_ROLE_KEY);
    const result = await integrations.integrations.core.sendEmail({
      to: email,
      from_name: "ד״ר סיון שני",
      subject: "אישור ביטול תור · ד״ר סיון שני",
      body_html: bodyHtml,
    });
    if (result && typeof result === "object" && (("error" in result && result.error) || ("success" in result && result.success === false))) throw new Error("Email service reported an error");
    return "sent";
  } catch (error) {
    console.error("[ManageAppointment] cancellation email failed:", safeError(error));
    return "failed";
  }
}

function requestHeaders(req: Request) {
  const headers: Record<string, string> = {};
  const authorization = req.headers.get("Authorization");
  const origin = req.headers.get("Origin");
  if (authorization) headers.Authorization = authorization;
  if (origin) headers.Origin = origin;
  return headers;
}

function unwrap(value: unknown): AppointmentRecord | null {
  if (typeof value === "string") {
    try { return unwrap(JSON.parse(value)); } catch { return null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as AppointmentRecord;
  if (Object.prototype.hasOwnProperty.call(record, "data")) return unwrap(record.data);
  if (Object.prototype.hasOwnProperty.call(record, "body")) return unwrap(record.body);
  return record;
}

function calendarEnvelopeFailed(record: AppointmentRecord) {
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

async function removeLinkedGoogleEvent(req: Request, appointmentId: string): Promise<CalendarRemovalStatus> {
  if (!SERVICE_ROLE_KEY) return "failed";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALENDAR_TIMEOUT_MS);
  try {
    const headers = requestHeaders(req);
    headers["X-Superdev-Internal-Key"] = SERVICE_ROLE_KEY;
    const remove = superdev.functions["create-calendar-event"] as unknown as BackendFunction;
    const response = await remove(
      { mode: "cancel", appointmentId },
      { headers, signal: controller.signal },
    );
    const payload = unwrap(response);
    if (!payload || calendarEnvelopeFailed(payload)) throw new Error("Google Calendar did not confirm removal.");
    const outcome = text(payload.outcome).toLowerCase();
    if (outcome === "removed" || outcome === "already_removed" || outcome === "not_linked") return outcome;
    throw new Error("Google Calendar returned an unknown removal result.");
  } catch (error) {
    console.error("[ManageAppointment] customer cancellation was saved, but Google Calendar removal failed:", safeError(error));
    return "failed";
  } finally {
    clearTimeout(timeout);
  }
}

function parseBusyPayload(value: unknown, requestedDate: string): BusyInterval[] {
  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
      } catch {
        throw new Error("Google calendar response is malformed.");
      }
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) throw new Error("Google calendar response is malformed.");
    const record = current as AppointmentRecord;
    if (calendarEnvelopeFailed(record)) throw new Error("Google calendar lookup failed.");
    if (Object.prototype.hasOwnProperty.call(record, "data")) {
      current = record.data;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(record, "body")) {
      current = record.body;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(record, "busy") || !Array.isArray(record.busy)) throw new Error("Google calendar response is malformed.");

    const intervals: BusyInterval[] = [];
    for (const item of record.busy) {
      const interval = item && typeof item === "object" && !Array.isArray(item) ? item as AppointmentRecord : null;
      const date = text(interval?.date);
      const start = text(interval?.start);
      const end = text(interval?.end);
      const startMinutes = timeToMinutes(start);
      const endMinutes = timeToMinutes(end);
      if (!interval || date !== requestedDate || !parseDate(date) || !TIME_PATTERN.test(start) || !TIME_PATTERN.test(end) || !validRange(startMinutes, endMinutes)) {
        throw new Error("Google calendar response contains an invalid busy interval.");
      }
      intervals.push({ date, start, end });
    }
    return intervals;
  }
  throw new Error("Google calendar response is too deeply nested.");
}

async function notifyOwner(req: Request, appointmentId: string): Promise<"sent" | "failed"> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);
  try {
    const notify = superdev.functions["send-business-notification"] as unknown as BackendFunction;
    const response = await notify({ event: "appointment_changed", record_id: appointmentId }, { headers: requestHeaders(req), signal: controller.signal });
    const payload = unwrap(response);
    if (payload?.error || payload?.ok === false) return "failed";
    return "sent";
  } catch (error) {
    console.error("[ManageAppointment] owner notification failed:", safeError(error));
    return "failed";
  } finally {
    clearTimeout(timeout);
  }
}

async function notifyRescheduleRequest(req: Request, requestId: string): Promise<NotificationStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);
  try {
    const notify = superdev.functions["send-business-notification"] as unknown as BackendFunction;
    const headers = requestHeaders(req);
    if (SERVICE_ROLE_KEY) headers["X-Superdev-Internal-Key"] = SERVICE_ROLE_KEY;
    const response = await notify({ event: "appointment_reschedule_requested", record_id: requestId }, { headers, signal: controller.signal });
    const payload = unwrap(response);
    if (!payload) return "failed";
    const status = text(payload.status).toLowerCase();
    if (payload.error || payload.ok === false) return "failed";
    if (status === "sent") return "sent";
    if (status === "already_sent") return "already_sent";
    if (status === "disabled") return "disabled";
    if (status === "no_channels") return "no_channels";
    if (status === "no_recipients") return "no_recipients";
    if (status === "in_progress") return "in_progress";
    return "failed";
  } catch (error) {
    console.error("[ManageAppointment] reschedule notification failed:", safeError(error));
    return "failed";
  } finally {
    clearTimeout(timeout);
  }
}

async function markRescheduleNotificationFailure(requestId: string, detail: string) {
  try {
    const current = await AppointmentRescheduleRequest.get(requestId) as RequestRecord;
    if (!current || text(current.status).toLowerCase() !== "pending" || text(current.manager_notification_sent_at)) return;
    await AppointmentRescheduleRequest.update(requestId, {
      manager_notification_error: detail.slice(0, 500),
      last_error: detail.slice(0, 500),
      last_error_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ManageAppointment] could not record reschedule notification failure:", safeError(error));
  }
}

async function loadAppointments(date: string): Promise<AppointmentRecord[]> {
  const records = await Appointment.query().where("date", date).limit(1000).exec();
  return Array.isArray(records) ? records.filter((item) => item && typeof item === "object") as AppointmentRecord[] : [];
}

async function loadWindows(): Promise<AppointmentRecord[]> {
  const records = await superdev.entities.AppointmentWindow.list("-created_at", 1000);
  return Array.isArray(records) ? records.filter((item) => item && typeof item === "object") as AppointmentRecord[] : [];
}

async function loadBusy(date: string): Promise<BusyInterval[]> {
  const getBusy = superdev.functions["get-calendar-busy"] as unknown as BackendFunction;
  return parseBusyPayload(await getBusy({ date }), date);
}

async function loadSchedulingData(date: string) {
  const [windows, appointments, busy] = await Promise.all([loadWindows(), loadAppointments(date), loadBusy(date)]);
  return { windows, appointments, busy };
}

function windowsForService(windows: AppointmentRecord[], date: ParsedDate, service: ResolvedService) {
  const allowedIds = new Set(service.windowIds);
  return windows.filter((window) => {
    const weekday = Number(window.weekday);
    const start = text(window.start_time);
    const end = text(window.end_time);
    return allowedIds.has(text(window.appointment_type_id)) && weekday === date.weekday && TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && validRange(timeToMinutes(start), timeToMinutes(end));
  });
}

function bookingMinimumHours(settings: SettingsRecord) {
  const value = Number(settings.min_hours_before_booking);
  return Number.isFinite(value) && value >= 0 && value <= 720 ? Math.floor(value) : DEFAULT_BOOKING_MIN_HOURS;
}

function availableSlots({ date, service, settings, windows, appointments, busy, excludeAppointmentId, now = new Date() }: {
  date: ParsedDate;
  service: ResolvedService;
  settings: SettingsRecord;
  windows: AppointmentRecord[];
  appointments: AppointmentRecord[];
  busy: BusyInterval[];
  excludeAppointmentId: string;
  now?: Date;
}): RescheduleSlot[] {
  const periods = clinicHours(settings.weekly_availability)[date.weekday] || [];
  const typeWindows = windowsForService(windows, date, service);
  const appointmentIntervals = appointments
    .filter((appointment) => text(appointment.id) !== excludeAppointmentId && !["cancelled", "canceled"].includes(text(appointment.status).toLowerCase()))
    .map((appointment) => ({ start: timeToMinutes(appointment.start_time), end: timeToMinutes(appointment.end_time) }))
    .filter((interval) => validRange(interval.start, interval.end));
  const busyIntervals = busy
    .filter((interval) => interval.date === date.key)
    .map((interval) => ({ start: timeToMinutes(interval.start), end: timeToMinutes(interval.end) }))
    .filter((interval) => validRange(interval.start, interval.end));
  const minimumInstant = new Date(now.getTime() + bookingMinimumHours(settings) * HOUR_MS);
  const slots: RescheduleSlot[] = [];

  for (const period of periods) {
    const periodStart = timeToMinutes(period.start);
    const periodEnd = timeToMinutes(period.end);
    if (!validRange(periodStart, periodEnd)) continue;
    for (let start = periodStart; start + service.durationMinutes <= periodEnd; start += service.durationMinutes) {
      const end = start + service.durationMinutes;
      const startTime = minutesToTime(start);
      const endTime = minutesToTime(end);
      const instant = localIsraelToInstant(date.key, startTime);
      if (!instant || instant.getTime() < minimumInstant.getTime()) continue;
      if (typeWindows.length > 0 && !typeWindows.some((window) => start >= timeToMinutes(window.start_time) && end <= timeToMinutes(window.end_time))) continue;
      if (appointmentIntervals.some((interval) => overlaps(start, end, interval.start, interval.end))) continue;
      if (busyIntervals.some((interval) => overlaps(start, end, interval.start, interval.end))) continue;
      slots.push({ startTime, endTime });
    }
  }
  return slots;
}

function slotError(message: string, kind: "invalid" | "conflict" | "too-soon" | "unavailable") {
  return { kind, message };
}

async function validateRequestedSlot({ date, startTime, service, settings, appointment }: {
  date: ParsedDate;
  startTime: string;
  service: ResolvedService;
  settings: SettingsRecord;
  appointment: AppointmentRecord;
}): Promise<{ ok: true; endTime: string } | { ok: false; kind: "invalid" | "conflict" | "too-soon" | "unavailable"; message: string }> {
  if (!dateIsBookable(date)) return slotError("המועד המוצע אינו תאריך שניתן לקבוע בו תור.", "invalid");
  if (!TIME_PATTERN.test(startTime)) return slotError("השעה שנבחרה אינה תקינה.", "invalid");

  const start = timeToMinutes(startTime);
  const end = start + service.durationMinutes;
  const endTime = minutesToTime(end);
  if (!validRange(start, end) || !endTime) return slotError("המועד המוצע אינו מתאים לאורך הטיפול.", "invalid");

  const proposedInstant = localIsraelToInstant(date.key, startTime);
  if (!proposedInstant) return slotError("לא ניתן לפרש את המועד המוצע לפי שעון ישראל.", "invalid");
  const minimumInstant = new Date(Date.now() + bookingMinimumHours(settings) * HOUR_MS);
  if (proposedInstant.getTime() < minimumInstant.getTime()) return slotError(`המועד המוצע קרוב מדי. יש להשאיר לפחות ${bookingMinimumHours(settings)} שעות מראש.`, "too-soon");

  let scheduling: { windows: AppointmentRecord[]; appointments: AppointmentRecord[]; busy: BusyInterval[] };
  try {
    scheduling = await loadSchedulingData(date.key);
  } catch (error) {
    return slotError(`לא הצלחנו לבדוק את כל מקורות הזמינות. ${safeError(error)}`, "unavailable");
  }

  const periods = clinicHours(settings.weekly_availability)[date.weekday] || [];
  const fitsClinicSlot = periods.some((period) => {
    const periodStart = timeToMinutes(period.start);
    const periodEnd = timeToMinutes(period.end);
    return validRange(periodStart, periodEnd) && start >= periodStart && end <= periodEnd && (start - periodStart) % service.durationMinutes === 0;
  });
  if (!fitsClinicSlot) return slotError("המועד המוצע אינו נמצא בשעות הפעילות או בצעדי הזמן של המרפאה.", "conflict");

  const typeWindows = windowsForService(scheduling.windows, date, service);
  if (typeWindows.length > 0 && !typeWindows.some((window) => {
    const windowStart = timeToMinutes(window.start_time);
    const windowEnd = timeToMinutes(window.end_time);
    return validRange(windowStart, windowEnd) && start >= windowStart && end <= windowEnd;
  })) return slotError("המועד המוצע אינו נמצא בחלון הזמינות של השירות.", "conflict");

  const appointmentId = text(appointment.id);
  const appointmentOverlap = scheduling.appointments.some((candidate) => {
    if (text(candidate.id) === appointmentId || text(candidate.date) !== date.key) return false;
    if (["cancelled", "canceled"].includes(text(candidate.status).toLowerCase())) return false;
    const candidateStart = timeToMinutes(candidate.start_time);
    const candidateEnd = timeToMinutes(candidate.end_time);
    return validRange(candidateStart, candidateEnd) && overlaps(start, end, candidateStart, candidateEnd);
  });
  if (appointmentOverlap) return slotError("המועד המוצע כבר תפוס בתור אחר במרפאה.", "conflict");

  const calendarOverlap = scheduling.busy.some((interval) => {
    if (interval.date !== date.key) return false;
    const busyStart = timeToMinutes(interval.start);
    const busyEnd = timeToMinutes(interval.end);
    return validRange(busyStart, busyEnd) && overlaps(start, end, busyStart, busyEnd);
  });
  if (calendarOverlap) return slotError("המועד המוצע חופף לאירוע ביומן Google.", "conflict");

  return { ok: true, endTime };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function idempotencyKey(appointmentId: string, token: string, date: string, startTime: string) {
  return sha256(`${appointmentId}|${token}|${date}|${startTime}`);
}

async function requestByIdempotencyKey(key: string) {
  const records = await AppointmentRescheduleRequest.filter({ idempotency_key: key }, "-created_at", 5);
  if (!Array.isArray(records)) return null;
  return records.find((record) => ["pending", "processing"].includes(text(record?.status).toLowerCase())) as RequestRecord | null;
}

function requestResponse(appointment: AppointmentRecord, request: RequestRecord, reschedule: Awaited<ReturnType<typeof rescheduleSummary>>, notificationStatus?: NotificationStatus) {
  const pending = requestForResponse(request);
  return {
    status: "reschedule-requested",
    success: true,
    message: RESCHEDULE_SUCCESS_MESSAGE,
    appointment: summary(appointment),
    reschedule: { ...reschedule, eligible: false, reason: "pending", message: "בקשת שינוי מועד כבר ממתינה לטיפול המרפאה.", pendingRequest: pending },
    ...(notificationStatus ? { notification_status: notificationStatus } : {}),
  };
}

async function handleGet(token: string) {
  const policy = await loadPolicy();
  if (!policy.enabled) return json({ status: "disabled", message: "ניהול תורים עצמאי אינו פעיל כרגע במרפאה." });

  const appointment = await findAppointment(token);
  if (!appointment) return json({ status: "not-found", message: "לא מצאנו תור שמתאים לקישור הזה." }, 404);

  const evaluation = evaluate(appointment, policy);
  let reschedule;
  try {
    reschedule = await rescheduleSummary(appointment, policy);
  } catch (error) {
    console.error("[ManageAppointment] reschedule summary failed:", safeError(error));
    reschedule = {
      enabled: true,
      eligible: false,
      cutoffPassed: false,
      cutoffMessage: policy.cutoffMessage,
      reason: "unavailable",
      message: "לא הצלחנו לבדוק את אפשרות שינוי המועד כרגע. נסו שוב בעוד רגע.",
      service: null,
      pendingRequest: null,
    };
  }

  return json({
    status: evaluation.status,
    message: evaluation.message,
    appointment: summary(appointment),
    policy: { minimumHours: policy.minimumHours, cutoffMessage: policy.cutoffMessage },
    reschedule,
  });
}

async function handleAvailability(token: string, dateValue: unknown, serviceIdentifier: unknown) {
  const policy = await loadPolicy();
  if (!policy.enabled) return json({ status: "disabled", message: "ניהול תורים עצמאי אינו פעיל כרגע במרפאה." }, 403);

  const appointment = await findAppointment(token);
  if (!appointment) return json({ status: "not-found", message: "לא מצאנו תור שמתאים לקישור הזה." }, 404);
  const reschedule = await rescheduleSummary(appointment, policy);
  if (!reschedule.eligible || !reschedule.service) return json({ status: reschedule.reason || "unavailable", message: reschedule.message || "אי אפשר לבקש שינוי מועד לתור הזה.", appointment: summary(appointment), reschedule }, 409);

  const requestedService = text(serviceIdentifier);
  if (!requestedService || requestedService !== reschedule.service.identifier) return json({ status: "invalid-service", message: "סוג הטיפול אינו תואם לתור המקורי. רעננו את הדף ונסו שוב." }, 400);

  const date = parseDate(dateValue);
  if (!date || !dateIsBookable(date)) return json({ status: "invalid-date", message: "בחרו תאריך עתידי שניתן לקבוע בו תור." }, 400);

  const settings = await loadClinicSettings();
  const service = await resolveAppointmentService(appointment);
  if (!service || service.id !== requestedService) return json({ status: "service-unavailable", message: "לא הצלחנו לאמת את סוג הטיפול של התור. רעננו את הדף ונסו שוב." }, 409);
  let scheduling;
  try {
    scheduling = await loadSchedulingData(date.key);
  } catch (error) {
    console.error("[ManageAppointment] reschedule availability lookup failed:", safeError(error));
    return json({ status: "service-unavailable", message: "לא הצלחנו לבדוק את הזמינות כרגע. נסו שוב בעוד רגע." }, 503);
  }

  const slots = availableSlots({ date, service, settings, ...scheduling, excludeAppointmentId: text(appointment.id) });
  return json({ status: "ok", date: date.key, available_slots: slots });
}

async function handleRequestReschedule(req: Request, token: string, proposedDateValue: unknown, proposedStartValue: unknown) {
  return withTokenLock(token, async () => {
    const policy = await loadPolicy();
    if (!policy.enabled) return json({ status: "disabled", message: "ניהול תורים עצמאי אינו פעיל כרגע במרפאה." }, 403);

    const appointment = await findAppointment(token);
    if (!appointment) return json({ status: "not-found", message: "לא מצאנו תור שמתאים לקישור הזה." }, 404);

    const reschedule = await rescheduleSummary(appointment, policy);
    if (!reschedule.eligible || !reschedule.service) {
      return json({ status: reschedule.reason || "unavailable", message: reschedule.message || "אי אפשר לבקש שינוי מועד לתור הזה.", appointment: summary(appointment), reschedule }, 409);
    }

    const proposedDate = parseDate(proposedDateValue);
    const proposedStartTime = text(proposedStartValue);
    if (!proposedDate || !dateIsBookable(proposedDate) || !TIME_PATTERN.test(proposedStartTime)) {
      return json({ status: "invalid-selection", message: "בחרו תאריך ושעה תקינים מתוך האפשרויות הזמינות.", appointment: summary(appointment), reschedule }, 400);
    }

    const service = await resolveAppointmentService(appointment);
    if (!service || service.id !== reschedule.service.identifier) {
      return json({ status: "service-unavailable", message: "לא הצלחנו לאמת את סוג הטיפול של התור. רעננו את הדף ונסו שוב.", appointment: summary(appointment), reschedule }, 409);
    }
    const currentDate = text(appointment.date);
    const currentStartTime = text(appointment.start_time).slice(0, 5);
    if (proposedDate.key === currentDate && proposedStartTime === currentStartTime) {
      return json({ status: "same-slot", message: "בחרו מועד שונה מהמועד הנוכחי של התור.", appointment: summary(appointment), reschedule }, 409);
    }

    const key = await idempotencyKey(text(appointment.id), token, proposedDate.key, proposedStartTime);
    const sameRequest = await requestByIdempotencyKey(key);
    if (sameRequest) {
      const currentSummary = await rescheduleSummary(appointment, policy);
      return json(requestResponse(appointment, sameRequest, currentSummary), 409);
    }
    const activeRequest = await loadActiveRequest(text(appointment.id));
    if (activeRequest) {
      const currentSummary = await rescheduleSummary(appointment, policy);
      return json({ status: "pending", message: "בקשת שינוי מועד כבר ממתינה לטיפול המרפאה.", appointment: summary(appointment), reschedule: currentSummary }, 409);
    }

    const settings = await loadClinicSettings();
    const validation = await validateRequestedSlot({ date: proposedDate, startTime: proposedStartTime, service, settings, appointment });
    if (!validation.ok) {
      const status = validation.kind === "unavailable" ? 503 : 409;
      return json({ status: validation.kind, message: validation.message, appointment: summary(appointment), reschedule }, status);
    }

    const requestRecord = {
      appointment_id: text(appointment.id),
      old_appointment_date: currentDate,
      old_start_time: currentStartTime,
      old_end_time: text(appointment.end_time).slice(0, 5),
      proposed_appointment_date: proposedDate.key,
      proposed_start_time: proposedStartTime,
      proposed_end_time: validation.endTime,
      service_identifier: service.id,
      service_duration_minutes: service.durationMinutes,
      status: "pending",
      idempotency_key: key,
      inbox_handled_at: "",
      processing_attempts: 0,
      manager_notification_sent_at: "",
      manager_notification_error: "",
      customer_notification_error: "",
      last_error: "",
      last_error_at: "",
    };

    let created: RequestRecord;
    try {
      created = await AppointmentRescheduleRequest.create(requestRecord) as RequestRecord;
    } catch (error) {
      console.error("[ManageAppointment] reschedule request persistence failed:", safeError(error));
      return json({ status: "service-unavailable", message: "לא הצלחנו לשמור את בקשת שינוי המועד. נסו שוב בעוד רגע." }, 500);
    }

    const requestId = text(created?.id);
    if (!requestId) {
      console.error("[ManageAppointment] reschedule request was created without an id");
      return json({ status: "service-unavailable", message: "לא הצלחנו לאמת את שמירת בקשת שינוי המועד. נסו שוב בעוד רגע." }, 500);
    }

    let persisted: RequestRecord;
    try {
      persisted = await AppointmentRescheduleRequest.get(requestId) as RequestRecord;
      if (!persisted || text(persisted.status).toLowerCase() !== "pending" || text(persisted.idempotency_key) !== key) throw new Error("Saved reschedule request did not pass the persistence check");
    } catch (error) {
      console.error("[ManageAppointment] reschedule request persistence check failed:", safeError(error));
      return json({ status: "service-unavailable", message: "בקשת שינוי המועד נשמרה, אך לא הצלחנו לאמת אותה כרגע. אפשר לרענן את הדף בעוד רגע." }, 500);
    }

    const notificationStatus = await notifyRescheduleRequest(req, requestId);
    if (notificationStatus === "failed" || notificationStatus === "no_recipients") {
      await markRescheduleNotificationFailure(requestId, "בקשת שינוי המועד נשמרה, אך ההתראה למרפאה לא נשלחה. נדרשת בדיקה בהגדרות ההתראות.");
    }
    const currentSummary = await rescheduleSummary(appointment, policy);
    return json(requestResponse(appointment, persisted, currentSummary, notificationStatus));
  });
}

async function handleCancel(req: Request, token: string) {
  return withTokenLock(token, async () => {
    const settings = await loadClinicSettings();
    const policy = readPolicy(settings);
    if (!policy.enabled) return json({ status: "disabled", message: "ניהול תורים עצמאי אינו פעיל כרגע במרפאה." }, 403);

    const appointment = await findAppointment(token);
    if (!appointment) return json({ status: "not-found", message: "לא מצאנו תור שמתאים לקישור הזה." }, 404);

    const evaluation = evaluate(appointment, policy);
    if (evaluation.status === "already-cancelled") {
      const cancelledByClient = text(appointment.cancelled_by).toLowerCase() === "client";
      const calendarStatus: CalendarRemovalStatus = cancelledByClient
        ? await removeLinkedGoogleEvent(req, text(appointment.id))
        : "not_attempted";
      return json({
        status: "already-cancelled",
        message: calendarStatus === "failed"
          ? "התור כבר בוטל, אך לא הצלחנו לאמת את הסרת האירוע מיומן Google. אם האירוע עדיין מופיע ביומן, הביטול תקף. לבירור, התקשרו למרפאה."
          : evaluation.message,
        appointment: summary(appointment),
        calendar_status: calendarStatus,
      });
    }
    if (evaluation.status === "cutoff" || evaluation.status === "past") {
      return json({ status: evaluation.status, message: evaluation.message, appointment: summary(appointment), policy: { minimumHours: policy.minimumHours, cutoffMessage: policy.cutoffMessage } }, 409);
    }

    await Appointment.update(appointment.id, { status: "cancelled", cancelled_by: "client" });
    let refreshed: AppointmentRecord | null = null;
    try {
      refreshed = await Appointment.get(appointment.id) as AppointmentRecord;
    } catch (error) {
      console.error("[ManageAppointment] cancellation persistence read failed:", safeError(error));
    }

    if (!refreshed || text(refreshed.status).toLowerCase() !== "cancelled") {
      console.error("[ManageAppointment] cancellation persistence check failed");
      return json({ status: "error", message: "לא הצלחנו להשלים את ביטול התור. נסו שוב בעוד רגע." }, 500);
    }

    const [emailStatus, notificationStatus, calendarStatus] = await Promise.all([
      sendCancellationEmail(refreshed, settings),
      notifyOwner(req, String(refreshed.id)),
      removeLinkedGoogleEvent(req, String(refreshed.id)),
    ]);

    if (emailStatus === "sent" && !refreshed.client_cancellation_email_sent_at) {
      try {
        await Appointment.update(refreshed.id, { client_cancellation_email_sent_at: new Date().toISOString() });
      } catch (error) {
        console.error("[ManageAppointment] cancellation email marker update failed:", safeError(error));
      }
    }

    return json({
      status: "cancelled",
      message: calendarStatus === "failed"
        ? "התור בוטל, אך לא הצלחנו להסיר את האירוע מיומן Google. אם האירוע עדיין מופיע ביומן, הביטול תקף. לבירור, התקשרו למרפאה."
        : "התור בוטל בהצלחה.",
      appointment: summary(refreshed),
      email_status: emailStatus,
      notification_status: notificationStatus,
      calendar_status: calendarStatus,
    });
  });
}

async function withTokenLock<T>(token: string, work: () => Promise<T>): Promise<T> {
  const previous = tokenLocks.get(token) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  tokenLocks.set(token, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (tokenLocks.get(token) === current) tokenLocks.delete(token);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SERVICE_ROLE_KEY) {
    console.error("[ManageAppointment] missing SUPERDEV_SERVICE_ROLE_KEY");
    return json({ status: "service-unavailable", message: "השירות אינו זמין כרגע." }, 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Request body is invalid" }, 400);

  const request = body as Record<string, unknown>;
  const action = request.action;
  const allowedKeys = action === "availability"
    ? new Set(["action", "token", "date", "service_identifier"])
    : action === "request_reschedule"
      ? new Set(["action", "token", "proposed_date", "proposed_start_time"])
      : new Set(["action", "token"]);
  if (Object.keys(request).some((key) => !allowedKeys.has(key))) return json({ error: "Request contains unsupported fields" }, 400);
  if (action !== "get" && action !== "cancel" && action !== "availability" && action !== "request_reschedule") return json({ error: "action must be get, cancel, availability, or request_reschedule" }, 400);

  const token = typeof request.token === "string" ? request.token.trim() : "";
  if (!validToken(token)) return json({ status: "invalid-token", message: "הקישור לניהול התור אינו תקין או שפג תוקפו." }, 400);
  if (action === "availability" && (typeof request.date !== "string" || typeof request.service_identifier !== "string")) return json({ status: "invalid-selection", message: "בחירת התאריך או סוג הטיפול אינה תקינה." }, 400);
  if (action === "request_reschedule" && (typeof request.proposed_date !== "string" || typeof request.proposed_start_time !== "string")) return json({ status: "invalid-selection", message: "בחרו תאריך ושעה תקינים מתוך האפשרויות הזמינות." }, 400);

  try {
    superdev.auth.setToken(SERVICE_ROLE_KEY);
    if (action === "get") return await handleGet(token);
    if (action === "cancel") return await handleCancel(req, token);
    if (action === "availability") return await handleAvailability(token, request.date, request.service_identifier);
    return await handleRequestReschedule(req, token, request.proposed_date, request.proposed_start_time);
  } catch (error) {
    console.error("[ManageAppointment] request failed:", safeError(error));
    return json({ status: "service-unavailable", message: "לא הצלחנו להשלים את הבקשה כרגע. נסו שוב בעוד רגע." }, 500);
  }
});
