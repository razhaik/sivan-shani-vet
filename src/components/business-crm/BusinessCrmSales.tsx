import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Appointment, BusinessClient, ClientArchive, ClinicService, ClinicSettings, ContactInquiry } from "@/entities";
import { SalesOverviewTab } from "@/components/business-crm/SalesOverviewTab";
import { SalesDetailReports, type SalesAppointmentReportRow, type SalesCustomerReportRow, type SalesInquiryReportRow } from "@/components/business-crm/SalesDetailReports";
import { SalesTopBar, type SalesReportTab, type SalesServiceOption } from "@/components/business-crm/SalesTopBar";
import { useCrmContext, type CrmRecord } from "@/components/business-crm/CrmContext";
import { normalizeSavedWeeklyAvailability } from "@/lib/clinicAvailability";
import { buildClientRows, text } from "@/lib/crmClientData";
import {
  filterSalesAppointments,
  formatSalesDate,
  formatSalesPeriodLabel,
  getClinicDateKey,
  getFirstVisitDates,
  getPeriodRange,
  normalizeSalesAppointments,
  SALES_TIME_ZONE,
  type SalesCustomRange,
  type SalesFilters,
  type SalesPeriod,
} from "@/components/business-crm/salesData";

const SALES_PAGE_SIZE = 500;
const CLINIC_ACTIVITY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: SALES_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

interface SalesQueryBuilder {
  sort: (field: string) => SalesQueryBuilder;
  limit: (value: number) => SalesQueryBuilder;
  skip: (value: number) => SalesQueryBuilder;
  exec: () => Promise<unknown>;
}

interface SalesQueryableEntity {
  query: () => SalesQueryBuilder;
}

interface SalesDataSnapshot {
  appointments: CrmRecord[];
  services: CrmRecord[];
  inquiries: CrmRecord[];
  businessClients: CrmRecord[];
  archives: CrmRecord[];
  settings: CrmRecord | null;
  servicesLoadFailed: boolean;
  settingsLoadFailed: boolean;
  inquiriesLoadFailed: boolean;
  businessClientsLoadFailed: boolean;
  archivesLoadFailed: boolean;
}

interface ClinicActivityTime {
  dateKey: string;
  time: string;
  sortKey: string;
  label: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pageData(value: unknown): { rows: CrmRecord[]; total: number | null } {
  if (Array.isArray(value)) return { rows: value.filter(isRecord) as CrmRecord[], total: null };
  if (!isRecord(value)) return { rows: [], total: null };
  const rows = Array.isArray(value.data) ? value.data.filter(isRecord) as CrmRecord[] : [];
  const total = typeof value.total === "number" && Number.isFinite(value.total) ? value.total : null;
  return { rows, total };
}

async function fetchAllRecords(entity: unknown, sortField: string): Promise<CrmRecord[]> {
  const queryable = entity as SalesQueryableEntity;
  const allRows: CrmRecord[] = [];
  let offset = 0;

  while (true) {
    const response = await queryable.query().sort(sortField).limit(SALES_PAGE_SIZE).skip(offset).exec();
    const page = pageData(response);
    allRows.push(...page.rows);
    const nextOffset = offset + page.rows.length;
    const reachedEnd = page.rows.length === 0
      || (page.total !== null && nextOffset >= page.total)
      || (page.total === null && page.rows.length < SALES_PAGE_SIZE);
    if (reachedEnd) return allRows;
    offset = nextOffset;
  }
}

function recordsFromList(value: unknown): CrmRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord) as CrmRecord[];
  if (isRecord(value) && Array.isArray(value.data)) return value.data.filter(isRecord) as CrmRecord[];
  return [];
}

