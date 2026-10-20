import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileSpreadsheet,
  MessageSquare,
  PawPrint,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { downloadSalesReport, type SalesExportData, type SalesReportKind } from "@/lib/salesReportExport";
import { formatSalesDate, type SalesDateRange, type SalesStatus } from "@/components/business-crm/salesData";
import type { SalesReportTab } from "@/components/business-crm/SalesTopBar";

export type SalesDetailTab = Exclude<SalesReportTab, "overview">;

export interface SalesAppointmentReportRow {
  key: string;
  date: string;
  time: string;
  clientName: string;
  petName: string;
  species: string;
  serviceName: string;
  status: SalesStatus;
  durationMin: number | null;
}

export interface SalesCustomerReportRow {
  key: string;
  name: string;
  phone: string;
  email: string;
  petNames: string[];
  appointmentCount: number;
  inquiryCount: number;
  activitySources: string[];
  latestActivity: string;
  sortKey: string;
  searchText: string;
}

export interface SalesInquiryReportRow {
  key: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  dateLabel: string;
  sortKey: string;
  handled: boolean;
  archived: boolean;
}

interface SalesDetailReportsProps {
  activeTab: SalesDetailTab;
  range: SalesDateRange;
  search: string;
  appointments: SalesAppointmentReportRow[];
  customers: SalesCustomerReportRow[];
  inquiries: SalesInquiryReportRow[];
  unavailableSources: string[];
  isRetrying: boolean;
  onRetry: () => void;
}

interface ReportColumn<T> {
  key: string;
  label: string;
  className?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  rows: T[];
  columns: ReportColumn<T>[];
  label: string;
  emptyTitle: string;
  emptyBody: string;
  icon: LucideIcon;
  getKey: (row: T, index: number) => string;
  renderMobileCard: (row: T, index: number) => ReactNode;
}

const PAGE_SIZE = 20;
const numberFormatter = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });
const statusOrder: SalesStatus[] = ["ממתין", "מאושר", "הושלם", "בוטל", "לא הגיע", "ממתין לעדכון", "לא ידוע"];

const reportMeta: Record<SalesDetailTab, { title: string; description: string; icon: LucideIcon; kind: SalesReportKind }> = {
  appointments: {
    title: "דוח תורים",
    description: "כל התורים שמועדיהם בתקופה שבחרת, לפי מסנני השירות, הסטטוס, סוג הלקוח וסוג החיה.",
    icon: CalendarDays,
    kind: "appointments",
  },
  services: {
    title: "דוח שירותים",
    description: "מספר התורים לכל שירות ופירוט הסטטוסים שנשמרו ברשומות המרפאה.",
    icon: Stethoscope,
    kind: "services",
  },
  customers: {
    title: "דוח לקוחות",
    description: "לקוחות ייחודיים עם פעילות מתועדת בתקופה, על בסיס תורים, פניות ורשומות לקוח.",
    icon: Users,
    kind: "customers",
  },
  inquiries: {
    title: "דוח פניות",
    description: "פניות האתר לפי מועד יצירתן, כולל סימוני הטיפול והמיקום הנוכחי בתיבת הדואר.",
    icon: MessageSquare,
    kind: "inquiries",
  },
};

function count(value: number): string {
  return numberFormatter.format(value);
}

function compactSearch(value: string): string {
  return value.toLocaleLowerCase("he").replace(/[\s().-]+/g, "");
}

function includesSearch(source: string, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase("he");
  if (!normalizedQuery) return true;
  const normalizedSource = source.toLocaleLowerCase("he");
  const compactQuery = compactSearch(normalizedQuery);
  return normalizedSource.includes(normalizedQuery) || (compactQuery.length >= 3 && compactSearch(normalizedSource).includes(compactQuery));
}

function statusClass(status: SalesStatus): string {
  if (status === "הושלם") return "border-green-200 bg-green-50 text-green-800";
  if (status === "בוטל") return "border-red-200 bg-red-50 text-red-800";
  if (status === "לא הגיע") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "מאושר") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "ממתין") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "ממתין לעדכון") return "border-slate-200 bg-slate-100 text-slate-700";
  return "border-[#E5E7EB] bg-[#F7F8FA] text-slate-600";
}

