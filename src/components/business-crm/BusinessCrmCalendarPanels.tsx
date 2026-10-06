import { useMemo, useState } from "react";
import { format, isValid } from "date-fns";
import { he } from "date-fns/locale";
import { isValidTime } from "@/lib/clinicAvailability";
import type { ManagerBookingWarning } from "@/lib/adminAppointmentAvailability";
import { AlertCircle, CalendarDays, Check, CheckCircle2, Clock3, Copy, CreditCard, Loader2, Mail, MapPin, PawPrint, Pencil, Phone, Plus, RefreshCw, Search, Send, StickyNote, UserRound, Video, X, XCircle, type LucideIcon } from "lucide-react";
import type { CrmRecord } from "@/components/business-crm/CrmContext";
import type { ClientRow } from "@/lib/crmClientData";
import { appointmentDateTime, appointmentStatusTone, isToday, recordStatusLabel, reminderState, text, type AppointmentEditDraft } from "@/lib/crmCalendar";
import { BusinessCrmCalendarAppointmentEditor, type AppointmentEditorMode } from "@/components/business-crm/BusinessCrmCalendarAppointmentEditor";
import type { CalendarServiceItem } from "@/components/business-crm/BusinessCrmCalendarToolbar";

export interface QuickBookingDraft { serviceId: string; clientName: string; phone: string; email: string; petName: string; petSpecies: string; notes: string; }
export type QuickBookingCustomerMode = "existing" | "new";
export type CalendarDetailMode = "view" | AppointmentEditorMode;
export interface CalendarDetailFeedback { tone: "success" | "error" | "info" | "warning"; message: string; }
export interface CalendarPrivateNote { id?: string; appointment_id?: string; body?: string; author_name?: string; created_at?: string; }
export interface CalendarSyncCounts { scanned: number; linked_existing: number; created: number; failed: number; needs_review: number; skipped: number; }
export interface CalendarBackfillUiState {
  phase: "idle" | "running" | "complete" | "interrupted";
  counts: CalendarSyncCounts;
  page: number;
  complete: boolean;
  inventoryLimitReached: boolean;
  retryable: boolean;
  tone: "success" | "error" | "info" | "warning";
  message: string;
}
export interface CalendarSyncFeedback extends CalendarDetailFeedback {
  retryAppointmentId?: string;
  retryAction?: "sync" | "remove";
  busyAppointmentId?: string;
}
interface CalendarAppointmentSyncPanelProps {
  canManage: boolean;
  state: CalendarBackfillUiState;
  syncFeedback: CalendarSyncFeedback | null;
  onRunBackfill: () => void;
  onRetrySingle: (appointmentId: string) => void;
}