async function loadSalesSnapshot(): Promise<SalesDataSnapshot> {
  const [appointmentsResult, servicesResult, inquiriesResult, businessClientsResult, archivesResult, settingsResult] = await Promise.allSettled([
    fetchAllRecords(Appointment, "date"),
    fetchAllRecords(ClinicService, "sort_order"),
    fetchAllRecords(ContactInquiry, "created_at"),
    fetchAllRecords(BusinessClient, "created_at"),
    fetchAllRecords(ClientArchive, "created_at"),
    ClinicSettings.list("-created_at"),
  ]);

  if (appointmentsResult.status === "rejected") throw appointmentsResult.reason;

  return {
    appointments: appointmentsResult.value,
    services: servicesResult.status === "fulfilled" ? servicesResult.value : [],
    inquiries: inquiriesResult.status === "fulfilled" ? inquiriesResult.value : [],
    businessClients: businessClientsResult.status === "fulfilled" ? businessClientsResult.value : [],
    archives: archivesResult.status === "fulfilled" ? archivesResult.value : [],
    settings: settingsResult.status === "fulfilled" ? recordsFromList(settingsResult.value)[0] || null : null,
    servicesLoadFailed: servicesResult.status === "rejected",
    settingsLoadFailed: settingsResult.status === "rejected",
    inquiriesLoadFailed: inquiriesResult.status === "rejected",
    businessClientsLoadFailed: businessClientsResult.status === "rejected",
    archivesLoadFailed: archivesResult.status === "rejected",
  };
}

function ContentLoading() {
  return (
    <div dir="rtl" role="status" aria-live="polite" className="flex min-h-[260px] items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white px-6 text-center">
      <div>
        <Loader2 aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-[#5267A8]" />
        <p className="mt-4 text-sm font-extrabold text-[#1A1A3E]">טוענת את נתוני הדוחות...</p>
        <p className="mt-1 text-xs font-medium leading-5 text-slate-500">התורים, הפניות ורשומות הלקוחות נטענים מכל העמודים.</p>
      </div>
    </div>
  );
}

function ContentError({ onRetry }: { onRetry: () => void }) {
  return (
    <div dir="rtl" className="flex min-h-[260px] items-center justify-center rounded-2xl border border-red-100 bg-white px-5 text-center">
      <div className="max-w-md">
        <ShieldAlert className="mx-auto h-9 w-9 text-red-500" />
        <h1 className="mt-4 text-lg font-extrabold text-[#1A1A3E]">לא הצלחנו לטעון את נתוני התורים</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">אפשר לנסות שוב. לא נציג נתונים חלקיים כאילו הם תמונת מצב מלאה.</p>
        <button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">
          <RefreshCw className="h-4 w-4" />נסי שוב
        </button>
      </div>
    </div>
  );
}

function initialFilters(): SalesFilters {
  return { serviceNames: [], status: "all", clientType: "all", species: "all" };
}

function serviceOptions(serviceRecords: CrmRecord[], appointmentRecords: CrmRecord[]): SalesServiceOption[] {
  const seen = new Set<string>();
  const choices = [
    ...serviceRecords.map((record) => ({ id: text(record.id), name: text(record.name) })),
    ...appointmentRecords.map((record) => ({ id: "", name: text(record.appointment_type) })),
  ];
  return choices.flatMap((choice) => {
    if (!choice.name || seen.has(choice.name)) return [];
    seen.add(choice.name);
    return [{ id: choice.id || choice.name, name: choice.name }];
  });
}

function clinicActivityTime(value: unknown): ClinicActivityTime | null {
  const stored = text(value);
  if (!stored) return null;
  const date = new Date(stored);
  if (!Number.isFinite(date.getTime())) return null;

  try {
    const parts = CLINIC_ACTIVITY_FORMATTER.formatToParts(date);
    const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
    const dateKey = `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
    const time = `${valueFor("hour")}:${valueFor("minute")}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}$/.test(time)) return null;
    return {
      dateKey,
      time,
      sortKey: `${dateKey}T${time}`,
      label: `${formatSalesDate(dateKey, "d בMMM yyyy")} · ${time}`,
    };
  } catch {
    return null;
  }
}

function clinicAppointmentTime(dateKey: string | null, time: string | null): ClinicActivityTime | null {
  if (!dateKey) return null;
  const normalizedTime = time || "00:00";
  return {
    dateKey,
    time: normalizedTime,
    sortKey: `${dateKey}T${normalizedTime}`,
    label: `${formatSalesDate(dateKey, "d בMMM yyyy")}${time ? ` · ${time}` : ""}`,
  };
}

