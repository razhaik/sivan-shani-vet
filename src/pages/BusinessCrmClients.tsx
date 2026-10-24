import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  ListChecks,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Send,
  Settings2,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { useCrmContext, type CrmDataLoadProgress } from "@/components/business-crm/CrmContext";
import { formatCount } from "@/components/business-crm/bento-ui";
import { BusinessClient, ClientListPreference } from "@/entities";
import { SEO } from "@/components/SEO";
import { ClientsTable, clientColumns, type ClientColumnKey, type ClientSortKey } from "@/components/business-crm/ClientsTable";
import BulkEmailComposer, { type BulkEmailResult } from "@/components/business-crm/BulkEmailComposer";
import BulkSmsComposer, { type BulkSmsClient, type BulkSmsResult } from "@/components/dashboard-mobile/BulkSmsComposer";
import { ClientImportExportModal, type ImportExportMode } from "@/components/business-crm/ClientImportExportModal";
import CreateClientDialog, { type CreateClientPayload } from "@/components/business-crm/CreateClientDialog";
import { saveClientImportPlan } from "@/lib/clientImportPersistence";
import { isValidClientPhone, normalizeClientPhone } from "@/lib/clientAggregation";
import {
  buildClientRows,
  rowHasSpecies,
  text,
  type ClientRow,
  type CrmRecord,
} from "@/lib/crmClientData";
import {
  clientRowHasHistory,
  isImportedOnlyClientRow,
  processClientRows,
  type ClientActionSummary,
} from "@/lib/clientActions";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";
import { useIsMobile } from "@/hooks/use-mobile";
type SegmentKey = "all" | "leads" | "future" | "quotes" | "payments";
type ActivityFilter = "all" | "7" | "30" | "90" | "older";
type MobileQuickFilter = "all" | "new" | "today";
type StatusFilter = "all" | "new" | "active" | "lead" | "imported";
type SpeciesFilter = "all" | "dog" | "cat" | "other" | "unknown";
type SelectionFeedback = { kind: "success" | "error"; text: string; details?: string };
type ClientSortDirection = "asc" | "desc";
type DisplayPreferenceSnapshot = { columns: ClientColumnKey[]; rowsPerPage: number; sortKey: ClientSortKey; sortDirection: ClientSortDirection };
type DisplayPreferenceStatus = "idle" | "loading" | "saving" | "saved" | "error" | "load-error";

const DEFAULT_VISIBLE_COLUMNS: ClientColumnKey[] = ["client", "lastActivity", "email", "phone", "status", "tags", "team"];
const SUPPORTED_ROWS_PER_PAGE = [20, 50, 100] as const;
const DEFAULT_SORT_KEY: ClientSortKey = "name";
const DEFAULT_SORT_DIRECTION: ClientSortDirection = "asc";

function normalizeSortKey(value: unknown): ClientSortKey {
  return value === "lastActivity" || value === "appointments" ? value : DEFAULT_SORT_KEY;
}

function normalizeSortDirection(value: unknown): ClientSortDirection {
  return value === "desc" ? "desc" : DEFAULT_SORT_DIRECTION;
}

function normalizeSortPreference(sortKeyValue: unknown, sortDirectionValue: unknown): Pick<DisplayPreferenceSnapshot, "sortKey" | "sortDirection"> {
  const hasValidKey = sortKeyValue === "name" || sortKeyValue === "lastActivity" || sortKeyValue === "appointments";
  const hasValidDirection = sortDirectionValue === "asc" || sortDirectionValue === "desc";
  if (!hasValidKey || !hasValidDirection) return { sortKey: DEFAULT_SORT_KEY, sortDirection: DEFAULT_SORT_DIRECTION };
  return { sortKey: normalizeSortKey(sortKeyValue), sortDirection: normalizeSortDirection(sortDirectionValue) };
}

function firstPreferenceRecord(value: unknown): CrmRecord | null {
  if (!Array.isArray(value)) return null;
  const record = value.find((entry) => entry && typeof entry === "object");
  return record ? record as CrmRecord : null;
}

function normalizeVisibleColumns(value: unknown): ClientColumnKey[] {
  if (!Array.isArray(value)) return [...DEFAULT_VISIBLE_COLUMNS];
  const allowed = new Set(clientColumns.map((column) => column.key));
  const normalized = value.filter((entry): entry is ClientColumnKey => typeof entry === "string" && allowed.has(entry as ClientColumnKey)).filter((entry, index, entries) => entries.indexOf(entry) === index);
  if (!normalized.length) return [...DEFAULT_VISIBLE_COLUMNS];
  return normalized.includes("client") ? normalized : ["client", ...normalized];
}

function normalizeRowsPerPage(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && SUPPORTED_ROWS_PER_PAGE.includes(value as typeof SUPPORTED_ROWS_PER_PAGE[number]) ? value : 20;
}

const DISPLAY_PREFERENCE_CACHE_VERSION = 1;
const DISPLAY_PREFERENCE_CACHE_PREFIX = `crm-client-display-preference:v${DISPLAY_PREFERENCE_CACHE_VERSION}:`;

function displayPreferenceCacheKey(userIdentity: string): string | null {
  if (!userIdentity) return null;
  try {
    return `${DISPLAY_PREFERENCE_CACHE_PREFIX}${encodeURIComponent(userIdentity)}`;
  } catch {
    return null;
  }
}

function readCachedDisplayPreference(userIdentity: string): DisplayPreferenceSnapshot | null {
  const key = displayPreferenceCacheKey(userIdentity);
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const rawColumns = record.visible_columns;
    const rawRowsPerPage = record.rows_per_page;
    if (record.version !== DISPLAY_PREFERENCE_CACHE_VERSION || !Array.isArray(rawColumns)) return null;
    if (typeof rawRowsPerPage !== "number" || !Number.isFinite(rawRowsPerPage) || !SUPPORTED_ROWS_PER_PAGE.includes(rawRowsPerPage as typeof SUPPORTED_ROWS_PER_PAGE[number])) return null;
    const allowed = new Set(clientColumns.map((column) => column.key));
    if (!rawColumns.some((entry) => typeof entry === "string" && allowed.has(entry as ClientColumnKey))) return null;
    return {
      columns: normalizeVisibleColumns(rawColumns),
      rowsPerPage: normalizeRowsPerPage(rawRowsPerPage),
      ...normalizeSortPreference(record.sort_key, record.sort_direction),
    };
  } catch {
    return null;
  }
}

function writeCachedDisplayPreference(userIdentity: string, snapshot: DisplayPreferenceSnapshot): void {
  const key = displayPreferenceCacheKey(userIdentity);
  if (!key || typeof window === "undefined") return;
  try {
    const normalized = {
      columns: normalizeVisibleColumns(snapshot.columns),
      rowsPerPage: normalizeRowsPerPage(snapshot.rowsPerPage),
      ...normalizeSortPreference(snapshot.sortKey, snapshot.sortDirection),
    };
    window.localStorage.setItem(key, JSON.stringify({
      version: DISPLAY_PREFERENCE_CACHE_VERSION,
      visible_columns: normalized.columns,
      rows_per_page: normalized.rowsPerPage,
      sort_key: normalized.sortKey,
      sort_direction: normalized.sortDirection,
    }));
  } catch {
    // Browser storage can be unavailable or privacy-restricted. The server preference remains authoritative.
  }
}

function clientSearchText(row: ClientRow): string {
  const pets = Array.isArray(row.pets) ? row.pets : [];
  const additionalFields = Array.isArray(row.additionalFields) ? row.additionalFields : [];
  return [
    row.name,
    row.firstName,
    row.lastName,
    row.nationalId,
    row.email,
    row.phone,
    row.mobilePhone,
    row.homePhone,
    row.address,
    row.city,
    row.postalCode,
    ...pets.flatMap((pet) => [pet.name, pet.species]),
    ...additionalFields.flatMap((field) => [field.key, field.label, field.value]),
  ]
    .map((value) => text(value))
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("he")
    .replace(/\s+/g, " ")
    .trim();
}

function isInboxRecord(record: CrmRecord): boolean {
  return !text(record.inbox_deleted_at) && !text(record.inbox_archived_at);
}

function isOpenRequestedAppointment(record: CrmRecord): boolean {
  return text(record.status).toLowerCase() === "requested" && isInboxRecord(record);
}

function isUnhandledInboxInquiry(record: CrmRecord): boolean {
  return !text(record.inbox_handled_at) && isInboxRecord(record);
}

function isPendingInboxReschedule(record: CrmRecord): boolean {
  return text(record.status).toLowerCase() === "pending" && isInboxRecord(record);
}

function clinicDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VETERINARY_CLINIC_PROFILE.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function ClientDataProgress({ progress, compact = false }: { progress: CrmDataLoadProgress; compact?: boolean }) {
  const total = Math.max(0, progress.total);
  const completed = total > 0 ? Math.min(Math.max(progress.completed, 0), total) : 0;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isError = progress.status === "error";
  const isComplete = progress.status === "complete";
  const statusLabel = total > 0
    ? `הושלמו ${completed.toLocaleString("he-IL")} מתוך ${total.toLocaleString("he-IL")} שלבי טעינה`
    : "מתכוננת לטעינת הנתונים";
  const receivedLabel = typeof progress.receivedCount === "number" && progress.receivedLabel
    ? `התקבלו ${progress.receivedCount.toLocaleString("he-IL")} רשומות מ${progress.receivedLabel}`
    : "המספרים מתעדכנים לאחר קבלת כל מקור נתונים";

  return (
    <div dir="rtl" className={`rounded-2xl border ${isError ? "border-red-100 bg-[#FFF8F8]" : "border-[#E5E7EB] bg-white"} ${compact ? "px-4 py-3" : "px-5 py-6 sm:px-7 sm:py-8"}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isError ? "bg-red-100 text-red-600" : isComplete ? "bg-[#E8F2EA] text-[#2C6A3B]" : "bg-[#EEF1FB] text-[#5267A8]"}`}>
          {isError ? <AlertTriangle className="h-5 w-5" /> : isComplete ? <CheckCircle2 className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
        <div className="min-w-0 flex-1">
          <p role={isError ? "alert" : "status"} aria-live="polite" className="text-sm font-black text-[#1A1A3E]">{progress.stage}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-slate-500">
            <span>{statusLabel}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>{receivedLabel}</span>
          </div>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="התקדמות טעינת נתוני הלקוחות"
        aria-valuemin={0}
        aria-valuemax={total > 0 ? total : undefined}
        aria-valuenow={total > 0 ? completed : undefined}
        aria-valuetext={total > 0 ? `${completed} מתוך ${total}` : "מתכוננת לטעינה"}
        className={`mt-4 h-2.5 overflow-hidden rounded-full ${isError ? "bg-red-100" : "bg-[#EEF0F3]"}`}
      >
        <div className={`h-full rounded-full transition-[width] duration-300 ${isError ? "bg-red-500" : isComplete ? "bg-[#2C6A3B]" : "bg-[#5267A8]"}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function ContentLoading({ progress }: { progress: CrmDataLoadProgress }) {
  return <div dir="rtl" className="flex min-h-[260px] items-center justify-center rounded-2xl border border-[#E5E7EB] bg-[#FBFCFD] px-4"><div className="w-full max-w-2xl"><ClientDataProgress progress={progress} /></div></div>;
}

function RefreshErrorBanner({ onRetry }: { onRetry: () => void | Promise<void> }) {
  return (
    <div role="alert" dir="rtl" className="flex flex-col gap-3 rounded-2xl border border-red-100 bg-[#FFF8F8] px-4 py-3 text-sm font-bold text-red-700 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>הרענון לא הושלם. הנתונים האחרונים שהתקבלו עדיין מוצגים, ואפשר לנסות שוב.</p>
      </div>
      <button type="button" onClick={() => void onRetry()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-red-200 bg-white px-3 text-xs font-extrabold text-red-700 transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162] sm:self-auto">
        <RefreshCw className="h-3.5 w-3.5" />
        נסי שוב
      </button>
    </div>
  );
}

function ContentError({ onRetry }: { onRetry: () => void }) {
  return <div dir="rtl" className="flex min-h-[260px] items-center justify-center rounded-2xl border border-red-100 bg-white px-5 text-center"><div className="max-w-md"><Users className="mx-auto h-9 w-9 text-red-500" /><h1 className="mt-4 text-lg font-extrabold text-[#1A1A3E]">לא הצלחנו לטעון את הלקוחות</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">אפשר לנסות שוב. אם הבעיה נמשכת, חזרי למערכת התורים הקיימת.</p><button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><RefreshCw className="h-4 w-4" />נסי שוב</button></div></div>;
}

function BentoClientProgress({ progress, compact = false }: { progress: CrmDataLoadProgress; compact?: boolean }) {
  const total = Math.max(0, progress.total);
  const completed = total > 0 ? Math.min(Math.max(progress.completed, 0), total) : 0;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isError = progress.status === "error";
  const isComplete = progress.status === "complete";
  const received = typeof progress.receivedCount === "number" && progress.receivedLabel
    ? `${progress.receivedCount.toLocaleString("he-IL")} רשומות התקבלו מ${progress.receivedLabel}`
    : "המספרים מתעדכנים לאחר קבלת המקורות";
  const Icon = isError ? AlertTriangle : isComplete ? CheckCircle2 : Loader2;

  return (
    <section className={`client-state-card${compact ? " client-state-card--compact" : ""}${isError ? " is-error" : ""}`} role={isError ? "alert" : "status"} aria-live="polite" aria-busy={!isError && !isComplete}>
      <span className="client-state-icon"><Icon className={!isError && !isComplete ? "animate-spin" : ""} aria-hidden="true" /></span>
      <div className="client-state-copy">
        <span className="client-state-label">{compact ? "עדכון הרשימה" : "טעינת נתוני המרפאה"}</span>
        <strong>{progress.stage}</strong>
        <p>{total > 0 ? `${completed.toLocaleString("he-IL")} מתוך ${total.toLocaleString("he-IL")} שלבים הושלמו` : "מתכוננת לטעינת הנתונים"} · {received}</p>
      </div>
      <div className="client-state-progress-track" role="progressbar" aria-label="התקדמות טעינת נתוני הלקוחות" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={completed} aria-valuetext={total > 0 ? `${completed} מתוך ${total}` : "מתכוננת לטעינה"}>
        <span style={{ width: `${percentage}%` }} />
      </div>
    </section>
  );
}

function BentoClientLoadError({ onRetry }: { onRetry: () => void | Promise<void> }) {
  return (
    <section className="client-state-card is-error" role="alert" dir="rtl">
      <span className="client-state-icon"><AlertTriangle aria-hidden="true" /></span>
      <div className="client-state-copy">
        <span className="client-state-label">הנתונים לא נטענו</span>
        <strong>לא הצלחנו לטעון את הלקוחות</strong>
        <p>אפשר לנסות שוב. אם הבעיה נמשכת, הנתונים במערכת התורים נשארים זמינים.</p>
      </div>
      <button type="button" className="client-state-retry" onClick={() => void onRetry()}><RefreshCw aria-hidden="true" />נסי שוב</button>
    </section>
  );
}

function BentoClientRefreshError({ onRetry }: { onRetry: () => void | Promise<void> }) {
  return (
    <div className="client-refresh-error" role="alert" dir="rtl">
      <AlertTriangle aria-hidden="true" />
      <p>הרענון לא הושלם. הנתונים האחרונים שהתקבלו עדיין מוצגים.</p>
      <button type="button" onClick={() => void onRetry()}><RefreshCw aria-hidden="true" />נסי שוב</button>
    </div>
  );
}

function SelectField({ value, onChange, label, children }: { value: string; onChange: (value: string) => void; label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-extrabold text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-xs font-bold text-[#1A1A3E] outline-none transition focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]">{children}</select></label>;
}

function DisplayPreferenceStatus({ status }: { status: DisplayPreferenceStatus }) {
  if (status === "idle") return null;
  const isError = status === "error" || status === "load-error";
  const Icon = status === "loading" || status === "saving" ? Loader2 : status === "saved" ? CheckCircle2 : AlertTriangle;
  const message = status === "loading" ? "טוענת את ההעדפה השמורה..." : status === "saving" ? "שומרת את השינויים..." : status === "saved" ? "נשמר אוטומטית" : status === "load-error" ? "לא ניתן היה לטעון את ההעדפה השמורה. התצוגה הנוכחית נשארת זמינה." : "השמירה נכשלה. הבחירה הנוכחית נשמרה במסך, אפשר לנסות שוב.";
  return <p role={isError ? "alert" : "status"} aria-live="polite" className={`mt-3 flex items-start gap-1.5 text-[11px] font-bold leading-5 ${isError ? "text-red-600" : status === "saved" ? "text-emerald-700" : "text-[#5267A8]"}`}><Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${status === "loading" || status === "saving" ? "animate-spin" : ""}`} />{message}</p>;
}

function DisplaySettingsDialog({ open, columns, rowsPerPage, preferenceStatus, onToggle, onRowsPerPageChange, onClose }: { open: boolean; columns: ClientColumnKey[]; rowsPerPage: number; preferenceStatus: DisplayPreferenceStatus; onToggle: (key: ClientColumnKey) => void; onRowsPerPageChange: (value: number) => void; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#1A1A3E]/[0.35] p-3 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div id="display-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="display-settings-title" aria-describedby="display-settings-description" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-2xl" dir="rtl"><div className="flex items-start justify-between gap-3"><div><h2 id="display-settings-title" className="text-lg font-black text-[#1A1A3E]">הגדרות תצוגה</h2><p id="display-settings-description" className="mt-1 text-xs font-medium leading-5 text-slate-500">בחרי אילו עמודות יוצגו בטבלה במסך רחב וכמה שורות יופיעו בכל עמוד. רשימת הטלפונים שומרת על פרטי קשר ופעילות תמציתיים. השינויים נשמרים אוטומטית ויישארו בביקור הבא שלך.</p><p className="mt-2 rounded-lg bg-[#F7F8FA] px-3 py-2 text-[11px] font-medium leading-5 text-slate-500 md:hidden">בחירת העמודות משנה רק את הטבלה במחשב. פרטי השורה ברשימת הטלפון נשארים קבועים, ומספר השורות בעמוד ממשיך להשתנות לפי ההגדרה למטה.</p><DisplayPreferenceStatus status={preferenceStatus} /></div><button type="button" onClick={onClose} autoFocus className="rounded-xl p-2 text-slate-400 hover:bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#F2D162]" aria-label="סגירת הגדרות תצוגה"><X className="h-5 w-5" /></button></div><fieldset className="mt-5"><legend className="text-sm font-black text-[#1A1A3E]">עמודות שיוצגו</legend><p className="mt-1 text-xs font-medium leading-5 text-slate-500">אפשר להציג או להסתיר כל שדה אמיתי. עמודת הלקוח מוצגת תמיד כדי לפתוח את כרטיס הלקוח.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{clientColumns.map((column) => <label key={column.key} className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-xs font-extrabold transition ${columns.includes(column.key) ? "border-[#F2D162] bg-[#FFFBEA] text-[#1A1A3E]" : "border-[#EEF0F3] text-slate-500"}`}><input type="checkbox" checked={columns.includes(column.key)} disabled={column.required} onChange={() => onToggle(column.key)} aria-label={`${column.label}${column.required ? ", עמודה חובה" : ""}`} className="h-4 w-4 rounded border-slate-300 accent-[#1A1A3E] focus:ring-[#F2D162]" />{column.label}{column.required && <span className="mr-auto text-[10px] text-slate-400">חובה</span>}</label>)}</div></fieldset><div className="mt-5 rounded-2xl border border-[#E5E7EB] bg-[#FBFCFD] p-4"><label className="flex items-center justify-between gap-4"><span><span className="block text-sm font-black text-[#1A1A3E]">מספר שורות בעמוד</span><span className="mt-1 block text-xs font-medium leading-5 text-slate-500">השינוי מחזיר אותך לעמוד הראשון ברשימת הלקוחות.</span></span><select value={rowsPerPage} onChange={(event) => onRowsPerPageChange(Number(event.target.value))} aria-label="מספר שורות בעמוד" className="h-10 shrink-0 rounded-xl border border-[#D9DEE5] bg-white px-3 text-xs font-bold text-[#1A1A3E] outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]"><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label></div><div className="mt-5 flex justify-start"><button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">סגירה</button></div></div></div>;
}

function SafeClientActionDialog({ open, selectedCount, importedOnlyCount, historyCount, isProcessing, onClose, onConfirm }: { open: boolean; selectedCount: number; importedOnlyCount: number; historyCount: number; isProcessing: boolean; onClose: () => void; onConfirm: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isProcessing) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isProcessing, onClose, open]);

  if (!open) return null;
  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#1A1A3E]/[0.48] p-3 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !isProcessing) onClose(); }}><div role="dialog" aria-modal="true" aria-labelledby="safe-client-action-title" aria-describedby="safe-client-action-description" aria-busy={isProcessing} dir="rtl" className="w-full max-w-lg rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF4CF] text-[#69550C]"><AlertTriangle className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 id="safe-client-action-title" className="text-lg font-black text-[#1A1A3E]">מחיקה או הסתרה בטוחה</h2><p id="safe-client-action-description" className="mt-1 text-xs font-medium leading-5 text-slate-500">בחרת {selectedCount} {selectedCount === 1 ? "לקוח" : "לקוחות"}. המערכת תבצע פעולה לפי מקור הרשומה.</p></div><button type="button" onClick={onClose} disabled={isProcessing} className="rounded-xl p-2 text-slate-400 transition hover:bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40" aria-label="סגירת אישור הפעולה"><X className="h-5 w-5" /></button></div></div></div><div className="mt-5 space-y-3">{importedOnlyCount > 0 && <div className="flex items-start gap-3 rounded-xl border border-[#F3D0D0] bg-[#FFF8F8] p-3"><Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /><p className="text-xs font-bold leading-5 text-red-800"><b>{importedOnlyCount} {importedOnlyCount === 1 ? "לקוח מיובא" : "לקוחות מיובאים"}</b> יימחקו לצמיתות מהרשומות המיובאות.</p></div>}{historyCount > 0 && <div className="flex items-start gap-3 rounded-xl border border-[#E6E9F3] bg-[#F7F8FF] p-3"><Users className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" /><p className="text-xs font-bold leading-5 text-[#33447A]"><b>{historyCount} {historyCount === 1 ? "לקוח עם היסטוריה" : "לקוחות עם היסטוריה"}</b> יוסתרו מרשימת הלקוחות ויישמרו בארכיון.</p></div>}{historyCount > 0 && <p className="rounded-xl bg-[#F7F7F7] px-3 py-2.5 text-xs font-extrabold leading-5 text-[#1A1A3E]">תורים, פניות והיסטוריית הטיפול לא יימחקו.</p>}</div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-start"><button type="button" onClick={onClose} disabled={isProcessing} autoFocus className="min-h-11 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50">ביטול</button><button type="button" onClick={onConfirm} disabled={isProcessing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#A93434] px-4 text-sm font-extrabold text-white transition hover:bg-[#8F2929] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60">{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{isProcessing ? "מבצעת את הפעולה..." : "אישור מחיקה והסתרה"}</button></div></div></div>;
}

function selectionFeedback(summary: ClientActionSummary): SelectionFeedback {
  const messages: string[] = [];
  if (summary.deletedRows > 0) messages.push(`נמחקו לצמיתות ${summary.deletedRows} ${summary.deletedRows === 1 ? "לקוח מיובא" : "לקוחות מיובאים"}`);
  if (summary.archivedRows > 0) messages.push(`הוסתרו ${summary.archivedRows} ${summary.archivedRows === 1 ? "לקוח עם היסטוריה" : "לקוחות עם היסטוריה"}`);
  if (summary.failedRows > 0) messages.push(`הפעולה נכשלה עבור ${summary.failedRows} ${summary.failedRows === 1 ? "לקוח" : "לקוחות"}`);
  const failedDetails = summary.results.filter((result) => result.kind === "failed").slice(0, 3).map((result) => `${result.name}: ${result.error || "לא התקבל פירוט"}`).join(" · ");
  const historyPreserved = summary.archivedRows > 0 ? " היסטוריית התורים והפניות נשמרה." : "";
  return {
    kind: summary.failedRows > 0 ? "error" : "success",
    text: `${messages.join(". ") || "לא בוצעה פעולה"}.${historyPreserved}`,
    details: failedDetails || undefined,
  };
}

function smsKeyForRow(row: ClientRow): string {
  return row.id.startsWith("client:") ? row.id.slice("client:".length) : row.id;
}

function eligibleSmsPhonesForRow(row: ClientRow, businessClients: CrmRecord[]): string[] {
  const linkedIds = new Set(row.businessClientIds.map((id) => text(id)).filter(Boolean));
  const linkedImports = businessClients.filter((record) => linkedIds.has(text(record.id)));
  const consentedRecords = [...row.appointments, ...linkedImports].filter((record) => record.sms_consent === true && Boolean(text(record.sms_consent_language)));
  const phones = consentedRecords
    .map((record) => normalizeClientPhone(record.phone))
    .filter(isValidClientPhone);
  if (phones.length > 0) return Array.from(new Set(phones));
  if (row.status === "imported" && row.smsConsent && Boolean(row.smsConsentLanguage)) {
    const fallback = normalizeClientPhone(row.phone);
    return isValidClientPhone(fallback) ? [fallback] : [];
  }
  return [];
}

function messageSelectionFeedback(channel: "SMS" | "אימייל", result: { sent: number; skipped: number; failed: number }): SelectionFeedback {
  return {
    kind: result.failed > 0 ? "error" : "success",
    text: `שליחת ${channel} הסתיימה: נשלחו ${result.sent}, דולגו ${result.skipped}, ונכשלו ${result.failed}.`,
  };
}

function comparableClientPhone(value: unknown): string {
  const normalized = normalizeClientPhone(text(value).replace(/[\s().-]+/g, ""));
  return normalized ? normalized.replace(/\D/g, "") : "";
}

function comparableClientEmail(value: unknown): string {
  return text(value).toLocaleLowerCase("en-US");
}

function validManualClientEmail(value: string): boolean {
  return value.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value);
}

