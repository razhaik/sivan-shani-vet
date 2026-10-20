import { format } from "date-fns";
import { he } from "date-fns/locale";
import { normalizePetSpecies, aggregateClients } from "@/lib/clientAggregation";
import { normalizeWeeklyAvailability } from "@/lib/clinicAvailability";

export const SALES_TIME_ZONE = "Asia/Jerusalem";
const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_PERIODS = ["today", "week", "month", "quarter", "year", "custom"] as const;

export type SalesPeriod = (typeof KNOWN_PERIODS)[number];
export type SalesStatus = "ממתין" | "מאושר" | "הושלם" | "בוטל" | "לא הגיע" | "ממתין לעדכון" | "לא ידוע";
export type SalesStatusFilter = "all" | SalesStatus;
export type SalesClientTypeFilter = "all" | "new" | "returning";
export type SalesSpeciesFilter = "all" | "dog" | "cat" | "other" | "unknown";
export type SalesComparisonTone = "neutral" | "success" | "danger";
export type SalesTrendGrouping = "day" | "week" | "month";

export interface SalesDateRange {
  start: string;
  end: string;
}

export interface SalesCustomRange {
  start: string | null;
  end: string | null;
}

export interface SalesFilters {
  serviceNames: string[];
  status: SalesStatusFilter;
  clientType: SalesClientTypeFilter;
  species: SalesSpeciesFilter;
}

export interface NormalizedSalesAppointment {
  id: string;
  date: string | null;
  time: string | null;
  durationMin: number | null;
  clientId: string | null;
  clientName: string | null;
  phone: string | null;
  petName: string | null;
  species: "dog" | "cat" | "other" | null;
  serviceId: string | null;
  serviceName: string | null;
  status: SalesStatus;
  source: string | null;
  createdAt: string | null;
  price: number | null;
}

export interface SalesPeriodMetrics {
  totalAppointments: number;
  workingDays: number | null;
  averagePerWorkingDay: number | null;
  attendanceRate: number | null;
  attendanceCompleted: number;
  attendanceDenominator: number;
  cancelledCount: number;
  cancelledRate: number | null;
  noShowCount: number;
  noShowRate: number | null;
  newClients: number;
}

export interface SalesServiceBreakdownItem {
  serviceName: string;
  count: number;
  percentage: number;
}

export interface SalesTrendPoint {
  label: string;
  tooltipLabel: string;
  appointments: number;
  cancellations: number;
  previousAppointments: number | null;
}

function asText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
}

function dateParts(dateKey: string): [number, number, number] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null;
  return [year, month, day];
}

export function isSalesDateKey(value: unknown): value is string {
  return typeof value === "string" && dateParts(value) !== null;
}

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateOrdinal(dateKey: string): number {
  const parts = dateParts(dateKey);
  if (!parts) return Number.NaN;
  return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / DAY_MS);
}

function dateKeyFromOrdinal(ordinal: number): string {
  const date = new Date(ordinal * DAY_MS);
  return dateKeyFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function addCalendarDays(dateKey: string, days: number): string {
  return dateKeyFromOrdinal(dateOrdinal(dateKey) + days);
}

function daysBetween(start: string, end: string): number {
  return dateOrdinal(end) - dateOrdinal(start) + 1;
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function partsInClinicTimeZone(now: Date): { date: string; time: string } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: SALES_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
    const date = `${part("year")}-${part("month")}-${part("day")}`;
    const time = `${part("hour")}:${part("minute")}`;
    if (isSalesDateKey(date) && /^\d{2}:\d{2}$/.test(time)) return { date, time };
  } catch {
    // Use the browser's local clock only if Intl cannot resolve the clinic timezone.
  }
  return {
    date: dateKeyFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
  };
}

export function getClinicDateKey(now = new Date()): string {
  return partsInClinicTimeZone(now).date;
}

function clinicNowLabel(now = new Date()): string {
  const { date, time } = partsInClinicTimeZone(now);
  return `${date}T${time}`;
}