function withinRange(dateKey: string, range: { start: string; end: string }): boolean {
  return dateKey >= range.start && dateKey <= range.end;
}

function buildInquiryReportRows(records: CrmRecord[], range: { start: string; end: string }): SalesInquiryReportRow[] {
  return records.flatMap((record, index) => {
    if (text(record.inbox_deleted_at)) return [];
    const created = clinicActivityTime(record.created_at);
    if (!created || !withinRange(created.dateKey, range)) return [];
    return [{
      key: text(record.id) || `inquiry-${index}-${created.sortKey}`,
      name: text(record.name) || "שם הפונה לא צוין",
      phone: text(record.phone),
      email: text(record.email),
      message: text(record.message),
      dateLabel: created.label,
      sortKey: created.sortKey,
      handled: Boolean(text(record.inbox_handled_at)),
      archived: Boolean(text(record.inbox_archived_at)),
    }];
  }).sort((first, second) => second.sortKey.localeCompare(first.sortKey));
}

function buildCustomerReportRows(
  appointments: CrmRecord[],
  inquiries: CrmRecord[],
  businessClients: CrmRecord[],
  archiveRecords: CrmRecord[],
  periodAppointments: ReturnType<typeof normalizeSalesAppointments>,
  periodInquiries: CrmRecord[],
  range: { start: string; end: string },
): SalesCustomerReportRow[] {
  const archivedKeys = new Set(archiveRecords.map((record) => text(record.client_key)).filter(Boolean));
  const periodAppointmentIds = new Set(periodAppointments.map((appointment) => appointment.id).filter(Boolean));
  const periodAppointmentRecords = new Set(appointments.filter((record) => periodAppointmentIds.has(text(record.id))));
  const periodInquiryRecords = new Set(periodInquiries);
  const appointmentById = new Map<string, ReturnType<typeof normalizeSalesAppointments>[number]>();
  periodAppointments.forEach((appointment) => appointmentById.set(appointment.id, appointment));
  const businessClientById = new Map<string, CrmRecord>();
  businessClients.forEach((record) => {
    const id = text(record.id);
    if (id) businessClientById.set(id, record);
  });

  return buildClientRows(appointments, inquiries, businessClients)
    .filter((row) => !archivedKeys.has(row.id))
    .flatMap((row) => {
      const rowAppointments = row.appointments.flatMap((record) => {
        if (!periodAppointmentRecords.has(record)) return [];
        const appointment = appointmentById.get(text(record.id));
        return appointment ? [appointment] : [];
      });
      const rowInquiries = row.inquiries.filter((record) => periodInquiryRecords.has(record));
      const rowImports = row.businessClientIds.flatMap((id) => {
        const record = businessClientById.get(id);
        const created = record ? clinicActivityTime(record.created_at) : null;
        return record && created && withinRange(created.dateKey, range) ? [{ record, created }] : [];
      });

      const activities = [
        ...rowAppointments.flatMap((appointment) => {
          const activity = clinicAppointmentTime(appointment.date, appointment.time);
          return activity ? [activity] : [];
        }),
        ...rowInquiries.flatMap((record) => {
          const activity = clinicActivityTime(record.created_at);
          return activity && withinRange(activity.dateKey, range) ? [activity] : [];
        }),
        ...rowImports.map((item) => item.created),
      ].sort((first, second) => second.sortKey.localeCompare(first.sortKey));

      if (activities.length === 0) return [];
      const petNames = Array.from(new Set(rowAppointments.map((appointment) => appointment.petName).filter((name): name is string => Boolean(name))));
      const serviceNames = Array.from(new Set(rowAppointments.map((appointment) => appointment.serviceName).filter((name): name is string => Boolean(name))));
      const activitySources = [
        rowAppointments.length > 0 ? "תורים" : "",
        rowInquiries.length > 0 ? "פניות" : "",
        rowImports.length > 0 ? "רשומת לקוח" : "",
      ].filter(Boolean);
      const name = row.name || "לקוח ללא שם";

      return [{
        key: row.id,
        name,
        phone: row.phone,
        email: row.email,
        petNames,
        appointmentCount: rowAppointments.length,
        inquiryCount: rowInquiries.length,
        activitySources,
        latestActivity: activities[0].label,
        sortKey: activities[0].sortKey,
        searchText: [name, row.phone, row.email, ...petNames, ...serviceNames, ...activitySources].join(" ").toLocaleLowerCase("he"),
      }];
    })
    .sort((first, second) => second.sortKey.localeCompare(first.sortKey) || first.name.localeCompare(second.name, "he"));
}

