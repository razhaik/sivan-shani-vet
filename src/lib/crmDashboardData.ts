import { Appointment, BusinessClient, ClientArchive, ContactInquiry } from "@/entities";
import type { CrmRecord } from "@/components/business-crm/CrmContext";
import { buildClientRows, text } from "@/lib/crmClientData";

export const CRM_DASHBOARD_TIME_ZONE = "Asia/Jerusalem";
const DASHBOARD_PAGE_SIZE = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DashboardDateRange {
  today: string;
  start: string;
  end: string;
}

export interface DashboardLeadSummary {
  count: number;
  latest: CrmRecord | null;
}

export interface DashboardClientSummary {
  id: string;
  name: string;
  appointmentCount: number;
  petNames: string[];
  lastActivityTimestamp: number;
  lastActivityLabel: string;
}

export interface DashboardMonthSummary {
  currentCount: number;
  previousCount: number;
  /** Appointments from the 1st of this month through today. */
  currentToDateCount: number;
  /** Appointments in the same span of last month (1st → same day of month). */
  previousToDateCount: number;
  lastFourteenDays: Array<{ dateKey: string; count: number }>;
}

interface DashboardQueryBuilder {
  where: (field: string, value: string | number | boolean | null) => DashboardQueryBuilder;
  gte: (field: string, value: string | number | boolean | null) => DashboardQueryBuilder;
  lte: (field: string, value: string | number | boolean | null) => DashboardQueryBuilder;
  lt: (field: string, value: string | number | boolean | null) => DashboardQueryBuilder;
  sort: (field: string) => DashboardQueryBuilder;
  limit: (value: number) => DashboardQueryBuilder;
  skip: (value: number) => DashboardQueryBuilder;
  exec: () => Promise<unknown>;
}

interface DashboardQueryableEntity {
  query: () => DashboardQueryBuilder;
}

function isRecord(value: unknown): value is CrmRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pageRecords(value: unknown): { records: CrmRecord[]; total: number | null } {
  if (Array.isArray(value)) return { records: value.filter(isRecord), total: null };
  if (!isRecord(value)) return { records: [], total: null };
  const rows = Array.isArray(value.data) ? value.data.filter(isRecord) : [];
  const total = typeof value.total === "number" && Number.isFinite(value.total) ? value.total : null;
  return { records: rows, total };
}

async function fetchAllRecords(
  entity: unknown,
  configureQuery: (query: DashboardQueryBuilder) => DashboardQueryBuilder,
): Promise<CrmRecord[]> {
  const queryable = entity as DashboardQueryableEntity;
  const allRecords: CrmRecord[] = [];
  let offset = 0;

  while (true) {
    const response = await configureQuery(queryable.query())
      .limit(DASHBOARD_PAGE_SIZE)
      .skip(offset)
      .exec();
    const page = pageRecords(response);
    allRecords.push(...page.records);
    const nextOffset = offset + page.records.length;
    const reachedEnd = page.records.length === 0
      || (page.total !== null && nextOffset >= page.total)
      || (page.total === null && page.records.length < DASHBOARD_PAGE_SIZE);
    if (reachedEnd) return allRecords;
    offset = nextOffset;
  }
}

function validDateParts(dateKey: string): [number, number, number] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null;
  return [year, month, day];
}

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getClinicDateKey(value = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: CRM_DASHBOARD_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
    const dateKey = `${part("year")}-${part("month")}-${part("day")}`;
    if (validDateParts(dateKey)) return dateKey;
  } catch {
    // Fall back to the device clock if the clinic timezone is unavailable.
  }
  return dateKeyFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

export function shiftDashboardDate(dateKey: string, days: number): string {
  const parts = validDateParts(dateKey);
  if (!parts) return dateKey;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return dateKeyFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function getDashboardAppointmentRange(now = new Date()): DashboardDateRange {
  const today = getClinicDateKey(now);
  return { today, start: shiftDashboardDate(today, -60), end: shiftDashboardDate(today, 30) };
}

export function getDashboardCalendarDateKeys(today: string, daysForward = 30): string[] {
  return Array.from({ length: daysForward + 1 }, (_, index) => shiftDashboardDate(today, index));
}

function dateAtNoonUtc(dateKey: string): Date | null {
  const parts = validDateParts(dateKey);
  return parts ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0)) : null;
}

export function formatDashboardDate(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  const date = dateAtNoonUtc(dateKey);
  if (!date) return "תאריך לא ידוע";
  return new Intl.DateTimeFormat("he-IL", { timeZone: CRM_DASHBOARD_TIME_ZONE, ...options }).format(date);
}

export function formatDashboardTimestamp(value: unknown): string {
  const timestamp = Date.parse(text(value));
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: CRM_DASHBOARD_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}

export async function fetchDashboardAppointments(startDate: string, endDate: string): Promise<CrmRecord[]> {
  return fetchAllRecords(Appointment, (query) => query
    .gte("date", startDate)
    .lte("date", endDate)
    .sort("date"));
}

export async function fetchDashboardPendingApprovals(): Promise<CrmRecord[]> {
  return fetchAllRecords(Appointment, (query) => query
    .where("status", "requested")
    .sort("-created_at"));
}

