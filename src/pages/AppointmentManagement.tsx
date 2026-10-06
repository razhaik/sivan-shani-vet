import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  PawPrint,
  Phone,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import { SEO } from "@/components/SEO";
import { manageAppointmentByToken } from "@/functions";

const CLINIC_PHONE = "054-4345388";
const RESCHEDULE_SUCCESS_MESSAGE = "בקשתך לשינוי מועד נשלחה וממתינה לאישור המרפאה. תקבל מייל עדכון ברגע שהבקשה תטופל.";

type ViewState = "loading" | "ready" | "invalid" | "disabled" | "cutoff" | "past" | "cancelled" | "success" | "error";
type EmailStatus = "sent" | "skipped" | "failed" | "";
type AvailabilityState = "idle" | "loading" | "ready" | "empty" | "error";

type AppointmentSummary = {
  clientName: string;
  petName: string;
  petSpecies: string;
  service: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
};

type RescheduleService = {
  identifier: string;
  name: string;
  durationMinutes: number;
};

type PendingReschedule = {
  status: "pending" | "processing";
  proposedDate: string;
  proposedStartTime: string;
  proposedEndTime: string;
};

type RescheduleSummary = {
  enabled: boolean;
  eligible: boolean;
  cutoffPassed: boolean;
  cutoffMessage: string;
  reason: string;
  message: string;
  service: RescheduleService | null;
  pendingRequest: PendingReschedule | null;
};

type RescheduleSlot = {
  startTime: string;
  endTime: string;
};

type ManagementPayload = {
  status?: string;
  message?: string;
  appointment?: AppointmentSummary;
  reschedule?: RescheduleSummary;
  available_slots?: RescheduleSlot[];
  date?: string;
  email_status?: EmailStatus;
  notification_status?: string;
  calendar_status?: "removed" | "already_removed" | "not_linked" | "failed" | "not_attempted";
  success?: boolean;
};

type ManagementAction = "get" | "cancel" | "availability" | "request_reschedule";

type RequestFields = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() || fallback : fallback;
}

function normalizeSummary(value: unknown): AppointmentSummary | null {
  if (!isRecord(value)) return null;
  return {
    clientName: textValue(value.clientName, "לקוח/ה"),
    petName: textValue(value.petName, "חיית המחמד"),
    petSpecies: textValue(value.petSpecies),
    service: textValue(value.service, "תור במרפאה"),
    date: textValue(value.date),
    startTime: textValue(value.startTime),
    endTime: textValue(value.endTime),
    status: textValue(value.status, "requested"),
  };
}

function normalizeReschedule(value: unknown): RescheduleSummary | null {
  if (!isRecord(value)) return null;
  const service = isRecord(value.service) && textValue(value.service.identifier)
    ? {
        identifier: textValue(value.service.identifier),
        name: textValue(value.service.name, "תור במרפאה"),
        durationMinutes: Number.isFinite(Number(value.service.durationMinutes)) ? Number(value.service.durationMinutes) : 0,
      }
    : null;
  const pending = isRecord(value.pendingRequest) && (value.pendingRequest.status === "pending" || value.pendingRequest.status === "processing")
    ? {
        status: value.pendingRequest.status,
        proposedDate: textValue(value.pendingRequest.proposedDate),
        proposedStartTime: textValue(value.pendingRequest.proposedStartTime).slice(0, 5),
        proposedEndTime: textValue(value.pendingRequest.proposedEndTime).slice(0, 5),
      }
    : null;
  return {
    enabled: value.enabled === true,
    eligible: value.eligible === true,
    cutoffPassed: value.cutoffPassed === true,
    cutoffMessage: textValue(value.cutoffMessage),
    reason: textValue(value.reason),
    message: textValue(value.message),
    service,
    pendingRequest: pending,
  };
}

function normalizeSlot(value: unknown): RescheduleSlot | null {
  if (!isRecord(value)) return null;
  const startTime = textValue(value.startTime).slice(0, 5);
  const endTime = textValue(value.endTime).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return null;
  return { startTime, endTime };
}