function speciesLabel(species: "dog" | "cat" | "other" | null): string {
  if (species === "dog") return "כלב";
  if (species === "cat") return "חתול";
  if (species === "other") return "אחר";
  return "לא ידוע";
}

export default function BusinessCrmSales() {
  const { user, search } = useCrmContext();
  const userIdentity = String(user?.id || user?.email || "");
  const [activeTab, setActiveTab] = useState<SalesReportTab>("overview");
  const [period, setPeriod] = useState<SalesPeriod>("month");
  const [customRange, setCustomRange] = useState<SalesCustomRange>(() => {
    const today = getClinicDateKey();
    return { start: today, end: today };
  });
  const [compare, setCompare] = useState(false);
  const [filters, setFilters] = useState<SalesFilters>(initialFilters);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const snapshotQuery = useQuery<SalesDataSnapshot>({
    queryKey: ["business-crm", "sales-report-snapshot", userIdentity],
    enabled: Boolean(userIdentity),
    queryFn: loadSalesSnapshot,
  });
  const snapshot = snapshotQuery.data;
  const rawAppointments = snapshot?.appointments || [];
  const rawInquiries = snapshot?.inquiries || [];
  const rawBusinessClients = snapshot?.businessClients || [];
  const rawArchives = snapshot?.archives || [];
  const services = useMemo(() => serviceOptions(snapshot?.services || [], rawAppointments), [rawAppointments, snapshot?.services]);
  const normalizedAppointments = useMemo(() => normalizeSalesAppointments(rawAppointments, now), [now, rawAppointments]);
  const firstVisitDates = useMemo(() => getFirstVisitDates(normalizedAppointments), [normalizedAppointments]);
  const ranges = useMemo(() => getPeriodRange(period, customRange, now), [customRange, now, period]);
  const currentAppointments = useMemo(
    () => filterSalesAppointments(normalizedAppointments, ranges.current, filters, firstVisitDates, search),
    [filters, firstVisitDates, normalizedAppointments, ranges.current, search],
  );
  const previousAppointments = useMemo(
    () => filterSalesAppointments(normalizedAppointments, ranges.previous, filters, firstVisitDates, search),
    [filters, firstVisitDates, normalizedAppointments, ranges.previous, search],
  );
  const periodCustomerAppointments = useMemo(
    () => filterSalesAppointments(normalizedAppointments, ranges.current, filters, firstVisitDates),
    [filters, firstVisitDates, normalizedAppointments, ranges.current],
  );
  const periodInquiryRecords = useMemo(() => rawInquiries.filter((record) => {
    if (text(record.inbox_deleted_at)) return false;
    const created = clinicActivityTime(record.created_at);
    return Boolean(created && withinRange(created.dateKey, ranges.current));
  }), [ranges.current, rawInquiries]);
  const appointmentReportRows = useMemo<SalesAppointmentReportRow[]>(() => currentAppointments.map((appointment, index) => ({
    key: appointment.id || `appointment-${index}-${appointment.date || "unknown"}`,
    date: appointment.date || "",
    time: appointment.time || "",
    clientName: appointment.clientName || "שם הלקוח לא צוין",
    petName: appointment.petName || "לא צוין",
    species: speciesLabel(appointment.species),
    serviceName: appointment.serviceName || "סוג השירות לא צוין",
    status: appointment.status,
    durationMin: appointment.durationMin,
  })), [currentAppointments]);
  const inquiryReportRows = useMemo(
    () => buildInquiryReportRows(rawInquiries, ranges.current),
    [ranges.current, rawInquiries],
  );
  const customerReportRows = useMemo(
    () => buildCustomerReportRows(
      rawAppointments,
      rawInquiries,
      rawBusinessClients,
      rawArchives,
      periodCustomerAppointments,
      periodInquiryRecords,
      ranges.current,
    ),
    [periodCustomerAppointments, periodInquiryRecords, ranges.current, rawAppointments, rawArchives, rawBusinessClients, rawInquiries],
  );
  const rangeLabel = formatSalesPeriodLabel(period, ranges.current);
  const settings = snapshot?.settings;
  const weeklyAvailability = settings?.weekly_availability;
  const hoursAvailable = normalizeSavedWeeklyAvailability(weeklyAvailability) !== null;

  if (snapshotQuery.isLoading || (snapshotQuery.isFetching && !snapshot)) return <ContentLoading />;
  if (snapshotQuery.isError || !snapshot) return <ContentError onRetry={() => { void snapshotQuery.refetch(); }} />;

  const customerUnavailableSources = [
    ...(snapshot.inquiriesLoadFailed ? ["הפניות"] : []),
    ...(snapshot.businessClientsLoadFailed ? ["רשומות הלקוחות"] : []),
    ...(snapshot.archivesLoadFailed ? ["סימוני הארכיון"] : []),
  ];
  const reportAppointments = activeTab === "appointments" || activeTab === "services" ? appointmentReportRows : [];
  const reportCustomers = activeTab === "customers" ? customerReportRows : [];
  const reportInquiries = activeTab === "inquiries" ? inquiryReportRows : [];
  const incompleteNotice = activeTab === "inquiries"
    ? null
    : [
      snapshot.servicesLoadFailed ? "קטלוג השירותים לא נטען. רשימת המסנן מבוססת גם על שמות השירות שנשמרו בתורים." : "",
      activeTab === "overview" && snapshot.settingsLoadFailed ? "שעות הפעילות לא נטענו, ולכן ממוצע התורים ליום עבודה אינו זמין." : "",
    ].filter(Boolean).join(" ");

  return (
    <div dir="rtl" className="min-w-0 max-w-full">
      <SalesTopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        period={period}
        onPeriodChange={setPeriod}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        compare={compare}
        onCompareChange={setCompare}
        filters={filters}
        onFiltersChange={setFilters}
        services={services}
        rangeLabel={rangeLabel}
      />
      {incompleteNotice && (
        <p role="status" className="mt-4 rounded-xl border border-[#EEF0F3] bg-white px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
          {incompleteNotice}
        </p>
      )}
      {activeTab === "overview" ? (
        <section id="sales-panel-overview" role="tabpanel" aria-labelledby="sales-tab-overview" tabIndex={0} className="mt-5 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-[#F2D162] focus-visible:ring-offset-4">
          <SalesOverviewTab
            appointments={currentAppointments}
            previousAppointments={previousAppointments}
            currentRange={ranges.current}
            previousRange={ranges.previous}
            compare={compare}
            firstVisitDates={firstVisitDates}
            weeklyAvailability={weeklyAvailability}
            hoursAvailable={hoursAvailable && !snapshot.settingsLoadFailed}
            now={now}
            settingsUnavailable={snapshot.settingsLoadFailed}
          />
        </section>
      ) : (
        <SalesDetailReports
          activeTab={activeTab}
          range={ranges.current}
          search={search}
          appointments={reportAppointments}
          customers={reportCustomers}
          inquiries={reportInquiries}
          unavailableSources={activeTab === "inquiries"
            ? (snapshot.inquiriesLoadFailed ? ["הפניות מהאתר"] : [])
            : activeTab === "customers" ? customerUnavailableSources : []}
          isRetrying={snapshotQuery.isFetching}
          onRetry={() => { void snapshotQuery.refetch(); }}
        />
      )}
    </div>
  );
}