function StatusBadge({ status }: { status: SalesStatus }) {
  return <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold leading-4 ${statusClass(status)}`}>{status}</span>;
}

function SummaryCard({ title, value, description, icon: Icon }: { title: string; value: string; description: string; icon: LucideIcon }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }} className="min-w-0 rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_-22px_rgba(26,26,62,0.55)]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F2D162]/[0.28] text-[#1A1A3E]"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-[#1A1A3E]">{value}</p>
          <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-400">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}

function ExportActions({ data, title }: { data: SalesExportData; title: string }) {
  const disabled = data.rows.length === 0;
  return (
    <div role="group" aria-label={`הורדת ${title}`} className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => downloadSalesReport(data, "csv")}
        aria-label={`הורדת ${title} כקובץ CSV`}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#D9DEE5] bg-white px-3.5 text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#5267A8] hover:bg-[#FBFCFD] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download className="h-4 w-4 text-[#5267A8]" aria-hidden="true" />CSV
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => downloadSalesReport(data, "xlsx")}
        aria-label={`הורדת ${title} כקובץ Excel`}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-3.5 text-xs font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FileSpreadsheet className="h-4 w-4 text-[#F2D162]" aria-hidden="true" />Excel
      </button>
    </div>
  );
}

function ReportHeader({
  tab,
  range,
  rows,
  countLabel,
}: {
  tab: SalesDetailTab;
  range: SalesDateRange;
  rows: Array<Array<string | number>>;
  countLabel: string;
}) {
  const meta = reportMeta[tab];
  const Icon = meta.icon;
  const exportData: SalesExportData = {
    kind: meta.kind,
    range,
    headers: rows[0]?.map(String) || [],
    rows: rows.slice(1),
  };

  return (
    <header className="flex min-w-0 flex-col gap-4 rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_-22px_rgba(26,26,62,0.55)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F2D162]/[0.3] text-[#1A1A3E]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[#1A1A3E]">{meta.title}</h2>
          <p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-slate-500">{meta.description}</p>
          <p role="status" aria-live="polite" className="mt-2 text-[11px] font-extrabold text-[#5267A8]">{countLabel}</p>
        </div>
      </div>
      <ExportActions data={exportData} title={meta.title} />
    </header>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_10px_30px_-24px_rgba(26,26,62,0.65)]" aria-label={title}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[#EEF0F3] px-4 py-3 sm:px-5">
        <h3 className="text-sm font-extrabold text-[#1A1A3E]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ReportEmpty({ title, body, icon: Icon }: { title: string; body: string; icon: LucideIcon }) {
  return (
    <div className="flex min-h-[190px] flex-col items-center justify-center px-5 py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[#D9DEE5] bg-[#FBFCFD] text-[#7C8795]"><Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" /></span>
      <p className="mt-3 text-sm font-extrabold text-[#1A1A3E]">{title}</p>
      <p className="mt-1 max-w-sm text-xs font-medium leading-5 text-slate-500">{body}</p>
    </div>
  );
}

function DataTable<T>({ rows, columns, label, emptyTitle, emptyBody, icon, getKey, renderMobileCard }: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  if (rows.length === 0) return <ReportEmpty title={emptyTitle} body={emptyBody} icon={icon} />;

  return (
    <>
      <div tabIndex={0} aria-label={`${label}, אפשר לגלול אופקית כדי לראות את כל העמודות`} className="hidden overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F2D162] md:block">
        <table className="w-full min-w-[760px] border-collapse text-right">
          <caption className="sr-only">{label}</caption>
          <thead className="bg-[#F7F8FA] text-[11px] font-extrabold text-slate-500">
            <tr>{columns.map((column) => <th key={column.key} scope="col" className={`whitespace-nowrap px-4 py-3 ${column.className || ""}`}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {pageRows.map((row, index) => (
              <tr key={getKey(row, currentPage * PAGE_SIZE + index)} className="border-t border-[#EEF0F3] text-xs transition-colors hover:bg-[#FBFCFD]">
                {columns.map((column) => <td key={column.key} className={`px-4 py-3.5 align-top font-semibold leading-5 text-slate-700 ${column.className || ""}`}>{column.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-3 md:hidden">
        {pageRows.map((row, index) => <div key={getKey(row, currentPage * PAGE_SIZE + index)}>{renderMobileCard(row, currentPage * PAGE_SIZE + index)}</div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF0F3] px-3 py-3 sm:px-5">
        <p role="status" aria-live="polite" className="text-[11px] font-semibold text-slate-500">
          מציגים {count(currentPage * PAGE_SIZE + 1)}–{count(Math.min((currentPage + 1) * PAGE_SIZE, rows.length))} מתוך {count(rows.length)} רשומות
        </p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} aria-label="העמוד הקודם" className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#D9DEE5] bg-white px-2.5 text-[11px] font-extrabold text-[#1A1A3E] transition hover:bg-[#FBFCFD] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-45"><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />הקודם</button>
          <span className="min-w-[72px] text-center text-[11px] font-bold text-slate-500">{count(currentPage + 1)} / {count(totalPages)}</span>
          <button type="button" disabled={currentPage >= totalPages - 1} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} aria-label="העמוד הבא" className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#D9DEE5] bg-white px-2.5 text-[11px] font-extrabold text-[#1A1A3E] transition hover:bg-[#FBFCFD] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-45">הבא<ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>
      </div>
    </>
  );
}

function ServiceStatusBreakdown({ counts }: { counts: Record<SalesStatus, number> }) {
  return (
    <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
      {statusOrder.map((status) => (
        <span key={status} className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(status)}`}>
          <span>{status}</span><strong className="tabular-nums">{count(counts[status])}</strong>
        </span>
      ))}
    </div>
  );
}