export function getPeriodRange(period: SalesPeriod, custom: SalesCustomRange | null = null, now = new Date()): { current: SalesDateRange; previous: SalesDateRange } {
  const today = getClinicDateKey(now);
  let currentStart = today;
  let currentEnd = today;

  if (period === "week") {
    const weekday = new Date(dateOrdinal(today) * DAY_MS).getUTCDay();
    currentStart = addCalendarDays(today, -weekday);
    currentEnd = addCalendarDays(currentStart, 6);
  } else if (period === "month") {
    const [year, month] = dateParts(today)!.slice(0, 2);
    currentStart = dateKeyFromParts(year, month, 1);
    currentEnd = dateKeyFromParts(year, month, lastDayOfMonth(year, month - 1));
  } else if (period === "quarter") {
    const [year, month] = dateParts(today)!.slice(0, 2);
    const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
    currentStart = dateKeyFromParts(year, firstMonth, 1);
    currentEnd = dateKeyFromParts(year, firstMonth + 2, lastDayOfMonth(year, firstMonth + 1));
  } else if (period === "year") {
    const [year] = dateParts(today)!;
    currentStart = dateKeyFromParts(year, 1, 1);
    currentEnd = dateKeyFromParts(year, 12, 31);
  } else if (period === "custom") {
    const proposedStart = custom?.start && isSalesDateKey(custom.start) ? custom.start : today;
    const proposedEnd = custom?.end && isSalesDateKey(custom.end) ? custom.end : proposedStart;
    currentStart = proposedStart <= proposedEnd ? proposedStart : proposedEnd;
    currentEnd = proposedStart <= proposedEnd ? proposedEnd : proposedStart;
  }

  const current = { start: currentStart, end: currentEnd };
  const duration = Math.max(1, daysBetween(current.start, current.end));
  const previousEnd = addCalendarDays(current.start, -1);
  const previousStart = addCalendarDays(previousEnd, -duration + 1);
  return { current, previous: { start: previousStart, end: previousEnd } };
}

