import { addMinutes, format, getDay, isBefore } from "date-fns";
import {
  DEFAULT_CLINIC_HOURS,
  minutesToTime,
  resolveServiceWeeklyAvailability,
  timeToMinutes,
  type NormalizedClinicHours,
  type TimePeriod,
} from "@/lib/clinicAvailability";

export interface AvailabilityType {
  id: string;
  duration: number;
  weeklyAvailability?: unknown;
}

export interface AvailabilityWindow {
  appointment_type_id?: string;
  weekday?: number;
  start_time?: string;
  end_time?: string;
}

export interface AvailabilityAppointment {
  date?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
}

export interface AvailabilityBlock {
  date?: string;
  start_time?: string;
  end_time?: string;
}

export interface CalendarBusyInterval {
  date?: string;
  start: string;
  end: string;
}

export interface GoogleCalendarEvent {
  id: string;
  date: string;
  start: string;
  end: string;
  title: string;
  allDay: boolean;
}

export type ManagerBookingWarningCode =
  | "outside-clinic-hours"
  | "outside-service-hours"
  | "outside-service-window"
  | "minimum-lead-time"
  | "crm-appointment-overlap"
  | "closed-window-overlap"
  | "google-calendar-overlap";

export interface ManagerBookingWarning {
  code: ManagerBookingWarningCode;
  message: string;
}

export const MANAGER_BOOKING_WARNING_MESSAGES: Record<ManagerBookingWarningCode, string> = {
  "outside-clinic-hours": "השעה מחוץ לשעות הפעילות של המרפאה. ניתן לשמור את התור בכל זאת.",
  "outside-service-hours": "השעה מחוץ לשעות שהוגדרו לשירות הזה. ניתן לשמור את התור בכל זאת.",
  "outside-service-window": "השעה מחוץ לחלון הזמינות של השירות. ניתן לשמור את התור בכל זאת.",
  "minimum-lead-time": "השעה קרובה מדי למועד הנוכחי לפי ההגדרה הקיימת. ניתן לשמור את התור בכל זאת.",
  "crm-appointment-overlap": "השעה חופפת לפגישה קיימת ב־CRM. ניתן לשמור את התור בכל זאת.",
  "closed-window-overlap": "השעה חופפת לחלון זמן סגור. ניתן לשמור את התור בכל זאת, אך לקוחות לא יוכלו לבחור את השעה הזו.",
  "google-calendar-overlap": "השעה חופפת לאירוע ביומן Google. ניתן לשמור את התור, אך ייתכן שתיווצר התנגשות.",
};

function validRange(start: number, end: number): boolean {
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && end > otherStart;
}

function periodsForDate(date: Date, clinicHours?: NormalizedClinicHours) {
  const hours = clinicHours || DEFAULT_CLINIC_HOURS;
  const periods = hours[getDay(date)];
  return Array.isArray(periods) ? periods : [];
}

function intersectPeriods(clinicPeriods: TimePeriod[], servicePeriods: TimePeriod[]): TimePeriod[] {
  const intersections: TimePeriod[] = [];
  for (const clinicPeriod of clinicPeriods) {
    const clinicStart = timeToMinutes(String(clinicPeriod?.start || ""));
    const clinicEnd = timeToMinutes(String(clinicPeriod?.end || ""));
    if (!validRange(clinicStart, clinicEnd)) continue;

    for (const servicePeriod of servicePeriods) {
      const start = Math.max(clinicStart, timeToMinutes(String(servicePeriod?.start || "")));
      const end = Math.min(clinicEnd, timeToMinutes(String(servicePeriod?.end || "")));
      if (validRange(start, end)) {
        intersections.push({ start: minutesToTime(start), end: minutesToTime(end) });
      }
    }
  }

  return intersections.sort((left, right) => timeToMinutes(left.start) - timeToMinutes(right.start));
}