export function CalendarAppointmentSyncPanel({ canManage, state, syncFeedback, onRunBackfill, onRetrySingle }: CalendarAppointmentSyncPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (!canManage) return null;
  const running = state.phase === "running";
  const hasSummary = state.phase !== "idle";
  const toneClasses = state.tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : state.tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : state.tone === "error"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-blue-100 bg-blue-50 text-blue-900";
  const syncToneClasses = syncFeedback?.tone === "success"
    ? "border-emerald-100 bg-emerald-50 text-emerald-900"
    : syncFeedback?.tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : syncFeedback?.tone === "error"
        ? "border-red-100 bg-red-50 text-red-900"
        : "border-blue-100 bg-blue-50 text-blue-900";
  const runConfirmed = () => {
    setConfirmOpen(false);
    onRunBackfill();
  };

  return <>
    <section aria-labelledby="calendar-google-sync-title" dir="rtl" className="relative overflow-hidden rounded-2xl border border-[#DDE5EF] bg-gradient-to-l from-white via-[#FBFCFD] to-[#F4F6FB] p-4 shadow-sm sm:p-5">
      <div className="pointer-events-none absolute -left-10 -top-12 h-36 w-36 rounded-full bg-[#F2D162]/20 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1A1A3E] text-[#F2D162] shadow-sm"><CalendarDays className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#5267A8]">קישור יומן המרפאה</p>
            <h2 id="calendar-google-sync-title" className="mt-1 text-base font-black text-[#1A1A3E]">סנכרון תורים מאושרים ל-Google Calendar</h2>
            <p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-slate-600">הפעולה תמצא אירועים קיימים לפני יצירת חדשים, ותשאיר התאמות לא ברורות לבדיקה ידנית. בקשות ממתינות, ביטולים והערות צוות פנימיות לא יועתקו ליומן.</p>
          </div>
        </div>
        <button type="button" onClick={() => setConfirmOpen(true)} disabled={running} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-xs font-black text-white shadow-sm transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-wait disabled:opacity-65">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {running ? "מסנכרנת תורים..." : state.retryable ? "בדיקה חוזרת של תורים חסרי קישור" : "סנכרון תורים חסרי קישור"}
        </button>
      </div>

      {syncFeedback && <div role={syncFeedback.tone === "error" ? "alert" : "status"} className={`relative mt-4 flex flex-col gap-3 rounded-xl border px-3 py-3 text-xs font-bold leading-5 sm:flex-row sm:items-center sm:justify-between ${syncToneClasses}`}>
        <div className="flex min-w-0 items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{syncFeedback.message}</p></div>
        {syncFeedback.retryAppointmentId && <button type="button" onClick={() => onRetrySingle(syncFeedback.retryAppointmentId!)} disabled={syncFeedback.busyAppointmentId === syncFeedback.retryAppointmentId} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-current bg-white/80 px-3 text-[11px] font-black transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/30 disabled:cursor-wait disabled:opacity-60">
          {syncFeedback.busyAppointmentId === syncFeedback.retryAppointmentId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {syncFeedback.retryAction === "remove" ? "נסי להסיר שוב את אירוע הפגישה" : "נסי לסנכרן שוב את הפגישה"}
        </button>}
      </div>}

      {hasSummary && <div className={`relative mt-4 rounded-xl border px-3 py-3 ${toneClasses}`}>
        <div role={state.tone === "error" || state.tone === "warning" ? "alert" : "status"} className="flex items-start gap-2 text-xs font-bold leading-5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{state.message}</p></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["נבדקו", state.counts.scanned],
            ["קושרו לאירוע קיים", state.counts.linked_existing],
            ["נוצרו", state.counts.created],
            ["נכשלו", state.counts.failed],
            ["דורשים בדיקה", state.counts.needs_review],
            ["דולגו", state.counts.skipped],
          ].map(([label, count]) => <div key={String(label)} className="rounded-lg border border-white/70 bg-white/75 px-2.5 py-2 text-center">
            <p className="text-base font-black tabular-nums text-[#1A1A3E]">{count}</p>
            <p className="mt-0.5 text-[9px] font-extrabold leading-4 text-slate-500">{label}</p>
          </div>)}
        </div>
      </div>}
    </section>

    {confirmOpen && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#1A1A3E]/[0.42] p-3 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="calendar-google-sync-confirm-title" dir="rtl" className="w-full max-w-lg rounded-3xl border border-[#DDE5EF] bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFFBEA] text-[#80620B]"><CalendarDays className="h-5 w-5" /></span><div><p className="text-[10px] font-black tracking-wide text-[#5267A8]">בדיקת יומן לפני יצירה</p><h2 id="calendar-google-sync-confirm-title" className="mt-1 text-lg font-black text-[#1A1A3E]">לסנכרן את התורים המאושרים?</h2></div></div>
        <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">Buildy תעבור על התורים המאושרים שאין להם קישור ל-Google Calendar. אירוע ייקשר אם נמצאה התאמה מדויקת וייחודית, ואירוע חדש ייווצר רק אם לא נמצאה התאמה.</p>
        <ul className="mt-3 space-y-2 rounded-2xl bg-[#F7F8FA] p-3 text-xs font-bold leading-5 text-slate-700">
          <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2C6A3B]" />התאמות כפולות לא ישונו, הן יוצגו כמקרים לבדיקה.</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2C6A3B]" />בקשות ממתינות, תורים שבוטלו והערות צוות פנימיות יישארו מחוץ ליומן.</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2C6A3B]" />אפשר להריץ שוב בבטחה. אירועים שכבר קושרו לא ייווצרו פעם נוספת.</li>
        </ul>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-start"><button type="button" onClick={() => setConfirmOpen(false)} className="min-h-10 rounded-xl border border-[#D9DEE5] px-4 text-xs font-extrabold text-slate-600 transition hover:bg-[#FBFCFD] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">חזרה ליומן</button><button type="button" onClick={runConfirmed} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-xs font-black text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><RefreshCw className="h-4 w-4" />אישור וסנכרון</button></div>
      </section>
    </div>}
  </>;
}