function localDateAtNoon(dateKey: string): Date | null {
  const parts = dateParts(dateKey);
  if (!parts) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

export function formatSalesDate(dateKey: string, pattern = "d בMMMM yyyy"): string {
  const date = localDateAtNoon(dateKey);
  return date ? format(date, pattern, { locale: he }) : "תאריך לא ידוע";
}

export function formatSalesRange(range: SalesDateRange): string {
  if (range.start === range.end) return formatSalesDate(range.start);
  const startParts = dateParts(range.start);
  const endParts = dateParts(range.end);
  if (!startParts || !endParts) return "טווח תאריכים לא ידוע";
  if (startParts[0] === endParts[0] && startParts[1] === endParts[1]) {
    return `${formatSalesDate(range.start, "d")} עד ${formatSalesDate(range.end, "d בMMMM yyyy")}`;
  }
  return `${formatSalesDate(range.start, "d בMMMM")} עד ${formatSalesDate(range.end, "d בMMMM yyyy")}`;
}

export function formatSalesPeriodLabel(period: SalesPeriod, range: SalesDateRange): string {
  if (period === "today") return `היום · ${formatSalesDate(range.start, "d בMMMM")}`;
  if (period === "week") return `השבוע · ${formatSalesRange(range)}`;
  if (period === "month") return formatSalesDate(range.start, "MMMM yyyy");
  if (period === "quarter") {
    const [year, month] = dateParts(range.start) || [0, 1, 1];
    return `רבעון ${Math.floor((month - 1) / 3) + 1} · ${year}`;
  }
  if (period === "year") return formatSalesDate(range.start, "yyyy");
  return formatSalesRange(range);
}

function validTime(value: unknown): string | null {
  const candidate = asText(value);
  const match = /^(\d{1,2}):([0-5]\d)/.exec(candidate);
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function validCreatedAt(value: unknown): string | null {
  const candidate = asText(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function rawStatus(value: unknown): SalesStatus {
  const status = asText(value).toLocaleLowerCase("en").replace(/[\s-]+/g, "_");
  if (["requested", "pending"].includes(status)) return "ממתין";
  if (status === "confirmed") return "מאושר";
  if (status === "completed") return "הושלם";
  if (["cancelled", "canceled", "rejected"].includes(status)) return "בוטל";
  if (["no_show", "noshow"].includes(status)) return "לא הגיע";
  return "לא ידוע";
}

function isPastAppointmentDateTime(date: string | null, time: string | null, now: Date): boolean {
  if (!date) return false;
  const clinicNow = partsInClinicTimeZone(now);
  if (date < clinicNow.date) return true;
  if (date > clinicNow.date || !time) return false;
  return `${date}T${time}` <= `${clinicNow.date}T${clinicNow.time}`;
}

export function normalizeSalesAppointments(rawAppointments: unknown, now = new Date()): NormalizedSalesAppointment[] {
  const records = Array.isArray(rawAppointments)
    ? rawAppointments.filter((record): record is Record<string, any> => Boolean(record && typeof record === "object"))
    : [];
  const clientIdByAppointment = new Map<string, string | null>();
  aggregateClients(records).forEach((client) => {
    const reliableClientId = client.key.startsWith("record:") ? null : client.id;
    client.appointments.forEach((record) => {
      const id = asText(record.id);
      if (id) clientIdByAppointment.set(id, reliableClientId);
    });
  });

  return records.map((record) => {
    const id = asText(record.id);
    const date = isSalesDateKey(record.date) ? record.date : null;
    const time = validTime(record.start_time);
    const storedStatus = rawStatus(record.status);
    const status = storedStatus === "מאושר" && isPastAppointmentDateTime(date, time, now)
      ? "ממתין לעדכון"
      : storedStatus;
    const explicitClientId = asText(record.client_id) || asText(record.business_client_id);
    const clientId = (id ? clientIdByAppointment.get(id) : null) || (explicitClientId ? `client:${explicitClientId}` : null);
    const duration = numberValue(record.duration_minutes);
    const species = normalizePetSpecies(record.pet_species);

    return {
      id,
      date,
      time,
      durationMin: duration !== null && duration > 0 ? Math.round(duration) : null,
      clientId,
      clientName: asText(record.client_name) || null,
      phone: asText(record.phone) || null,
      petName: asText(record.pet_name) || null,
      species: species || null,
      // Appointment currently stores the service label, not the ClinicService id.
      serviceId: null,
      serviceName: asText(record.appointment_type) || null,
      status,
      // Source attribution and numeric prices are not stored on appointment records yet.
      source: null,
      createdAt: validCreatedAt(record.created_at),
      price: null,
    };
  });
}

export function getFirstVisitDates(appointments: readonly NormalizedSalesAppointment[]): Map<string, string> {
  const firstVisitDates = new Map<string, string>();
  appointments.forEach((appointment) => {
    if (!appointment.clientId || !appointment.date) return;
    const currentFirstVisit = firstVisitDates.get(appointment.clientId);
    if (!currentFirstVisit || appointment.date < currentFirstVisit) firstVisitDates.set(appointment.clientId, appointment.date);
  });
  return firstVisitDates;
}

export function filterSalesAppointments(
  appointments: readonly NormalizedSalesAppointment[],
  range: SalesDateRange,
  filters: SalesFilters,
  firstVisitDates: ReadonlyMap<string, string>,
  search = "",
): NormalizedSalesAppointment[] {
  const searchTerm = search.trim().toLocaleLowerCase("he");
  return appointments.filter((appointment) => {
    if (!appointment.date || appointment.date < range.start || appointment.date > range.end) return false;
    if (filters.serviceNames.length > 0 && (!appointment.serviceName || !filters.serviceNames.includes(appointment.serviceName))) return false;
    if (filters.status !== "all" && appointment.status !== filters.status) return false;
    if (filters.species === "unknown" && appointment.species !== null) return false;
    if (filters.species !== "all" && filters.species !== "unknown" && appointment.species !== filters.species) return false;

    if (filters.clientType !== "all") {
      if (!appointment.clientId) return false;
      const firstVisitDate = firstVisitDates.get(appointment.clientId);
      if (!firstVisitDate) return false;
      const firstVisitIsInRange = firstVisitDate >= range.start && firstVisitDate <= range.end;
      if (filters.clientType === "new" && !firstVisitIsInRange) return false;
      if (filters.clientType === "returning" && firstVisitDate >= range.start) return false;
    }

    if (searchTerm) {
      const searchable = [appointment.clientName, appointment.phone, appointment.petName, appointment.serviceName, appointment.date, appointment.time]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("he");
      if (!searchable.includes(searchTerm)) return false;
    }
    return true;
  });
}

export function countWorkingDaysInRange(range: SalesDateRange, weeklyAvailability: unknown): number {
  const workingWeekdays = new Set(
    normalizeWeeklyAvailability(weeklyAvailability)
      .filter((day) => day.enabled && day.periods.length > 0)
      .map((day) => day.weekday),
  );
  let count = 0;
  for (let ordinal = dateOrdinal(range.start); ordinal <= dateOrdinal(range.end); ordinal += 1) {
    if (workingWeekdays.has(new Date(ordinal * DAY_MS).getUTCDay())) count += 1;
  }
  return count;
}

export function calculatePeriodMetrics(
  appointments: readonly NormalizedSalesAppointment[],
  range: SalesDateRange,
  firstVisitDates: ReadonlyMap<string, string>,
  weeklyAvailability: unknown,
  options: { hoursAvailable?: boolean; now?: Date } = {},
): SalesPeriodMetrics {
  const now = options.now || new Date();
  const totalAppointments = appointments.length;
  const workingDays = options.hoursAvailable === false ? null : countWorkingDaysInRange(range, weeklyAvailability);
  const averagePerWorkingDay = workingDays === null || workingDays === 0 ? null : totalAppointments / workingDays;
  const cancelledCount = appointments.filter((appointment) => appointment.status === "בוטל").length;
  const noShowCount = appointments.filter((appointment) => appointment.status === "לא הגיע").length;
  const pastAppointments = appointments.filter((appointment) => isPastAppointmentDateTime(appointment.date, appointment.time, now));
  const attendanceCompleted = pastAppointments.filter((appointment) => appointment.status === "הושלם").length;
  const attendanceDenominator = pastAppointments.filter((appointment) => ["הושלם", "לא הגיע", "ממתין לעדכון"].includes(appointment.status)).length;
  const clientIdsInPeriod = new Set(appointments.map((appointment) => appointment.clientId).filter((id): id is string => Boolean(id)));
  const newClients = Array.from(clientIdsInPeriod).filter((clientId) => {
    const firstVisitDate = firstVisitDates.get(clientId);
    return Boolean(firstVisitDate && firstVisitDate >= range.start && firstVisitDate <= range.end);
  }).length;

  return {
    totalAppointments,
    workingDays,
    averagePerWorkingDay,
    attendanceRate: attendanceDenominator > 0 ? (attendanceCompleted / attendanceDenominator) * 100 : null,
    attendanceCompleted,
    attendanceDenominator,
    cancelledCount,
    cancelledRate: totalAppointments > 0 ? (cancelledCount / totalAppointments) * 100 : null,
    noShowCount,
    noShowRate: totalAppointments > 0 ? (noShowCount / totalAppointments) * 100 : null,
    newClients,
  };
}

export function getComparisonChange(current: number | null, previous: number | null, inverse = false): { label: string; tone: SalesComparisonTone } {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return { label: "—", tone: "neutral" };
  }
  const change = current - previous;
  if (change === 0) return { label: "0%", tone: "neutral" };
  const percentage = Math.round((Math.abs(change) / Math.abs(previous)) * 100);
  const isImprovement = inverse ? change < 0 : change > 0;
  return {
    label: `${change > 0 ? "↑" : "↓"} ${percentage}%`,
    tone: isImprovement ? "success" : "danger",
  };
}

export function buildServiceBreakdown(appointments: readonly NormalizedSalesAppointment[]): SalesServiceBreakdownItem[] {
  if (appointments.length === 0) return [];
  const counts = new Map<string, number>();
  appointments.forEach((appointment) => {
    const serviceName = appointment.serviceName || "לא ידוע";
    counts.set(serviceName, (counts.get(serviceName) || 0) + 1);
  });
  return Array.from(counts, ([serviceName, count]) => ({
    serviceName,
    count,
    percentage: (count / appointments.length) * 100,
  })).sort((first, second) => second.count - first.count || first.serviceName.localeCompare(second.serviceName, "he"));
}

function rangeLengthDays(range: SalesDateRange): number {
  return Math.max(1, daysBetween(range.start, range.end));
}

export function getTrendGrouping(range: SalesDateRange): SalesTrendGrouping {
  const length = rangeLengthDays(range);
  if (length <= 62) return "day";
  if (length <= 366) return "week";
  return "month";
}

interface TrendBucket {
  key: string;
  start: string;
  end: string;
  label: string;
  tooltipLabel: string;
}

function makeTrendBuckets(range: SalesDateRange, grouping: SalesTrendGrouping): TrendBucket[] {
  const buckets: TrendBucket[] = [];
  if (grouping === "day") {
    for (let ordinal = dateOrdinal(range.start); ordinal <= dateOrdinal(range.end); ordinal += 1) {
      const date = dateKeyFromOrdinal(ordinal);
      buckets.push({ key: date, start: date, end: date, label: formatSalesDate(date, "d MMM"), tooltipLabel: formatSalesDate(date) });
    }
    return buckets;
  }

  if (grouping === "week") {
    let index = 0;
    for (let ordinal = dateOrdinal(range.start); ordinal <= dateOrdinal(range.end); ordinal += 7) {
      const start = dateKeyFromOrdinal(ordinal);
      const end = dateKeyFromOrdinal(Math.min(ordinal + 6, dateOrdinal(range.end)));
      buckets.push({ key: `week-${index}`, start, end, label: formatSalesDate(start, "d MMM"), tooltipLabel: formatSalesRange({ start, end }) });
      index += 1;
    }
    return buckets;
  }

  let cursor = range.start;
  while (cursor <= range.end) {
    const parts = dateParts(cursor);
    if (!parts) break;
    const endOfMonth = dateKeyFromParts(parts[0], parts[1], lastDayOfMonth(parts[0], parts[1] - 1));
    const end = endOfMonth < range.end ? endOfMonth : range.end;
    buckets.push({ key: cursor.slice(0, 7), start: cursor, end, label: formatSalesDate(cursor, "MMM yyyy"), tooltipLabel: formatSalesRange({ start: cursor, end }) });
    cursor = addCalendarDays(end, 1);
  }
  return buckets;
}

function aggregateTrendBuckets(
  appointments: readonly NormalizedSalesAppointment[],
  range: SalesDateRange,
  grouping: SalesTrendGrouping,
): Array<{ appointments: number; cancellations: number }> {
  const buckets = makeTrendBuckets(range, grouping);
  const bucketIndex = new Map(buckets.map((bucket, index) => [bucket.key, index]));
  const totals = buckets.map(() => ({ appointments: 0, cancellations: 0 }));
  const rangeStartOrdinal = dateOrdinal(range.start);
  appointments.forEach((appointment) => {
    if (!appointment.date) return;
    const key = grouping === "day"
      ? appointment.date
      : grouping === "week"
        ? `week-${Math.floor((dateOrdinal(appointment.date) - rangeStartOrdinal) / 7)}`
        : appointment.date.slice(0, 7);
    const index = bucketIndex.get(key);
    if (index === undefined) return;
    totals[index].appointments += 1;
    if (appointment.status === "בוטל") totals[index].cancellations += 1;
  });
  return totals;
}

export function buildSalesTrend(
  currentAppointments: readonly NormalizedSalesAppointment[],
  previousAppointments: readonly NormalizedSalesAppointment[],
  currentRange: SalesDateRange,
  previousRange: SalesDateRange,
  compare: boolean,
): { grouping: SalesTrendGrouping; points: SalesTrendPoint[] } {
  const grouping = getTrendGrouping(currentRange);
  const currentBuckets = makeTrendBuckets(currentRange, grouping);
  const currentTotals = aggregateTrendBuckets(currentAppointments, currentRange, grouping);
  const previousTotals = compare ? aggregateTrendBuckets(previousAppointments, previousRange, grouping) : [];
  return {
    grouping,
    points: currentBuckets.map((bucket, index) => ({
      label: bucket.label,
      tooltipLabel: bucket.tooltipLabel,
      appointments: currentTotals[index]?.appointments || 0,
      cancellations: currentTotals[index]?.cancellations || 0,
      previousAppointments: compare ? (previousTotals[index]?.appointments ?? null) : null,
    })),
  };
}