function effectivePeriodsForDate(
  date: Date,
  type: AvailabilityType,
  clinicHours?: NormalizedClinicHours,
): TimePeriod[] {
  const clinicSchedule = clinicHours || DEFAULT_CLINIC_HOURS;
  const clinicPeriods = periodsForDate(date, clinicSchedule);
  const serviceAvailability = resolveServiceWeeklyAvailability(type.weeklyAvailability, clinicSchedule);
  const servicePeriods = serviceAvailability.hours[getDay(date)] || [];
  return intersectPeriods(clinicPeriods, servicePeriods);
}

export function typeWindowsForDate(
  date: Date,
  type: AvailabilityType | null,
  windows: AvailabilityWindow[],
): AvailabilityWindow[] {
  if (!type) return [];
  const weekday = getDay(date);
  const source = Array.isArray(windows) ? windows : [];
  return source.filter((window) => {
    if (!window) return false;
    const rawWeekday = window.weekday;
    const normalizedWeekday = rawWeekday === null || rawWeekday === undefined || (typeof rawWeekday === "string" && rawWeekday.trim() === "")
      ? Number.NaN
      : Number(rawWeekday);
    return String(window.appointment_type_id || "") === type.id
      && Number.isInteger(normalizedWeekday)
      && normalizedWeekday === weekday;
  });
}

export function isDateAvailableForType(
  date: Date,
  type: AvailabilityType | null,
  windows: AvailabilityWindow[],
  clinicHours?: NormalizedClinicHours,
): boolean {
  const periods = periodsForDate(date, clinicHours);
  if (!periods.length) return false;
  if (!type) return true;

  const typeWindows = typeWindowsForDate(date, type, windows);
  const hasTypeWindows = typeWindows.length > 0;

  return periods.some((period) => {
    const periodStart = timeToMinutes(String(period?.start || ""));
    const periodEnd = timeToMinutes(String(period?.end || ""));
    if (!validRange(periodStart, periodEnd)) return false;

    for (let start = periodStart; start + type.duration <= periodEnd; start += type.duration) {
      if (!hasTypeWindows) return true;
      const fitsWindow = typeWindows.some((window) => {
        const windowStart = timeToMinutes(String(window.start_time || ""));
        const windowEnd = timeToMinutes(String(window.end_time || ""));
        return validRange(windowStart, windowEnd) && start >= windowStart && start + type.duration <= windowEnd;
      });
      if (fitsWindow) return true;
    }
    return false;
  });
}

/**
 * Checks a proposed manager-booking interval against external calendar busy data.
 * Invalid dates, times, durations and busy ranges are ignored rather than treated as conflicts.
 */
export function hasCalendarBusyOverlap(params: {
  date: Date;
  startTime: string;
  duration: number;
  calendarBusy?: CalendarBusyInterval[];
}): boolean {
  const { date, startTime, duration, calendarBusy = [] } = params;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

  const start = timeToMinutes(String(startTime || ""));
  const normalizedDuration = Number(duration);
  const end = start + normalizedDuration;
  if (!validRange(start, end) || start < 0 || start >= 24 * 60) return false;

  const dateKey = format(date, "yyyy-MM-dd");
  const comparisonEnd = Math.min(end, 24 * 60);
  const intervals = Array.isArray(calendarBusy) ? calendarBusy : [];
  return intervals.some((busy) => {
    if (!busy || (busy.date && busy.date !== dateKey)) return false;
    const busyStart = timeToMinutes(String(busy.start || ""));
    const busyEnd = timeToMinutes(String(busy.end || ""));
    return validRange(busyStart, busyEnd) && overlaps(start, comparisonEnd, busyStart, busyEnd);
  });
}

/**
 * Returns advisory warnings for a manager-selected appointment interval.
 * Invalid records are ignored, and none of these warnings should block a save.
 */
