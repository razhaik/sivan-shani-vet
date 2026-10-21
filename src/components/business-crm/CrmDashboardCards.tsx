import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, CalendarDays, CalendarPlus, CheckCircle2, Clock3, PawPrint, ReceiptText, Sparkles, TrendingDown, TrendingUp, UserRound, Users, XCircle } from "lucide-react";
import type { CrmRecord } from "@/components/business-crm/CrmContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card } from "@/components/business-crm/CrmCardPrimitives";
import { CrmDashboardLayoutEditor, type CrmDashboardWidget } from "@/components/business-crm/CrmDashboardLayoutEditor";
import {
  formatDashboardDate,
  formatDashboardTimestamp,
  getDashboardCalendarDateKeys,
  shiftDashboardDate,
  summarizeDashboardAppointments,
  type DashboardClientSummary,
  type DashboardLeadSummary,
} from "@/lib/crmDashboardData";
import type { AppointmentDecisionAction, AppointmentDecisionResult } from "@/lib/crmAppointmentDecision";
import type { CrmWidgetId, CrmWidgetLayout, CrmWidgetSizeMode } from "@/lib/crmDashboardLayout";

export interface DashboardWidgetRequestState {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}

interface CrmDashboardCardsProps {
  appointments: CrmRecord[];
  appointmentsState: DashboardWidgetRequestState;
  pendingAppointments: CrmRecord[];
  pendingState: DashboardWidgetRequestState;
  clients: DashboardClientSummary[];
  clientsState: DashboardWidgetRequestState;
  leads: DashboardLeadSummary;
  leadsState: DashboardWidgetRequestState;
  today: string;
  search: string;
  onOpenCalendar: () => void;
  onOpenClients: () => void;
  onAppointmentDecision: (record: CrmRecord, action: AppointmentDecisionAction) => Promise<AppointmentDecisionResult>;
  widgetOrder: CrmWidgetId[];
  widgetLayout: CrmWidgetLayout[];
  isEditing: boolean;
  onOrderChange: (nextOrder: CrmWidgetId[]) => void;
  onLayoutChange: (nextLayout: CrmWidgetLayout[]) => void;
}

const avatarColors = ["bg-[#F8C4B4] text-[#8D342E]", "bg-[#FFD98E] text-[#855517]", "bg-[#B9DCE0] text-[#205C67]", "bg-[#D7C6F2] text-[#54358A]"];

function numberText(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.max(0, Math.floor(value)));
}

function clientCountText(value: number, filtered: boolean): string {
  if (filtered) return value === 1 ? "לקוח תואם אחד" : `${numberText(value)} לקוחות תואמים`;
  return value === 1 ? "לקוח פעיל אחד" : `${numberText(value)} לקוחות פעילים`;
}

function appointmentCountText(value: number): string {
  return value === 1 ? "תור אחד" : `${numberText(value)} תורים`;
}