function validatedManualClientPayload(payload: CreateClientPayload, existingRows: ClientRow[]): CreateClientPayload {
  const name = payload.name.trim();
  const phone = normalizeClientPhone(payload.phone.trim().replace(/[\s().-]+/g, ""));
  const email = payload.email.trim();
  const notes = payload.notes.trim();
  const petName = text(payload.pet_name);
  const petSpecies = payload.pet_species || "";

  if (!name || name.length > 120) throw new Error("נדרש להזין שם מלא באורך תקין.");
  if (!phone || !isValidClientPhone(phone)) throw new Error("מספר הטלפון אינו תקין. בדקי את המספר ונסי שוב.");
  if (phone.length > 40) throw new Error("מספר הטלפון ארוך מדי.");
  if (email && !validManualClientEmail(email)) throw new Error("כתובת האימייל אינה תקינה. בדקי אותה ונסי שוב.");
  if (notes.length > 1000) throw new Error("ההערות ארוכות מדי. אפשר להזין עד 1,000 תווים.");
  if (petName.length > 80) throw new Error("שם חיית המחמד ארוך מדי.");
  if (petName && !["", "dog", "cat", "other"].includes(petSpecies)) throw new Error("סוג חיית המחמד אינו תקין.");
  if (payload.sms_consent !== false || payload.sms_consent_language !== "" || payload.import_source !== "crm_manual") throw new Error("לא ניתן לשנות את הגדרות ההסכמה בטופס הזה.");

  const phoneKey = comparableClientPhone(phone);
  const emailKey = comparableClientEmail(email);
  const duplicate = existingRows.find((row) => (phoneKey && comparableClientPhone(row.phone) === phoneKey) || (emailKey && comparableClientEmail(row.email) === emailKey));
  if (duplicate) throw new Error(`לקוח עם אותם פרטי קשר כבר קיים ברשימה${duplicate.name ? `: ${duplicate.name}` : ""}.`);

  const safePayload: CreateClientPayload = {
    name,
    phone,
    email,
    notes,
    sms_consent: false,
    sms_consent_language: "",
    import_source: "crm_manual",
  };
  if (petName) {
    safePayload.pet_name = petName;
    safePayload.pet_species = petSpecies as CreateClientPayload["pet_species"];
    safePayload.pet_details = [{ name: petName, species: safePayload.pet_species || "" }];
  }
  return safePayload;
}