export function getManagerBookingWarnings(params: {
  date: Date;
  startTime: string;
  type: AvailabilityType | null;
  appointments: AvailabilityAppointment[];
  windows: AvailabilityWindow[];
  blocks?: AvailabilityBlock[];
  calendarBusy?: CalendarBusyInterval[];
  minHoursBeforeBooking: number;
  now?: Date;
  clinicHours?: NormalizedClinicHours;
  serviceWeeklyAvailability?: unknown;
}): ManagerBookingWarning[] {
  const {
    date,
    startTime,
    type,
    appointments,
    windows,
    blocks = [],
    calendarBusy = [],
    minHoursBeforeBooking,
    clinicHours,
  } = params;

  if (!(date instanceof Date) || Number.isNaN(date.getTime()) || !type) return [];

  const start = timeToMinutes(String(startTime || ""));
  const duration = Number(type.duration);
  const end = start + duration;
  if (!validRange(start, end) || start < 0 || start >= 24 * 60) return [];

  const warnings: ManagerBookingWarning[] = [];
  const addWarning = (code: ManagerBookingWarningCode) => {
    warnings.push({ code, message: MANAGER_BOOKING_WARNING_MESSAGES[code] });
  };

  const periods = periodsForDate(date, clinicHours);
  const fitsClinicHours = periods.some((period) => {
    const periodStart = timeToMinutes(String(period?.start || ""));
    const periodEnd = timeToMinutes(String(period?.end || ""));
    return validRange(periodStart, periodEnd) && start >= periodStart && end <= periodEnd;
  });
  if (!fitsClinicHours) addWarning("outside-clinic-hours");

  const serviceAvailability = resolveServiceWeeklyAvailability(
    params.serviceWeeklyAvailability,
    clinicHours || DEFAULT_CLINIC_HOURS,
  );
  if (serviceAvailability.status !== "inherit") {
    const servicePeriods = serviceAvailability.hours[getDay(date)] || [];
    const fitsServiceHours = servicePeriods.some((period) => {
      const periodStart = timeToMinutes(String(period?.start || ""));
      const periodEnd = timeToMinutes(String(period?.end || ""));
      return validRange(periodStart, periodEnd) && start >= periodStart && end <= periodEnd;
    });
    if (!fitsServiceHours) addWarning("outside-service-hours");
  }

  // A malformed window should not turn into a restriction. Only valid windows
  // count as a configured service-specific availability rule.
  const validTypeWindows = typeWindowsForDate(date, type, windows).filter((window) => {
    const windowStart = timeToMinutes(String(window.start_time || ""));
    const windowEnd = timeToMinutes(String(window.end_time || ""));
    return validRange(windowStart, windowEnd);
  });
  const hasServiceWindows = validTypeWindows.length > 0;
  const fitsServiceWindow = validTypeWindows.some((window) => {
    const windowStart = timeToMinutes(String(window.start_time || ""));
    const windowEnd = timeToMinutes(String(window.end_time || ""));
    return start >= windowStart && end <= windowEnd;
  });
  if (hasServiceWindows && !fitsServiceWindow) addWarning("outside-service-window");

  const now = params.now || new Date();
  const minimumDateTime = addMinutes(now, Math.max(0, minHoursBeforeBooking || 0) * 60);
  const slotDateTime = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Math.floor(start / 60),
    start % 60,
    0,
    0,
  );
  if (!Number.isNaN(minimumDateTime.getTime()) && isBefore(slotDateTime, minimumDateTime)) {
    addWarning("minimum-lead-time");
  }

  const dateKey = format(date, "yyyy-MM-dd");
  const records = Array.isArray(appointments) ? appointments : [];
  const hasAppointmentOverlap = records.some((appointment) => {
    const status = String(appointment?.status || "").toLowerCase();
    if (!appointment || appointment.date !== dateKey || status === "cancelled" || status === "canceled") return false;
    const appointmentStart = timeToMinutes(String(appointment.start_time || ""));
    const appointmentEnd = timeToMinutes(String(appointment.end_time || ""));
    return validRange(appointmentStart, appointmentEnd) && overlaps(start, end, appointmentStart, appointmentEnd);
  });
  if (hasAppointmentOverlap) addWarning("crm-appointment-overlap");

  const hasClosedWindowOverlap = (Array.isArray(blocks) ? blocks : []).some((block) => {
    if (!block || String(block.date || "") !== dateKey) return false;
    const blockStart = timeToMinutes(String(block.start_time || ""));
    const blockEnd = timeToMinutes(String(block.end_time || ""));
    return validRange(blockStart, blockEnd) && overlaps(start, end, blockStart, blockEnd);
  });
  if (hasClosedWindowOverlap) addWarning("closed-window-overlap");

  if (hasCalendarBusyOverlap({ date, startTime, duration, calendarBusy })) {
    addWarning("google-calendar-overlap");
  }

  return warnings;
}