function AppointmentsReport({ rows, range }: { rows: SalesAppointmentReportRow[]; range: SalesDateRange }) {
  const statusCounts = useMemo(() => statusOrder.reduce((result, status) => {
    result[status] = rows.filter((row) => row.status === status).length;
    return result;
  }, {} as Record<SalesStatus, number>), [rows]);
  const exportMatrix: Array<Array<string | number>> = [
    ["תאריך התור", "שעת התחלה", "שם הלקוח", "חיית מחמד", "סוג חיה", "שירות", "סטטוס", "משך בדקות"],
    ...rows.map((row) => [
      row.date ? formatSalesDate(row.date, "d בMMMM yyyy") : "תאריך לא צוין",
      row.time,
      row.clientName,
      row.petName,
      row.species,
      row.serviceName,
      row.status,
      row.durationMin === null ? "" : row.durationMin,
    ]),
  ];
  const columns: ReportColumn<SalesAppointmentReportRow>[] = [
    { key: "date", label: "מועד התור", className: "min-w-[145px]", render: (row) => <div><span className="block font-extrabold text-[#1A1A3E]">{row.date ? formatSalesDate(row.date, "d בMMMM yyyy") : "תאריך לא צוין"}</span><span dir="ltr" className="mt-0.5 block text-right text-[11px] font-bold tabular-nums text-[#5267A8]">{row.time || "שעה לא צוינה"}</span></div> },
    { key: "client", label: "לקוח", render: (row) => <span className="font-extrabold text-[#1A1A3E]">{row.clientName}</span> },
    { key: "pet", label: "חיית מחמד", render: (row) => <div><span className="block font-bold text-[#1A1A3E]">{row.petName}</span><span className="text-[10px] font-semibold text-slate-400">{row.species}</span></div> },
    { key: "service", label: "שירות", render: (row) => row.serviceName },
    { key: "status", label: "סטטוס", render: (row) => <StatusBadge status={row.status} /> },
    { key: "duration", label: "משך", className: "whitespace-nowrap", render: (row) => row.durationMin === null ? "לא צוין" : `${count(row.durationMin)} דק׳` },
  ];
  return (
    <div className="space-y-4">
      <ReportHeader tab="appointments" range={range} rows={exportMatrix} countLabel={`${count(rows.length)} תורים`} />
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="תורים בתקופה" value={count(rows.length)} description="לאחר החלת מסנני התורים." icon={CalendarDays} />
        <SummaryCard title="הושלמו" value={count(statusCounts["הושלם"])} description="סטטוס התור מציין שהושלם." icon={CheckCircle2} />
        <SummaryCard title="בוטלו" value={count(statusCounts["בוטל"])} description="כולל ביטולים שנשמרו במערכת." icon={XCircle} />
        <SummaryCard title="לא הגיעו" value={count(statusCounts["לא הגיע"])} description="תורים שסומנו כאי-הגעה." icon={Clock3} />
      </div>
      <ReportSection title="חלוקה לפי סטטוס">
        <ServiceStatusBreakdown counts={statusCounts} />
      </ReportSection>
      <ReportSection title="רשימת תורים">
        <DataTable
          rows={rows}
          columns={columns}
          label="רשימת תורים לתקופה הנבחרת"
          icon={CalendarDays}
          emptyTitle="אין תורים התואמים לבחירה"
          emptyBody="שני את התקופה או הסירי מסנני תורים כדי לבדוק רשומות נוספות."
          getKey={(row) => row.key}
          renderMobileCard={(row) => <article className="rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_20px_-20px_rgba(26,26,62,0.65)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-extrabold text-[#1A1A3E]">{row.date ? formatSalesDate(row.date, "d בMMMM yyyy") : "תאריך לא צוין"}</p><p dir="ltr" className="mt-1 text-right text-[11px] font-bold tabular-nums text-[#5267A8]">{row.time || "שעה לא צוינה"}</p></div><StatusBadge status={row.status} /></div><div className="mt-3 border-t border-[#EEF0F3] pt-3"><p className="text-sm font-extrabold text-[#1A1A3E]">{row.clientName}</p><p className="mt-1 text-xs font-semibold text-slate-500">{row.petName} · {row.species}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="rounded-lg bg-[#F7F8FA] px-2.5 py-1 text-[11px] font-bold text-slate-600">{row.serviceName}</span><span className="text-[10px] font-semibold text-slate-400">{row.durationMin === null ? "משך לא צוין" : `${count(row.durationMin)} דקות`}</span></div></div></article>}
        />
      </ReportSection>
      <p className="px-1 text-[11px] font-medium leading-5 text-slate-400">המועד בדוח הוא התאריך שבו נקבע התור. תורים שבוטלו נשארים ברשימה ומסומנים בסטטוס.</p>
    </div>
  );
}