interface QuickBookingProps {
  date: Date;
  time: string;
  now: Date;
  services: CalendarServiceItem[];
  customers: ClientRow[];
  customerMode: QuickBookingCustomerMode;
  customerSearch: string;
  selectedCustomerId: string | null;
  selectedCustomer: ClientRow | null;
  managerWarnings: ManagerBookingWarning[];
  publicSuggestedTimes: string[];
  publicAvailabilityLoading: boolean;
  publicAvailabilityError: string;
  availabilityChecksLoading: boolean;
  availabilityChecksError: string;
  draft: QuickBookingDraft;
  feedback: string;
  saving: boolean;
  onChange: (field: keyof QuickBookingDraft, value: string) => void;
  onCustomerModeChange: (mode: QuickBookingCustomerMode) => void;
  onCustomerSearchChange: (value: string) => void;
  onSelectCustomer: (customer: ClientRow) => void;
  onTimeChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function CalendarQuickBooking({ date, time, now, services, customers, customerMode, customerSearch, selectedCustomerId, selectedCustomer, managerWarnings, publicSuggestedTimes, publicAvailabilityLoading, publicAvailabilityError, availabilityChecksLoading, availabilityChecksError, draft, feedback, saving, onChange, onCustomerModeChange, onCustomerSearchChange, onSelectCustomer, onTimeChange, onSubmit, onClose }: QuickBookingProps) {
  const customerResults = useMemo(() => {
    const query = customerSearch.trim().toLocaleLowerCase("he");
    return customers.filter((customer) => customer.id !== selectedCustomerId && (!query || [customer.name, customer.phone, customer.email].some((value) => value.toLocaleLowerCase("he").includes(query))));
  }, [customers, customerSearch, selectedCustomerId]);
  const hasCustomerQuery = customerSearch.trim().length > 0;
  const matchingCustomers = hasCustomerQuery ? customerResults.slice(0, 6) : [];
  const hasService = services.some((service) => service.id === draft.serviceId && service.id !== "other" && service.duration > 0);
  const minimumTime = isToday(date, now) ? format(now, "HH:mm") : undefined;
  const customerReady = customerMode === "new" || Boolean(selectedCustomer);
  const canSubmit = !saving && hasService && isValidTime(time) && customerReady;

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#1A1A3E]/[0.35] p-3 backdrop-blur-sm sm:items-center"><section role="dialog" aria-modal="true" aria-labelledby="quick-booking-title" dir="rtl" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold text-[#5267A8]">פגישה חדשה</p><h2 id="quick-booking-title" className="mt-1 text-xl font-black text-[#1A1A3E]">קביעת פגישה</h2><div className="mt-2 flex items-center gap-2 text-sm font-black text-[#1A1A3E]"><Clock3 className="h-4 w-4 text-[#5267A8]" /><span>שעת התחלה:</span><span dir="ltr" className="rounded-md bg-[#FFFBEA] px-2 py-0.5 text-[#69550C]">{time || "לא נבחרה"}</span></div><p className="mt-1 text-xs font-semibold text-slate-500">{format(date, "EEEE, d בMMMM yyyy", { locale: he })}</p></div><button type="button" onClick={onClose} aria-label="סגירת קביעת הפגישה" className="rounded-xl p-2 text-slate-400 hover:bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><X className="h-5 w-5" /></button></div>{feedback && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-xs font-bold leading-5 text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{feedback}</div>}<div className="mt-5 grid gap-3 sm:grid-cols-2"><label htmlFor="quick-booking-service" className="sm:col-span-2"><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">שירות <b className="text-red-500">*</b></span><select id="quick-booking-service" value={draft.serviceId} onChange={(event) => onChange("serviceId", event.target.value)} aria-required="true" className="h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-bold text-[#1A1A3E] outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]"><option value="">בחרי שירות</option>{services.filter((service) => service.id !== "other").map((service) => <option key={service.id} value={service.id}>{service.label} · {service.duration} דקות</option>)}</select></label><div className="sm:col-span-2 space-y-2"><label htmlFor="quick-booking-time" className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-[#1A1A3E]">שעת התחלה <b className="text-red-500">*</b></span><input id="quick-booking-time" type="time" step="60" required value={time} min={minimumTime} onChange={(event) => onTimeChange(event.target.value)} disabled={saving} aria-describedby="quick-booking-public-availability quick-booking-availability quick-booking-manager-warnings" className="h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-bold text-[#1A1A3E] outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:bg-[#FBFCFD] disabled:text-slate-400" dir="ltr" /></label><section id="quick-booking-public-availability" aria-live="polite" className="rounded-2xl border border-[#E4E9F3] bg-[#F7F9FD] p-3"><div className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" /><div><h3 className="text-xs font-black text-[#1A1A3E]">השעות הפנויות ללקוח</h3><p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">אלה השעות שהלקוח יראה עבור השירות והתאריך שנבחרו.</p></div></div>{!hasService ? <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[11px] font-bold leading-5 text-slate-500">בחרי שירות כדי לראות את השעות הפנויות ללקוח.</p> : publicAvailabilityLoading ? <div role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-[11px] font-bold text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin text-[#5267A8]" />טוענת את השעות הפנויות ללקוח...</div> : publicAvailabilityError ? <div role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[11px] font-bold leading-5 text-red-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{publicAvailabilityError}</div> : publicSuggestedTimes.length === 0 ? <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[11px] font-bold leading-5 text-slate-600">לא נמצאה שעה פנויה שהלקוח יכול לבחור בשירות ובתאריך האלה. אפשר עדיין להזין כאן שעה עתידית אחרת ידנית.</p> : <div className="mt-3 flex flex-wrap gap-2">{publicSuggestedTimes.map((suggestedTime) => <button key={suggestedTime} type="button" onClick={() => onTimeChange(suggestedTime)} disabled={saving} aria-pressed={time === suggestedTime} aria-label={`בחירת שעה ${suggestedTime}`} className={`min-h-9 rounded-lg border px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50 ${time === suggestedTime ? "border-[#1A1A3E] bg-[#1A1A3E] text-white" : "border-[#CBD5E1] bg-white text-[#1A1A3E] hover:border-[#5267A8] hover:bg-[#EEF3FF]"}`} dir="ltr">{suggestedTime}</button>)}</div>}<p className="mt-3 text-[10px] font-semibold leading-4 text-slate-500">הבחירה כאן ממלאת את שעת ההתחלה. שדה השעה נשאר פתוח, ואפשר להקליד שעה עתידית אחרת גם אם היא לא ברשימת הלקוח.</p></section><div id="quick-booking-availability" aria-live="polite" className="mt-2 space-y-2">{availabilityChecksLoading && <div role="status" className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold leading-5 text-slate-600"><Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-[#5267A8]" />בודקת את נתוני הזמינות. הבדיקה מייעצת בלבד ואינה מונעת שמירה.</div>}{availabilityChecksError && <div role="status" className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold leading-5 text-blue-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{availabilityChecksError}</div>}</div>{managerWarnings.length > 0 && <section id="quick-booking-manager-warnings" aria-live="polite" role="status" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[11px] font-bold leading-5 text-amber-950"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><h3 className="font-black text-amber-950">אזהרות בלבד</h3><p className="mt-0.5 font-semibold text-amber-900">הזמן שבחרת חורג מכלל אחד או יותר. אפשר לשמור את התור בכל זאת.</p></div></div><ul className="mt-2 list-disc space-y-1 pr-6">{managerWarnings.map((warning) => <li key={warning.code}>{warning.message}</li>)}</ul></section>}</div><div className="sm:col-span-1">
  <div className="mb-1.5 flex items-center justify-between gap-2">
    <label htmlFor="quick-booking-client-name" className="text-xs font-extrabold text-[#1A1A3E]">שם הלקוח <b className="text-red-500">*</b></label>
    <button type="button" onClick={() => onCustomerModeChange(customerMode === "existing" ? "new" : "existing")} disabled={saving} className="shrink-0 rounded-md px-1.5 py-1 text-[10px] font-black text-[#5267A8] transition hover:bg-[#FFFBEA] hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50">{customerMode === "existing" ? "לקוח חדש" : "חזרה לחיפוש לקוח קיים"}</button>
  </div>
  {customerMode === "existing" ? <>
    <div className="relative">
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input id="quick-booking-client-name" role="combobox" aria-autocomplete="list" aria-controls="quick-booking-customer-options" aria-expanded={matchingCustomers.length > 0} aria-describedby="quick-booking-customer-help" aria-required="true" value={customerSearch} onChange={(event) => onCustomerSearchChange(event.target.value)} placeholder="הקלידי שם לקוח כדי לחפש" autoComplete="off" aria-label="שם הלקוח. אפשר לחפש גם לפי טלפון או אימייל" disabled={saving} className="h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 pr-10 text-sm font-semibold outline-none transition focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:bg-[#FBFCFD] disabled:text-slate-400" />
    </div>
  </> : <input id="quick-booking-client-name" value={draft.clientName} onChange={(event) => onChange("clientName", event.target.value)} autoComplete="name" aria-describedby="quick-booking-customer-help" aria-required="true" placeholder="הקלידי את שם הלקוח" disabled={saving} className="h-11 w-full rounded-xl border border-[#D9DEE5] px-3 text-sm font-semibold outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:bg-[#FBFCFD] disabled:text-slate-400" />}
  <p id="quick-booking-customer-help" className="mt-1.5 text-[10px] font-semibold text-slate-400">{customerMode === "existing" ? "אפשר לחפש גם לפי טלפון או אימייל." : "הזיני את פרטי הלקוח וחיית המחמד בשדות שמתחת."}</p>
  {customerMode === "existing" && selectedCustomer && <p className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold leading-4 text-[#2C6A3B]" aria-live="polite"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /><span><b className="font-black">{selectedCustomer.name}</b> נבחר/ה, והפרטים מולאו בשדות שמתחת.</span></p>}
  {customerMode === "existing" && matchingCustomers.length > 0 && <div id="quick-booking-customer-options" className="mt-2 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm" role="listbox" aria-label="לקוחות תואמים">{matchingCustomers.map((customer) => { const contactContext = customer.phone || customer.email || "אין פרטי קשר"; return <button key={customer.id} id={`quick-booking-customer-option-${customer.id}`} type="button" role="option" aria-selected={selectedCustomerId === customer.id} disabled={saving} onClick={() => onSelectCustomer(customer)} className="flex w-full items-center justify-between gap-3 border-b border-[#EEF0F3] px-3 py-2.5 text-right transition last:border-b-0 hover:bg-[#FFFBEA] focus:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60"><span className="min-w-0"><span className="block truncate text-sm font-black text-[#1A1A3E]">{customer.name}</span><span className="mt-1 block truncate text-[11px] font-semibold text-slate-500" dir={customer.phone || customer.email ? "ltr" : undefined}>{contactContext}</span></span><span className="shrink-0 rounded-full bg-[#FBFCFD] px-2 py-1 text-[10px] font-black text-[#5267A8]">בחירה</span></button>; })}</div>}
  {customerMode === "existing" && hasCustomerQuery && customerResults.length > matchingCustomers.length && <p className="mt-2 text-[10px] font-semibold text-slate-400">יש עוד לקוחות תואמים. המשיכי להקליד כדי לצמצם את התוצאות.</p>}
  {customerMode === "existing" && hasCustomerQuery && customerResults.length === 0 && !selectedCustomer && <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-400">לא נמצא לקוח מתאים. אפשר לבחור ״לקוח חדש״ ליד שם הלקוח.</p>}
</div><label htmlFor="quick-booking-phone"><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">טלפון <b className="text-red-500">*</b></span><input id="quick-booking-phone" value={draft.phone} onChange={(event) => onChange("phone", event.target.value)} dir="ltr" autoComplete="tel" disabled={saving || (customerMode === "existing" && !selectedCustomer)} className="h-11 w-full rounded-xl border border-[#D9DEE5] px-3 text-sm font-semibold outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]" /></label><label htmlFor="quick-booking-pet-name"><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">שם חיית המחמד <b className="text-red-500">*</b></span><input id="quick-booking-pet-name" value={draft.petName} onChange={(event) => onChange("petName", event.target.value)} disabled={saving || (customerMode === "existing" && !selectedCustomer)} className="h-11 w-full rounded-xl border border-[#D9DEE5] px-3 text-sm font-semibold outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]" /></label><label htmlFor="quick-booking-pet-species"><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">סוג חיית מחמד <b className="text-red-500">*</b></span><select id="quick-booking-pet-species" value={draft.petSpecies} onChange={(event) => onChange("petSpecies", event.target.value)} disabled={saving || (customerMode === "existing" && !selectedCustomer)} className="h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-bold text-[#1A1A3E] outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]"><option value="">בחרי סוג</option><option value="dog">כלב</option><option value="cat">חתול</option><option value="other">אחר</option></select></label><label htmlFor="quick-booking-email" className="sm:col-span-2"><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">אימייל <span className="font-semibold text-slate-400">(אופציונלי)</span></span><input id="quick-booking-email" value={draft.email} onChange={(event) => onChange("email", event.target.value)} dir="ltr" autoComplete="email" disabled={saving || (customerMode === "existing" && !selectedCustomer)} className="h-11 w-full rounded-xl border border-[#D9DEE5] px-3 text-sm font-semibold outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]" /></label><label htmlFor="quick-booking-notes" className="sm:col-span-2"><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">הערות <span className="font-semibold text-slate-400">(אופציונלי)</span></span><textarea id="quick-booking-notes" value={draft.notes} onChange={(event) => onChange("notes", event.target.value)} rows={3} placeholder="מידע שיעזור לצוות המרפאה" className="w-full resize-none rounded-xl border border-[#D9DEE5] px-3 py-2.5 text-sm font-medium outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]" /></label></div><p className="mt-4 rounded-xl bg-[#FBFCFD] px-3 py-2.5 text-[11px] font-semibold leading-5 text-slate-500">התור יישמר כמאושר, ללא הוספת הסכמה ל-SMS. התזכורות הקיימות ימשיכו לפעול לפי מדיניות המרפאה.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-start"><button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-xl border border-[#D9DEE5] px-5 text-sm font-extrabold text-slate-600 transition hover:bg-[#FBFCFD] disabled:opacity-50">ביטול</button><button type="button" onClick={onSubmit} disabled={!canSubmit} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60">{saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{saving ? "שומרת את הפגישה..." : "שמירת פגישה מאושרת"}</button></div></section></div>;
}

interface EventDetailsProps {
  record: CrmRecord;
  service?: CalendarServiceItem;
  services: CalendarServiceItem[];
  canManageCalendar: boolean;
  onClose: () => void;
  onOpenInbox: (clientName: string) => void;
  editorMode: CalendarDetailMode;
  editDraft: AppointmentEditDraft | null;
  editFeedback?: string | null;
  savingAppointment: boolean;
  onBeginEditor: (mode: AppointmentEditorMode) => void;
  onEditDraftChange: (field: keyof AppointmentEditDraft, value: string) => void;
  onSubmitEditor: () => void;
  onCancelEditor: () => void;
  decisionSaving: boolean;
  onApprove: () => void;
  onReject: () => void;
  cancelConfirmOpen: boolean;
  cancelSaving: boolean;
  onRequestCancel: () => void;
  onCancelCancel: () => void;
  onConfirmCancel: () => void;
  calendarRemovalRetrying: boolean;
  onRetryCalendarRemoval: () => void;
  noShowConfirmOpen: boolean;
  noShowSaving: boolean;
  onRequestNoShow: () => void;
  onCancelNoShow: () => void;
  onConfirmNoShow: () => void;
  feedback?: CalendarDetailFeedback | null;
  notes: CalendarPrivateNote[];
  notesLoading: boolean;
  notesAvailable: boolean;
  notesError: string | null;
  notesRetryable: boolean;
  onRetryNotes: () => void;
  noteDraft: string;
  savingNote: boolean;
  onNoteDraftChange: (value: string) => void;
  onSaveNote: () => void;
}

const statusClasses: Record<string, string> = { confirmed: "bg-[#E8F2EA] text-[#2C6A3B]", requested: "bg-[#FFFBEA] text-[#80620B]", completed: "bg-[#EEF0F3] text-slate-600", no_show: "bg-[#FFF1E6] text-[#934D1E]", cancelled: "bg-red-50 text-red-700", unknown: "bg-slate-100 text-slate-600" };
function noteTimestamp(value?: string) { const date = value ? new Date(value) : null; return date && isValid(date) ? format(date, "d בMMM yyyy, HH:mm", { locale: he }) : "זמן שמירה לא צוין"; }
function Feedback({ feedback }: { feedback?: CalendarDetailFeedback | null }) {
  if (!feedback) return null;
  const tone = feedback.tone === "success"
    ? "border-emerald-100 bg-emerald-50 text-emerald-800"
    : feedback.tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : feedback.tone === "info"
        ? "border-blue-100 bg-blue-50 text-blue-800"
        : "border-red-100 bg-red-50 text-red-800";
  return <div role={feedback.tone === "error" ? "alert" : "status"} className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-3 text-xs font-bold leading-5 ${tone}`}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{feedback.message}</div>;
}
interface DetailFieldProps { label: string; value: string; Icon: LucideIcon; href?: string; }
function DetailField({ label, value, Icon, href }: DetailFieldProps) { const isExternalLink = Boolean(href?.startsWith("http")); const direction = label === "טלפון" || label === "אימייל" ? "ltr" : undefined; const content = value ? href ? <a href={href} target={isExternalLink ? "_blank" : undefined} rel={isExternalLink ? "noreferrer" : undefined} dir={direction} className="mt-2 block truncate text-xs font-bold text-[#5267A8] hover:underline">{value}</a> : <p className="mt-2 text-xs font-bold text-[#1A1A3E]">{value}</p> : <p className="mt-2 text-xs font-semibold text-slate-400">לא צוין</p>; return <div className="rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] p-3"><div className="flex items-center gap-2 text-[10px] font-extrabold text-slate-400"><Icon className="h-3.5 w-3.5" />{label}</div>{content}</div>; }

export function CalendarEventDetails({ record, service, services, canManageCalendar, onClose, onOpenInbox, editorMode, editDraft, editFeedback, savingAppointment, onBeginEditor, onEditDraftChange, onSubmitEditor, onCancelEditor, decisionSaving, onApprove, onReject, cancelConfirmOpen, cancelSaving, onRequestCancel, onCancelCancel, onConfirmCancel, calendarRemovalRetrying, onRetryCalendarRemoval, noShowConfirmOpen, noShowSaving, onRequestNoShow, onCancelNoShow, onConfirmNoShow, feedback, notes, notesLoading, notesAvailable, notesError, notesRetryable, onRetryNotes, noteDraft, savingNote, onNoteDraftChange, onSaveNote }: EventDetailsProps) {
  const date = appointmentDateTime(record);
  const tone = appointmentStatusTone(record.status);
  const location = text(record.location) || text(record.address) || text(record.clinic_address);
  const mapUrl = text(record.google_maps_url) || text(record.maps_url);
  const meetingUrl = text(record.zoom_link) || text(record.meeting_url) || text(record.video_url);
  const isFutureConfirmed = tone === "confirmed" && Boolean(date && date.getTime() > Date.now());
  const canMarkNoShow = !["no_show", "cancelled", "completed"].includes(tone);
  const savedStatus = text(record.status);
  const isRequested = savedStatus === "requested";
  const isConfirmed = savedStatus === "confirmed";

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#1A1A3E]/[0.35] p-3 backdrop-blur-sm sm:items-center"><section role="dialog" aria-modal="true" aria-labelledby="event-details-title" dir="rtl" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-2xl sm:p-7"><header className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-extrabold text-[#5267A8]">פרטי פגישה</p><h2 id="event-details-title" className="mt-1 truncate text-2xl font-black text-[#1A1A3E]">{text(record.appointment_type) || service?.label || "פגישה"}</h2><span className={`mt-3 inline-flex rounded-full px-3 py-1 text-[10px] font-black ${statusClasses[tone]}`}>{recordStatusLabel(record)}</span></div><button type="button" onClick={onClose} aria-label="סגירת פרטי הפגישה" className="rounded-xl p-2 text-slate-400 hover:bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><X className="h-5 w-5" /></button></header><Feedback feedback={feedback} />{editorMode !== "view" && editDraft ? <BusinessCrmCalendarAppointmentEditor mode={editorMode} draft={editDraft} services={services} feedback={editFeedback} saving={savingAppointment} onChange={onEditDraftChange} onSubmit={onSubmitEditor} onCancel={onCancelEditor} /> : <><div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl bg-[#FFFBEA] px-4 py-3 text-sm font-black text-[#1A1A3E]"><CalendarDays className="h-4 w-4 text-[#8B6B00]" />{date ? format(date, "EEEE, d בMMMM yyyy", { locale: he }) : "תאריך לא צוין"}<span className="text-[#C8A62F]">·</span><Clock3 className="h-4 w-4 text-[#8B6B00]" /><span dir="ltr">{text(record.start_time).slice(0, 5)}–{text(record.end_time).slice(0, 5)}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><DetailField label="לקוח" value={text(record.client_name)} Icon={UserRound} /><DetailField label="חיית מחמד" value={text(record.pet_name)} Icon={PawPrint} /><DetailField label="טלפון" value={text(record.phone)} Icon={Phone} href={text(record.phone) ? `tel:${text(record.phone)}` : undefined} /><DetailField label="אימייל" value={text(record.email)} Icon={Mail} href={text(record.email) ? `mailto:${text(record.email)}` : undefined} />{location && <DetailField label="מיקום" value={location} Icon={MapPin} href={mapUrl || undefined} />}{meetingUrl && <DetailField label="פגישה מרחוק" value="קישור לפגישה" Icon={Video} href={meetingUrl} />}</div>{text(record.notes) && <section className="mt-4 rounded-2xl border border-[#EEF0F3] bg-[#FBFCFD] p-4"><div className="flex items-center gap-2 text-xs font-black text-[#1A1A3E]"><StickyNote className="h-4 w-4 text-[#5267A8]" />הערות פומביות</div><p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-600">{text(record.notes)}</p></section>}<div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => onOpenInbox(text(record.client_name))} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-xs font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Send className="h-4 w-4" />הצג תקשורת עם הלקוח</button><button type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#D9DEE5] bg-white px-4 text-xs font-extrabold text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><CalendarDays className="h-4 w-4" />צפייה ביומן</button></div><section className="mt-5 border-t border-[#EEF0F3] pt-5"><h3 className="text-sm font-black text-[#1A1A3E]">פעולות</h3>{isRequested && <div className="mt-3 rounded-2xl border border-dashed border-[#D5B044] bg-[#FFFBEA] p-3"><div className="flex items-start gap-2 text-xs font-bold leading-5 text-[#80620B]"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><span>הבקשה ממתינה להחלטה. אישור יעדכן את הלקוח ויומן Google, וסירוב יסיר את התור מהיומן.</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" onClick={onApprove} disabled={decisionSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#B8D9C0] bg-[#F0FAF2] px-4 text-xs font-black text-[#1F6A38] transition hover:bg-[#E5F5E9] disabled:cursor-wait disabled:opacity-60">{decisionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}אישור</button><button type="button" onClick={onReject} disabled={decisionSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E8B8B8] bg-[#FFF3F3] px-4 text-xs font-black text-[#A52D2D] transition hover:bg-[#FDE7E7] disabled:cursor-wait disabled:opacity-60">{decisionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}סירוב</button></div></div>}{isConfirmed && <div className="mt-3 rounded-2xl border border-[#E5E7EB] bg-[#FBFCFD] p-3"><p className="text-xs font-bold leading-5 text-slate-500">פעולות על תור מאושר נשמרות במערכת ומעדכנות את הלקוח לפי הצורך.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => onBeginEditor("edit")} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#F2D162] px-3 text-xs font-black text-[#1A1A3E] transition hover:bg-[#E7C34D] focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/30"><Pencil className="h-4 w-4" />עריכת פרטי התור</button>{cancelConfirmOpen ? <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold leading-5 text-red-900"><span className="w-full">ביטול התור יסיר אותו מהיומן וישלח ללקוח הודעת ביטול. לא ניתן לבטל את הפעולה מתוך מסך זה.</span><button type="button" onClick={onConfirmCancel} disabled={cancelSaving} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-red-700 px-3 text-[11px] font-black text-white disabled:opacity-60">{cancelSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}ביטול תור סופי</button><button type="button" onClick={onCancelCancel} disabled={cancelSaving} className="min-h-9 rounded-lg border border-red-200 px-3 text-[11px] font-extrabold text-red-800 disabled:opacity-60">חזרה</button></div> : <button type="button" onClick={onRequestCancel} disabled={cancelSaving} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-extrabold text-red-700 transition hover:bg-red-50 disabled:opacity-60"><XCircle className="h-4 w-4" />ביטול תור</button>}</div></div>}{canManageCalendar && savedStatus === "cancelled" && text(record.google_event_id) && <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-semibold leading-5 text-amber-950">התור בוטל. אם האירוע עדיין מופיע ב-Google Calendar, אפשר לבדוק ולהסיר רק את האירוע שמקושר לפגישה הזו.</p><button type="button" onClick={onRetryCalendarRemoval} disabled={calendarRemovalRetrying} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 text-[11px] font-black text-amber-950 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-wait disabled:opacity-60">{calendarRemovalRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{calendarRemovalRetrying ? "בודקת את היומן..." : "בדיקה והסרה מ-Google Calendar"}</button></div>}<div className="mt-3 flex flex-wrap gap-2">{!isConfirmed && <button type="button" onClick={() => onBeginEditor("edit")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#D9DEE5] px-3 text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Pencil className="h-4 w-4" />עריכה</button>}<button type="button" onClick={() => onBeginEditor("duplicate")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#D9DEE5] px-3 text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Copy className="h-4 w-4" />שכפול פגישה</button>{noShowConfirmOpen ? <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-[#E7B68E] bg-[#FFF8F3] p-3 text-xs font-bold text-[#934D1E]"><span className="w-full">לסמן את הפגישה כ״לא הגיע״? התור יישאר ביומן ולא יימחק.</span><button type="button" onClick={onConfirmNoShow} disabled={noShowSaving} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-[#934D1E] px-3 text-[11px] font-black text-white disabled:opacity-60">{noShowSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}אישור</button><button type="button" onClick={onCancelNoShow} disabled={noShowSaving} className="min-h-9 rounded-lg border border-[#E7B68E] px-3 text-[11px] font-extrabold text-[#934D1E] disabled:opacity-60">ביטול</button></div> : <button type="button" onClick={onRequestNoShow} disabled={!canMarkNoShow || noShowSaving} title={tone === "no_show" ? "הפגישה כבר סומנה כלא הגיע" : undefined} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-extrabold focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${canMarkNoShow ? "border-[#D9DEE5] text-[#934D1E] hover:border-[#E7B68E] hover:bg-[#FFF8F3]" : "cursor-not-allowed border-[#EEF0F3] text-slate-400"}`}><XCircle className="h-4 w-4" />{tone === "no_show" ? "הלקוח סומן כלא הגיע" : "סימון לקוח שלא הגיע"}</button>}</div></section><div className="mt-5 grid gap-3 lg:grid-cols-2"><section className="rounded-2xl border border-[#EEF0F3] bg-[#FBFCFD] p-4"><h3 className="text-sm font-black text-[#1A1A3E]">פרטים נוספים</h3><p className="mt-2 text-xs font-semibold leading-5 text-slate-500">אזור זמן: Asia/Jerusalem. אורך השירות: {Number(record.duration_minutes) || service?.duration || "לא צוין"} דקות.</p></section><section className="rounded-2xl border border-[#EEF0F3] bg-[#FBFCFD] p-4"><h3 className="flex items-center gap-2 text-sm font-black text-[#1A1A3E]"><CreditCard className="h-4 w-4 text-slate-400" />תשלום</h3><p className="mt-2 text-xs font-semibold leading-5 text-slate-500">אין במודל התור מידע על מחיר או חיוב. פעולות תשלום יתחברו בשלב הבא.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled className="rounded-lg border border-[#D9DEE5] px-2.5 py-2 text-[10px] font-extrabold text-slate-400">חיוב לקוח, בקרוב</button><button type="button" disabled className="rounded-lg border border-[#D9DEE5] px-2.5 py-2 text-[10px] font-extrabold text-slate-400">יצירת בקשת תשלום, בקרוב</button></div></section></div><section className="mt-3 rounded-2xl border border-[#EEF0F3] bg-[#FBFCFD] p-4"><h3 className="flex items-center gap-2 text-sm font-black text-[#1A1A3E]"><Clock3 className="h-4 w-4 text-[#5267A8]" />התראות</h3><p className="mt-2 text-[11px] font-medium leading-5 text-slate-500">המערכת משתמשת בתזכורות הקיימות, עבור תורים מאושרים בעתיד, באזור הזמן Asia/Jerusalem.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600">אישור קביעה: הרשומה נשמרה במערכת</div><div className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600">24 שעות לפני: {isFutureConfirmed ? reminderState(record, "day_before_reminder_sent_at") : "לא מתוזמנת"}</div><div className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600">שעה לפני: {isFutureConfirmed ? reminderState(record, "hour_before_reminder_sent_at") : "לא מתוזמנת"}</div><div className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600">מעקב אחרי הפגישה: אין תהליך כזה במודל הקיים</div></div></section><section className="mt-3 rounded-2xl border border-dashed border-[#D9DEE5] bg-[#FBFCFD] p-4"><h3 className="flex items-center gap-2 text-sm font-black text-[#1A1A3E]"><StickyNote className="h-4 w-4 text-slate-400" />הערות לשימוש פנימי</h3>{!notesAvailable ? <div role={notesError ? "alert" : "status"} className={`mt-3 flex flex-col gap-3 rounded-xl border px-3 py-3 text-xs font-semibold leading-5 ${notesRetryable ? "border-amber-200 bg-amber-50 text-amber-950" : notesError ? "border-red-100 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-600"}`}><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{notesError || "הערות פנימיות זמינות רק לצוות מורשה של המרפאה."}</p></div>{notesRetryable && <button type="button" onClick={onRetryNotes} disabled={notesLoading} className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg border border-amber-300 bg-white px-3 text-[11px] font-extrabold text-amber-950 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-wait disabled:opacity-60"><RefreshCw className="h-3.5 w-3.5" />נסי לטעון הערות שוב</button>}</div> : notesLoading ? <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-[#5267A8]" />טוענת הערות שנשמרו...</div> : notesError ? <p role="alert" className="mt-2 text-xs font-semibold leading-5 text-red-700">{notesError}</p> : notes.length === 0 ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">עדיין לא נשמרה הערה פנימית לפגישה הזו.</p> : <div className="mt-3 space-y-2">{notes.map((note, index) => <article key={note.id || `${note.created_at}-${index}`} className="rounded-xl bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-extrabold text-slate-400"><span>{text(note.author_name) || "מחבר לא צוין"}</span><time dateTime={note.created_at}>{noteTimestamp(note.created_at)}</time></div><p className="mt-2 whitespace-pre-wrap text-xs font-medium leading-5 text-slate-700">{text(note.body)}</p></article>)}</div>}{notesAvailable && !notesError && <form onSubmit={(event) => { event.preventDefault(); onSaveNote(); }} className="mt-4"><label htmlFor="crm-internal-note" className="sr-only">הערה פנימית חדשה</label><textarea id="crm-internal-note" value={noteDraft} onChange={(event) => onNoteDraftChange(event.target.value)} rows={3} placeholder="כתבי הערה שתישאר לשימוש צוות המרפאה בלבד" className="w-full resize-none rounded-xl border border-[#D9DEE5] bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]" /><button type="submit" disabled={savingNote} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#1A1A3E] px-3 text-[11px] font-extrabold text-white transition hover:bg-[#2A2A5A] disabled:cursor-not-allowed disabled:opacity-60">{savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}{savingNote ? "שומרת הערה..." : "הוספת הערה פנימית"}</button></form>}</section></>}</section></div>;
}
