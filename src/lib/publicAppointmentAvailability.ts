import { Appointment, AppointmentBlock, AppointmentWindow, ClinicService, ClinicSettings } from "@/entities";
import { getCalendarBusy } from "@/functions";
import { getClinicHours, timeToMinutes, type NormalizedClinicHours } from "@/lib/clinicAvailability";

type AnyRecord = Record<string, any>;
type TimePeriod = { start: string; end: string };
type BusyInterval = { date: string; start: string; end: string };

type ParsedDate = {
  key: string;
  year: number;
  month: number;
  day: number;
  weekday: number;
};

type ResolvedService = {
  id: string;
  name: string;
  durationMinutes: number;
  windowIds: string[];
};

export type StrictRescheduleValidationKind = "valid" | "invalid" | "unavailable";

export interface StrictRescheduleValidation {
  kind: StrictRescheduleValidationKind;
  ok: boolean;
  message: string;
  proposedEndTime?: string;
  durationMinutes?: number;
}

const TIME_ZONE = "Asia/Jerusalem";
const DEFAULT_MIN_HOURS_BEFORE_BOOKING = 4;
const MAX_BOOKING_MONTHS = 12;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const LEGACY_SERVICES: Array<{ id: string; name: string; durationMinutes: number }> = [
  { id: "vaccine", name: "חיסון וטיפולים שגרתיים", durationMinutes: 20 },
  { id: "general", name: "בדיקה כללית / לקוח חדש", durationMinutes: 30 },
  { id: "surgery", name: "עיקור / סירוס / פרוצדורה אחרת", durationMinutes: 90 },
  { id: "dental", name: "ניקוי שיניים בהרדמה", durationMinutes: 90 },
];

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

const text = (value: unknown, fallback = "") =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() || fallback : fallback;

function record(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : null;
}

function unwrap(value: unknown): AnyRecord | null {
  if (typeof value === "string") {
    try { return unwrap(JSON.parse(value)); } catch { return null; }
  }
  const current = record(value);
  if (!current) return null;
  if (Object.prototype.hasOwnProperty.call(current, "data")) return unwrap(current.data);
  if (Object.prototype.hasOwnProperty.call(current, "body")) return unwrap(current.body);
  return current;
}

function calendarEnvelopeFailed(value: AnyRecord) {
  if (Object.prototype.hasOwnProperty.call(value, "error") && value.error !== undefined && value.error !== null && value.error !== "" && value.error !== false) return true;
  if (value.ok === false || value.success === false) return true;
  if (!Object.prototype.hasOwnProperty.call(value, "status")) return false;

  const status = value.status;
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
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
      } catch {
        throw new Error("Google calendar response is malformed.");
      }
    }
    const payload = record(current);
    if (!payload) throw new Error("Google calendar response is malformed.");
    if (calendarEnvelopeFailed(payload)) throw new Error("Google calendar lookup failed.");
    if (Object.prototype.hasOwnProperty.call(payload, "data")) {
      current = payload.data;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "body")) {
      current = payload.body;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(payload, "busy") || !Array.isArray(payload.busy)) throw new Error("Google calendar response is malformed.");

    const intervals: BusyInterval[] = [];
    for (const item of payload.busy) {
      const interval = record(item);
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

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 180);
}