function leadCountText(value: number): string {
  return value === 1 ? "פנייה חדשה אחת" : `${numberText(value)} פניות חדשות`;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`;
  return name.trim().slice(0, 2) || "לק";
}

function WidgetLoading({ label, rows = 3 }: { label: string; rows?: number }) {
  return <div role="status" aria-label={label} className="space-y-2.5">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, index) => <div key={index} className={`${index === 0 ? "h-8" : "h-10"} animate-pulse rounded-xl bg-[#F1F3F6]`} style={{ opacity: 0.78 - index * 0.12 }} />)}
  </div>;
}

function WidgetError({ onRetry }: { onRetry: () => void }) {
  return <div className="flex min-h-[112px] flex-col items-center justify-center rounded-xl border border-red-100 bg-red-50/70 px-3 py-4 text-center">
    <p className="text-xs font-extrabold text-[#8D3030]">לא הצלחנו לטעון את הנתונים.</p>
    <button type="button" onClick={onRetry} className="mt-2 inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-xs font-black text-[#5267A8] underline-offset-2 transition hover:bg-white hover:underline focus:outline-none focus:ring-2 focus:ring-[#F2D162]">נסי שוב</button>
  </div>;
}

function QuickMenuCard({ onOpenCalendar, onOpenClients, mode, reducedMotion }: { onOpenCalendar: () => void; onOpenClients: () => void; mode: CrmWidgetSizeMode; reducedMotion: boolean }) {
  return <Card title="תפריט מהיר" icon={Sparkles} mode={mode} reducedMotion={reducedMotion} className="crm-dashboard-card">
    <p className="mb-2 text-[11px] font-semibold text-slate-500">פעולות יומיומיות במרפאה</p>
    <div className="space-y-2">
      <button type="button" onClick={onOpenClients} className="group flex min-h-10 w-full min-w-0 items-center gap-2.5 rounded-xl border border-[#EEF0F3] px-2.5 text-right text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F8] text-[#1A1A3E] group-hover:bg-white"><UserRound className="h-4 w-4" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1 truncate">פתיחת רשימת הלקוחות</span><ArrowLeft className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:-translate-x-0.5" aria-hidden="true" />
      </button>
      <button type="button" onClick={onOpenCalendar} className="group flex min-h-10 w-full min-w-0 items-center gap-2.5 rounded-xl border border-[#EEF0F3] px-2.5 text-right text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F8] text-[#1A1A3E] group-hover:bg-white"><CalendarPlus className="h-4 w-4" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1 truncate">קביעה חדשה</span><ArrowLeft className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:-translate-x-0.5" aria-hidden="true" />
      </button>
      <button type="button" disabled title="חיוב לקוח יהיה זמין לאחר חיבור מערכת תשלומים" className="inline-flex min-h-10 w-full cursor-not-allowed items-center gap-2.5 rounded-xl border border-[#CBD2DB] bg-[#FBFCFD] px-2.5 text-right text-xs font-extrabold text-slate-500 opacity-80">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F8]"><ReceiptText className="h-4 w-4" aria-hidden="true" /></span>
        <span>חיוב לקוח</span><span className="mr-auto text-[10px] font-bold text-slate-400">בקרוב</span>
      </button>
    </div>
  </Card>;
}

function appointmentStatus(statusValue: unknown): { label: string; className: string } {
  const status = String(statusValue ?? "").trim().toLowerCase();
  if (status === "requested") return { label: "ממתין לאישור", className: "bg-amber-50 text-amber-800" };
  if (status === "confirmed") return { label: "מאושר", className: "bg-emerald-50 text-emerald-800" };
  if (status === "completed") return { label: "הושלם", className: "bg-[#EEF2FF] text-[#5267A8]" };
  if (["no_show", "no-show", "noshow"].includes(status)) return { label: "לא הגיע", className: "bg-red-50 text-red-700" };
  return { label: "נקבע", className: "bg-slate-100 text-slate-600" };
}

function animalLabel(record: CrmRecord): string {
  const petName = String(record.pet_name ?? "").trim();
  const species = String(record.pet_species ?? "").trim().toLowerCase();
  const speciesLabel = species === "dog" ? "כלב" : species === "cat" ? "חתול" : species === "other" ? "חיה" : "";
  if (petName && speciesLabel) return `${petName} · ${speciesLabel}`;
  return petName || speciesLabel || "חיית מחמד לא צוינה";
}