interface ServiceReportRow {
  key: string;
  serviceName: string;
  appointmentCount: number;
  statusCounts: Record<SalesStatus, number>;
  averageDuration: number | null;
}

function buildServiceReportRows(appointments: SalesAppointmentReportRow[]): ServiceReportRow[] {
  const groups = new Map<string, { serviceName: string; appointmentCount: number; statusCounts: Record<SalesStatus, number>; durationTotal: number; durationCount: number }>();
  appointments.forEach((appointment) => {
    const serviceName = appointment.serviceName || "סוג שירות לא צוין";
    const current = groups.get(serviceName) || {
      serviceName,
      appointmentCount: 0,
      statusCounts: statusOrder.reduce((result, status) => ({ ...result, [status]: 0 }), {} as Record<SalesStatus, number>),
      durationTotal: 0,
      durationCount: 0,
    };
    current.appointmentCount += 1;
    current.statusCounts[appointment.status] += 1;
    if (appointment.durationMin !== null) {
      current.durationTotal += appointment.durationMin;
      current.durationCount += 1;
    }
    groups.set(serviceName, current);
  });
  return Array.from(groups.values()).map((group) => ({
    key: group.serviceName,
    serviceName: group.serviceName,
    appointmentCount: group.appointmentCount,
    statusCounts: group.statusCounts,
    averageDuration: group.durationCount ? group.durationTotal / group.durationCount : null,
  })).sort((first, second) => second.appointmentCount - first.appointmentCount || first.serviceName.localeCompare(second.serviceName, "he"));
}