function normalizeName(value: unknown) {
  return text(value).replace(/\s+/g, " ").toLocaleLowerCase("he");
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

export function localIsraelToInstant(dateValue: unknown, timeValue: unknown): Date | null {
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

function validRange(start: number, end: number) {
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && end > otherStart;
}

function minutesToTime(value: number) {
  if (!Number.isFinite(value) || value < 0 || value >= 24 * 60) return "";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function positiveInteger(value: unknown) {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(number) && number > 0 && number <= 720 ? number : null;
}

function activeService(value: AnyRecord) {
  return value.is_active !== false && value.is_active !== 0 && value.is_active !== "false";
}

async function resolveService(request: AnyRecord, appointment: AnyRecord): Promise<ResolvedService | null> {
  const identifier = text(request.service_identifier);
  const appointmentType = text(appointment.appointment_type);
  const candidateNames = new Set([normalizeName(identifier), normalizeName(appointmentType)].filter(Boolean));
  let catalog: AnyRecord[] = [];

  try {
    const result = await ClinicService.list("sort_order", 500);
    catalog = Array.isArray(result) ? result.filter((item) => record(item)) as AnyRecord[] : [];
  } catch (error) {
    const legacyFallback = LEGACY_SERVICES.filter((service) => service.id === identifier || candidateNames.has(normalizeName(service.name)));
    if (legacyFallback.length === 1) {
      return { ...legacyFallback[0], windowIds: [...new Set([identifier, legacyFallback[0].id].filter(Boolean))] };
    }
    throw new Error(`קטלוג השירותים אינו זמין כרגע: ${safeError(error)}`);
  }

  const catalogMatches = catalog.filter((item) => {
    const id = text(item.id);
    const name = normalizeName(item.name);
    return (identifier && id === identifier) || (name && candidateNames.has(name));
  });
  const uniqueCatalogMatches = [...new Map(catalogMatches.map((item) => [text(item.id) || normalizeName(item.name), item])).values()];
  if (uniqueCatalogMatches.length > 1) throw new Error("נמצאו כמה שירותים מתאימים לבקשת שינוי המועד.");

  if (uniqueCatalogMatches.length === 1) {
    const service = uniqueCatalogMatches[0];
    if (!activeService(service)) return null;
    const duration = positiveInteger(service.duration_minutes);
    const name = text(service.name);
    const id = text(service.id);
    if (!duration || !name || !id) return null;
    return { id, name, durationMinutes: duration, windowIds: [...new Set([identifier, id].filter(Boolean))] };
  }

  const legacyMatches = LEGACY_SERVICES.filter((service) => service.id === identifier || candidateNames.has(normalizeName(service.name)));
  if (legacyMatches.length > 1) throw new Error("נמצאו כמה שירותים מתאימים לבקשת שינוי המועד.");
  if (legacyMatches.length === 1) {
    const service = legacyMatches[0];
    return { ...service, windowIds: [...new Set([identifier, service.id].filter(Boolean))] };
  }
  return null;
}

function validWindow(item: AnyRecord) {
  const start = text(item.start_time);
  const end = text(item.end_time);
  return TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && timeToMinutes(end) > timeToMinutes(start);
}

function validBlock(item: AnyRecord, dateKey: string) {
  const start = text(item.date) === dateKey ? text(item.start_time) : "";
  const end = text(item.date) === dateKey ? text(item.end_time) : "";
  return TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && timeToMinutes(end) > timeToMinutes(start);
}

function windowsForService(windows: AnyRecord[], date: ParsedDate, service: ResolvedService) {
  const allowedIds = new Set(service.windowIds);
  return windows.filter((window) => {
    const weekday = Number(window.weekday);
    return allowedIds.has(text(window.appointment_type_id)) && weekday === date.weekday && validWindow(window);
  });
}

function minimumHours(settings: AnyRecord) {
  const value = Number(settings.min_hours_before_booking);
  return Number.isFinite(value) && value >= 0 && value <= 720 ? Math.floor(value) : DEFAULT_MIN_HOURS_BEFORE_BOOKING;
}

async function loadSettings() {
  try {
    const result = await ClinicSettings.list("-created_at", 1);
    return Array.isArray(result) && record(result[0]) ? result[0] as AnyRecord : {};
  } catch (error) {
    throw new Error(`הגדרות המרפאה אינן זמינות כרגע: ${safeError(error)}`);
  }
}

async function loadAppointments(date: string) {
  try {
    const result = await Appointment.query().where("date", date).limit(1000).exec();
    return Array.isArray(result) ? result.filter((item) => record(item)) as AnyRecord[] : [];
  } catch (error) {
    throw new Error(`רשימת התורים אינה זמינה כרגע: ${safeError(error)}`);
  }
}

async function loadWindows() {
  try {
    const result = await AppointmentWindow.list("-created_at", 1000);
    return Array.isArray(result) ? result.filter((item) => record(item)) as AnyRecord[] : [];
  } catch (error) {
    throw new Error(`חלונות השירות אינם זמינים כרגע: ${safeError(error)}`);
  }
}

async function loadBlocks(date: string) {
  try {
    const result = await AppointmentBlock.query().where("date", date).limit(1000).exec();
    return Array.isArray(result) ? result.filter((item) => record(item)) as AnyRecord[] : [];
  } catch (error) {
    throw new Error(`סגירות היומן אינן זמינות כרגע: ${safeError(error)}`);
  }
}

async function loadBusy(date: string): Promise<BusyInterval[]> {
  try {
    return parseBusyPayload(await getCalendarBusy({ date }), date);
  } catch (error) {
    throw new Error(`לא הצלחנו לבדוק את יומן Google: ${safeError(error)}`);
  }
}

function unavailable(message: string): StrictRescheduleValidation {
  return { kind: "unavailable", ok: false, message: `לא ניתן להשלים את בדיקת הזמינות כרגע. ${message} נסי שוב בעוד רגע.` };
}

function invalid(message: string): StrictRescheduleValidation {
  return { kind: "invalid", ok: false, message };
}

export async function validateRescheduleSlot(request: AnyRecord, appointment: AnyRecord): Promise<StrictRescheduleValidation> {
  const date = parseDate(request.proposed_appointment_date);
  const startTime = text(request.proposed_start_time);
  const endTime = text(request.proposed_end_time);
  if (!date || !dateIsBookable(date)) return invalid("המועד המוצע אינו תאריך שניתן לקבוע בו תור.");
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) return invalid("המועד המוצע כולל שעות שאינן תקינות.");

  let service: ResolvedService | null;
  let settings: AnyRecord;
  try {
    [settings, service] = await Promise.all([loadSettings(), resolveService(request, appointment)]);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "הגדרות הזמינות לא נטענו.");
  }
  if (!service) return invalid("סוג השירות של הבקשה אינו מזוהה או שאינו פעיל, ולכן אי אפשר לאשר את המועד.");

  const storedRequestDuration = positiveInteger(request.service_duration_minutes);
  const storedAppointmentDuration = positiveInteger(appointment.duration_minutes);
  if ((storedRequestDuration && storedRequestDuration !== service.durationMinutes) || (storedAppointmentDuration && storedAppointmentDuration !== service.durationMinutes)) {
    return invalid("משך השירות שנשמר אינו תואם לשירות המבוקש. הבקשה דורשת בדיקה ידנית.");
  }

  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (!validRange(start, end) || end !== start + service.durationMinutes) return invalid("משך המועד המוצע אינו תואם למשך השירות.");

  const proposedInstant = localIsraelToInstant(date.key, startTime);
  if (!proposedInstant) return invalid("לא ניתן לפרש את המועד המוצע לפי שעון ישראל.");
  const minimumInstant = new Date(Date.now() + minimumHours(settings) * 60 * 60 * 1000);
  if (proposedInstant.getTime() < minimumInstant.getTime()) return invalid(`המועד המוצע קרוב מדי. יש להשאיר לפחות ${minimumHours(settings)} שעות מראש.`);

  let windows: AnyRecord[];
  let blocks: AnyRecord[];
  let appointments: AnyRecord[];
  let busy: BusyInterval[];
  try {
    [windows, blocks, appointments, busy] = await Promise.all([loadWindows(), loadBlocks(date.key), loadAppointments(date.key), loadBusy(date.key)]);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "נתוני הזמינות לא נטענו.");
  }

  const clinicHours: NormalizedClinicHours = getClinicHours(settings.weekly_availability);
  const periods = Array.isArray(clinicHours[date.weekday]) ? clinicHours[date.weekday] : [];
  const fitsClinicSlot = periods.some((period: TimePeriod) => {
    const periodStart = timeToMinutes(period.start);
    const periodEnd = timeToMinutes(period.end);
    return validRange(periodStart, periodEnd) && start >= periodStart && end <= periodEnd && (start - periodStart) % service.durationMinutes === 0;
  });
  if (!fitsClinicSlot) return invalid("המועד המוצע אינו נמצא בשעות הפעילות או בצעדי הזמן של המרפאה.");

  const typeWindows = windowsForService(windows, date, service);
  if (typeWindows.length > 0 && !typeWindows.some((window) => {
    const windowStart = timeToMinutes(text(window.start_time));
    const windowEnd = timeToMinutes(text(window.end_time));
    return validRange(windowStart, windowEnd) && start >= windowStart && end <= windowEnd;
  })) return invalid("המועד המוצע אינו נמצא בחלון הזמינות של השירות.");

  const closedWindowOverlap = blocks.some((block) => {
    if (!validBlock(block, date.key)) return false;
    const blockStart = timeToMinutes(text(block.start_time));
    const blockEnd = timeToMinutes(text(block.end_time));
    return overlaps(start, end, blockStart, blockEnd);
  });
  if (closedWindowOverlap) return invalid("המועד המוצע חופף לחלון זמן סגור במרפאה.");

  const appointmentId = text(appointment.id);
  const dateAppointmentsOverlap = appointments.some((candidate) => {
    if (text(candidate.id) === appointmentId) return false;
    const status = text(candidate.status).toLowerCase();
    if (["cancelled", "canceled"].includes(status) || text(candidate.date) !== date.key) return false;
    const candidateStart = timeToMinutes(text(candidate.start_time));
    const candidateEnd = timeToMinutes(text(candidate.end_time));
    return validRange(candidateStart, candidateEnd) && overlaps(start, end, candidateStart, candidateEnd);
  });
  if (dateAppointmentsOverlap) return invalid("המועד המוצע חופף לתור אחר במרפאה.");

  const calendarOverlap = busy.some((interval) => {
    if (interval.date !== date.key) return false;
    const busyStart = timeToMinutes(interval.start);
    const busyEnd = timeToMinutes(interval.end);
    return validRange(busyStart, busyEnd) && overlaps(start, end, busyStart, busyEnd);
  });
  if (calendarOverlap) return invalid("המועד המוצע חופף לאירוע ביומן Google.");

  return { kind: "valid", ok: true, message: "המועד המוצע עבר את בדיקת הזמינות.", proposedEndTime: minutesToTime(end), durationMinutes: service.durationMinutes };
}