function AppointmentsCard({ appointments, state, today, search, onOpenCalendar, mode, reducedMotion }: {
  appointments: CrmRecord[];
  state: DashboardWidgetRequestState;
  today: string;
  search: string;
  onOpenCalendar: () => void;
  mode: CrmWidgetSizeMode;
  reducedMotion: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState(today);
  useEffect(() => setSelectedDate(today), [today]);
  const dateKeys = useMemo(() => getDashboardCalendarDateKeys(today, 30), [today]);
  const lastCalendarDate = dateKeys[dateKeys.length - 1];
  const searchTerm = search.trim().toLocaleLowerCase("he");
  const upcomingAppointments = useMemo(() => appointments
    .filter((record) => {
      const date = String(record.date ?? "");
      const status = String(record.status ?? "").toLowerCase();
      return date >= today && date <= lastCalendarDate && status !== "cancelled" && status !== "canceled";
    })
    .filter((record) => !searchTerm || [record.client_name, record.pet_name, record.appointment_type].map((value) => String(value ?? "").toLocaleLowerCase("he")).join(" ").includes(searchTerm))
    .sort((first, second) => `${String(first.date ?? "")} ${String(first.start_time ?? "")}`.localeCompare(`${String(second.date ?? "")} ${String(second.start_time ?? "")}`)), [appointments, lastCalendarDate, searchTerm, today]);
  const selectedAppointments = upcomingAppointments.filter((record) => String(record.date ?? "") === selectedDate);
  const visibleAppointments = selectedAppointments.slice(0, mode === "compact" ? 1 : mode === "medium" ? 4 : 8);

  return <Card title="יומן פגישות" icon={CalendarDays} mode={mode} reducedMotion={reducedMotion} className="crm-dashboard-card">
    <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
      <p className="truncate text-[11px] font-semibold text-slate-500">{formatDashboardDate(selectedDate, { weekday: "long", day: "numeric", month: "short" })}</p>
      <button type="button" onClick={onOpenCalendar} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-extrabold text-[#5267A8] transition hover:bg-[#F7F8FF] hover:underline focus:outline-none focus:ring-2 focus:ring-[#F2D162] md:min-h-8">
        <span className={mode === "compact" ? "sr-only" : ""}>פתיחת היומן</span><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
    <div className="mb-3 flex min-w-0 gap-1.5 overflow-x-auto pb-1" role="group" aria-label="בחירת יום לתצוגת התורים">
      {dateKeys.map((dateKey) => {
        const active = dateKey === selectedDate;
        const isToday = dateKey === today;
        return <button key={dateKey} type="button" aria-pressed={active} aria-label={formatDashboardDate(dateKey, { weekday: "long", day: "numeric", month: "long" })} title={formatDashboardDate(dateKey, { weekday: "long", day: "numeric", month: "long" })} onClick={() => setSelectedDate(dateKey)} className={`min-w-[48px] rounded-xl border px-1.5 py-1.5 text-center transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${active ? "border-[#1A1A3E] bg-[#1A1A3E] text-white" : isToday ? "border-[#E5CA5B] bg-[#FFFBEA] text-[#1A1A3E]" : "border-[#EEF0F3] bg-white text-slate-500 hover:bg-[#FBFCFD]"}`}>
          <span className="block truncate text-[9px] font-bold">{isToday ? "היום" : formatDashboardDate(dateKey, { weekday: "short" })}</span>
          <span className="mt-0.5 block text-sm font-black leading-4">{formatDashboardDate(dateKey, { day: "numeric" })}</span>
        </button>;
      })}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
      {state.isLoading ? <WidgetLoading label="טוענים את התורים" rows={4} />
        : state.error ? <WidgetError onRetry={state.onRetry} />
          : visibleAppointments.length > 0 ? <div className="space-y-2">
            {visibleAppointments.map((appointment, index) => {
              const name = String(appointment.client_name ?? "").trim() || "שם הלקוח לא צוין";
              const service = String(appointment.appointment_type ?? "").trim() || "שירות לא צוין";
              const startTime = String(appointment.start_time ?? "").slice(0, 5);
              const endTime = String(appointment.end_time ?? "").slice(0, 5);
              const status = appointmentStatus(appointment.status);
              return <div key={String(appointment.id || `${appointment.date}-${startTime}-${index}`)} className="grid grid-cols-[68px_minmax(0,1fr)] items-stretch gap-2 rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] px-2.5 py-2">
                <div className="flex min-w-0 flex-col items-center justify-center border-l border-[#E6E9F3] pl-2 text-center">
                  <span className="text-xs font-black text-[#1A1A3E]" dir="ltr">{startTime || "--:--"}</span>
                  {endTime && <span className="mt-0.5 text-[10px] font-bold text-slate-400" dir="ltr">{endTime}</span>}
                </div>
                <div className="min-w-0 py-0.5">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="crm-dashboard-client-name min-w-0 flex-1 text-xs font-extrabold leading-4 text-[#1A1A3E]"><bdi dir="auto">{name}</bdi></p>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-extrabold ${status.className}`}>{status.label}</span>
                  </div>
                  <p className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-semibold text-slate-500">
                    <PawPrint className="h-3 w-3 shrink-0 text-[#5267A8]" aria-hidden="true" />
                    <bdi dir="auto" className="max-w-[45%] truncate">{animalLabel(appointment)}</bdi>
                    <span className="shrink-0 text-slate-300">·</span>
                    <bdi dir="auto" className="min-w-0 truncate">{service}</bdi>
                  </p>
                </div>
              </div>;
            })}
            {selectedAppointments.length > visibleAppointments.length && <p className="pt-1 text-center text-[10px] font-semibold text-slate-400">{selectedAppointments.length - visibleAppointments.length === 1 ? "עוד תור אחד ביום הזה" : `${numberText(selectedAppointments.length - visibleAppointments.length)} תורים נוספים ביום הזה`}</p>}
          </div>
          : <div className="flex min-h-[92px] flex-col items-center justify-center rounded-xl border border-dashed border-[#D9DEE5] bg-[#FBFCFD] px-3 py-4 text-center">
            <p className="text-xs font-extrabold text-[#1A1A3E]">{searchTerm ? "אין תורים שמתאימים לחיפוש" : upcomingAppointments.length === 0 ? "אין תורים בטווח הקרוב" : "אין תורים ביום הזה"}</p>
            <p className="mt-1 text-[10px] font-medium leading-4 text-slate-500">{searchTerm ? "אפשר לשנות את מילות החיפוש או לבחור יום אחר." : "תורים חדשים יופיעו כאן לפי היום שנבחר."}</p>
          </div>}
    </div>
  </Card>;
}

function PendingApprovalsCard({ appointments, state, onDecision, mode, reducedMotion }: {
  appointments: CrmRecord[];
  state: DashboardWidgetRequestState;
  onDecision: (record: CrmRecord, action: AppointmentDecisionAction) => Promise<AppointmentDecisionResult>;
  mode: CrmWidgetSizeMode;
  reducedMotion: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<CrmRecord | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "partial" | "error"; text: string } | null>(null);
  const visibleAppointments = appointments.slice(0, 3);
  const rejectingName = String(rejecting?.client_name ?? "").trim() || "הלקוח";

  async function decide(record: CrmRecord, action: AppointmentDecisionAction) {
    const id = String(record.id ?? "");
    setBusyId(id);
    setFeedback(null);
    try {
      const result = await onDecision(record, action);
      setFeedback({
        tone: result.isPartial ? "partial" : "success",
        text: result.isPartial
          ? "הבקשה טופלה, אך חלק מהעדכונים הנלווים לא הושלמו."
          : action === "approve" ? "התור אושר והבקשה הוסרה מהרשימה." : "הבקשה נדחתה והוסרה מהרשימה.",
      });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "לא הצלחנו לשמור את ההחלטה. נסי שוב." });
    } finally {
      setBusyId(null);
    }
  }

  return <>
    <Card title="ממתינים לאישור" icon={Clock3} mode={mode} reducedMotion={reducedMotion} className="crm-dashboard-card">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div><p className="text-4xl font-black leading-none tracking-tight text-[#1A1A3E]">{state.isLoading ? "—" : state.error ? "—" : numberText(appointments.length)}</p><p className="mt-1 text-[10px] font-bold text-slate-500">{appointments.length === 1 ? "תור אחד ממתין" : "תורים ממתינים"}</p></div>
        <span className="rounded-full bg-[#FFF7D6] px-2.5 py-1 text-[9px] font-extrabold text-[#6F5A14]">דורש טיפול</span>
      </div>
      {state.isLoading ? <WidgetLoading label="טוענים בקשות שממתינות לאישור" rows={3} />
        : state.error ? <WidgetError onRetry={state.onRetry} />
          : appointments.length === 0 ? <div className="rounded-xl border border-dashed border-[#E6E9F3] bg-[#FBFCFD] px-3 py-4 text-center text-xs font-extrabold leading-5 text-slate-500">אין תורים שממתינים לאישור</div>
            : <div className="space-y-1.5">
              {visibleAppointments.map((record, index) => {
                const id = String(record.id || `${record.date}-${record.start_time}-${index}`);
                const name = String(record.client_name ?? "").trim() || "שם הלקוח לא צוין";
                const dateText = [record.date ? formatDashboardDate(String(record.date), { day: "numeric", month: "short" }) : "", String(record.start_time ?? "").slice(0, 5)].filter(Boolean).join(" · ");
                const busy = Boolean(busyId);
                return <div key={id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 rounded-lg border border-[#EEF0F3] bg-white px-2 py-1.5">
                  <div className="min-w-0"><p className="truncate text-[11px] font-extrabold text-[#1A1A3E]"><bdi dir="auto">{name}</bdi></p>{dateText && <p className="truncate text-[9px] font-medium text-slate-400">{dateText}</p>}</div>
                  <button type="button" disabled={busy} onClick={() => void decide(record, "approve")} aria-label={`אישור התור של ${name}`} className="inline-flex min-h-9 min-w-[45px] items-center justify-center gap-1 rounded-lg border border-[#1A1A3E] bg-[#1A1A3E] px-2 text-[10px] font-black text-white transition hover:border-[#2A2A5A] hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-wait disabled:opacity-55">{busyId === id ? <Clock3 className="h-3 w-3 animate-pulse" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}אישור</button>
                  <button type="button" disabled={busy} onClick={() => setRejecting(record)} aria-label={`דחיית התור של ${name}`} className="inline-flex min-h-9 min-w-[45px] items-center justify-center gap-1 rounded-lg border border-[#A52D2D] bg-transparent px-2 text-[10px] font-black text-[#A52D2D] transition hover:bg-[#FFF8F8] focus:outline-none focus:ring-2 focus:ring-[#D96868] disabled:cursor-wait disabled:opacity-55"><XCircle className="h-3 w-3" aria-hidden="true" />דחייה</button>
                </div>;
              })}
              {feedback && <p role={feedback.tone === "error" ? "alert" : "status"} aria-live="polite" className={`rounded-lg px-2.5 py-2 text-[10px] font-bold leading-4 ${feedback.tone === "error" ? "bg-red-50 text-red-700" : feedback.tone === "partial" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{feedback.text}</p>}
            </div>}
    </Card>
    <AlertDialog open={Boolean(rejecting)} onOpenChange={(open) => { if (!open) setRejecting(null); }}>
      <AlertDialogContent dir="rtl" className="rounded-2xl border-[#E5E7EB] bg-white text-right shadow-2xl">
        <AlertDialogHeader className="text-right">
          <AlertDialogTitle className="text-right text-lg font-black text-[#1A1A3E]">לדחות את התור של <bdi dir="auto">{rejectingName}</bdi>?</AlertDialogTitle>
          <AlertDialogDescription className="text-right text-sm leading-6 text-slate-600">הבקשה של <bdi dir="auto" className="font-extrabold text-[#1A1A3E]">{rejectingName}</bdi> תסורב, סטטוס התור יעודכן והודעת ביטול תישלח לפי תהליך המרפאה.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel className="mt-0 min-h-11 rounded-xl border-[#D9DEE5] text-xs font-extrabold text-slate-600">חזרה</AlertDialogCancel>
          <AlertDialogAction onClick={() => { const record = rejecting; setRejecting(null); if (record) void decide(record, "reject"); }} className="min-h-11 rounded-xl bg-[#A52D2D] px-4 text-xs font-extrabold text-white hover:bg-[#8F2525] focus:ring-[#D96868]">כן, לדחות</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

function QuickMenuWidget(props: { onOpenCalendar: () => void; onOpenClients: () => void; mode: CrmWidgetSizeMode; reducedMotion: boolean }) {
  return <QuickMenuCard {...props} />;
}

function MonthlyAppointmentsCard({ appointments, state, today, mode, reducedMotion }: { appointments: CrmRecord[]; state: DashboardWidgetRequestState; today: string; mode: CrmWidgetSizeMode; reducedMotion: boolean }) {
  const summary = useMemo(() => summarizeDashboardAppointments(appointments, today), [appointments, today]);
  const comparison = summary.currentCount - summary.previousCount;
  const ComparisonIcon = comparison > 0 ? TrendingUp : comparison < 0 ? TrendingDown : ArrowUpRight;
  const comparisonText = summary.previousCount === 0
    ? summary.currentCount === 0 ? "0%" : "חדש החודש"
    : comparison === 0 ? "0%" : `${Math.round(Math.abs(comparison) / summary.previousCount * 100)}%`;
  const maxCount = Math.max(1, ...summary.lastFourteenDays.map((day) => day.count));
  const noRecentAppointments = summary.lastFourteenDays.every((day) => day.count === 0);

  return <Card title="תורים החודש" icon={CalendarDays} mode={mode} reducedMotion={reducedMotion} className="crm-dashboard-card">
    {state.isLoading ? <WidgetLoading label="טוענים נתוני התורים החודשיים" rows={3} />
      : state.error ? <WidgetError onRetry={state.onRetry} />
        : <>
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-4xl font-black leading-none tracking-tight text-[#1A1A3E]">{numberText(summary.currentCount)}</p>
              <p className="mt-1 truncate text-[11px] font-extrabold text-slate-600">{summary.currentCount === 1 ? "תור אחד החודש" : `${numberText(summary.currentCount)} תורים החודש`}</p>
            </div>
            <div className="shrink-0 text-left">
              <div className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-black ${comparison < 0 ? "bg-[#F1F4FF] text-[#5267A8]" : "bg-[#FFF7D6] text-[#6F5A14]"}`} aria-label={`השוואה לחודש הקודם: ${comparisonText}`}>
                <ComparisonIcon className="h-3.5 w-3.5" aria-hidden="true" />{comparisonText}
              </div>
              <p className="mt-1 text-[9px] font-semibold text-slate-400">לעומת החודש הקודם</p>
            </div>
          </div>
          <div className="mt-3 flex min-h-0 flex-1 flex-col justify-end">
            <div className="flex h-12 items-end gap-[3px]" role="img" aria-label="עמודות של מספר התורים בכל אחד מארבעת עשר הימים האחרונים">
              {summary.lastFourteenDays.map((day) => {
                const isToday = day.dateKey === today;
                const height = day.count === 0 ? 3 : 5 + Math.round(day.count / maxCount * 25);
                const dateLabel = formatDashboardDate(day.dateKey, { day: "numeric", month: "short" });
                return <div key={day.dateKey} className="flex h-full min-w-0 flex-1 items-end justify-center" title={`${dateLabel}: ${appointmentCountText(day.count)}`}>
                  <span className={`w-full max-w-[13px] rounded-t-md transition-[height,background-color] duration-300 ${isToday ? "bg-[#D6B83F]" : day.count > 0 ? "bg-[#596EAA]" : "bg-[#E7EBF2]"}`} style={{ height: `${height}px` }} />
                </div>;
              })}
            </div>
            <div className="mt-1 flex items-center justify-between text-[9px] font-semibold text-slate-400"><span>14 הימים האחרונים</span><span>היום בזהב</span></div>
            {noRecentAppointments && <p className="mt-1 text-[9px] font-medium text-slate-400">אין תורים ב-14 הימים האחרונים.</p>}
          </div>
        </>}
  </Card>;
}

function ClientsCard({ clients, state, search, onOpenClients, mode, reducedMotion }: { clients: DashboardClientSummary[]; state: DashboardWidgetRequestState; search: string; onOpenClients: () => void; mode: CrmWidgetSizeMode; reducedMotion: boolean }) {
  const searchTerm = search.trim().toLocaleLowerCase("he");
  const matchingClients = searchTerm ? clients.filter((client) => `${client.name} ${client.petNames.join(" ")}`.toLocaleLowerCase("he").includes(searchTerm)) : clients;
  const visibleClients = matchingClients.slice(0, mode === "compact" ? 2 : 4);
  const count = searchTerm ? matchingClients.length : clients.length;

  return <Card title="לקוחות" icon={Users} mode={mode} reducedMotion={reducedMotion} className="crm-dashboard-card">
    {state.isLoading ? <WidgetLoading label="טוענים לקוחות ופעילות אחרונה" rows={4} />
      : state.error ? <WidgetError onRetry={state.onRetry} />
        : clients.length === 0 ? <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-[#D9DEE5] bg-[#FBFCFD] px-4 text-center text-xs font-bold text-slate-500">אין עדיין לקוחות פעילים להצגה.</div>
          : <div className="grid min-h-0 grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] gap-3">
            <div className="min-w-0 rounded-xl bg-[#FBFCFD] px-3 py-3">
              <p className="text-3xl font-black leading-none tracking-tight text-[#1A1A3E]">{numberText(count)}</p>
              <p className="mt-1 text-[11px] font-extrabold leading-4 text-slate-600">{clientCountText(count, Boolean(searchTerm))}</p>
              {searchTerm && <p className="mt-1 text-[9px] font-semibold text-slate-400">מתוך כלל הלקוחות הפעילים</p>}
              <button type="button" onClick={onOpenClients} className="mt-3 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-[10px] font-extrabold text-[#5267A8] transition hover:bg-white hover:underline focus:outline-none focus:ring-2 focus:ring-[#F2D162]">לכל הלקוחות<ArrowLeft className="h-3 w-3" aria-hidden="true" /></button>
            </div>
            <div className="min-w-0 border-r border-[#EEF0F3] pr-3">
              <p className="mb-2 text-[10px] font-extrabold text-slate-500">הפעילות האחרונה</p>
              {visibleClients.length === 0 ? <p className="rounded-lg bg-[#FBFCFD] px-2 py-3 text-[10px] font-semibold text-slate-500">לא נמצאו לקוחות תואמים לחיפוש.</p> : <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {visibleClients.map((client, index) => <div key={client.id} className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${avatarColors[index % avatarColors.length]}`}>{initials(client.name)}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-extrabold text-[#1A1A3E]"><bdi dir="auto">{client.name}</bdi></p><p className="truncate text-[9px] font-medium text-slate-500">{client.lastActivityLabel}</p></div>
                </div>)}
              </div>}
            </div>
          </div>}
  </Card>;
}

function NewLeadsCard({ leads, state, mode, reducedMotion }: { leads: DashboardLeadSummary; state: DashboardWidgetRequestState; mode: CrmWidgetSizeMode; reducedMotion: boolean }) {
  return <Card title="לידים חדשים" icon={UserRound} mode={mode} reducedMotion={reducedMotion} className="crm-dashboard-card">
    {state.isLoading ? <WidgetLoading label="טוענים את הפניות החדשות" rows={2} />
      : state.error ? <WidgetError onRetry={state.onRetry} />
        : <div className="flex h-full min-h-[118px] flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><p className="text-4xl font-black leading-none tracking-tight text-[#1A1A3E]">{numberText(leads.count)}</p><p className="mt-1 text-[11px] font-extrabold text-slate-600">{leadCountText(leads.count)}</p></div>
            <span className="shrink-0 rounded-lg bg-[#F7F8FF] px-2 py-1.5 text-[9px] font-extrabold text-[#5267A8]">החודש</span>
          </div>
          <div className="mt-auto border-t border-[#EEF0F3] pt-2.5">
            <p className="text-[9px] font-extrabold text-slate-400">הפנייה האחרונה</p>
            {leads.latest ? <div className="mt-1 flex min-w-0 items-center justify-between gap-2"><p className="min-w-0 truncate text-[11px] font-extrabold text-[#1A1A3E]"><bdi dir="auto">{String(leads.latest.name ?? "").trim() || "שם הפונה לא צוין"}</bdi></p><span className="shrink-0 text-[9px] font-semibold text-slate-500" dir="auto">{formatDashboardTimestamp(leads.latest.created_at)}</span></div>
              : <p className="mt-1 text-[10px] font-semibold text-slate-500">אין פניות חדשות החודש.</p>}
          </div>
        </div>}
  </Card>;
}

export function CrmDashboardCards({ appointments, appointmentsState, pendingAppointments, pendingState, clients, clientsState, leads, leadsState, today, search, onOpenCalendar, onOpenClients, onAppointmentDecision, widgetOrder, widgetLayout, isEditing, onOrderChange, onLayoutChange }: CrmDashboardCardsProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const widgets: CrmDashboardWidget[] = [
    { id: "appointmentCalendar", label: "יומן פגישות", render: (mode) => <AppointmentsCard appointments={appointments} state={appointmentsState} today={today} search={search} onOpenCalendar={onOpenCalendar} mode={mode} reducedMotion={reducedMotion} /> },
    { id: "pendingApprovals", label: "ממתינים לאישור", render: (mode) => <PendingApprovalsCard appointments={pendingAppointments} state={pendingState} onDecision={onAppointmentDecision} mode={mode} reducedMotion={reducedMotion} /> },
    { id: "quickMenu", label: "תפריט מהיר", render: (mode) => <QuickMenuWidget onOpenCalendar={onOpenCalendar} onOpenClients={onOpenClients} mode={mode} reducedMotion={reducedMotion} /> },
    { id: "appointmentsThisMonth", label: "תורים החודש", render: (mode) => <MonthlyAppointmentsCard appointments={appointments} state={appointmentsState} today={today} mode={mode} reducedMotion={reducedMotion} /> },
    { id: "clients", label: "לקוחות", render: (mode) => <ClientsCard clients={clients} state={clientsState} search={search} onOpenClients={onOpenClients} mode={mode} reducedMotion={reducedMotion} /> },
    { id: "newLeads", label: "לידים חדשים", render: (mode) => <NewLeadsCard leads={leads} state={leadsState} mode={mode} reducedMotion={reducedMotion} /> },
  ];

  return <div className="space-y-4"><CrmDashboardLayoutEditor widgets={widgets} order={widgetOrder} layout={widgetLayout} isEditing={isEditing} onOrderChange={onOrderChange} onLayoutChange={onLayoutChange} />
    {search && <p className="text-center text-xs font-semibold text-slate-400">החיפוש מסנן את שמות הלקוחות והתורים בווידג׳טים הרלוונטיים.</p>}
  </div>;
}