export function getAvailableManagerSlots(params: {
  date: Date;
  type: AvailabilityType;
  appointments: AvailabilityAppointment[];
  windows: AvailabilityWindow[];
  calendarBusy?: CalendarBusyInterval[];
  ignoreCalendarBusy?: boolean;
  minHoursBeforeBooking: number;
  now?: Date;
  clinicHours?: NormalizedClinicHours;
}): string[] {
  const { date, type, appointments, windows, calendarBusy = [], ignoreCalendarBusy = false, clinicHours } = params;
  const dateKey = format(date, "yyyy-MM-dd");
  const periods = effectivePeriodsForDate(date, type, clinicHours);
  const typeWindows = typeWindowsForDate(date, type, windows);
  const hasTypeWindows = typeWindows.length > 0;
  const now = params.now || new Date();
  const minimumDateTime = addMinutes(now, Math.max(0, params.minHoursBeforeBooking || 0) * 60);
  const activeAppointments = (Array.isArray(appointments) ? appointments : []).filter(
    (appointment) => appointment?.date === dateKey && appointment.status !== "cancelled",
  );
  const busyForDate = ignoreCalendarBusy
    ? []
    : (Array.isArray(calendarBusy) ? calendarBusy : []).filter((busy) => Boolean(busy) && (!busy.date || busy.date === dateKey));
  const slots: string[] = [];

  for (const period of periods) {
    const periodStart = timeToMinutes(String(period?.start || ""));
    const periodEnd = timeToMinutes(String(period?.end || ""));
    if (!validRange(periodStart, periodEnd)) continue;

    for (let start = periodStart; start + type.duration <= periodEnd; start += type.duration) {
      const end = start + type.duration;
      const time = minutesToTime(start);
      const slotDateTime = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        Math.floor(start / 60),
        start % 60,
        0,
        0,
      );
      if (isBefore(slotDateTime, minimumDateTime)) continue;

      const fitsWindow = !hasTypeWindows || typeWindows.some((window) => {
        const windowStart = timeToMinutes(String(window.start_time || ""));
        const windowEnd = timeToMinutes(String(window.end_time || ""));
        return validRange(windowStart, windowEnd) && start >= windowStart && end <= windowEnd;
      });
      if (!fitsWindow) continue;

      const appointmentOverlap = activeAppointments.some((appointment) => {
        const appointmentStart = timeToMinutes(String(appointment.start_time || ""));
        const appointmentEnd = timeToMinutes(String(appointment.end_time || ""));
        return validRange(appointmentStart, appointmentEnd) && overlaps(start, end, appointmentStart, appointmentEnd);
      });
      if (appointmentOverlap) continue;

      const calendarOverlap = busyForDate.some((busy) => {
        const busyStart = timeToMinutes(String(busy.start || ""));
        const busyEnd = timeToMinutes(String(busy.end || ""));
        return validRange(busyStart, busyEnd) && overlaps(start, end, busyStart, busyEnd);
      });
      if (!calendarOverlap) slots.push(time);
    }
  }

  return slots;
}