function parsePayload(value: unknown): ManagementPayload | null {
  if (typeof value === "string") {
    try {
      return parsePayload(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  if (isRecord(value.data)) return parsePayload(value.data);
  if (isRecord(value.body)) return parsePayload(value.body);
  return {
    status: typeof value.status === "string" ? value.status : undefined,
    message: typeof value.message === "string" ? value.message : typeof value.error === "string" ? value.error : undefined,
    appointment: normalizeSummary(value.appointment) || undefined,
    reschedule: normalizeReschedule(value.reschedule) || undefined,
    available_slots: Array.isArray(value.available_slots)
      ? value.available_slots.map(normalizeSlot).filter((slot): slot is RescheduleSlot => Boolean(slot))
      : undefined,
    date: typeof value.date === "string" ? value.date : undefined,
    email_status: value.email_status === "sent" || value.email_status === "skipped" || value.email_status === "failed" ? value.email_status : "",
    notification_status: typeof value.notification_status === "string" ? value.notification_status : undefined,
    calendar_status: value.calendar_status === "removed" || value.calendar_status === "already_removed" || value.calendar_status === "not_linked" || value.calendar_status === "failed" || value.calendar_status === "not_attempted" ? value.calendar_status : undefined,
    success: value.success === true,
  };
}

function payloadFromError(error: unknown): ManagementPayload | null {
  if (isRecord(error)) {
    const direct = parsePayload(error);
    if (direct?.status) return direct;
    if (isRecord(error.response)) {
      const fromResponse = parsePayload(error.response);
      if (fromResponse?.status) return fromResponse;
    }
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  const jsonStart = message.indexOf("{");
  if (jsonStart >= 0) return parsePayload(message.slice(jsonStart));
  return null;
}

function dateLabel(value: string) {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value || "לא צוין";
}

function timeLabel(summary: AppointmentSummary) {
  return `${summary.startTime || "-"}${summary.endTime ? ` - ${summary.endTime}` : ""}`;
}

function slotLabel(slot: { startTime: string; endTime: string }) {
  return `${slot.startTime}${slot.endTime ? ` - ${slot.endTime}` : ""}`;
}

function speciesLabel(value: string) {
  if (value === "dog") return "כלב";
  if (value === "cat") return "חתול";
  if (value === "other") return "חיית מחמד";
  return value || "לא צוין";
}

function statusLabel(value: string) {
  if (value === "confirmed") return "תור מאושר";
  if (value === "requested") return "ממתין לאישור";
  if (value === "cancelled") return "תור מבוטל";
  return "תור במרפאה";
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfBookableRange() {
  const value = startOfLocalDay(new Date());
  value.setMonth(value.getMonth() + 12);
  return value;
}

async function requestManagement(action: ManagementAction, token: string, fields: RequestFields = {}): Promise<ManagementPayload> {
  try {
    const response = await manageAppointmentByToken({ action, token, ...fields });
    const payload = parsePayload(response);
    if (payload) return payload;
    throw new Error("Empty management response");
  } catch (error) {
    const payload = payloadFromError(error);
    if (payload) return payload;
    throw error;
  }
}

function InfoRow({ icon: Icon, label, value, dir }: { icon: typeof CalendarDays; label: string; value: string; dir?: "ltr" | "rtl" }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3.5">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#5267A8] shadow-sm">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-black text-slate-500">{label}</div>
        <div dir={dir} className="mt-1 break-words text-sm font-black text-[#1A1A3E]">{value || "לא צוין"}</div>
      </div>
    </div>
  );
}

export default function AppointmentManagement() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useMemo(() => new URLSearchParams(location.search).get("token")?.trim() || "", [location.search]);
  const calendarStart = useMemo(() => startOfLocalDay(new Date()), []);
  const calendarEnd = useMemo(() => endOfBookableRange(), []);
  const [view, setView] = useState<ViewState>("loading");
  const [summary, setSummary] = useState<AppointmentSummary | null>(null);
  const [reschedule, setReschedule] = useState<RescheduleSummary | null>(null);
  const [message, setMessage] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("");
  const [calendarRemovalFailed, setCalendarRemovalFailed] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [actionError, setActionError] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [availableSlots, setAvailableSlots] = useState<RescheduleSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<RescheduleSlot | null>(null);
  const [availabilityState, setAvailabilityState] = useState<AvailabilityState>("idle");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [rescheduleError, setRescheduleError] = useState("");
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false);
  const [rescheduleSubmitted, setRescheduleSubmitted] = useState(false);
  const availabilityRequestId = useRef(0);

  const resetReschedulePicker = useCallback(() => {
    availabilityRequestId.current += 1;
    setSelectedDate(undefined);
    setAvailableSlots([]);
    setSelectedSlot(null);
    setAvailabilityState("idle");
    setAvailabilityMessage("");
    setRescheduleError("");
  }, []);

  const applyPayload = useCallback((payload: ManagementPayload, mode: "load" | "cancel") => {
    const nextSummary = normalizeSummary(payload.appointment);
    const nextReschedule = normalizeReschedule(payload.reschedule);
    if (nextSummary) setSummary(nextSummary);
    if (payload.reschedule) setReschedule(nextReschedule);
    if (payload.message) setMessage(payload.message);
    if (payload.email_status) setEmailStatus(payload.email_status);
    if (payload.calendar_status) setCalendarRemovalFailed(payload.calendar_status === "failed");

    if (mode === "cancel") {
      setReschedule(null);
      setRescheduleSubmitted(false);
      resetReschedulePicker();
    }

    switch (payload.status) {
      case "available":
        setView("ready");
        return;
      case "disabled":
        setSummary(null);
        setReschedule(null);
        setView("disabled");
        return;
      case "not-found":
      case "invalid-token":
        setSummary(null);
        setReschedule(null);
        setView("invalid");
        return;
      case "cutoff":
        setView("cutoff");
        return;
      case "past":
        setView("past");
        return;
      case "already-cancelled":
        setView("cancelled");
        setIsConfirming(false);
        return;
      case "cancelled":
        setView(mode === "cancel" ? "success" : "cancelled");
        setIsConfirming(false);
        return;
      case "reschedule-requested":
        setView("ready");
        setRescheduleSubmitted(true);
        return;
      default:
        if (nextSummary) setView("ready");
        else setView("error");
    }
  }, [resetReschedulePicker]);

  const loadAppointment = useCallback(async (nextToken: string) => {
    setView("loading");
    setSummary(null);
    setReschedule(null);
    setMessage("");
    setActionError("");
    setEmailStatus("");
    setCalendarRemovalFailed(false);
    setRescheduleSubmitted(false);
    resetReschedulePicker();
    if (!nextToken || nextToken.length < 12) {
      setView("invalid");
      setMessage("הקישור לניהול התור חסר או אינו תקין.");
      return;
    }

    try {
      const payload = await requestManagement("get", nextToken);
      applyPayload(payload, "load");
    } catch (error) {
      console.error("Failed to load appointment management page:", error);
      setView("error");
      setMessage("לא הצלחנו לטעון את פרטי התור כרגע. אפשר לנסות שוב בעוד רגע.");
    }
  }, [applyPayload, resetReschedulePicker]);

  useEffect(() => {
    void loadAppointment(token);
  }, [loadAppointment, token]);

  const loadAvailability = useCallback(async (date: Date) => {
    if (!token || !reschedule?.eligible || !reschedule.service) return;
    const requestId = availabilityRequestId.current + 1;
    availabilityRequestId.current = requestId;
    const dateValue = localDateKey(date);
    setAvailabilityState("loading");
    setAvailabilityMessage("");
    setRescheduleError("");
    setSelectedSlot(null);
    setAvailableSlots([]);

    try {
      const payload = await requestManagement("availability", token, {
        date: dateValue,
        service_identifier: reschedule.service.identifier,
      });
      if (availabilityRequestId.current !== requestId) return;
      if (payload.reschedule) setReschedule(normalizeReschedule(payload.reschedule));
      if (payload.status === "ok") {
        const slots = payload.available_slots || [];
        setAvailableSlots(slots);
        setAvailabilityState(slots.length ? "ready" : "empty");
        if (!slots.length) setAvailabilityMessage("לא נמצאו שעות פנויות בתאריך הזה. אפשר לבחור יום אחר.");
        return;
      }
      if (payload.status === "invalid-token" || payload.status === "not-found") {
        setSummary(null);
        setReschedule(null);
        setView("invalid");
        setAvailabilityState("error");
        setAvailabilityMessage(payload.message || "הקישור אינו זמין.");
        return;
      }
      setAvailabilityState("error");
      setAvailabilityMessage(payload.message || "לא הצלחנו לבדוק את הזמינות. נסו שוב.");
    } catch (error) {
      if (availabilityRequestId.current !== requestId) return;
      console.error("Failed to load reschedule availability:", error);
      setAvailabilityState("error");
      setAvailabilityMessage("לא הצלחנו לבדוק את הזמינות כרגע. בדקו את החיבור ונסו שוב.");
    }
  }, [reschedule, token]);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    void loadAvailability(date);
  };

  const handleCancel = async () => {
    if (!token || isCancelling) return;
    setIsCancelling(true);
    setActionError("");
    try {
      const payload = await requestManagement("cancel", token);
      if (payload.status === "error" || payload.status === "service-unavailable") {
        setActionError(payload.message || "לא הצלחנו להשלים את ביטול התור. נסו שוב בעוד רגע.");
        return;
      }
      applyPayload(payload, "cancel");
    } catch (error) {
      console.error("Failed to cancel appointment from management page:", error);
      setActionError("לא הצלחנו להשלים את ביטול התור. בדקו את החיבור ונסו שוב.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRescheduleSubmit = async () => {
    if (!token || !selectedDate || !selectedSlot || !reschedule?.eligible || isSubmittingReschedule) return;
    setIsSubmittingReschedule(true);
    setRescheduleError("");
    try {
      const payload = await requestManagement("request_reschedule", token, {
        proposed_date: localDateKey(selectedDate),
        proposed_start_time: selectedSlot.startTime,
      });
      if (payload.appointment) setSummary(normalizeSummary(payload.appointment));
      if (payload.reschedule) setReschedule(normalizeReschedule(payload.reschedule));

      if (payload.status === "reschedule-requested" || payload.success === true) {
        setMessage(RESCHEDULE_SUCCESS_MESSAGE);
        setRescheduleSubmitted(true);
        setAvailableSlots([]);
        setSelectedSlot(null);
        setAvailabilityState("idle");
        setAvailabilityMessage("");
        return;
      }

      if (payload.status === "invalid-token" || payload.status === "not-found") {
        setSummary(null);
        setReschedule(null);
        setView("invalid");
        setRescheduleError(payload.message || "הקישור אינו זמין.");
        return;
      }

      if (payload.status === "cutoff" || payload.status === "past" || payload.status === "pending" || payload.status === "requires-approval") {
        setAvailableSlots([]);
        setSelectedSlot(null);
        setAvailabilityState("idle");
      }
      setRescheduleError(payload.message || "המועד כבר אינו פנוי. בחרו מועד אחר ונסו שוב.");
    } catch (error) {
      console.error("Failed to submit reschedule request:", error);
      setRescheduleError("לא הצלחנו לשלוח את בקשת שינוי המועד. בדקו את החיבור ונסו שוב.");
    } finally {
      setIsSubmittingReschedule(false);
    }
  };

  const noDetailsState = view === "invalid" || view === "disabled" || view === "error";
  const showSummary = Boolean(summary) && !noDetailsState;
  const showReschedulePanel = Boolean(summary && reschedule && reschedule.enabled && summary.status !== "cancelled" && view !== "cancelled" && view !== "success");
  const hasPendingRequest = Boolean(reschedule?.pendingRequest);
  const canSelectReschedule = Boolean(reschedule?.eligible && !hasPendingRequest && !rescheduleSubmitted);

  return (
    <div dir="rtl" className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#eef4ff_0,_#f8fafc_42%,_#fffdf4_100%)] text-[#1A1A3E]">
      <SEO title="ניהול התור שלי | ד״ר סיון שני" description="ניהול מאובטח של תור במרפאה הווטרינרית של ד״ר סיון שני." url="https://sivanshanivet.com/manage-appointment" noindex siteName="ד״ר סיון שני · מרפאה וטרינרית" />

      <header className="border-b border-white/70 bg-white/80 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
          <div className="text-right">
            <p className="text-lg font-black tracking-tight text-[#1A1A3E]">ד״ר סיון שני</p>
            <p className="mt-0.5 text-xs font-bold text-slate-500">מרפאה וטרינרית</p>
          </div>
          <a href={`tel:${CLINIC_PHONE}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#E8E1B8] bg-[#FFFBEA] px-3.5 text-xs font-black text-[#80630E] transition hover:border-[#D7B43C] hover:bg-[#F2D162] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B43C] focus-visible:ring-offset-2 sm:px-4 sm:text-sm">
            <Phone className="h-4 w-4" aria-hidden="true" />
            <span dir="ltr">{CLINIC_PHONE}</span>
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="mb-7 text-center sm:mb-9">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1A1A3E] text-[#F2D162] shadow-lg shadow-[#1A1A3E]/15">
              <ShieldCheck className="h-7 w-7" aria-hidden="true" />
            </div>
            <p className="mt-5 text-xs font-black tracking-[0.14em] text-[#B38A16]">קישור אישי ומאובטח</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#1A1A3E] sm:text-4xl">ניהול התור שלי</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-6 text-slate-500">כאן אפשר לבדוק את פרטי התור ולבטל אותו ללא התחברות. בתור מאושר אפשר גם להציע מועד חלופי, בכפוף לאישור המרפאה.</p>
          </div>

          {view === "loading" && (
            <section role="status" className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5267A8]" aria-hidden="true" />
              <p className="mt-4 text-sm font-black text-[#1A1A3E]">טוענים את פרטי התור...</p>
              <p className="mt-1 text-xs font-medium text-slate-500">הקישור נבדק מול מערכת המרפאה.</p>
            </section>
          )}

          {noDetailsState && (
            <section role={view === "error" ? "alert" : "status"} className={`rounded-3xl border p-6 text-center shadow-sm sm:p-10 ${view === "error" ? "border-red-200 bg-red-50" : "border-[#E8E1B8] bg-white"}`}>
              <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${view === "error" ? "bg-red-100 text-red-700" : "bg-[#FFF7D6] text-[#B38A16]"}`}>
                <AlertCircle className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-xl font-black text-[#1A1A3E]">
                {view === "disabled" ? "ניהול תורים עצמאי אינו פעיל" : view === "invalid" ? "הקישור אינו זמין" : "אירעה תקלה זמנית"}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-7 text-slate-600">{message || "לא הצלחנו לזהות תור לפי הקישור הזה."}</p>
              {view === "error" && <Button type="button" onClick={() => void loadAppointment(token)} className="mt-6 min-h-11 rounded-xl bg-[#1A1A3E] px-6 font-black text-white hover:bg-[#29295B]">ניסיון נוסף</Button>}
              {view !== "error" && <a href={`tel:${CLINIC_PHONE}`} className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D7B43C] bg-[#FFFBEA] px-5 text-sm font-black text-[#80630E] transition hover:bg-[#F2D162] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B43C] focus-visible:ring-offset-2"><Phone className="h-4 w-4" aria-hidden="true" />יצירת קשר עם המרפאה</a>}
            </section>
          )}

          {showSummary && summary && (
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
              <div className="bg-gradient-to-l from-[#1A1A3E] to-[#29295B] px-5 py-6 text-white sm:px-8 sm:py-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold text-white/65">התור של</p>
                    <h2 className="mt-1 text-2xl font-black">{summary.clientName}</h2>
                    <p className="mt-1 text-sm font-medium text-white/75">עבור {summary.petName}</p>
                  </div>
                  <span className={`inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-black ${view === "success" || view === "cancelled" ? "bg-red-100 text-red-800" : "bg-[#F2D162] text-[#1A1A3E]"}`}>{view === "success" || view === "cancelled" ? "תור מבוטל" : statusLabel(summary.status)}</span>
                </div>
              </div>

              <div className="space-y-5 p-5 sm:p-8">
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow icon={CalendarDays} label="תאריך" value={dateLabel(summary.date)} dir="ltr" />
                  <InfoRow icon={Clock3} label="שעה" value={timeLabel(summary)} dir="ltr" />
                  <InfoRow icon={PawPrint} label="חיית מחמד" value={`${summary.petName} · ${speciesLabel(summary.petSpecies)}`} />
                  <InfoRow icon={UserRound} label="סוג הטיפול" value={summary.service} />
                </div>

                {(view === "cutoff" || view === "past") && (
                  <div role="status" className="rounded-2xl border border-[#E8E1B8] bg-[#FFFBEA] p-4 text-sm font-bold leading-7 text-[#80630E]">
                    <div className="flex items-start gap-2"><AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /><p>{message || (view === "past" ? "מועד התור כבר עבר ולכן אי אפשר לבטל אותו דרך הדף." : "חלף הזמן שבו אפשר לבטל את התור באופן עצמאי.")}</p></div>
                    <a href={`tel:${CLINIC_PHONE}`} className="mt-3 inline-flex items-center gap-2 text-sm font-black underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B43C]"><Phone className="h-4 w-4" aria-hidden="true" />לשינוי דחוף, התקשרו למרפאה</a>
                  </div>
                )}

                {(view === "success" || view === "cancelled") && (
                  <div
                    role={view === "success" && calendarRemovalFailed ? "alert" : "status"}
                    className={`rounded-2xl border p-4 text-sm font-bold leading-7 ${view === "success" && calendarRemovalFailed ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
                  >
                    <div className="flex items-start gap-2">
                      {view === "success" && calendarRemovalFailed
                        ? <AlertCircle className="mt-1 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                        : <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />}
                      <p>{view === "success" && calendarRemovalFailed
                        ? "התור בוטל במערכת. לא הצלחנו לעדכן את יומן המרפאה כרגע, ולכן ייתכן שהאירוע עדיין יופיע בו. הביטול תקף. לשאלות אפשר להתקשר למרפאה."
                        : message || "התור בוטל בהצלחה."}</p>
                    </div>
                    {view === "success" && emailStatus === "sent" && <p className={`mt-1 pr-6 text-xs font-medium ${calendarRemovalFailed ? "text-amber-900" : "text-emerald-800"}`}>שלחנו גם אישור ביטול לכתובת המייל שמסרת.</p>}
                    {view === "success" && emailStatus !== "sent" && <p className={`mt-1 pr-6 text-xs font-medium ${calendarRemovalFailed ? "text-amber-900" : "text-emerald-800"}`}>אם לא התקבל מייל, אפשר ליצור קשר עם המרפאה.</p>}
                  </div>
                )}

                {showReschedulePanel && reschedule && (
                  <section aria-labelledby="reschedule-title" className="rounded-3xl border border-[#DCE1F2] bg-[#F7F8FF] p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1A1A3E] text-[#F2D162] shadow-sm"><RefreshCw className="h-5 w-5" aria-hidden="true" /></span>
                      <div className="min-w-0">
                        <h3 id="reschedule-title" className="text-lg font-black text-[#1A1A3E]">שינוי מועד</h3>
                        <p className="mt-1 text-sm font-medium leading-6 text-slate-600">בחרו תאריך ושעה חלופיים. הבקשה תישלח למרפאה, והמועד המקורי יישאר שמור עד לקבלת החלטה.</p>
                      </div>
                    </div>

                    {(rescheduleSubmitted || hasPendingRequest) && reschedule.pendingRequest && (
                      <div role="status" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-950">
                        <div className="flex items-start gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" /><p className="font-black">{rescheduleSubmitted ? RESCHEDULE_SUCCESS_MESSAGE : "בקשת שינוי מועד כבר ממתינה לטיפול המרפאה."}</p></div>
                        <p className="mt-2 pr-6 font-bold">המועד המוצע: <span dir="ltr" className="inline-block">{dateLabel(reschedule.pendingRequest.proposedDate)} · {slotLabel({ startTime: reschedule.pendingRequest.proposedStartTime, endTime: reschedule.pendingRequest.proposedEndTime })}</span></p>
                        <p className="mt-1 pr-6 text-xs font-medium text-emerald-800">התור המקורי שמופיע למעלה נשאר בתוקף עד שהמרפאה תאשר את הבקשה.</p>
                      </div>
                    )}

                    {!rescheduleSubmitted && !hasPendingRequest && summary.status === "requested" && (
                      <div role="status" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-950">
                        <div className="flex items-start gap-2"><AlertCircle className="mt-1 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" /><p>{reschedule.message || "בקשת התור עדיין ממתינה לאישור המרפאה. אפשר לבקש שינוי מועד לאחר שהתור יאושר."}</p></div>
                      </div>
                    )}

                    {!rescheduleSubmitted && !hasPendingRequest && summary.status !== "requested" && !reschedule.eligible && (
                      <div role="status" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-950">
                        <div className="flex items-start gap-2"><AlertCircle className="mt-1 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" /><p>{reschedule.message || reschedule.cutoffMessage || "אי אפשר לבקש שינוי מועד לתור הזה כרגע."}</p></div>
                        {(reschedule.reason === "unavailable" || reschedule.reason === "service-unavailable") && <Button type="button" variant="outline" onClick={() => void loadAppointment(token)} className="mt-4 min-h-10 rounded-xl border-amber-300 bg-white font-black text-amber-900 hover:bg-amber-100"><RefreshCw className="h-4 w-4" aria-hidden="true" />ניסיון נוסף</Button>}
                        {(reschedule.reason === "cutoff" || reschedule.reason === "past") && <a href={`tel:${CLINIC_PHONE}`} className="mt-3 inline-flex items-center gap-2 text-sm font-black text-amber-900 underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"><Phone className="h-4 w-4" aria-hidden="true" />לשינוי דחוף, התקשרו למרפאה</a>}
                      </div>
                    )}

                    {canSelectReschedule && (
                      <div className="mt-5 space-y-4">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
                          <div className="rounded-2xl border border-[#DCE1F2] bg-white p-3 sm:p-4">
                            <div className="flex items-center gap-2 px-1"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFF7D6] text-xs font-black text-[#80630E]">1</span><h4 className="text-sm font-black text-[#1A1A3E]">בחירת תאריך</h4></div>
                            <p className="mt-2 px-1 text-xs font-medium leading-5 text-slate-500">אפשר לבחור מועד עתידי עד שנה מהיום.</p>
                            <BookingCalendar
                              mode="single"
                              selected={selectedDate}
                              onSelect={(date) => { if (date) handleDateSelect(date); }}
                              defaultMonth={calendarStart}
                              disabled={{ before: calendarStart, after: calendarEnd }}
                              className="mx-auto mt-2 w-full max-w-[330px]"
                              aria-label="בחירת תאריך לשינוי מועד"
                            />
                            {selectedDate && <p className="rounded-xl bg-[#F7F8FF] px-3 py-2 text-center text-xs font-black text-[#5267A8]">נבחר: <span dir="ltr" className="inline-block">{dateLabel(localDateKey(selectedDate))}</span></p>}
                          </div>

                          <div className="rounded-2xl border border-[#DCE1F2] bg-white p-4">
                            <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFF7D6] text-xs font-black text-[#80630E]">2</span><h4 className="text-sm font-black text-[#1A1A3E]">בחירת שעה</h4></div>
                            <p className="mt-2 text-xs font-medium leading-5 text-slate-500">השעות שמוצגות כאן נבדקו מול שעות המרפאה, השירות והיומן.</p>

                            {!selectedDate && <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center text-sm font-bold leading-6 text-slate-500">בחרו תאריך כדי לראות שעות פנויות.</div>}
                            {selectedDate && availabilityState === "loading" && <div role="status" className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-[#DCE1F2] bg-[#F7F8FF] px-4 py-7 text-sm font-bold text-[#5267A8]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />בודקים זמינות...</div>}
                            {selectedDate && availabilityState === "empty" && <div role="status" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-center text-sm font-bold leading-6 text-amber-950">{availabilityMessage || "אין שעות פנויות בתאריך הזה."}</div>}
                            {selectedDate && availabilityState === "error" && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-center text-sm font-bold leading-6 text-red-800"><p>{availabilityMessage || "לא הצלחנו לטעון את השעות הפנויות."}</p><Button type="button" variant="outline" onClick={() => void loadAvailability(selectedDate)} className="mt-4 min-h-10 rounded-xl border-red-300 bg-white font-black text-red-800 hover:bg-red-100"><RefreshCw className="h-4 w-4" aria-hidden="true" />ניסיון נוסף</Button></div>}
                            {selectedDate && availabilityState === "ready" && (
                              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" role="listbox" aria-label="שעות פנויות">
                                {availableSlots.map((slot) => {
                                  const selected = selectedSlot?.startTime === slot.startTime;
                                  return <button key={`${slot.startTime}-${slot.endTime}`} type="button" role="option" aria-selected={selected} onClick={() => { setSelectedSlot(slot); setRescheduleError(""); }} className={`flex min-h-14 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-sm font-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B43C] focus-visible:ring-offset-2 ${selected ? "border-[#1A1A3E] bg-[#1A1A3E] text-white shadow-md" : "border-slate-200 bg-white text-[#1A1A3E] hover:border-[#5267A8] hover:bg-[#F7F8FF]"}`}><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" /><span dir="ltr">{slotLabel(slot)}</span></button>;
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {rescheduleError && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-800"><AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /><p>{rescheduleError}</p></div>}
                        <div className="flex flex-col gap-3 rounded-2xl border border-[#E8E1B8] bg-[#FFFBEA] p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0"><p className="text-sm font-black text-[#80630E]">{selectedSlot ? `המועד שנבחר: ${dateLabel(localDateKey(selectedDate!))} בשעה ${slotLabel(selectedSlot)}` : "בחרו תאריך ושעה כדי לשלוח בקשה."}</p><p className="mt-1 text-xs font-medium leading-5 text-[#80630E]/80">המועד הנוכחי יישאר שמור עד שהמרפאה תאשר את הבקשה.</p></div>
                          <Button type="button" onClick={() => void handleRescheduleSubmit()} disabled={!selectedSlot || !selectedDate || isSubmittingReschedule} className="min-h-12 w-full shrink-0 rounded-xl bg-[#1A1A3E] px-5 font-black text-white hover:bg-[#29295B] focus-visible:ring-2 focus-visible:ring-[#D7B43C] focus-visible:ring-offset-2 sm:w-auto">{isSubmittingReschedule ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />שולחים...</> : <><Send className="h-4 w-4" aria-hidden="true" />שליחת בקשת שינוי</>}</Button>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {view === "ready" && !isConfirming && (
                  <div className="rounded-2xl border border-red-100 bg-red-50/60 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-red-600 shadow-sm"><Trash2 className="h-5 w-5" aria-hidden="true" /></span>
                      <div>
                        <h3 className="text-base font-black text-[#1A1A3E]">ביטול תור</h3>
                        <p className="mt-1 text-sm font-medium leading-6 text-slate-600">אם אינכם יכולים להגיע, בטלו את התור כדי לשחרר את המועד למטופל אחר.</p>
                      </div>
                    </div>
                    <Button type="button" onClick={() => { setActionError(""); setIsConfirming(true); }} className="mt-4 min-h-12 w-full rounded-xl bg-red-600 font-black text-white shadow-sm hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2">ביטול התור</Button>
                  </div>
                )}

                {view === "ready" && isConfirming && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-red-700 shadow-sm"><AlertCircle className="h-5 w-5" aria-hidden="true" /></span>
                      <div>
                        <h3 className="text-base font-black text-[#1A1A3E]">האם את/ה בטוח/ה שברצונך לבטל את התור?</h3>
                        <p className="mt-1 text-sm font-medium leading-6 text-slate-600">הביטול מתבצע מיד ולא ניתן לשחזר את המועד מתוך הקישור הזה.</p>
                      </div>
                    </div>
                    {actionError && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm font-bold leading-6 text-red-800">{actionError}</p>}
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
                      <Button type="button" variant="destructive" onClick={() => void handleCancel()} disabled={isCancelling} className="min-h-12 flex-1 rounded-xl font-black">{isCancelling ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />מבטלים...</> : "כן, לבטל את התור"}</Button>
                      <Button type="button" variant="outline" onClick={() => setIsConfirming(false)} disabled={isCancelling} className="min-h-12 flex-1 rounded-xl border-slate-300 bg-white font-black text-slate-700">חזרה</Button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-medium leading-5 text-slate-500">לשאלה או שינוי דחוף, צוות המרפאה זמין בטלפון.</p>
                  <a href={`tel:${CLINIC_PHONE}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-[#5267A8] transition hover:border-[#5267A8] hover:bg-[#F7F8FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5267A8] focus-visible:ring-offset-2"><Phone className="h-4 w-4" aria-hidden="true" />{CLINIC_PHONE}</a>
                </div>
              </div>
            </section>
          )}

          <button type="button" onClick={() => navigate("/")} className="mx-auto mt-7 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black text-[#5267A8] transition hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B43C] focus-visible:ring-offset-2"><ArrowRight className="h-4 w-4" aria-hidden="true" />חזרה לאתר המרפאה</button>
        </motion.div>
      </main>

      <footer className="px-4 pb-8 text-center text-xs font-medium text-slate-400">ד״ר סיון שני · מרפאה וטרינרית</footer>
    </div>
  );
}