function currentMonthBounds(today: string): { start: string; nextStart: string; previousStart: string; previousEnd: string } {
  const [year, month] = validDateParts(today) || [new Date().getFullYear(), new Date().getMonth() + 1, 1];
  const start = dateKeyFromParts(year, month, 1);
  const nextStart = month === 12 ? dateKeyFromParts(year + 1, 1, 1) : dateKeyFromParts(year, month + 1, 1);
  const previousEnd = shiftDashboardDate(start, -1);
  const previousDate = validDateParts(previousEnd)!;
  const previousStart = dateKeyFromParts(previousDate[0], previousDate[1], 1);
  return { start, nextStart, previousStart, previousEnd };
}

function widenedIsoBoundary(dateKey: string, offsetDays: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString();
}

export async function fetchDashboardLeadSummary(now = new Date()): Promise<DashboardLeadSummary> {
  const today = getClinicDateKey(now);
  const bounds = currentMonthBounds(today);
  const records = await fetchAllRecords(ContactInquiry, (query) => query
    .gte("created_at", widenedIsoBoundary(bounds.start, -1))
    .lt("created_at", widenedIsoBoundary(bounds.nextStart, 1))
    .sort("-created_at"));
  const currentMonthRecords = records.filter((record) => {
    if (text(record.inbox_deleted_at)) return false;
    const createdAt = Date.parse(text(record.created_at));
    if (!Number.isFinite(createdAt)) return false;
    const clinicDate = getClinicDateKey(new Date(createdAt));
    return clinicDate >= bounds.start && clinicDate < bounds.nextStart;
  });
  currentMonthRecords.sort((first, second) => text(second.created_at).localeCompare(text(first.created_at)));
  return { count: currentMonthRecords.length, latest: currentMonthRecords[0] || null };
}

export function summarizeDashboardAppointments(records: CrmRecord[], today: string): DashboardMonthSummary {
  const bounds = currentMonthBounds(today);
  const validAppointments = records.filter((record) => {
    const status = text(record.status).toLowerCase();
    return status !== "cancelled" && status !== "canceled";
  });
  const appointmentsOn = (dateKey: string) => validAppointments.filter((record) => text(record.date) === dateKey).length;
  const currentCount = validAppointments.filter((record) => text(record.date) >= bounds.start && text(record.date) < bounds.nextStart).length;
  const previousCount = validAppointments.filter((record) => text(record.date) >= bounds.previousStart && text(record.date) <= bounds.previousEnd).length;
  const lastFourteenDays = Array.from({ length: 14 }, (_, index) => {
    const dateKey = shiftDashboardDate(today, index - 13);
    return { dateKey, count: appointmentsOn(dateKey) };
  });
  // Same-period comparison: 1st of this month → today vs 1st of last month → same day (capped at month end).
  const dayOfMonth = validDateParts(today)?.[2] ?? 1;
  const previousSameDay = shiftDashboardDate(bounds.previousStart, dayOfMonth - 1);
  const previousSamePeriodEnd = previousSameDay > bounds.previousEnd ? bounds.previousEnd : previousSameDay;
  const currentToDateCount = validAppointments.filter((record) => text(record.date) >= bounds.start && text(record.date) <= today).length;
  const previousToDateCount = validAppointments.filter((record) => text(record.date) >= bounds.previousStart && text(record.date) <= previousSamePeriodEnd).length;
  return { currentCount, previousCount, currentToDateCount, previousToDateCount, lastFourteenDays };
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function activityLabel(value: number): string {
  if (!value) return "אין פעילות מתועדת";
  const label = new Intl.DateTimeFormat("he-IL", {
    timeZone: CRM_DASHBOARD_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(new Date(value));
  return `פעילות אחרונה ${label}`;
}

export async function fetchDashboardClientSummaries(): Promise<DashboardClientSummary[]> {
  const [appointments, inquiries, businessClients, archives] = await Promise.all([
    fetchAllRecords(Appointment, (query) => query.sort("date")),
    fetchAllRecords(ContactInquiry, (query) => query.sort("created_at")),
    fetchAllRecords(BusinessClient, (query) => query.sort("created_at")),
    fetchAllRecords(ClientArchive, (query) => query.sort("created_at")),
  ]);

  const archivedIds = new Set(archives.map((record) => text(record.client_key)).filter(Boolean));
  const businessClientById = new Map(businessClients.map((record) => [text(record.id), record]).filter(([id]) => Boolean(id)));

  return buildClientRows(appointments, inquiries, businessClients)
    .filter((row) => row.status !== "lead" && !archivedIds.has(row.id))
    .map((row) => {
      const importedActivity = row.businessClientIds.reduce((latest, id) => {
        const record = businessClientById.get(id);
        return Math.max(latest, timestamp(record?.updated_at), timestamp(record?.created_at));
      }, 0);
      const lastActivityTimestamp = Math.max(row.lastActivityTimestamp, importedActivity);
      return {
        id: row.id,
        name: row.name || "לקוח ללא שם",
        appointmentCount: row.appointmentCount,
        petNames: row.pets.map((pet) => pet.name).filter(Boolean),
        lastActivityTimestamp,
        lastActivityLabel: activityLabel(lastActivityTimestamp),
      };
    })
    .sort((first, second) => second.lastActivityTimestamp - first.lastActivityTimestamp || first.name.localeCompare(second.name, "he"));
}