function ServicesReport({ appointments, range }: { appointments: SalesAppointmentReportRow[]; range: SalesDateRange }) {
  const services = useMemo(() => buildServiceReportRows(appointments), [appointments]);
  const completed = appointments.filter((row) => row.status === "הושלם").length;
  const cancelled = appointments.filter((row) => row.status === "בוטל").length;
  const noShow = appointments.filter((row) => row.status === "לא הגיע").length;
  const exportMatrix: Array<Array<string | number>> = [
    ["שירות", "מספר תורים", ...statusOrder, "משך ממוצע בדקות"],
    ...services.map((service) => [
      service.serviceName,
      service.appointmentCount,
      ...statusOrder.map((status) => service.statusCounts[status]),
      service.averageDuration === null ? "" : Number(service.averageDuration.toFixed(1)),
    ]),
  ];
  const columns: ReportColumn<ServiceReportRow>[] = [
    { key: "service", label: "שירות", className: "min-w-[180px]", render: (row) => <span className="font-extrabold text-[#1A1A3E]">{row.serviceName}</span> },
    { key: "total", label: "סה״כ", className: "text-center", render: (row) => <span className="font-black text-[#1A1A3E]">{count(row.appointmentCount)}</span> },
    ...statusOrder.map((status) => ({ key: `status-${status}`, label: status, className: "min-w-[92px] text-center", render: (row: ServiceReportRow) => count(row.statusCounts[status]) })),
    { key: "duration", label: "משך ממוצע", className: "min-w-[105px] whitespace-nowrap text-center", render: (row) => row.averageDuration === null ? "לא צוין" : `${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 }).format(row.averageDuration)} דק׳` },
  ];
  const statusTotals = statusOrder.reduce((result, status) => {
    result[status] = appointments.filter((appointment) => appointment.status === status).length;
    return result;
  }, {} as Record<SalesStatus, number>);

  return (
    <div className="space-y-4">
      <ReportHeader tab="services" range={range} rows={exportMatrix} countLabel={`${count(services.length)} שירותים`} />
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="שירותים בתורים" value={count(services.length)} description="שמות שירותים שמופיעים ברשומות התקופה." icon={Stethoscope} />
        <SummaryCard title="תורים משויכים" value={count(appointments.length)} description="לאחר החלת מסנני התורים והחיפוש." icon={CalendarDays} />
        <SummaryCard title="הושלמו" value={count(completed)} description="תורים שסומנו כהושלמו." icon={CheckCircle2} />
        <SummaryCard title="בוטלו או לא הגיעו" value={count(cancelled + noShow)} description={`${count(cancelled)} ביטולים · ${count(noShow)} אי-הגעה`} icon={XCircle} />
      </div>
      <ReportSection title="סטטוסי התורים שנכללו בפילוח">
        <ServiceStatusBreakdown counts={statusTotals} />
      </ReportSection>
      <ReportSection title="תורים לפי שירות">
        <DataTable
          rows={services}
          columns={columns}
          label="פירוט תורים לפי שירות וסטטוס"
          icon={Stethoscope}
          emptyTitle="אין שירותים להצגה בתקופה הזו"
          emptyBody="כשיישמרו תורים בתקופה הנבחרת, הם יופיעו כאן לפי שם השירות."
          getKey={(row) => row.key}
          renderMobileCard={(row) => <article className="rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_20px_-20px_rgba(26,26,62,0.65)]"><div className="flex items-start justify-between gap-3"><h4 className="min-w-0 text-sm font-extrabold leading-5 text-[#1A1A3E]">{row.serviceName}</h4><span className="shrink-0 rounded-full bg-[#1A1A3E] px-2.5 py-1 text-[10px] font-black text-white">{count(row.appointmentCount)} תורים</span></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#EEF0F3] pt-3 sm:grid-cols-3">{statusOrder.map((status) => <div key={status} className="rounded-lg bg-[#F7F8FA] px-2.5 py-2"><p className="text-[10px] font-semibold text-slate-500">{status}</p><p className="mt-0.5 text-xs font-black text-[#1A1A3E]">{count(row.statusCounts[status])}</p></div>)}</div><p className="mt-2 text-[10px] font-semibold text-slate-400">משך ממוצע מתועד: {row.averageDuration === null ? "לא צוין" : `${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 }).format(row.averageDuration)} דקות`}</p></article>}
        />
      </ReportSection>
      <p className="px-1 text-[11px] font-medium leading-5 text-slate-400">הספירות מחושבות משמות השירות שנשמרו בתורים. הדוח מציג פעילות בלבד, ללא מחירים או הכנסות.</p>
    </div>
  );
}

function CustomersReport({ rows, range, search }: { rows: SalesCustomerReportRow[]; range: SalesDateRange; search: string }) {
  const filteredRows = useMemo(() => rows.filter((row) => includesSearch(row.searchText, search)), [rows, search]);
  const appointmentTotal = filteredRows.reduce((total, row) => total + row.appointmentCount, 0);
  const inquiryTotal = filteredRows.reduce((total, row) => total + row.inquiryCount, 0);
  const importedCustomers = filteredRows.filter((row) => row.activitySources.includes("רשומת לקוח")).length;
  const exportMatrix: Array<Array<string | number>> = [
    ["שם לקוח", "טלפון", "אימייל", "חיות מחמד בתורים בתקופה", "תורים בתקופה", "פניות בתקופה", "סוג הפעילות", "פעילות אחרונה בתקופה"],
    ...filteredRows.map((row) => [
      row.name,
      row.phone,
      row.email,
      row.petNames.join(", "),
      row.appointmentCount,
      row.inquiryCount,
      row.activitySources.join(", "),
      row.latestActivity,
    ]),
  ];
  const columns: ReportColumn<SalesCustomerReportRow>[] = [
    { key: "name", label: "לקוח", className: "min-w-[150px]", render: (row) => <span className="font-extrabold text-[#1A1A3E]">{row.name}</span> },
    { key: "contact", label: "פרטי קשר", className: "min-w-[170px]", render: (row) => <div className="space-y-1">{row.phone && <p dir="ltr" className="text-right font-bold tabular-nums text-slate-700">{row.phone}</p>}{row.email && <p dir="ltr" className="break-all text-right text-[10px] font-semibold text-slate-500">{row.email}</p>}{!row.phone && !row.email && <span className="text-slate-400">לא נשמרו פרטי קשר</span>}</div> },
    { key: "pets", label: "חיות מחמד מתורים בתקופה", className: "min-w-[150px]", render: (row) => row.petNames.length ? row.petNames.join(", ") : <span className="text-slate-400">לא צוין</span> },
    { key: "appointments", label: "תורים", className: "text-center", render: (row) => <span className="font-black text-[#1A1A3E]">{count(row.appointmentCount)}</span> },
    { key: "inquiries", label: "פניות", className: "text-center", render: (row) => <span className="font-black text-[#1A1A3E]">{count(row.inquiryCount)}</span> },
    { key: "activity", label: "פעילות בתקופה", className: "min-w-[170px]", render: (row) => <div><div className="flex flex-wrap gap-1">{row.activitySources.map((source) => <span key={source} className="rounded-full bg-[#F2D162]/[0.28] px-2 py-0.5 text-[10px] font-extrabold text-[#5A4A14]">{source}</span>)}</div><p className="mt-1.5 text-[10px] font-semibold text-slate-500">{row.latestActivity}</p></div> },
  ];

  return (
    <div className="space-y-4">
      <ReportHeader tab="customers" range={range} rows={exportMatrix} countLabel={`${count(filteredRows.length)} לקוחות`} />
      <aside aria-label="הסבר על סינון דוח הלקוחות" className="flex items-start gap-2 rounded-xl border border-[#E7D88D] bg-[#FFFDF1] px-3.5 py-3 text-[11px] font-semibold leading-5 text-slate-600 sm:px-4">
        <PawPrint className="mt-0.5 h-4 w-4 shrink-0 text-[#8A6A16]" aria-hidden="true" />
        <p>התקופה כוללת מועד תור, תאריך יצירת פנייה או יצירת רשומת לקוח. מסנני התורים משנים את ספירת התורים בלבד, ולא מסתירים לקוח שיש לו פעילות אחרת בתקופה.</p>
      </aside>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="לקוחות ייחודיים" value={count(filteredRows.length)} description="אחרי איחוד הרשומות לפי כללי ה-CRM." icon={Users} />
        <SummaryCard title="תורים בתקופה" value={count(appointmentTotal)} description="לאחר החלת מסנני התורים." icon={CalendarDays} />
        <SummaryCard title="פניות בתקופה" value={count(inquiryTotal)} description="פניות שאינן באשפה, לפי מועד יצירתן." icon={MessageSquare} />
        <SummaryCard title="רשומות לקוח שנוספו" value={count(importedCustomers)} description="לקוחות עם רשומת CRM שנוצרה בתקופה." icon={Clock3} />
      </div>
      <ReportSection title="לקוחות עם פעילות בתקופה">
        <DataTable
          rows={filteredRows}
          columns={columns}
          label="לקוחות עם פעילות בתקופה הנבחרת"
          icon={Users}
          emptyTitle={search.trim() ? "לא נמצאו לקוחות התואמים לחיפוש" : "אין פעילות לקוחות בתקופה הזו"}
          emptyBody={search.trim() ? "נסי שם, טלפון, כתובת אימייל, שם חיית מחמד או שירות." : "בחרי תקופה אחרת כדי לראות תורים, פניות או רשומות לקוח שנוצרו במועד אחר."}
          getKey={(row) => row.key}
          renderMobileCard={(row) => <article className="rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_20px_-20px_rgba(26,26,62,0.65)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-sm font-extrabold text-[#1A1A3E]">{row.name}</h4><div className="mt-1 space-y-1">{row.phone && <p dir="ltr" className="text-right text-[11px] font-bold tabular-nums text-slate-600">{row.phone}</p>}{row.email && <p dir="ltr" className="break-all text-right text-[10px] font-semibold text-slate-500">{row.email}</p>}</div></div><div className="flex shrink-0 flex-wrap justify-end gap-1">{row.activitySources.map((source) => <span key={source} className="rounded-full bg-[#F2D162]/[0.3] px-2 py-1 text-[10px] font-extrabold text-[#5A4A14]">{source}</span>)}</div></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#EEF0F3] pt-3"><div className="rounded-lg bg-[#F7F8FA] px-2.5 py-2"><p className="text-[10px] font-semibold text-slate-500">תורים בתקופה</p><p className="mt-0.5 text-xs font-black text-[#1A1A3E]">{count(row.appointmentCount)}</p></div><div className="rounded-lg bg-[#F7F8FA] px-2.5 py-2"><p className="text-[10px] font-semibold text-slate-500">פניות בתקופה</p><p className="mt-0.5 text-xs font-black text-[#1A1A3E]">{count(row.inquiryCount)}</p></div></div>{row.petNames.length > 0 && <p className="mt-2 text-[11px] font-semibold text-slate-500">חיות בתורים בתקופה: {row.petNames.join(", ")}</p>}<p className="mt-2 text-[10px] font-semibold text-slate-400">פעילות אחרונה: {row.latestActivity}</p></article>}
        />
      </ReportSection>
    </div>
  );
}

function InquiryStatus({ handled, archived }: { handled: boolean; archived: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${handled ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        {handled ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <Clock3 className="h-3 w-3" aria-hidden="true" />}
        {handled ? "טופלה" : "ממתינה לטיפול"}
      </span>
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${archived ? "border-slate-200 bg-slate-100 text-slate-700" : "border-[#E5E7EB] bg-white text-slate-500"}`}>
        {archived ? "בארכיון" : "בתיבת הדואר"}
      </span>
    </div>
  );
}

function InquiriesReport({ rows, range, search }: { rows: SalesInquiryReportRow[]; range: SalesDateRange; search: string }) {
  const filteredRows = useMemo(() => rows.filter((row) => includesSearch([row.name, row.phone, row.email, row.message, row.dateLabel].join(" "), search)), [rows, search]);
  const handled = filteredRows.filter((row) => row.handled).length;
  const pending = filteredRows.length - handled;
  const archived = filteredRows.filter((row) => row.archived).length;
  const exportMatrix: Array<Array<string | number>> = [
    ["שם הפונה", "טלפון", "אימייל", "מועד יצירת הפנייה", "תוכן הפנייה", "סטטוס טיפול", "מיקום בתיבה"],
    ...filteredRows.map((row) => [row.name, row.phone, row.email, row.dateLabel, row.message, row.handled ? "טופלה" : "ממתינה לטיפול", row.archived ? "בארכיון" : "בתיבת הדואר"]),
  ];
  const columns: ReportColumn<SalesInquiryReportRow>[] = [
    { key: "name", label: "פונה", className: "min-w-[135px]", render: (row) => <span className="font-extrabold text-[#1A1A3E]">{row.name}</span> },
    { key: "contact", label: "פרטי קשר", className: "min-w-[175px]", render: (row) => <div className="space-y-1">{row.phone && <p dir="ltr" className="text-right font-bold tabular-nums text-slate-700">{row.phone}</p>}{row.email && <p dir="ltr" className="break-all text-right text-[10px] font-semibold text-slate-500">{row.email}</p>}{!row.phone && !row.email && <span className="text-slate-400">לא נשמרו פרטי קשר</span>}</div> },
    { key: "message", label: "תוכן הפנייה", className: "min-w-[240px] max-w-[360px]", render: (row) => <p title={row.message || "לא צורף תוכן לפנייה"} className="line-clamp-2 whitespace-pre-wrap break-words text-slate-600">{row.message || "לא צורף תוכן לפנייה"}</p> },
    { key: "date", label: "נוצרה בתאריך", className: "min-w-[155px]", render: (row) => <span className="font-bold text-[#1A1A3E]">{row.dateLabel}</span> },
    { key: "status", label: "מצב בתיבה", className: "min-w-[205px]", render: (row) => <InquiryStatus handled={row.handled} archived={row.archived} /> },
  ];

  return (
    <div className="space-y-4">
      <ReportHeader tab="inquiries" range={range} rows={exportMatrix} countLabel={`${count(filteredRows.length)} פניות`} />
      <aside aria-label="הסבר על מצב הפניות" className="flex items-start gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-3 text-[11px] font-semibold leading-5 text-slate-500 sm:px-4">
        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" aria-hidden="true" />
        <p>התקופה נקבעת לפי תאריך יצירת הפנייה. פניות שהועברו לאשפה אינן נכללות; מצב הטיפול מציג את הסימון הנוכחי בתיבת הדואר.</p>
      </aside>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="פניות בתקופה" value={count(filteredRows.length)} description="לאחר החלת החיפוש." icon={MessageSquare} />
        <SummaryCard title="ממתינות לטיפול" value={count(pending)} description="פניות ללא סימון טיפול שמור." icon={Clock3} />
        <SummaryCard title="סומנו כטופלו" value={count(handled)} description="סימון בתיבת הדואר, לא אישור שנשלח." icon={CheckCircle2} />
        <SummaryCard title="בארכיון" value={count(archived)} description="פניות שאינן באשפה ונמצאות בארכיון." icon={Download} />
      </div>
      <ReportSection title="פניות מהאתר">
        <DataTable
          rows={filteredRows}
          columns={columns}
          label="פניות האתר בתקופה הנבחרת"
          icon={MessageSquare}
          emptyTitle={search.trim() ? "לא נמצאו פניות התואמות לחיפוש" : "אין פניות בתקופה הזו"}
          emptyBody={search.trim() ? "נסי שם, טלפון, אימייל או מילה מתוך תוכן הפנייה." : "הפניות יופיעו כאן לפי תאריך יצירתן, לאחר הסרת רשומות שהועברו לאשפה."}
          getKey={(row) => row.key}
          renderMobileCard={(row) => <article className="rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_20px_-20px_rgba(26,26,62,0.65)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-sm font-extrabold text-[#1A1A3E]">{row.name}</h4><p className="mt-1 text-[10px] font-semibold text-slate-500">נוצרה {row.dateLabel}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-extrabold ${row.handled ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{row.handled ? "טופלה" : "ממתינה"}</span></div><div className="mt-3 space-y-1 border-t border-[#EEF0F3] pt-3">{row.phone && <p dir="ltr" className="text-right text-xs font-bold tabular-nums text-slate-700">{row.phone}</p>}{row.email && <p dir="ltr" className="break-all text-right text-[10px] font-semibold text-slate-500">{row.email}</p>}</div><p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-[#F7F8FA] px-3 py-2 text-xs font-medium leading-5 text-slate-600">{row.message || "לא צורף תוכן לפנייה"}</p><p className="mt-2 text-[10px] font-semibold text-slate-400">{row.archived ? "בארכיון" : "בתיבת הדואר"}</p></article>}
        />
      </ReportSection>
    </div>
  );
}

function ReportSourceError({ sources, retrying, onRetry, title }: { sources: string[]; retrying: boolean; onRetry: () => void; title: string }) {
  return (
    <div role="alert" className="flex min-h-[260px] items-center justify-center rounded-[14px] border border-red-100 bg-white px-5 py-8 text-center shadow-[0_10px_30px_-24px_rgba(26,26,62,0.65)]">
      <div className="max-w-md">
        <ShieldAlert className="mx-auto h-9 w-9 text-red-500" aria-hidden="true" />
        <h3 className="mt-4 text-lg font-extrabold text-[#1A1A3E]">לא הצלחנו להשלים את {title}</h3>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{sources.join(", ")} לא נטענו במלואם. הדוח נשאר מוסתר כדי לא להציג ספירה חלקית כאילו היא מלאה.</p>
        <button type="button" onClick={onRetry} disabled={retrying} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D162] disabled:cursor-wait disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} aria-hidden="true" />{retrying ? "טוען מחדש..." : "נסי שוב"}
        </button>
      </div>
    </div>
  );
}

export function SalesDetailReports({ activeTab, range, search, appointments, customers, inquiries, unavailableSources, isRetrying, onRetry }: SalesDetailReportsProps) {
  const meta = reportMeta[activeTab];
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.section
        key={activeTab}
        id={`sales-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`sales-tab-${activeTab}`}
        tabIndex={0}
        dir="rtl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="mt-5 min-w-0 space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-[#F2D162] focus-visible:ring-offset-4"
      >
        {unavailableSources.length > 0 ? (
          <ReportSourceError sources={unavailableSources} retrying={isRetrying} onRetry={onRetry} title={meta.title} />
        ) : activeTab === "appointments" ? (
          <AppointmentsReport rows={appointments} range={range} />
        ) : activeTab === "services" ? (
          <ServicesReport appointments={appointments} range={range} />
        ) : activeTab === "customers" ? (
          <CustomersReport rows={customers} range={range} search={search} />
        ) : (
          <InquiriesReport rows={inquiries} range={range} search={search} />
        )}
      </motion.section>
    </AnimatePresence>
  );
}