export default function BusinessCrmClients() {
  const { user, appointments, inquiries, rescheduleRequests, businessClients, archivedClientKeys, hasDataSnapshot, dataLoadProgress, search, setSearch, isDataLoading, dataError, refreshData, isDataFetching, openView } = useCrmContext();
  const userIdentity = String(user?.id || user?.email || "");
  const isMobileViewport = useIsMobile();
  const prefersReducedMotion = useReducedMotion() ?? false;
  const initialPreferenceSnapshot = readCachedDisplayPreference(userIdentity) || { columns: [...DEFAULT_VISIBLE_COLUMNS], rowsPerPage: 20, sortKey: DEFAULT_SORT_KEY, sortDirection: DEFAULT_SORT_DIRECTION };
  const [segment, setSegment] = useState<SegmentKey>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileQuickFilter, setMobileQuickFilter] = useState<MobileQuickFilter>("all");
  const [mobileSelectionMode, setMobileSelectionMode] = useState(false);
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [safeActionDialogOpen, setSafeActionDialogOpen] = useState(false);
  const [isProcessingSelection, setIsProcessingSelection] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<SelectionFeedback | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [species, setSpecies] = useState<SpeciesFilter>("all");
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [sortKey, setSortKey] = useState<ClientSortKey>(() => initialPreferenceSnapshot.sortKey);
  const [sortDirection, setSortDirection] = useState<ClientSortDirection>(() => initialPreferenceSnapshot.sortDirection);
  const [page, setPage] = useState(1);
  const [mobilePage, setMobilePage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(() => initialPreferenceSnapshot.rowsPerPage);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<ClientColumnKey[]>(() => [...initialPreferenceSnapshot.columns]);
  const [importExportMode, setImportExportMode] = useState<ImportExportMode | null>(null);
  const [smsComposerOpen, setSmsComposerOpen] = useState(false);
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [preferenceLoadState, setPreferenceLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [preferenceSaveState, setPreferenceSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const preferenceRecordRef = useRef<CrmRecord | null>(null);
  const preferenceReadyRef = useRef(false);
  const preferenceDirtyRef = useRef(false);
  const preferenceSessionRef = useRef(0);
  const preferenceSaveVersionRef = useRef(0);
  const preferenceSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const preferenceDesiredRef = useRef<DisplayPreferenceSnapshot>({ columns: [...initialPreferenceSnapshot.columns], rowsPerPage: initialPreferenceSnapshot.rowsPerPage, sortKey: initialPreferenceSnapshot.sortKey, sortDirection: initialPreferenceSnapshot.sortDirection });
  const visibleColumnsRef = useRef<ClientColumnKey[]>([...initialPreferenceSnapshot.columns]);
  const rowsPerPageRef = useRef(initialPreferenceSnapshot.rowsPerPage);
  const sortKeyRef = useRef<ClientSortKey>(initialPreferenceSnapshot.sortKey);
  const sortDirectionRef = useRef<ClientSortDirection>(initialPreferenceSnapshot.sortDirection);

  const sourceRows = useMemo(() => buildClientRows(appointments as CrmRecord[], inquiries as CrmRecord[], businessClients as CrmRecord[]), [appointments, businessClients, inquiries]);
  const allRows = useMemo(() => sourceRows.filter((row) => !archivedClientKeys.has(row.id)), [archivedClientKeys, sourceRows]);
  const customerRows = useMemo(() => allRows.filter((row) => row.status !== "lead"), [allRows]);
  const leadRows = useMemo(() => allRows.filter((row) => row.status === "lead"), [allRows]);
  const pendingRescheduleAppointmentIds = useMemo(() => new Set(
    rescheduleRequests
      .filter(isPendingInboxReschedule)
      .map((record) => text(record.appointment_id))
      .filter(Boolean),
  ), [rescheduleRequests]);
  const mobileNewRequestIds = useMemo(() => new Set(allRows
    .filter((row) => row.appointments.some(isOpenRequestedAppointment)
      || row.inquiries.some(isUnhandledInboxInquiry)
      || row.appointments.some((record) => pendingRescheduleAppointmentIds.has(text(record.id))))
    .map((row) => row.id)), [allRows, pendingRescheduleAppointmentIds]);
  const clinicToday = clinicDateKey();
  const mobileTodayAppointmentIds = useMemo(() => new Set(allRows
    .filter((row) => row.appointments.some((record) => {
      const statusValue = text(record.status).toLowerCase();
      return (statusValue === "requested" || statusValue === "confirmed") && text(record.date) === clinicToday;
    }))
    .map((row) => row.id)), [allRows, clinicToday]);
  const segmentRows = useMemo(() => segment === "all" ? customerRows : segment === "leads" ? leadRows : segment === "future" ? customerRows.filter((row) => row.futureAppointments.length > 0) : [], [customerRows, leadRows, segment]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("he").replace(/\s+/g, " ");
    const compactQuery = query.replace(/[\s().-]+/g, "");
    const now = Date.now();
    return segmentRows.filter((row) => {
      const searchText = clientSearchText(row);
      const compactSearchText = searchText.replace(/[\s().-]+/g, "");
      const searchMatch = !query || searchText.includes(query) || (compactQuery.length >= 3 && compactSearchText.includes(compactQuery));
      const statusMatch = status === "all" || row.status === status;
      const speciesMatch = species === "all" || rowHasSpecies(row, species);
      const activityMatch = activity === "all" || (activity === "older" ? !row.lastActivityTimestamp || row.lastActivityTimestamp < now - 90 * 86400000 : Boolean(row.lastActivityTimestamp && row.lastActivityTimestamp >= now - Number(activity) * 86400000));
      return searchMatch && statusMatch && speciesMatch && activityMatch;
    });
  }, [activity, search, segmentRows, species, status]);
  const sortedRows = useMemo(() => [...filteredRows].sort((a, b) => { if (sortKey === "name") return a.name.localeCompare(b.name, "he") * (sortDirection === "asc" ? 1 : -1); const first = sortKey === "appointments" ? a.appointmentCount : a.lastActivityTimestamp; const second = sortKey === "appointments" ? b.appointmentCount : b.lastActivityTimestamp; return (first - second) * (sortDirection === "asc" ? 1 : -1); }), [filteredRows, sortDirection, sortKey]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const mobileQuickFilterCounts = useMemo(() => ({
    all: filteredRows.length,
    new: filteredRows.filter((row) => mobileNewRequestIds.has(row.id)).length,
    today: filteredRows.filter((row) => mobileTodayAppointmentIds.has(row.id)).length,
  }), [filteredRows, mobileNewRequestIds, mobileTodayAppointmentIds]);
  const mobileFilteredRows = useMemo(() => filteredRows.filter((row) => (
    mobileQuickFilter === "all"
      || (mobileQuickFilter === "new" && mobileNewRequestIds.has(row.id))
      || (mobileQuickFilter === "today" && mobileTodayAppointmentIds.has(row.id))
  )), [filteredRows, mobileNewRequestIds, mobileQuickFilter, mobileTodayAppointmentIds]);
  const mobileSortedRows = useMemo(() => [...mobileFilteredRows].sort((first, second) => {
    if (!first.lastActivityTimestamp && second.lastActivityTimestamp) return 1;
    if (first.lastActivityTimestamp && !second.lastActivityTimestamp) return -1;
    return second.lastActivityTimestamp - first.lastActivityTimestamp || first.name.localeCompare(second.name, "he");
  }), [mobileFilteredRows]);
  const mobileTotalPages = Math.max(1, Math.ceil(mobileSortedRows.length / rowsPerPage));
  const mobileCurrentPage = Math.min(mobilePage, mobileTotalPages);
  const mobilePageRows = mobileSortedRows.slice((mobileCurrentPage - 1) * rowsPerPage, mobileCurrentPage * rowsPerPage);
  const selectedRows = useMemo(() => (isMobileViewport ? mobileSortedRows : sortedRows).filter((row) => selectedIds.has(row.id)), [isMobileViewport, mobileSortedRows, selectedIds, sortedRows]);
  const exportAllRows = isMobileViewport ? mobileSortedRows : sortedRows;
  const exportRows = useMemo(() => selectedRows.length ? selectedRows : exportAllRows, [exportAllRows, selectedRows]);
  const selectedImportedOnlyCount = selectedRows.filter(isImportedOnlyClientRow).length;
  const selectedHistoryCount = selectedRows.filter(clientRowHasHistory).length;
  const selectedSmsClients = useMemo<BulkSmsClient[]>(() => selectedRows.map((row) => ({ key: smsKeyForRow(row), name: row.name, eligiblePhones: eligibleSmsPhonesForRow(row, businessClients as CrmRecord[]) })), [businessClients, selectedRows]);
  const activeFilterCount = [search.trim(), status !== "all" ? status : "", species !== "all" ? species : "", activity !== "all" ? activity : ""].filter(Boolean).length;
  const displayPreferenceStatus: DisplayPreferenceStatus = preferenceSaveState === "saving" ? "saving" : preferenceSaveState === "error" ? "error" : preferenceLoadState === "loading" ? "loading" : preferenceSaveState === "saved" ? "saved" : preferenceLoadState === "error" ? "load-error" : "idle";

  const enqueuePreferenceSave = (snapshot: DisplayPreferenceSnapshot, requestedSession = preferenceSessionRef.current) => {
    const normalized: DisplayPreferenceSnapshot = {
      columns: normalizeVisibleColumns(snapshot.columns),
      rowsPerPage: normalizeRowsPerPage(snapshot.rowsPerPage),
      ...normalizeSortPreference(snapshot.sortKey, snapshot.sortDirection),
    };
    preferenceDesiredRef.current = normalized;
    writeCachedDisplayPreference(userIdentity, normalized);
    if (!userIdentity || !preferenceReadyRef.current || requestedSession !== preferenceSessionRef.current) {
      preferenceDirtyRef.current = true;
      return;
    }

    const saveVersion = ++preferenceSaveVersionRef.current;
    setPreferenceSaveState("saving");
    const save = async () => {
      if (!preferenceReadyRef.current || requestedSession !== preferenceSessionRef.current) return;
      try {
        const payload = { visible_columns: normalized.columns, rows_per_page: normalized.rowsPerPage, sort_key: normalized.sortKey, sort_direction: normalized.sortDirection };
        let recordForSave = preferenceRecordRef.current;
        if (!recordForSave?.id) {
          try {
            const recentRecords = await ClientListPreference.list("-updated_at", 1);
            if (requestedSession !== preferenceSessionRef.current) return;
            const recoveredRecord = firstPreferenceRecord(recentRecords);
            if (recoveredRecord?.id) {
              recordForSave = recoveredRecord;
              preferenceRecordRef.current = recoveredRecord;
            }
          } catch (error) {
            console.error("Failed to recover existing customer list display preference:", error);
          }
        }
        if (requestedSession !== preferenceSessionRef.current) return;
        const result = recordForSave?.id ? await ClientListPreference.update(String(recordForSave.id), payload) : await ClientListPreference.create(payload);
        if (requestedSession !== preferenceSessionRef.current) return;
        const savedRecord = result && typeof result === "object" && !Array.isArray(result) ? result as CrmRecord : null;
        if (savedRecord?.id) preferenceRecordRef.current = savedRecord;
        if (!recordForSave?.id && !savedRecord?.id) {
          const recentRecords = await ClientListPreference.list("-updated_at", 1);
          const recoveredRecord = firstPreferenceRecord(recentRecords);
          if (recoveredRecord?.id && requestedSession === preferenceSessionRef.current) preferenceRecordRef.current = recoveredRecord;
        }
        if (saveVersion === preferenceSaveVersionRef.current && requestedSession === preferenceSessionRef.current) {
          writeCachedDisplayPreference(userIdentity, preferenceDesiredRef.current);
          setPreferenceSaveState("saved");
        }
      } catch (error) {
        console.error("Failed to save customer list display preference:", error);
        if (saveVersion === preferenceSaveVersionRef.current && requestedSession === preferenceSessionRef.current) setPreferenceSaveState("error");
      }
    };
    preferenceSaveQueueRef.current = preferenceSaveQueueRef.current.catch((error) => { console.error("Previous customer list preference save failed:", error); }).then(save);
  };

  useEffect(() => {
    const requestedSession = ++preferenceSessionRef.current;
    let active = true;
    preferenceReadyRef.current = false;
    preferenceDirtyRef.current = false;
    preferenceRecordRef.current = null;
    preferenceSaveVersionRef.current = 0;
    preferenceSaveQueueRef.current = Promise.resolve();
    const defaultSnapshot: DisplayPreferenceSnapshot = { columns: [...DEFAULT_VISIBLE_COLUMNS], rowsPerPage: 20, sortKey: DEFAULT_SORT_KEY, sortDirection: DEFAULT_SORT_DIRECTION };
    const cachedSnapshot = readCachedDisplayPreference(userIdentity);
    const startingSnapshot = cachedSnapshot || defaultSnapshot;
    const startingColumns = [...startingSnapshot.columns];
    const startingRowsPerPage = startingSnapshot.rowsPerPage;
    const startingSortKey = normalizeSortKey(startingSnapshot.sortKey);
    const startingSortDirection = normalizeSortDirection(startingSnapshot.sortDirection);
    preferenceDesiredRef.current = { columns: startingColumns, rowsPerPage: startingRowsPerPage, sortKey: startingSortKey, sortDirection: startingSortDirection };
    visibleColumnsRef.current = startingColumns;
    rowsPerPageRef.current = startingRowsPerPage;
    sortKeyRef.current = startingSortKey;
    sortDirectionRef.current = startingSortDirection;
    setVisibleColumns(startingColumns);
    setRowsPerPage(startingRowsPerPage);
    setSortKey(startingSortKey);
    setSortDirection(startingSortDirection);
    writeCachedDisplayPreference(userIdentity, { columns: startingColumns, rowsPerPage: startingRowsPerPage, sortKey: startingSortKey, sortDirection: startingSortDirection });
    setPreferenceLoadState("loading");
    setPreferenceSaveState("idle");

    const finishWithoutUser = () => {
      if (!active || requestedSession !== preferenceSessionRef.current) return;
      setPreferenceLoadState("error");
    };
    if (!userIdentity) {
      finishWithoutUser();
      return () => {
        active = false;
        if (requestedSession === preferenceSessionRef.current) {
          preferenceSessionRef.current += 1;
          preferenceReadyRef.current = false;
        }
      };
    }

    ClientListPreference.list("-updated_at", 1)
      .then((records) => {
        if (!active || requestedSession !== preferenceSessionRef.current) return;
        const record = firstPreferenceRecord(records);
        const loadedColumns = normalizeVisibleColumns(record?.visible_columns);
        const loadedRowsPerPage = normalizeRowsPerPage(record?.rows_per_page);
        const loadedSortPreference = normalizeSortPreference(record?.sort_key, record?.sort_direction);
        const changedWhileLoading = preferenceDirtyRef.current;
        preferenceRecordRef.current = record;
        if (!changedWhileLoading) {
          const loadedSnapshot: DisplayPreferenceSnapshot = { columns: loadedColumns, rowsPerPage: loadedRowsPerPage, ...loadedSortPreference };
          preferenceDesiredRef.current = loadedSnapshot;
          visibleColumnsRef.current = loadedColumns;
          rowsPerPageRef.current = loadedRowsPerPage;
          sortKeyRef.current = loadedSnapshot.sortKey;
          sortDirectionRef.current = loadedSnapshot.sortDirection;
          setVisibleColumns(loadedColumns);
          setRowsPerPage(loadedRowsPerPage);
          setSortKey(loadedSnapshot.sortKey);
          setSortDirection(loadedSnapshot.sortDirection);
          writeCachedDisplayPreference(userIdentity, loadedSnapshot);
        }
        preferenceReadyRef.current = true;
        setPreferenceLoadState("ready");
        if (changedWhileLoading) {
          preferenceDirtyRef.current = false;
          enqueuePreferenceSave(preferenceDesiredRef.current, requestedSession);
        }
      })
      .catch((error) => {
        console.error("Failed to load customer list display preference:", error);
        if (!active || requestedSession !== preferenceSessionRef.current) return;
        preferenceRecordRef.current = null;
        preferenceReadyRef.current = true;
        setPreferenceLoadState("error");
        if (preferenceDirtyRef.current) {
          preferenceDirtyRef.current = false;
          enqueuePreferenceSave(preferenceDesiredRef.current, requestedSession);
        }
      });

    return () => {
      active = false;
      if (requestedSession === preferenceSessionRef.current) {
        preferenceSessionRef.current += 1;
        preferenceReadyRef.current = false;
      }
    };
  }, [userIdentity]);

  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [activity, search, segment, species, status, rowsPerPage]);
  useEffect(() => { setMobilePage(1); setSelectedIds(new Set()); }, [activity, mobileQuickFilter, search, segment, species, status, rowsPerPage]);
  useEffect(() => {
    const visibleRows = isMobileViewport ? mobilePageRows : pageRows;
    const allowed = new Set(visibleRows.map((row) => row.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => allowed.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [isMobileViewport, mobilePageRows, pageRows]);
  useEffect(() => {
    setSelectedIds(new Set());
    setMobileSelectionMode(false);
  }, [isMobileViewport]);
  useEffect(() => { if (selectedRows.length === 0) { setSmsComposerOpen(false); setEmailComposerOpen(false); } }, [selectedRows.length]);

  const toggleSelection = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleMobileSelectionMode = () => {
    setSelectedIds(new Set());
    setActionFeedback(null);
    setMobileSelectionMode((current) => !current);
  };
  const toggleColumn = (key: ClientColumnKey) => {
    if (key === "client") return;
    const current = visibleColumnsRef.current;
    const next = normalizeVisibleColumns(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    visibleColumnsRef.current = next;
    setVisibleColumns(next);
    enqueuePreferenceSave({ columns: next, rowsPerPage: rowsPerPageRef.current, sortKey: sortKeyRef.current, sortDirection: sortDirectionRef.current });
  };
  const handleRowsPerPageChange = (value: number) => {
    const next = normalizeRowsPerPage(value);
    rowsPerPageRef.current = next;
    setRowsPerPage(next);
    setPage(1);
    enqueuePreferenceSave({ columns: visibleColumnsRef.current, rowsPerPage: next, sortKey: sortKeyRef.current, sortDirection: sortDirectionRef.current });
  };

  const toggleAll = () => setSelectedIds((current) => { const all = pageRows.length > 0 && pageRows.every((row) => current.has(row.id)); return all ? new Set([...current].filter((id) => !pageRows.some((row) => row.id === id))) : new Set([...current, ...pageRows.map((row) => row.id)]); });
  const sort = (key: ClientSortKey) => {
    const nextKey = normalizeSortKey(key);
    const currentKey = sortKeyRef.current;
    const currentDirection = sortDirectionRef.current;
    const nextDirection: ClientSortDirection = nextKey === currentKey
      ? currentDirection === "asc" ? "desc" : "asc"
      : nextKey === "lastActivity" ? "desc" : "asc";
    sortKeyRef.current = nextKey;
    sortDirectionRef.current = nextDirection;
    setSortKey(nextKey);
    setSortDirection(nextDirection);
    setPage(1);
    setSelectedIds(new Set());
    enqueuePreferenceSave({ columns: visibleColumnsRef.current, rowsPerPage: rowsPerPageRef.current, sortKey: nextKey, sortDirection: nextDirection });
  };
  const clearFilters = () => { setSearch(""); setStatus("all"); setSpecies("all"); setActivity("all"); setSegment("all"); setMobileQuickFilter("all"); };

  async function handleSafeClientAction() {
    if (!selectedRows.length || isProcessingSelection) return;
    setIsProcessingSelection(true);
    setActionFeedback(null);
    try {
      const summary = await processClientRows(selectedRows, { existingArchivedClientKeys: archivedClientKeys });
      setSelectedIds(new Set());
      setSafeActionDialogOpen(false);
      let feedback = selectionFeedback(summary);
      try {
        await refreshData();
      } catch (error) {
        console.error("Failed to refresh CRM data after customer action:", error);
        feedback = { ...feedback, kind: "error", text: `${feedback.text} הרשימה לא התרעננה, נסי לרענן ידנית.` };
      }
      setActionFeedback(feedback);
    } catch (error) {
      console.error("Failed to process selected CRM customers:", error);
      setActionFeedback({ kind: "error", text: "לא ניתן היה להשלים את הפעולה. הרשומות נשארו ללא שינוי, אפשר לנסות שוב." });
    } finally {
      setIsProcessingSelection(false);
    }
  }

  async function handleCreateClient(payload: CreateClientPayload) {
    if (isCreatingClient) return;
    const safePayload = validatedManualClientPayload(payload, customerRows);
    setIsCreatingClient(true);
    setActionFeedback(null);
    try {
      try {
        await BusinessClient.create(safePayload);
      } catch (error) {
        console.error("Failed to create manual CRM customer:", error);
        setActionFeedback({ kind: "error", text: "לא ניתן היה לשמור את הלקוח. הרשומה לא נוצרה, אפשר לבדוק את הפרטים ולנסות שוב." });
        throw new Error("שמירת הלקוח נכשלה. בדקי את הפרטים ונסי שוב.");
      }

      try {
        await refreshData();
      } catch (error) {
        console.error("Failed to refresh CRM data after manual customer creation:", error);
        setCreateClientOpen(false);
        setSelectedIds(new Set());
        setPage(1);
        setActionFeedback({ kind: "error", text: "הלקוח נשמר, אבל הרשימה לא התרעננה. לחצי על רענון כדי להציג אותו." });
        return;
      }

      setCreateClientOpen(false);
      setSelectedIds(new Set());
      setPage(1);
      if (segment !== "all") setSegment("all");
      if (search.trim()) setSearch("");
      setActionFeedback({ kind: "success", text: `הלקוח ${safePayload.name} נוצר בהצלחה והרשימה התרעננה.` });
    } finally {
      setIsCreatingClient(false);
    }
  }

  const openSmsComposer = () => {
    setActionFeedback(null);
    setEmailComposerOpen(false);
    setSmsComposerOpen(true);
  };
  const openEmailComposer = () => {
    setActionFeedback(null);
    setSmsComposerOpen(false);
    setEmailComposerOpen(true);
  };
  const handleSmsSuccess = (result: BulkSmsResult) => {
    setSmsComposerOpen(false);
    setSelectedIds(new Set());
    setActionFeedback(messageSelectionFeedback("SMS", result));
  };
  const handleEmailSuccess = (result: BulkEmailResult) => {
    setEmailComposerOpen(false);
    setSelectedIds(new Set());
    setActionFeedback(messageSelectionFeedback("אימייל", result));
  };

  const queryEmpty = !sourceRows.length;
  const allRowsArchived = sourceRows.length > 0 && !allRows.length;
  const onlyUnconvertedLeads = customerRows.length === 0 && leadRows.length > 0;
  const emptyTitle = allRowsArchived ? "כל הרשומות הפעילות הוסתרו" : queryEmpty ? "אין עדיין לקוחות או לידים" : segment === "quotes" || segment === "payments" ? "אין מקור נתונים לפלח הזה" : activeFilterCount ? "לא נמצאו לקוחות תואמים" : onlyUnconvertedLeads && segment === "all" ? "אין עדיין לקוחות" : onlyUnconvertedLeads && segment === "future" ? "אין לקוחות עם תורים עתידיים" : "אין רשומות בפלח הזה";
  const emptyBody = allRowsArchived ? "היסטוריית התורים והפניות נשמרה. לקוחות שהוסתרו לא יופיעו ברשימה הזו." : queryEmpty ? "לקוחות או פניות יופיעו כאן לאחר שמירת תורים, פניות או ייבוא לקוחות." : segment === "quotes" || segment === "payments" ? "המערכת אינה מחוברת להצעות מחיר או לתשלומים, לכן לא יוצגו נתונים מומצאים." : activeFilterCount ? "נסי לשנות את החיפוש או לנקות את הסינון כדי לראות רשומות נוספות." : onlyUnconvertedLeads && segment === "all" ? `נמצאו ${leadRows.length} הצעות עסקיות, אך עדיין אין לקוחות עם תורים שנשמרו במערכת. עברי לפלח הצעות עסקיות כדי לצפות בהן.` : onlyUnconvertedLeads && segment === "future" ? "פניות שעדיין לא הפכו ללקוחות אינן מופיעות בפלח הזימונים העתידיים." : "רשומות חדשות שייווצרו במערכת יופיעו כאן.";
  const segments: Array<{ key: SegmentKey; label: string; count: number | null; note?: string }> = [{ key: "all", label: "כל הלקוחות", count: customerRows.length }, { key: "leads", label: "הצעות עסקיות", count: leadRows.length }, { key: "quotes", label: "הצעות מחיר ממתינות לאישור", count: null, note: "אין מקור נתונים" }, { key: "future", label: "לקוחות עם תורים עתידיים", count: customerRows.filter((row) => row.futureAppointments.length > 0).length }, { key: "payments", label: "תשלומים פתוחים", count: null, note: "אין מקור נתונים" }];
  const mobileQuickFilterOptions: Array<{ key: MobileQuickFilter; label: string; count: number }> = [
    { key: "all", label: "הכל", count: mobileQuickFilterCounts.all },
    { key: "new", label: "בקשות חדשות", count: mobileQuickFilterCounts.new },
    { key: "today", label: "תור היום", count: mobileQuickFilterCounts.today },
  ];
  const mobileEmptyTitle = mobileQuickFilter !== "all" && filteredRows.length > 0 && mobileFilteredRows.length === 0
    ? mobileQuickFilter === "new" ? "אין לקוחות עם בקשה חדשה" : "אין לקוחות עם תור היום"
    : emptyTitle;
  const mobileEmptyBody = mobileQuickFilter !== "all" && filteredRows.length > 0 && mobileFilteredRows.length === 0
    ? mobileQuickFilter === "new" ? "לקוחות עם בקשות שעדיין ממתינות בתיבת הדואר יופיעו כאן." : "לקוחות עם תור מבוקש או מאושר לתאריך של היום יופיעו כאן."
    : emptyBody;
  const mobileSegmentLabel = segment === "leads" ? "פניות" : "לקוחות";
  const isMobileFilterActive = activeFilterCount > 0 || mobileQuickFilter !== "all";
  const mobileActiveFilterCount = activeFilterCount + (mobileQuickFilter === "all" ? 0 : 1);
  const mobileHasActiveCriteria = isMobileFilterActive || segment !== "all";
  const mobileListCountLabel = mobileSortedRows.length === 1
    ? segment === "leads" ? "פנייה אחת" : "לקוח אחד"
    : `${formatCount(mobileSortedRows.length)} ${mobileSegmentLabel}`;

  const mobileClientScreen = (
    <div className="bn bn-client-list md:hidden" dir="rtl">
      <motion.div className="wrap" initial={prefersReducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: prefersReducedMotion ? 0 : 0.15, ease: "easeOut" }}>
        <header className="client-list-header">
          <div className="client-list-heading-copy">
            <div className="client-list-heading-line">
              <div className="client-list-title-block">
                <h1 id="client-list-title">לקוחות</h1>
                <p className="client-list-count" aria-live="polite"><strong>{mobileListCountLabel}</strong></p>
              </div>
              <div className="client-list-header-actions">
                <button
                  type="button"
                  onClick={() => { setActionFeedback(null); setCreateClientOpen(true); setMobileToolsOpen(false); }}
                  aria-haspopup="dialog"
                  aria-expanded={createClientOpen}
                  aria-controls="create-client-dialog"
                  className="client-list-add-button press"
                  aria-label="לקוח חדש"
                >
                  <UserPlus aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={toggleMobileSelectionMode}
                  aria-pressed={mobileSelectionMode}
                  aria-label={mobileSelectionMode ? "סיום בחירת לקוחות" : "בחירת לקוחות"}
                  className={`client-list-select-button${mobileSelectionMode ? " is-active" : ""}`}
                >
                  <ListChecks aria-hidden="true" />
                  <span>{mobileSelectionMode ? "סיום" : "בחר"}</span>
                  {mobileSelectionMode && selectedRows.length > 0 && <b>{formatCount(selectedRows.length)}</b>}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="client-list-search">
          <label className="sr-only" htmlFor="client-list-search-mobile">חיפוש לפי שם, חיית מחמד או פרטי קשר</label>
          <Search aria-hidden="true" />
          <input
            id="client-list-search-mobile"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="שם, חיית מחמד או טלפון"
            inputMode="search"
            autoComplete="off"
          />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="ניקוי החיפוש"><X aria-hidden="true" /></button>}
          <button
            type="button"
            className={`client-search-options${filtersOpen || mobileActiveFilterCount > 0 || segment !== "all" ? " is-active" : ""}`}
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="client-mobile-filter-panel"
            aria-label={mobileActiveFilterCount > 0 ? `סינון וכלים, ${mobileActiveFilterCount} מסננים פעילים` : "סינון וכלים"}
          >
            <SlidersHorizontal aria-hidden="true" />
            {mobileActiveFilterCount > 0 && <b>{formatCount(mobileActiveFilterCount)}</b>}
          </button>
        </div>

        <div className="client-quick-filters" role="tablist" aria-label="סינון מהיר של לקוחות">
          {mobileQuickFilterOptions.map((option) => {
            const active = mobileQuickFilter === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobileQuickFilter(option.key)}
                className={`client-quick-filter${active ? " is-active" : ""}`}
              >
                <span>{option.label}</span>
                {option.key !== "all" && option.count > 0 && <b>{formatCount(option.count)}</b>}
              </button>
            );
          })}
        </div>

        {filtersOpen && (
          <section id="client-mobile-filter-panel" className="client-filter-panel" aria-label="סינון וכלים">
            <div className="client-filter-grid">
              <SelectField value={segment} onChange={(value) => setSegment(value as SegmentKey)} label="רשימה">
                {segments.map((item) => (
                  <option key={item.key} value={item.key} disabled={item.count === null}>
                    {item.label}{item.count === null ? " · אין מקור נתונים" : ` · ${formatCount(item.count)}`}
                  </option>
                ))}
              </SelectField>
              <SelectField value={status} onChange={(value) => setStatus(value as StatusFilter)} label="סטטוס איש קשר">
                <option value="all">כל הסטטוסים</option>
                <option value="new">לקוח חדש</option>
                <option value="active">לקוח פעיל</option>
                <option value="lead">ליד חדש</option>
                <option value="imported">לקוח מיובא</option>
              </SelectField>
              <SelectField value={species} onChange={(value) => setSpecies(value as SpeciesFilter)} label="סוג חיית מחמד">
                <option value="all">כל הסוגים</option>
                <option value="dog">כלב</option>
                <option value="cat">חתול</option>
                <option value="other">אחר</option>
                <option value="unknown">לא ידוע</option>
              </SelectField>
              <SelectField value={activity} onChange={(value) => setActivity(value as ActivityFilter)} label="פעילות אחרונה">
                <option value="all">כל טווחי הזמן</option>
                <option value="7">7 הימים האחרונים</option>
                <option value="30">30 הימים האחרונים</option>
                <option value="90">90 הימים האחרונים</option>
                <option value="older">לפני יותר מ-90 יום</option>
              </SelectField>
            </div>
            {mobileHasActiveCriteria && (
              <div className="client-filter-footer">
                <span>{mobileActiveFilterCount > 0 ? `${formatCount(mobileActiveFilterCount)} מסננים פעילים` : "פלח לקוחות נבחר"}</span>
                <button type="button" onClick={clearFilters}><X aria-hidden="true" />ניקוי הסינון</button>
              </div>
            )}
          </section>
        )}

        {filtersOpen && (
          <div id="client-list-tools-mobile" className="client-tools-panel" role="group" aria-label="כלי ניהול לקוחות">
            <button type="button" onClick={() => { void refreshData(); setFiltersOpen(false); }}>
              <RefreshCw className={isDataFetching ? "animate-spin" : ""} aria-hidden="true" />
              <span>רענון הרשימה</span>
            </button>
            <button type="button" onClick={() => { setImportExportMode("import"); setFiltersOpen(false); }}>
              <Upload aria-hidden="true" />
              <span>ייבוא לקוחות</span>
            </button>
            <button type="button" onClick={() => { setImportExportMode("export"); setFiltersOpen(false); }}>
              <Download aria-hidden="true" />
              <span>ייצוא לקוחות</span>
            </button>
            <button type="button" onClick={() => { setDisplaySettingsOpen(true); setFiltersOpen(false); }} aria-haspopup="dialog" aria-expanded={displaySettingsOpen} aria-controls="display-settings-dialog">
              <Settings2 aria-hidden="true" />
              <span>הגדרות תצוגה</span>
            </button>
          </div>
        )}

        {mobileSelectionMode && selectedRows.length === 0 && <p className="client-selection-hint" role="status">הקישי על שורות כדי לבחור לקוחות. בסיום הבחירה יופיעו הפעולות המתאימות.</p>}

        {selectedRows.length > 0 && (
          <div className="client-selected-toolbar" role="toolbar" aria-label="פעולות ללקוחות שנבחרו">
            <div className="client-selected-heading">
              <strong role="status" aria-live="polite">{formatCount(selectedRows.length)} {selectedRows.length === 1 ? "לקוח נבחר" : "לקוחות נבחרו"}</strong>
              <span>{selectedImportedOnlyCount > 0 ? `${formatCount(selectedImportedOnlyCount)} למחיקה לצמיתות` : "אין רשומות מיובאות למחיקה"}{selectedHistoryCount > 0 ? ` · ${formatCount(selectedHistoryCount)} יוסתרו בבטחה` : ""}</span>
            </div>
            <div className="client-selected-actions">
              <button type="button" className="client-selected-action is-sms" onClick={openSmsComposer} aria-label="שליחת SMS ללקוחות שנבחרו"><Send aria-hidden="true" />שליחת SMS</button>
              <button type="button" className="client-selected-action is-email" onClick={openEmailComposer} aria-label="שליחת אימייל ללקוחות שנבחרו"><Mail aria-hidden="true" />שליחת אימייל</button>
              <button type="button" className="client-selected-action" onClick={() => setImportExportMode("export")}><Download aria-hidden="true" />ייצוא נבחרים</button>
              <button type="button" className="client-selected-action is-danger" onClick={() => { setActionFeedback(null); setSafeActionDialogOpen(true); }}><Trash2 aria-hidden="true" />מחיקה/הסתרה בטוחה</button>
              <button type="button" className="client-selected-action is-clear" onClick={() => setSelectedIds(new Set())}><X aria-hidden="true" />ניקוי בחירה</button>
            </div>
          </div>
        )}

        {isMobileViewport && smsComposerOpen && selectedRows.length > 0 && (
          <div className="client-mobile-composer"><BulkSmsComposer selectedClients={selectedSmsClients} onClose={() => setSmsComposerOpen(false)} onSuccess={handleSmsSuccess} /></div>
        )}
        {isMobileViewport && emailComposerOpen && selectedRows.length > 0 && (
          <div className="client-mobile-composer"><BulkEmailComposer selectedClients={selectedRows} senderName={VETERINARY_CLINIC_PROFILE.businessName} onClose={() => setEmailComposerOpen(false)} onSuccess={handleEmailSuccess} /></div>
        )}

        {actionFeedback && (
          <div className={`client-action-feedback${actionFeedback.kind === "error" ? " is-error" : " is-success"}`} role={actionFeedback.kind === "error" ? "alert" : "status"}>
            {actionFeedback.kind === "error" ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            <div><p>{actionFeedback.text}</p>{actionFeedback.details && <p className="client-action-feedback-details">{actionFeedback.details}</p>}</div>
          </div>
        )}

        <section className="client-list-results" aria-labelledby="client-results-heading-mobile">
          <div className="client-list-results-heading">
            <h2 id="client-results-heading-mobile">פעילות אחרונה</h2>
          </div>

          {!hasDataSnapshot ? (
            dataError
              ? <BentoClientLoadError onRetry={refreshData} />
              : <BentoClientProgress progress={dataLoadProgress} />
          ) : (
            <>
              {(isDataFetching || dataLoadProgress.status === "loading") && <BentoClientProgress progress={dataLoadProgress} compact />}
              {dataError && <BentoClientRefreshError onRetry={refreshData} />}
              <ClientsTable
                rows={pageRows}
                mobileRows={mobilePageRows}
                mobileSelectionMode={mobileSelectionMode}
                mobileNewRequestIds={mobileNewRequestIds}
                mobileEmptyTitle={mobileEmptyTitle}
                mobileEmptyBody={mobileEmptyBody}
                columns={visibleColumns}
                selectedIds={selectedIds}
                loading={false}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onToggle={toggleSelection}
                onToggleAll={toggleAll}
                onSort={sort}
                onRefresh={refreshData}
                onOpenClient={(id) => openView({ kind: "client-details", clientId: id })}
                emptyTitle={emptyTitle}
                emptyBody={emptyBody}
              />
              {mobileTotalPages > 1 && <div className="client-list-pagination" aria-label="עמודי רשימת הלקוחות">
                <p>עמוד {mobileCurrentPage} מתוך {mobileTotalPages}<span> · {mobileListCountLabel}</span></p>
                <div>
                  <button type="button" disabled={mobileCurrentPage <= 1} onClick={() => setMobilePage(Math.max(1, mobileCurrentPage - 1))} aria-label="עמוד קודם"><ChevronRight aria-hidden="true" /></button>
                  <button type="button" disabled={mobileCurrentPage >= mobileTotalPages} onClick={() => setMobilePage(Math.min(mobileTotalPages, mobileCurrentPage + 1))} aria-label="עמוד הבא"><ChevronLeft aria-hidden="true" /></button>
                </div>
              </div>}
            </>
          )}
        </section>
      </motion.div>
    </div>
  );

  return (
    <>
      <SEO title={`לקוחות | ${VETERINARY_CLINIC_PROFILE.businessName}`} description="ניהול לקוחות ופניות במערכת העסקית של המרפאה הווטרינרית." url={`${VETERINARY_CLINIC_PROFILE.publicOrigin}${VETERINARY_CLINIC_PROFILE.crmBasePath}/clients`} noindex siteName={VETERINARY_CLINIC_PROFILE.businessName} />
      {mobileClientScreen}
      <div className="hidden md:block">
      {dataError && !hasDataSnapshot ? <ContentError onRetry={refreshData} /> : isDataLoading && !hasDataSnapshot ? <ContentLoading progress={dataLoadProgress} /> : <div dir="rtl">{(isDataFetching || dataLoadProgress.status === "loading") && <div className="mb-4"><ClientDataProgress progress={dataLoadProgress} compact /></div>}{dataError && hasDataSnapshot && <div className="mb-4"><RefreshErrorBanner onRetry={refreshData} /></div>}<div className="hidden md:block max-w-3xl"><p className="mb-2 text-xs font-extrabold tracking-wide text-slate-500">{VETERINARY_CLINIC_PROFILE.businessName}</p><h1 className="text-3xl font-black tracking-tight text-[#1A1A3E] sm:text-4xl">לקוחות</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">כאן ניתן לנהל את הלקוחות בעזרת מידע מפולטר מותאם לצרכי העסק שלך</p></div><div className="hidden md:flex mt-6 grid-cols-2 gap-2 sm:flex sm:gap-3 sm:overflow-x-auto sm:pb-2" role="tablist" aria-label="פלחי לקוחות">{segments.map((item) => { const disabled = item.count === null; return <button key={item.key} type="button" role="tab" aria-selected={segment === item.key} disabled={disabled} onClick={() => { setSegment(item.key); setMoreOpen(false); }} title={disabled ? "אין מקור נתונים לפלח הזה" : undefined} className={`min-w-0 rounded-2xl border p-3 text-right transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] sm:min-w-[180px] sm:p-4 ${segment === item.key ? "border-[#1A1A3E] bg-[#1A1A3E] text-white shadow-lg" : disabled ? "cursor-not-allowed border-[#E5E7EB] bg-white/60 text-slate-400 opacity-80" : "border-[#E5E7EB] bg-white text-[#1A1A3E] hover:-translate-y-0.5 hover:border-[#F2D162]"}`}><span className="block text-xs font-extrabold leading-5">{item.label}</span><span className="mt-3 block text-2xl font-black">{item.count === null ? "—" : item.count}</span><span className={`mt-1 block text-[10px] font-bold ${segment === item.key ? "text-white/70" : "text-slate-400"}`}>{item.note || "רשומות זמינות"}</span></button>; })}</div>

        <section aria-labelledby="customer-list-heading" className="mt-4">
          <div className="mb-3 md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 id="customer-list-heading-mobile" className="text-xl font-black tracking-tight text-[#1A1A3E]">לקוחות</h2>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500" aria-live="polite">{mobileSortedRows.length.toLocaleString("he-IL")} {segment === "leads" ? "פניות" : "לקוחות"}</p>
              </div>
              <button type="button" onClick={toggleMobileSelectionMode} aria-pressed={mobileSelectionMode} aria-label={mobileSelectionMode ? "סיום בחירת לקוחות" : "בחירת לקוחות"} className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${mobileSelectionMode ? "border-[#1A1A3E] bg-[#1A1A3E] text-[#F2D162]" : "border-[#D9DEE5] bg-white text-[#1A1A3E] hover:border-[#F2D162]"}`}>
                {mobileSelectionMode ? "סיום בחירה" : "בחר"}
                {mobileSelectionMode && selectedRows.length > 0 && <span className="rounded-full bg-[#F2D162] px-1.5 py-0.5 text-[10px] text-[#1A1A3E]">{selectedRows.length}</span>}
              </button>
            </div>
            <label className="relative mt-3 block">
              <span className="sr-only">חיפוש לפי שם, חיית מחמד או טלפון</span>
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="שם, חיית מחמד או טלפון" aria-label="חיפוש לפי שם, חיית מחמד או טלפון" className="h-10 w-full rounded-xl border border-[#D9DEE5] bg-white pr-9 pl-3 text-xs font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]" />
            </label>
            <div className="mt-2 grid grid-cols-3 gap-1.5" role="tablist" aria-label="סינון מהיר של לקוחות">
              {mobileQuickFilterOptions.map((option) => {
                const active = mobileQuickFilter === option.key;
                return <button key={option.key} type="button" role="tab" aria-selected={active} onClick={() => setMobileQuickFilter(option.key)} className={`flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-xl border px-1.5 text-[10px] font-black whitespace-nowrap transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${active ? "border-[#1A1A3E] bg-[#1A1A3E] text-[#F2D162]" : "border-[#E5E7EB] bg-white text-[#1A1A3E] hover:border-[#F2D162]"}`}>
                  <span className="truncate">{option.label}</span><span className={`shrink-0 text-[9px] ${active ? "text-[#F2D162]/80" : "text-slate-400"}`}>{option.count}</span>
                </button>;
              })}
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
              <label className="relative min-w-0">
                <span className="sr-only">בחירת פלח לקוחות</span>
                <select value={segment} onChange={(event) => { setSegment(event.target.value as SegmentKey); setMobileToolsOpen(false); }} aria-label="בחירת פלח לקוחות" className="h-10 w-full appearance-none rounded-xl border border-[#D9DEE5] bg-white py-2 pr-3 pl-8 text-right text-[11px] font-extrabold text-[#1A1A3E] outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]">
                  {segments.map((item) => <option key={item.key} value={item.key} disabled={item.count === null}>{item.label}{item.count === null ? " · אין מקור נתונים" : ` · ${item.count}`}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              </label>
              <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border px-2 text-[11px] font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${filtersOpen || activeFilterCount ? "border-[#1A1A3E] bg-[#1A1A3E] text-white" : "border-[#D9DEE5] bg-white text-[#1A1A3E] hover:border-[#F2D162]"}`}><Filter className="h-3.5 w-3.5" />סינון{activeFilterCount > 0 && <span className="rounded-full bg-[#F2D162] px-1 text-[9px] text-[#1A1A3E]">{activeFilterCount}</span>}</button>
              <button type="button" onClick={() => setMobileToolsOpen((open) => !open)} aria-expanded={mobileToolsOpen} aria-controls="mobile-client-tools" className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border px-2 text-[11px] font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${mobileToolsOpen ? "border-[#1A1A3E] bg-[#1A1A3E] text-white" : "border-[#D9DEE5] bg-white text-[#1A1A3E] hover:border-[#F2D162]"}`}><MoreHorizontal className="h-3.5 w-3.5" />כלים</button>
            </div>
            {mobileToolsOpen && <div id="mobile-client-tools" role="group" aria-label="כלי ניהול לקוחות" className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
              <button type="button" onClick={() => { setActionFeedback(null); setCreateClientOpen(true); setMobileToolsOpen(false); }} aria-haspopup="dialog" aria-expanded={createClientOpen} aria-controls="create-client-dialog" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[#1A1A3E] px-2 text-[11px] font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><UserPlus className="h-3.5 w-3.5" />לקוח חדש</button>
              <button type="button" onClick={() => { void refreshData(); setMobileToolsOpen(false); }} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#D9DEE5] bg-white px-2 text-[11px] font-extrabold text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><RefreshCw className={isDataFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />רענון</button>
              <button type="button" onClick={() => { setImportExportMode("import"); setMobileToolsOpen(false); }} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#D9DEE5] bg-white px-2 text-[11px] font-extrabold text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Upload className="h-3.5 w-3.5" />ייבוא לקוחות</button>
              <button type="button" onClick={() => { setImportExportMode("export"); setMobileToolsOpen(false); }} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#D9DEE5] bg-white px-2 text-[11px] font-extrabold text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Download className="h-3.5 w-3.5" />ייצוא לקוחות</button>
              <button type="button" onClick={() => { setDisplaySettingsOpen(true); setMobileToolsOpen(false); }} aria-haspopup="dialog" aria-expanded={displaySettingsOpen} aria-controls="display-settings-dialog" className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#D9DEE5] bg-white px-2 text-[11px] font-extrabold text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Settings2 className="h-3.5 w-3.5" />הגדרות תצוגה</button>
            </div>}
            {mobileSelectionMode && <p role="status" className="mt-2 text-[10px] font-bold text-[#5267A8]">הקישי על שורה כדי לבחור לקוח. סיום בחירה יבטל את כל הסימונים.</p>}
          </div>
          <div className="hidden md:flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="customer-list-heading" className="text-lg font-black text-[#1A1A3E]">{sortedRows.length} לקוחות</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">{segment === "all" ? "לקוחות עם תורים או רשומות שיובאו למערכת" : segments.find((item) => item.key === segment)?.label}</p>
            </div>
            <div className="flex items-center gap-2"><button type="button" onClick={() => { setActionFeedback(null); setCreateClientOpen(true); }} aria-haspopup="dialog" aria-expanded={createClientOpen} aria-controls="create-client-dialog" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1A1A3E] px-3 text-xs font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><UserPlus className="h-4 w-4" />לקוח חדש</button><button type="button" onClick={refreshData} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D9DEE5] bg-white px-3 text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162]" title="רענון נתוני לקוחות"><RefreshCw className={isDataFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />רענון</button></div>
          </div>
          <div className="hidden md:flex mt-3 flex-col gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center"><div className="grid w-full grid-cols-2 gap-2 sm:contents"><div className="relative"><button type="button" onClick={() => setMoreOpen((open) => !open)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#D9DEE5] bg-white px-3 text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162] sm:h-10 sm:w-auto sm:justify-start"><MoreHorizontal className="h-4 w-4" />אפשרויות נוספות</button>{moreOpen && <div className="absolute right-0 top-12 z-20 w-full max-w-[calc(100vw-2rem)] rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-xl sm:w-52 sm:max-w-none"><button type="button" onClick={() => { setImportExportMode("import"); setMoreOpen(false); }} className="flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-right text-xs font-extrabold text-[#1A1A3E] transition hover:bg-[#FFFDF2] sm:min-h-0">ייבוא לקוחות</button><button type="button" onClick={() => { setImportExportMode("export"); setMoreOpen(false); }} className="flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-right text-xs font-extrabold text-[#1A1A3E] transition hover:bg-[#FFFDF2] sm:min-h-0">ייצוא לקוחות</button></div>}</div><button type="button" onClick={() => setDisplaySettingsOpen(true)} aria-haspopup="dialog" aria-expanded={displaySettingsOpen} aria-controls="display-settings-dialog" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#D9DEE5] bg-white px-3 text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162] sm:h-10 sm:w-auto sm:justify-start"><Settings2 className="h-4 w-4" />הגדרות תצוגה</button><button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] sm:h-10 sm:w-auto sm:justify-start ${filtersOpen || activeFilterCount ? "border-[#1A1A3E] bg-[#1A1A3E] text-white" : "border-[#D9DEE5] bg-white text-[#1A1A3E] hover:border-[#F2D162]"}`}><Filter className="h-4 w-4" />אפשרויות סינון{activeFilterCount > 0 && <span className="rounded-full bg-[#F2D162] px-1.5 py-0.5 text-[10px] text-[#1A1A3E]">{activeFilterCount}</span>}</button></div><label className="order-first relative w-full sm:order-none sm:min-w-[220px] sm:flex-1"><span className="sr-only">חיפוש לקוחות</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש לפי שם, טלפון, תעודת זהות, כתובת או פרטים נוספים" aria-label="חיפוש לפי שם, טלפון, תעודת זהות, כתובת או פרטים נוספים" className="h-10 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-xs font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]" /></label></div>
        {filtersOpen && <section className="mt-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm"><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><SelectField value={status} onChange={(value) => setStatus(value as StatusFilter)} label="סטטוס איש קשר"><option value="all">כל הסטטוסים</option><option value="new">לקוח חדש</option><option value="active">לקוח פעיל</option><option value="lead">ליד חדש</option><option value="imported">לקוח מיובא</option></SelectField><SelectField value={species} onChange={(value) => setSpecies(value as SpeciesFilter)} label="סוג חיית מחמד"><option value="all">כל הסוגים</option><option value="dog">כלב</option><option value="cat">חתול</option><option value="other">אחר</option><option value="unknown">לא ידוע</option></SelectField><SelectField value={activity} onChange={(value) => setActivity(value as ActivityFilter)} label="פעילות אחרונה"><option value="all">כל טווחי הזמן</option><option value="7">7 הימים האחרונים</option><option value="30">30 הימים האחרונים</option><option value="90">90 הימים האחרונים</option><option value="older">לפני יותר מ-90 יום</option></SelectField></div>{activeFilterCount > 0 && <div className="mt-4 flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-slate-500">מסננים פעילים: {activeFilterCount}</span><button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-extrabold text-[#5267A8] hover:bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><X className="h-3.5 w-3.5" />ניקוי סינון</button></div>}</section>}
        {selectedRows.length > 0 && <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0" role="toolbar" aria-label="פעולות ללקוחות שנבחרו"><div className="min-w-0"><p className="text-sm font-black text-[#1A1A3E]" role="status" aria-live="polite">{selectedRows.length} {selectedRows.length === 1 ? "לקוח נבחר" : "לקוחות נבחרו"}</p><p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">{selectedImportedOnlyCount > 0 ? `${selectedImportedOnlyCount} למחיקה לצמיתות` : "אין רשומות מיובאות למחיקה"}{selectedHistoryCount > 0 ? ` · ${selectedHistoryCount} להסתרה בטוחה` : ""}</p></div><div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center"><button type="button" onClick={openSmsComposer} aria-label="שליחת SMS ללקוחות שנבחרו" className="inline-flex min-h-11 w-full items-center justify-center gap-2 sm:min-h-10 sm:w-auto sm:justify-start rounded-xl border border-[#D8ECEB] bg-[#F5FBFA] px-3 text-xs font-black text-[#236B68] transition hover:border-[#B8DCD9] hover:bg-[#EAF7F5] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Send className="h-4 w-4" />שליחת SMS</button><button type="button" onClick={openEmailComposer} aria-label="שליחת אימייל ללקוחות שנבחרו" className="inline-flex min-h-11 w-full items-center justify-center gap-2 sm:min-h-10 sm:w-auto sm:justify-start rounded-xl border border-[#E6DDF4] bg-[#FBF9FE] px-3 text-xs font-black text-[#705493] transition hover:border-[#CDBBE2] hover:bg-[#F5F0FB] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Mail className="h-4 w-4" />שליחת אימייל</button><button type="button" onClick={() => { setImportExportMode("export"); setMoreOpen(false); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 sm:min-h-10 sm:w-auto sm:justify-start rounded-xl border border-[#D9DEE5] bg-white px-3 text-xs font-black text-[#1A1A3E] transition hover:border-[#F2D162] hover:bg-[#FFFDF2] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Download className="h-4 w-4" />ייצוא נבחרים</button><button type="button" onClick={() => { setActionFeedback(null); setSafeActionDialogOpen(true); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 sm:min-h-10 sm:w-auto sm:justify-start rounded-xl border border-red-200 bg-[#FFF8F8] px-3 text-xs font-black text-[#A93434] transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Trash2 className="h-4 w-4" />מחיקה/הסתרה בטוחה</button><button type="button" onClick={() => setSelectedIds(new Set())} className="inline-flex min-h-11 w-full items-center justify-center gap-2 sm:min-h-10 sm:w-auto sm:justify-start rounded-xl border border-[#D9DEE5] bg-white px-3 text-xs font-extrabold text-slate-600 transition hover:border-[#F2D162] hover:bg-[#FFFDF2] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><X className="h-4 w-4" />ניקוי בחירה</button></div></div>}
        {!isMobileViewport && smsComposerOpen && selectedRows.length > 0 && <div className="mt-4"><BulkSmsComposer selectedClients={selectedSmsClients} onClose={() => setSmsComposerOpen(false)} onSuccess={handleSmsSuccess} /></div>}
        {!isMobileViewport && emailComposerOpen && selectedRows.length > 0 && <div className="mt-4"><BulkEmailComposer selectedClients={selectedRows} senderName={VETERINARY_CLINIC_PROFILE.businessName} onClose={() => setEmailComposerOpen(false)} onSuccess={handleEmailSuccess} /></div>}
        {actionFeedback && <div role={actionFeedback.kind === "error" ? "alert" : "status"} className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-bold ${actionFeedback.kind === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}><div className="flex items-start gap-2">{actionFeedback.kind === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}<div><p>{actionFeedback.text}</p>{actionFeedback.details && <p className="mt-1 text-xs font-semibold leading-5 opacity-80">{actionFeedback.details}</p>}</div></div></div>}
          <div className="mt-4"><ClientsTable rows={pageRows} mobileRows={mobilePageRows} mobileSelectionMode={mobileSelectionMode} mobileNewRequestIds={mobileNewRequestIds} mobileEmptyTitle={mobileEmptyTitle} mobileEmptyBody={mobileEmptyBody} columns={visibleColumns} selectedIds={selectedIds} loading={false} sortKey={sortKey} sortDirection={sortDirection} onToggle={toggleSelection} onToggleAll={toggleAll} onSort={sort} onRefresh={refreshData} onOpenClient={(id) => openView({ kind: "client-details", clientId: id })} emptyTitle={emptyTitle} emptyBody={emptyBody} /></div><div className="mt-4 hidden md:flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-xs font-bold text-slate-500"><span>עמוד {currentPage} מתוך {totalPages}</span><div className="flex items-center gap-2"><button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-[#D9DEE5] p-2 text-[#1A1A3E] transition hover:border-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40" aria-label="עמוד קודם"><ChevronRight className="h-4 w-4" /></button><button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-[#D9DEE5] p-2 text-[#1A1A3E] transition hover:border-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40" aria-label="עמוד הבא"><ChevronLeft className="h-4 w-4" /></button></div></div><div className="mt-3 flex md:hidden flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-xs font-bold text-slate-500"><span>עמוד {mobileCurrentPage} מתוך {mobileTotalPages} · {mobileSortedRows.length.toLocaleString("he-IL")} {segment === "leads" ? "פניות" : "לקוחות"}</span><div className="flex items-center gap-2"><button type="button" disabled={mobileCurrentPage <= 1} onClick={() => setMobilePage(Math.max(1, mobileCurrentPage - 1))} className="rounded-lg border border-[#D9DEE5] p-2 text-[#1A1A3E] transition hover:border-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40" aria-label="עמוד קודם"><ChevronRight className="h-4 w-4" /></button><button type="button" disabled={mobileCurrentPage >= mobileTotalPages} onClick={() => setMobilePage(Math.min(mobileTotalPages, mobileCurrentPage + 1))} className="rounded-lg border border-[#D9DEE5] p-2 text-[#1A1A3E] transition hover:border-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40" aria-label="עמוד הבא"><ChevronLeft className="h-4 w-4" /></button></div></div></section></div>}
      </div>
      <DisplaySettingsDialog open={displaySettingsOpen} columns={visibleColumns} rowsPerPage={rowsPerPage} preferenceStatus={displayPreferenceStatus} onToggle={toggleColumn} onRowsPerPageChange={handleRowsPerPageChange} onClose={() => setDisplaySettingsOpen(false)} />
      <CreateClientDialog open={createClientOpen} existingRows={customerRows} isSaving={isCreatingClient} onClose={() => setCreateClientOpen(false)} onCreate={handleCreateClient} />
      <SafeClientActionDialog open={safeActionDialogOpen} selectedCount={selectedRows.length} importedOnlyCount={selectedImportedOnlyCount} historyCount={selectedHistoryCount} isProcessing={isProcessingSelection} onClose={() => setSafeActionDialogOpen(false)} onConfirm={handleSafeClientAction} />
      <ClientImportExportModal open={Boolean(importExportMode)} mode={importExportMode || "import"} existingRows={customerRows} exportRows={exportRows} exportScopeLabel={selectedRows.length ? `ייצוא של ${selectedRows.length} הלקוחות שנבחרו` : `ייצוא של כל ${exportAllRows.length} הלקוחות לאחר הסינון`} onClose={() => setImportExportMode(null)} onImport={async (plan, onProgress) => { const result = await saveClientImportPlan(plan, businessClients as CrmRecord[], customerRows, onProgress); await refreshData(); return result; }} />
    </>
  );
}
