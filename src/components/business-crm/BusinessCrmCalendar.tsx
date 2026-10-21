import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, Plus, RefreshCw } from "lucide-react";
import { Appointment, AppointmentBlock, AppointmentNote, AppointmentWindow, ClinicService, ClinicSettings } from "@/entities";
import { contacts } from "@/integrations/core";
import { getCalendarBusy, getCalendarEvents, publicAppointmentBooking } from "@/functions";
import { useIsMobile } from "@/hooks/use-mobile";
import { APPOINTMENT_TYPES } from "@/pages/AppointmentBooking";
import { normalizeClientPhone } from "@/lib/clientAggregation";
import { buildClientRows, type ClientRow } from "@/lib/crmClientData";
import { getAvailableManagerSlots, getManagerBookingWarnings, type CalendarBusyInterval, type GoogleCalendarEvent, type ManagerBookingWarning } from "@/lib/adminAppointmentAvailability";
import { getClinicHours, isValidTime } from "@/lib/clinicAvailability";
import { notifyBrowserPush, notifyBusinessNotification } from "@/lib/onesignalPush";
import { approveAppointmentRequest, rejectAppointmentRequest } from "@/lib/crmAppointmentDecision";
import { appointmentSnapshotFromRecord, cancelConfirmedAppointment, syncCalendarOnlyAppointment, syncUpdatedAppointment, type SideEffectOutcome } from "@/lib/crmAppointmentActions";
import { calendarOutcomeFeedback, runCalendarAppointmentRetry, useCalendarSyncFeedback } from "@/lib/calendarAppointmentSyncRetry";
import { appointmentStatusTone, createAppointmentEditDraft, dateFromKey, dateKey, GOOGLE_CALENDAR_SERVICE_ID, hasRemoteSupport, isActiveAppointment, isInMonth, isPastCalendarMoment, isToday, minutesToClock, monthGridDates, navigationDate, recordSearchText, serviceIdForRecord, text, timeToMinutes, type AppointmentEditDraft, type CalendarMode, visibleDates } from "@/lib/crmCalendar";
import { useCrmContext, type CrmRecord } from "@/components/business-crm/CrmContext";
import { BusinessCrmCalendarGrid } from "@/components/business-crm/BusinessCrmCalendarGrid";
import { BusinessCrmCalendarToolbar, type CalendarServiceItem } from "@/components/business-crm/BusinessCrmCalendarToolbar";
import { BusinessCrmCalendarSidePanel } from "@/components/business-crm/BusinessCrmCalendarSidePanel";
import { BusinessCrmCalendarBlockDialog, type CalendarBlockDraft } from "@/components/business-crm/BusinessCrmCalendarBlockDialog";
import { BusinessCrmCalendarSlotActionDialog } from "@/components/business-crm/BusinessCrmCalendarSlotActionDialog";
import { CalendarEventDetails, CalendarQuickBooking, type CalendarDetailFeedback, type CalendarDetailMode, type CalendarPrivateNote, type QuickBookingCustomerMode, type QuickBookingDraft } from "@/components/business-crm/BusinessCrmCalendarPanels";
import CalendarAppointmentSyncSection from "@/components/business-crm/CalendarAppointmentSyncSection";
import CrmMobileSkeleton from "@/components/business-crm/CrmMobileSkeleton";
import { CalendarPage } from "@/components/business-crm/bento-pages";
import type { BentoDockTab } from "@/components/business-crm/bento-ui";
import type { CalendarBlockDisplay } from "@/components/business-crm/BusinessCrmCalendarGrid";
import type { AppointmentEditorMode } from "@/components/business-crm/BusinessCrmCalendarAppointmentEditor";

type AppointmentActionMode = AppointmentEditorMode;
type QuickBookingState = {
  date: Date;
  time: string;
  draft: QuickBookingDraft;
  feedback: string;
  customerMode: QuickBookingCustomerMode;
  customerSearch: string;
  selectedCustomerId: string | null;
};
type CalendarSlotActionState = {
  date: Date;
  time: string;
};
const emptyDraft = (): QuickBookingDraft => ({ serviceId: "", clientName: "", phone: "", email: "", petName: "", petSpecies: "", notes: "" });
const cancelToken = () => globalThis.crypto?.randomUUID?.() || `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
const recordIdentity = (record: CrmRecord) => String(record.id || `${record.date}|${record.start_time}|${record.client_name}|${record.pet_name}`);
const validEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const normalizedCalendarValue = (value: unknown) => text(value);

type PrivateNoteLoadFailure = {
  message: string;
  retryable: boolean;
  transient: boolean;
};

function privateNoteLoadFailure(error: unknown): PrivateNoteLoadFailure {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const details = [
    error instanceof Error ? `${error.name} ${error.message}` : "",
    typeof error === "string" ? error : "",
    ...(record ? ["name", "message", "status", "statusCode", "code", "detail"].map((key) => {
      const value = record[key];
      return typeof value === "string" || typeof value === "number" ? String(value) : "";
    }) : []),
  ].filter(Boolean).join(" ");

  if (/failed to fetch|networkerror|network request failed|fetch failed|err_network/i.test(details)) {
    return {
      message: "החיבור להערות הפנימיות נכשל זמנית. התור והיומן נשארו זמינים. אפשר לנסות שוב.",
      retryable: true,
      transient: true,
    };
  }

  const normalizedDetails = details.toLocaleLowerCase("en");
  if (["401", "403", "unauthorized", "forbidden", "permission denied", "access denied", "not authorized", "row level security", "rls"].some((term) => normalizedDetails.includes(term))) {
    return {
      message: "אין לחשבון הזה הרשאה לצפות בהערות הפנימיות. פרטי הפגישה נשארים זמינים.",
      retryable: false,
      transient: false,
    };
  }

  return {
    message: "לא הצלחנו לקרוא את ההערות הפנימיות. הן לא הוצגו כדי לשמור על הפרטיות. אפשר לנסות שוב.",
    retryable: true,
    transient: false,
  };
}

type CatalogServiceRecord = {
  id?: unknown;
  name?: unknown;
  duration_minutes?: unknown;
  is_active?: unknown;
  weekly_availability?: unknown;
};

function serviceNameKey(value: unknown): string {
  return normalizedCalendarValue(value)
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .toLocaleLowerCase("he");
}

const CALENDAR_CATALOG_SERVICE_NAME_ALIASES: Record<string, string[]> = {
  surgery: ["עיקור/סירוס/ניתוח אחר (נא לפרט)"],
};

function catalogScheduleForAppointmentType(
  type: { id: string; label: string },
  records: CatalogServiceRecord[] | undefined,
): unknown {
  const source = Array.isArray(records) ? records : [];
  const idMatch = source.find((record) => normalizedCalendarValue(record?.id) === type.id);
  if (idMatch) return idMatch.weekly_availability;

  const nameKeys = new Set([
    serviceNameKey(type.label),
    ...(CALENDAR_CATALOG_SERVICE_NAME_ALIASES[type.id] || []).map(serviceNameKey),
  ].filter(Boolean));
  if (nameKeys.size === 0) return undefined;
  const nameMatches = source.filter((record) => nameKeys.has(serviceNameKey(record?.name)));
  if (nameMatches.length === 1) return nameMatches[0].weekly_availability;
  // Ambiguous catalog matches fail closed rather than borrowing the wrong schedule.
  return nameMatches.length > 1 ? [] : undefined;
}

function normalizeCalendarBlock(value: unknown): CalendarBlockDisplay | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const date = text(record.date);
  const startMinutes = timeToMinutes(record.start_time);
  const endMinutes = timeToMinutes(record.end_time);
  if (!dateFromKey(date) || !Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return null;
  const id = text(record.id) || `${date}-${minutesToClock(startMinutes)}-${minutesToClock(endMinutes)}`;
  return { id, date, start_time: minutesToClock(startMinutes), end_time: minutesToClock(endMinutes), reason: text(record.reason) };
}

function unwrapCalendarAvailability(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try { return unwrapCalendarAvailability(JSON.parse(value)); } catch { return null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.data !== undefined) return unwrapCalendarAvailability(record.data);
  if (record.body !== undefined) return unwrapCalendarAvailability(record.body);
  return record;
}

function normalizeSuggestedTimes(value: unknown): string[] {
  const payload = unwrapCalendarAvailability(value);
  const rawTimes = payload?.available_start_times;
  if (!Array.isArray(rawTimes)) return [];
  return [...new Set(rawTimes.flatMap((item) => {
    if (typeof item !== "string") return [];
    const minutes = timeToMinutes(item);
    return Number.isFinite(minutes) ? [minutesToClock(minutes)] : [];
  }))].sort();
}

function calendarBlockOverlapWarning(draft: CalendarBlockDraft, appointments: CrmRecord[]): string | null {
  const date = text(draft.date);
  const start = timeToMinutes(draft.startTime);
  const end = timeToMinutes(draft.endTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const overlaps = (Array.isArray(appointments) ? appointments : []).filter((record) => {
    if (!isActiveAppointment(record) || text(record.date) !== date) return false;
    const appointmentStart = timeToMinutes(record.start_time);
    const appointmentEnd = timeToMinutes(record.end_time);
    return Number.isFinite(appointmentStart) && Number.isFinite(appointmentEnd) && appointmentEnd > appointmentStart && start < appointmentEnd && end > appointmentStart;
  }).length;

  if (!overlaps) return null;
  const label = overlaps === 1 ? "פגישה פעילה קיימת" : "פגישות פעילות קיימות";
  return `הטווח חופף ל-${overlaps} ${label}. הפגישות יישארו ללא שינוי, ואפשר לשמור את הסגירה בכל זאת.`;
}

function normalizedCalendarTime(value: unknown): number | null {
  const minutes = timeToMinutes(value);
  return Number.isFinite(minutes) ? minutes : null;
}

function crmGeneratedGoogleTitle(record: CrmRecord): string {
  return normalizedCalendarValue(`תור: ${normalizedCalendarValue(record.pet_name) || "חיה"} (${normalizedCalendarValue(record.client_name) || ""}) - ${normalizedCalendarValue(record.appointment_type) || ""}`);
}

function isLegacyGoogleEventForAppointment(event: GoogleCalendarEvent, record: CrmRecord): boolean {
  if (normalizedCalendarValue(record.google_event_id)) return false;
  const eventDate = normalizedCalendarValue(event.date);
  const appointmentDate = normalizedCalendarValue(record.date);
  const eventStart = normalizedCalendarTime(event.start);
  const eventEnd = normalizedCalendarTime(event.end);
  const appointmentStart = normalizedCalendarTime(record.start_time);
  const appointmentEnd = normalizedCalendarTime(record.end_time);
  if (!eventDate || !appointmentDate || eventDate !== appointmentDate) return false;
  if (eventStart === null || eventEnd === null || appointmentStart === null || appointmentEnd === null) return false;
  return eventStart === appointmentStart
    && eventEnd === appointmentEnd
    && normalizedCalendarValue(event.title) === crmGeneratedGoogleTitle(record);
}

function isLinkedGoogleEvent(event: GoogleCalendarEvent, records: CrmRecord[]): boolean {
  const eventId = normalizedCalendarValue(event.id);
  if (eventId && records.some((record) => normalizedCalendarValue(record.google_event_id) === eventId)) return true;
  return records.some((record) => isLegacyGoogleEventForAppointment(event, record));
}

function validateAppointmentDraft(draft: AppointmentEditDraft, service: typeof APPOINTMENT_TYPES[number] | undefined): string | null {
  if (!service) return "נא לבחור שירות תקין.";
  if (!dateFromKey(draft.date)) return "נא לבחור תאריך תקין.";
  if (!isValidTime(draft.startTime)) return "נא לבחור שעת התחלה תקינה.";
  if (!draft.clientName.trim()) return "נא למלא את שם הלקוח.";
  if (draft.phone.trim().replace(/\D/g, "").length < 7) return "נא למלא מספר טלפון תקין.";
  if (!validEmail(draft.email.trim())) return "כתובת האימייל אינה תקינה.";
  if (!draft.petName.trim()) return "נא למלא את שם חיית המחמד.";
  if (!["dog", "cat", "other"].includes(draft.petSpecies.trim())) return "נא לבחור סוג חיית מחמד.";
  return null;
}

function CalendarState({ loading, onRetry }: { loading?: boolean; onRetry?: () => void }) {
  return <div dir="rtl" className="flex min-h-[320px] items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white px-6 text-center"><div className="max-w-md">{loading ? <Loader2 className="mx-auto h-9 w-9 animate-spin text-[#5267A8]" /> : <AlertCircle className="mx-auto h-9 w-9 text-red-500" />}<h1 className="mt-4 text-lg font-black text-[#1A1A3E]">{loading ? "טוען את היומן..." : "לא הצלחנו לטעון את היומן"}</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">{loading ? "המסגרת נשארת זמינה בזמן טעינת התורים." : "אפשר לנסות שוב. התורים והמסגרת יישארו זמינים."}</p>{!loading && onRetry && <button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><RefreshCw className="h-4 w-4" />נסי שוב</button>}</div></div>;
}

export default function BusinessCrmCalendar() {
  const { user, userLabel, appointments, inquiries, businessClients, search, setSearch, notificationCount, isDataLoading, dataError, refreshData, openView, openNewAppointment, calendarLaunchRequest, consumeCalendarLaunchRequest } = useCrmContext();
  const isMobile = useIsMobile();
  const isMobileCalendar = isMobile || (typeof window !== "undefined" && window.innerWidth < 768);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [mode, setMode] = useState<CalendarMode>(() => typeof window !== "undefined" && window.innerWidth < 768 ? "day" : "week");
  const [mobileCalendarView, setMobileCalendarView] = useState<"timeline" | "agenda">("timeline");
  const [now, setNow] = useState(() => new Date());
  const [sidePanelOpen, setSidePanelOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [visibleServiceIds, setVisibleServiceIds] = useState<Set<string>>(() => new Set([...APPOINTMENT_TYPES.map((service) => service.id), GOOGLE_CALENDAR_SERVICE_ID]));
  const [selectedAppointment, setSelectedAppointment] = useState<CrmRecord | null>(null);
  const [quickBooking, setQuickBooking] = useState<QuickBookingState | null>(null);
  const [slotAction, setSlotAction] = useState<CalendarSlotActionState | null>(null);
  const [savingBooking, setSavingBooking] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockDraft, setBlockDraft] = useState<CalendarBlockDraft>(() => ({ date: dateKey(new Date()), startTime: "09:00", endTime: "10:00", reason: "" }));
  const [blockFeedback, setBlockFeedback] = useState<string | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const [localAppointments, setLocalAppointments] = useState<CrmRecord[]>([]);
  const [detailMode, setDetailMode] = useState<CalendarDetailMode>("view");
  const [editDraft, setEditDraft] = useState<AppointmentEditDraft | null>(null);
  const [editorFeedback, setEditorFeedback] = useState<string | null>(null);
  const [appointmentFeedback, setAppointmentFeedback] = useState<CalendarDetailFeedback | null>(null);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [noShowConfirmOpen, setNoShowConfirmOpen] = useState(false);
  const [noShowSaving, setNoShowSaving] = useState(false);
  const [notes, setNotes] = useState<CalendarPrivateNote[]>([]);
  const [notesAppointmentId, setNotesAppointmentId] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesAvailable, setNotesAvailable] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesRetryable, setNotesRetryable] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [calendarSyncFeedback, setCalendarSyncFeedback] = useCalendarSyncFeedback();
  const noteRequestRef = useRef(0);
  const handledCalendarLaunchRef = useRef<number | null>(null);
  const canManageClinicCalendar = ["administrator", "user"].includes(String(user?.role || "").toLowerCase());
  const canManagePrivateNotes = ["administrator", "user"].includes(String(user?.role || "").toLowerCase());

  const settingsQuery = useQuery({ queryKey: ["business-crm", "clinic-settings"], queryFn: () => ClinicSettings.list("-created_at", 1) });
  const windowsQuery = useQuery({ queryKey: ["business-crm", "appointment-windows"], queryFn: () => AppointmentWindow.list("-created_at", 1000) });
  const clinicServicesQuery = useQuery<CatalogServiceRecord[]>({
    queryKey: ["business-crm", "clinic-services", "quick-booking"],
    queryFn: async () => {
      const result = await ClinicService.list("sort_order", 500);
      return Array.isArray(result) ? result as CatalogServiceRecord[] : [];
    },
  });
  const visibleCalendarDates = useMemo(() => mode === "month" ? monthGridDates(monthDate) : visibleDates(selectedDate, mode), [mode, monthDate, selectedDate]);
  const calendarBlockQueryDates = useMemo(() => {
    const uniqueDates = new Map<string, Date>();
    [...visibleCalendarDates, ...monthGridDates(monthDate)].forEach((date) => uniqueDates.set(dateKey(date), date));
    return [...uniqueDates.values()].sort((left, right) => left.getTime() - right.getTime());
  }, [monthDate, visibleCalendarDates]);
  const visibleCalendarStartKey = dateKey(calendarBlockQueryDates[0] || selectedDate);
  const visibleCalendarEndKey = dateKey(calendarBlockQueryDates[calendarBlockQueryDates.length - 1] || selectedDate);
  const calendarBlocksQuery = useQuery<unknown[]>({
    queryKey: ["business-crm", "calendar-blocks", visibleCalendarStartKey, visibleCalendarEndKey],
    enabled: Boolean(visibleCalendarStartKey && visibleCalendarEndKey),
    queryFn: async () => {
      const result = await AppointmentBlock.query()
        .gte("date", visibleCalendarStartKey)
        .lte("date", visibleCalendarEndKey)
        .sort("date")
        .limit(1000)
        .exec();
      return Array.isArray(result) ? result : [];
    },
  });
  const normalizedCalendarBlocks = useMemo<CalendarBlockDisplay[]>(() => {
    const seen = new Set<string>();
    return (Array.isArray(calendarBlocksQuery.data) ? calendarBlocksQuery.data : [])
      .map(normalizeCalendarBlock)
      .filter((block): block is CalendarBlockDisplay => {
        if (!block || seen.has(block.id)) return false;
        seen.add(block.id);
        return true;
      });
  }, [calendarBlocksQuery.data]);
  const busyQuery = useQuery<CalendarBusyInterval[]>({ queryKey: ["business-crm", "calendar-busy", visibleCalendarStartKey, visibleCalendarEndKey], enabled: Boolean(visibleCalendarStartKey && visibleCalendarEndKey), queryFn: async () => { try { const result = await getCalendarBusy({ date: visibleCalendarStartKey, dateTo: visibleCalendarEndKey }); return Array.isArray(result?.busy) ? result.busy as CalendarBusyInterval[] : []; } catch (error) { console.warn("Could not load external calendar busy times:", error); return []; } } });
  const calendarEventsQuery = useQuery<{ busy: CalendarBusyInterval[]; events: GoogleCalendarEvent[] }>({
    queryKey: ["business-crm", "calendar-events", visibleCalendarStartKey, visibleCalendarEndKey],
    enabled: Boolean(visibleCalendarStartKey && visibleCalendarEndKey),
    queryFn: async () => {
      try {
        const result = await getCalendarEvents({ date: visibleCalendarStartKey, dateTo: visibleCalendarEndKey });
        return {
          busy: Array.isArray(result?.busy) ? result.busy as CalendarBusyInterval[] : [],
          events: Array.isArray(result?.events) ? result.events as GoogleCalendarEvent[] : [],
        };
      } catch (error) {
        console.warn("Could not load external calendar events:", error);
        throw error;
      }
    },
  });
  const displayCalendarBusy = calendarEventsQuery.data?.busy ?? (Array.isArray(busyQuery.data) ? busyQuery.data : []);
  const googleEvents = calendarEventsQuery.data?.events ?? [];
  const quickBookingDateKey = quickBooking ? dateKey(quickBooking.date) : "";
  const quickBookingBusyQuery = useQuery({ queryKey: ["business-crm", "quick-booking-calendar-busy", quickBookingDateKey], enabled: Boolean(quickBookingDateKey), queryFn: async () => { try { const result = await getCalendarBusy({ date: quickBookingDateKey }); return Array.isArray(result?.busy) ? result.busy : []; } catch (error) { console.warn("Could not load external calendar busy times for quick booking:", error); throw error; } } });

  const loadNotes = useCallback(async (appointmentId: string) => {
    const requestId = ++noteRequestRef.current;
    setNotesAppointmentId(appointmentId);
    setNotes([]);
    setNotesError(null);
    setNotesRetryable(false);

    if (!canManagePrivateNotes) {
      setNotesLoading(false);
      setNotesAvailable(false);
      setNotesError("הערות פנימיות זמינות רק לצוות מורשה של המרפאה.");
      return false;
    }

    setNotesLoading(true);
    setNotesAvailable(true);
    try {
      const loaded = await AppointmentNote.query().where("appointment_id", appointmentId).sort("-created_at").limit(100).exec();
      if (requestId !== noteRequestRef.current) return false;
      if (!Array.isArray(loaded)) throw new Error("Appointment notes returned an invalid response.");
      setNotes(loaded as CalendarPrivateNote[]);
      setNotesAvailable(true);
      setNotesError(null);
      return true;
    } catch (error) {
      if (requestId !== noteRequestRef.current) return false;
      const failure = privateNoteLoadFailure(error);
      if (!failure.transient) console.error("Failed to load private appointment notes:", error);
      setNotes([]);
      setNotesAvailable(false);
      setNotesRetryable(failure.retryable);
      setNotesError(failure.message);
      return false;
    } finally {
      if (requestId === noteRequestRef.current) setNotesLoading(false);
    }
  }, [canManagePrivateNotes]);

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (isMobile) setSidePanelOpen(false); }, [isMobile]);
  useEffect(() => {
    noteRequestRef.current += 1;
    setDetailMode("view");
    setEditDraft(null);
    setEditorFeedback(null);
    setDecisionSaving(false);
    setCancelConfirmOpen(false);
    setCancelSaving(false);
    setNoShowConfirmOpen(false);
    setNoteDraft("");
    setNotes([]);
    setNotesRetryable(false);

    const appointmentId = text(selectedAppointment?.id);
    setNotesAppointmentId(selectedAppointment ? appointmentId : null);
    if (!selectedAppointment) {
      setNotesLoading(false);
      setNotesAvailable(false);
      setNotesError(null);
    } else if (!appointmentId) {
      setNotesLoading(false);
      setNotesAvailable(false);
      setNotesError("להערות הפנימיות חסר מזהה פגישה תקין.");
    } else {
      void loadNotes(appointmentId);
    }

    return () => {
      noteRequestRef.current += 1;
    };
  }, [loadNotes, selectedAppointment?.id]);

  const allAppointmentRecords = useMemo(() => {
    const map = new Map<string, CrmRecord>();
    [...appointments, ...localAppointments].forEach((record) => map.set(recordIdentity(record), record));
    return [...map.values()];
  }, [appointments, localAppointments]);
  const allAppointments = useMemo(
    () => allAppointmentRecords.filter((record) => !["cancelled", "canceled"].includes(text(record.status).toLowerCase())),
    [allAppointmentRecords],
  );
  const unsyncedConfirmedCount = useMemo(
    () => allAppointments.filter((record) => text(record.status).toLowerCase() === "confirmed" && !text(record.google_event_id)).length,
    [allAppointments],
  );
  const googleEventsForDisplay = useMemo(() => {
    const source = Array.isArray(googleEvents) ? googleEvents : [];
    return source.filter((event) => !isLinkedGoogleEvent(event, allAppointmentRecords));
  }, [allAppointmentRecords, googleEvents]);
  const visibleGoogleEvents = useMemo(
    () => visibleServiceIds.has(GOOGLE_CALENDAR_SERVICE_ID) ? googleEventsForDisplay : [],
    [googleEventsForDisplay, visibleServiceIds],
  );
  const customerRows = useMemo(() => buildClientRows(appointments, inquiries, businessClients).filter((row) => row.status !== "lead"), [appointments, inquiries, businessClients]);
  const selectedQuickCustomer = useMemo(() => quickBooking?.selectedCustomerId ? customerRows.find((row) => row.id === quickBooking.selectedCustomerId) || null : null, [customerRows, quickBooking?.selectedCustomerId]);
  const appointmentServiceItems = useMemo<CalendarServiceItem[]>(() => APPOINTMENT_TYPES.map((service) => ({ id: service.id, label: service.label, duration: service.duration, remote: allAppointments.some((record) => serviceIdForRecord(record, APPOINTMENT_TYPES) === service.id && hasRemoteSupport(record)) })), [allAppointments]);
  const quickBookingServiceItems = useMemo<CalendarServiceItem[]>(() => {
    const catalogItems = (Array.isArray(clinicServicesQuery.data) ? clinicServicesQuery.data : [])
      .map((record) => {
        const id = typeof record.id === "string" || typeof record.id === "number" ? String(record.id).trim() : "";
        const label = typeof record.name === "string" ? record.name.trim() : "";
        const duration = typeof record.duration_minutes === "number" ? record.duration_minutes : Number(record.duration_minutes);
        const active = record.is_active !== false && record.is_active !== 0 && record.is_active !== "false";
        if (!id || id === "other" || !label || !active || !Number.isInteger(duration) || duration <= 0 || duration > 720) return null;
        return { id, label, duration, remote: false, weeklyAvailability: record.weekly_availability } satisfies CalendarServiceItem;
      })
      .filter((item): item is CalendarServiceItem => Boolean(item));
    if (catalogItems.length > 0) return catalogItems;
    return APPOINTMENT_TYPES.map((service) => ({ id: service.id, label: service.label, duration: service.duration, remote: false }));
  }, [clinicServicesQuery.data]);
  const calendarFilterItems = useMemo<CalendarServiceItem[]>(() => [...appointmentServiceItems, { id: GOOGLE_CALENDAR_SERVICE_ID, label: "יומן Google", duration: 0, remote: false }], [appointmentServiceItems]);
  const visibleAppointments = useMemo(() => { const query = search.trim().toLocaleLowerCase("he"); return allAppointments.filter((record) => { const serviceId = serviceIdForRecord(record, appointmentServiceItems); const service = appointmentServiceItems.find((item) => item.id === serviceId); const isUnknownService = serviceId === "other"; const matchesSearch = !query || `${recordSearchText(record)} ${service?.label || ""}`.toLocaleLowerCase("he").includes(query); return (isUnknownService || visibleServiceIds.has(serviceId)) && matchesSearch; }); }, [allAppointments, appointmentServiceItems, search, visibleServiceIds]);
  const clinicSettings = Array.isArray(settingsQuery.data) ? settingsQuery.data[0] : undefined;
  const clinicHours = useMemo(() => getClinicHours(clinicSettings?.weekly_availability), [clinicSettings?.weekly_availability]);
  const appointmentWindows = Array.isArray(windowsQuery.data) ? windowsQuery.data : [];
  const bookingDataUnavailable = Boolean(settingsQuery.error || windowsQuery.error);
  const suggestedBookingTime = useMemo(() => { const clinicPeriods = clinicHours[selectedDate.getDay()] || []; const clinicFallbackTime = clinicPeriods[0]?.start || "09:00"; const fallbackTime = isToday(selectedDate, now) && isPastCalendarMoment(selectedDate, clinicFallbackTime, now) ? format(new Date(now.getTime() + 60_000), "HH:mm") : clinicFallbackTime; if (bookingDataUnavailable || settingsQuery.isLoading || windowsQuery.isLoading || busyQuery.isLoading) return fallbackTime; const availableTimes = APPOINTMENT_TYPES.flatMap((service) => getAvailableManagerSlots({ date: selectedDate, type: service, appointments: allAppointments, windows: appointmentWindows, calendarBusy: Array.isArray(busyQuery.data) ? busyQuery.data : [], minHoursBeforeBooking: Number(clinicSettings?.min_hours_before_booking ?? 4), now, clinicHours })); return availableTimes.filter((time) => !isPastCalendarMoment(selectedDate, time, now)).sort((left, right) => left.localeCompare(right))[0] || fallbackTime; }, [allAppointments, appointmentWindows, bookingDataUnavailable, busyQuery.data, busyQuery.isLoading, clinicSettings?.min_hours_before_booking, now, selectedDate, settingsQuery.isLoading, windowsQuery.isLoading, clinicHours]);
  const canCreateBooking = useMemo(() => !isPastCalendarMoment(selectedDate, suggestedBookingTime, now), [now, selectedDate, suggestedBookingTime]);
  const quickBookingService = quickBooking ? quickBookingServiceItems.find((service) => service.id === quickBooking.draft.serviceId) : undefined;
  const publicAvailabilityQuery = useQuery<string[]>({
    queryKey: [
      "business-crm",
      "public-availability",
      quickBookingDateKey,
      quickBookingService?.id || "",
      quickBookingService?.label || "",
      quickBookingService?.duration || 0,
      JSON.stringify(quickBookingService?.weeklyAvailability ?? null) || "",
    ],
    enabled: Boolean(quickBooking && quickBookingDateKey && quickBookingService && quickBookingService.id !== "other" && quickBookingService.duration > 0),
    queryFn: async () => {
      if (!quickBooking || !quickBookingService) return [];
      try {
        const result = await publicAppointmentBooking({
          action: "availability",
          service_id: quickBookingService.id,
          service_name: quickBookingService.label,
          service_duration_minutes: quickBookingService.duration,
          date: quickBookingDateKey,
        });
        const payload = unwrapCalendarAvailability(result);
        if (!payload || !Array.isArray(payload.available_start_times)) throw new Error("invalid availability response");
        return normalizeSuggestedTimes(result);
      } catch (error) {
        console.warn("Could not load customer availability for CRM booking:", error);
        throw new Error("לא הצלחנו לטעון את השעות הפנויות ללקוח כרגע.");
      }
    },
  });
  const publicSuggestedTimes = publicAvailabilityQuery.data ?? [];
  const publicAvailabilityLoading = Boolean(quickBooking && publicAvailabilityQuery.isFetching);
  const publicAvailabilityError = publicAvailabilityQuery.error ? "לא הצלחנו לטעון את השעות הפנויות ללקוח כרגע. אפשר להקליד שעה עתידית אחרת ולשמור את הפגישה." : "";
  const quickBookingAvailabilityLoading = Boolean(
    quickBooking &&
      (settingsQuery.isFetching || windowsQuery.isFetching || quickBookingBusyQuery.isFetching),
  );
  const quickBookingAvailabilityError = Boolean(
    quickBooking && (settingsQuery.error || windowsQuery.error || quickBookingBusyQuery.error),
  );
  const quickBookingAvailabilityErrorMessage = quickBookingAvailabilityError
    ? "חלק מבדיקות הזמינות לא נטענו. אפשר לשמור את התור, אך כדאי לבדוק ידנית את שעות המרפאה, הפגישות ויומן Google."
    : "";
  const quickBookingWarnings = useMemo<ManagerBookingWarning[]>(() => {
    if (!quickBooking || !quickBookingService || !isValidTime(quickBooking.time)) return [];
    if (
      settingsQuery.isFetching ||
      windowsQuery.isFetching ||
      settingsQuery.error ||
      windowsQuery.error
    ) return [];

    const googleDataReady = !quickBookingBusyQuery.isFetching && !quickBookingBusyQuery.error;
    return getManagerBookingWarnings({
      date: quickBooking.date,
      startTime: quickBooking.time,
      type: quickBookingService,
      appointments: allAppointments,
      windows: appointmentWindows,
      blocks: normalizedCalendarBlocks.filter((block) => block.date === dateKey(quickBooking.date)),
      clinicHours,
      serviceWeeklyAvailability: quickBookingService.weeklyAvailability,
      minHoursBeforeBooking: Number(clinicSettings?.min_hours_before_booking ?? 4),
      now,
      calendarBusy: googleDataReady && Array.isArray(quickBookingBusyQuery.data)
        ? quickBookingBusyQuery.data
        : [],
    });
  }, [
    allAppointments,
    appointmentWindows,
    clinicHours,
    clinicSettings?.min_hours_before_booking,
    normalizedCalendarBlocks,
    now,
    quickBooking,
    quickBookingBusyQuery.data,
    quickBookingBusyQuery.error,
    quickBookingBusyQuery.isFetching,
    quickBookingService,
    settingsQuery.error,
    settingsQuery.isFetching,
    windowsQuery.error,
    windowsQuery.isFetching,
  ]);

  const blockOverlapWarning = useMemo(() => calendarBlockOverlapWarning(blockDraft, allAppointments), [allAppointments, blockDraft]);

  const isTodayView = useMemo(() => {
    if (mode === "month") return isInMonth(now, monthDate);
    return visibleDates(selectedDate, mode).some((date) => isToday(date, now));
  }, [mode, monthDate, now, selectedDate]);

  const selectDate = (date: Date) => { setSelectedDate(date); setMonthDate(date); };
  const moveDate = (direction: -1 | 1) => { const next = navigationDate(selectedDate, mode, direction); selectDate(next); };
  const openAppointment = useCallback((record: CrmRecord) => { setAppointmentFeedback(null); setEditorFeedback(null); setSelectedAppointment(record); }, []);
  const openQuickBooking = useCallback((date: Date, time: string) => { if (isPastCalendarMoment(date, time, new Date())) return; setQuickBooking({ date, time, draft: emptyDraft(), feedback: "", customerMode: "existing", customerSearch: "", selectedCustomerId: null }); setServicePickerOpen(false); }, []);
  useEffect(() => {
    if (!calendarLaunchRequest || handledCalendarLaunchRef.current === calendarLaunchRequest.requestId) return;
    handledCalendarLaunchRef.current = calendarLaunchRequest.requestId;
    if (calendarLaunchRequest.kind === "new") {
      const nowAtLaunch = new Date();
      let bookingDate = new Date(nowAtLaunch);
      let bookingTime = suggestedBookingTime || "09:00";
      if (isPastCalendarMoment(bookingDate, bookingTime, nowAtLaunch)) {
        bookingDate.setDate(bookingDate.getDate() + 1);
        bookingTime = "09:00";
      }
      openQuickBooking(bookingDate, bookingTime);
    } else {
      const record = allAppointmentRecords.find((item) => text(item.id) === calendarLaunchRequest.appointmentId) || calendarLaunchRequest.record;
      if (record) openAppointment(record);
    }
    consumeCalendarLaunchRequest(calendarLaunchRequest.requestId);
  }, [allAppointmentRecords, calendarLaunchRequest, consumeCalendarLaunchRequest, openAppointment, openQuickBooking, suggestedBookingTime]);
  const openSlotAction = (date: Date, time: string) => { setSlotAction({ date, time }); };
  const updateQuickDraft = (field: keyof QuickBookingDraft, value: string) => setQuickBooking((current) => current ? { ...current, feedback: "", draft: { ...current.draft, [field]: value } } : current);
  const updateQuickCustomerSearch = (value: string) => setQuickBooking((current) => {
    if (!current) return current;
    const isEditingSelectedCustomer = Boolean(current.selectedCustomerId);
    return {
      ...current,
      customerSearch: value,
      selectedCustomerId: isEditingSelectedCustomer ? null : current.selectedCustomerId,
      feedback: "",
      draft: isEditingSelectedCustomer
        ? { ...current.draft, clientName: "", phone: "", email: "", petName: "", petSpecies: "" }
        : current.draft,
    };
  });
  const changeQuickCustomerMode = (mode: QuickBookingCustomerMode) => setQuickBooking((current) => {
    if (!current) return current;
    if (current.customerMode === mode) return { ...current, feedback: "" };
    const typedCustomerName = current.customerMode === "existing" ? current.customerSearch : "";
    return {
      ...current,
      customerMode: mode,
      customerSearch: "",
      selectedCustomerId: null,
      feedback: "",
      draft: {
        ...current.draft,
        clientName: mode === "new" ? typedCustomerName : "",
        phone: "",
        email: "",
        petName: "",
        petSpecies: "",
      },
    };
  });
  const selectQuickCustomer = (customer: ClientRow) => setQuickBooking((current) => current ? { ...current, customerMode: "existing", customerSearch: customer.name, selectedCustomerId: customer.id, feedback: "", draft: { ...current.draft, clientName: customer.name, phone: customer.phone, email: customer.email, petName: customer.pets[0]?.name || "", petSpecies: customer.pets[0]?.species || "" } } : current);
  const updateQuickBookingTime = (time: string) => setQuickBooking((current) => current ? { ...current, time, feedback: "" } : current);
  const openBlockDialog = (date = selectedDate, time?: string) => {
    const startTime = time && isValidTime(time) ? time : "09:00";
    const startMinutes = timeToMinutes(startTime);
    const requestedEndMinutes = Number.isFinite(startMinutes) ? startMinutes + 30 : 10 * 60;
    const endMinutes = Math.min(1439, requestedEndMinutes);
    const safeEndMinutes = endMinutes > startMinutes ? endMinutes : Math.min(1439, startMinutes + 1);
    setBlockDraft({ date: dateKey(date), startTime, endTime: minutesToClock(safeEndMinutes), reason: "" });
    setBlockFeedback(null);
    setBlockDialogOpen(true);
  };
  const chooseSlotAppointment = () => {
    if (!slotAction) return;
    const { date, time } = slotAction;
    setSlotAction(null);
    openQuickBooking(date, time);
  };
  const chooseSlotBlock = () => {
    if (!slotAction) return;
    const { date, time } = slotAction;
    setSlotAction(null);
    openBlockDialog(date, time);
  };
  const updateBlockDraft = (field: keyof CalendarBlockDraft, value: string) => {
    setBlockDraft((current) => ({ ...current, [field]: value }));
    setBlockFeedback(null);
  };
  const saveCalendarBlock = async () => {
    if (blockSaving) return;
    const date = dateFromKey(blockDraft.date.trim());
    const start = timeToMinutes(blockDraft.startTime);
    const end = timeToMinutes(blockDraft.endTime);
    if (!date) { setBlockFeedback("נא לבחור תאריך תקין."); return; }
    if (!isValidTime(blockDraft.startTime) || !isValidTime(blockDraft.endTime) || !Number.isFinite(start) || !Number.isFinite(end)) { setBlockFeedback("נא לבחור שעות תקינות."); return; }
    if (end <= start) { setBlockFeedback("שעת הסיום חייבת להיות מאוחרת משעת ההתחלה."); return; }

    setBlockSaving(true);
    setBlockFeedback(null);
    try {
      await AppointmentBlock.create({
        date: dateKey(date),
        start_time: minutesToClock(start),
        end_time: minutesToClock(end),
        reason: blockDraft.reason.trim(),
      });
      await calendarBlocksQuery.refetch();
      setBlockDialogOpen(false);
      setBlockFeedback("סגירת חלון הזמן נשמרה ביומן.");
    } catch (error) {
      console.error("Failed to save CRM calendar block:", error);
      setBlockFeedback("לא הצלחנו לשמור את סגירת חלון הזמן. נסי שוב.");
    } finally {
      setBlockSaving(false);
    }
  };
  const deleteCalendarBlock = async (block: CalendarBlockDisplay) => {
    const blockId = text(block.id);
    if (!blockId) { setBlockFeedback("לסגירת החלון חסר מזהה שמאפשר להסיר אותה."); return; }
    const confirmed = typeof window === "undefined" || window.confirm(`להסיר את סגירת הזמן ${block.start_time}–${block.end_time}? התורים הקיימים לא ישתנו.`);
    if (!confirmed) return;
    try {
      await AppointmentBlock.delete(blockId);
      await calendarBlocksQuery.refetch();
      setBlockFeedback("סגירת חלון הזמן הוסרה. התורים הקיימים נשארו ללא שינוי.");
    } catch (error) {
      console.error("Failed to delete CRM calendar block:", error);
      setBlockFeedback("לא הצלחנו להסיר את סגירת חלון הזמן. נסי שוב.");
    }
  };
  const toggleService = (id: string) => setVisibleServiceIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const patchLocalAppointment = (record: CrmRecord) => { const id = text(record.id); setLocalAppointments((current) => id ? [...current.filter((item) => text(item.id) !== id), record] : [...current, record]); };
  const actionFeedback = (result: { isPartial: boolean; summary: string }): CalendarDetailFeedback => ({ tone: result.isPartial ? "info" : "success", message: result.summary });
  const refreshGoogleCalendarViews = () => {
    void calendarEventsQuery.refetch().catch((error) => console.warn("Could not refresh Google Calendar events:", error));
    void busyQuery.refetch().catch((error) => console.warn("Could not refresh Google Calendar busy times:", error));
  };
  const refreshCrmAndGoogleCalendar = () => {
    refreshGoogleCalendarViews();
    void Promise.resolve(refreshData()).catch((error) => console.error("Calendar action completed, but CRM refresh failed:", error));
  };
  const syncCreatedAppointmentCalendar = async (record: CrmRecord): Promise<{ record: CrmRecord; outcome: SideEffectOutcome }> => {
    const appointmentId = text(record.id);
    let outcome: SideEffectOutcome;
    try {
      outcome = appointmentId
        ? await syncCalendarOnlyAppointment(appointmentId)
        : { status: "failed", detail: "לפגישה חסר מזהה שמאפשר לסנכרן אותה." };
    } catch (error) {
      console.error("Appointment saved, but its Google Calendar sync could not be verified:", error);
      outcome = { status: "failed", detail: "לא הצלחנו לאמת את הסנכרון ל-Google Calendar." };
    }
    const syncedRecord = outcome.eventId ? { ...record, google_event_id: outcome.eventId } as CrmRecord : record;
    setCalendarSyncFeedback(calendarOutcomeFeedback(appointmentId, outcome, "sync"));
    if (outcome.status !== "failed") refreshGoogleCalendarViews();
    return { record: syncedRecord, outcome };
  };
  const retrySingleCalendarAction = async (appointmentId: string, actionOverride?: "sync" | "remove") => {
    const id = text(appointmentId);
    if (!id) return;
    const retry = await runCalendarAppointmentRetry(id, actionOverride);
    if (!retry) return;
    const { outcome } = retry;
    if (outcome.eventId) {
      const selectedMatches = Boolean(selectedAppointment && text(selectedAppointment.id) === id);
      const existing = selectedMatches
        ? selectedAppointment
        : localAppointments.find((record) => text(record.id) === id) || allAppointmentRecords.find((record) => text(record.id) === id) || null;
      if (existing) {
        const updated = { ...existing, google_event_id: outcome.eventId } as CrmRecord;
        patchLocalAppointment(updated);
        if (selectedMatches) setSelectedAppointment(updated);
      }
    }
    refreshCrmAndGoogleCalendar();
  };

  const saveAppointmentDecision = async (action: "approve" | "reject") => {
    if (!selectedAppointment || decisionSaving || cancelSaving) return;
    if (text(selectedAppointment.status) !== "requested") { setAppointmentFeedback({ tone: "error", message: "בקשת התור כבר טופלה או שאינה ממתינה להחלטה." }); return; }
    const id = text(selectedAppointment.id);
    if (!id) { setAppointmentFeedback({ tone: "error", message: "לבקשת התור חסר מזהה שמאפשר לשמור את ההחלטה." }); return; }
    setDecisionSaving(true); setAppointmentFeedback(null);
    try {
      const snapshot = appointmentSnapshotFromRecord(selectedAppointment);
      const result = action === "approve" ? await approveAppointmentRequest(snapshot) : await rejectAppointmentRequest(snapshot);
      if (action === "approve") {
        setCalendarSyncFeedback(calendarOutcomeFeedback(id, result.calendar, "sync"));
        if (result.calendar.status !== "failed") refreshGoogleCalendarViews();
      }
      const saved = { ...selectedAppointment, ...(action === "approve" ? { status: "confirmed", inbox_handled_at: new Date().toISOString(), ...(result.googleEventId ? { google_event_id: result.googleEventId } : {}) } : { status: "cancelled", cancelled_by: "admin", inbox_handled_at: new Date().toISOString() }) } as CrmRecord;
      patchLocalAppointment(saved); setSelectedAppointment(saved); setAppointmentFeedback(actionFeedback(result));
      try { await Promise.resolve(refreshData()); } catch (error) { console.error("Appointment decision saved, but CRM refresh failed:", error); setAppointmentFeedback((current) => current ? { ...current, tone: "info", message: `${current.message} רענון היומן לא הצליח, נסי לרענן שוב.` } : current); }
    } catch (error) {
      console.error(`Failed to ${action} CRM calendar appointment:`, error);
      setAppointmentFeedback({ tone: "error", message: error instanceof Error ? error.message : "לא הצלחנו להשלים את ההחלטה. נסי שוב." });
    } finally { setDecisionSaving(false); }
  };

  const requestAppointmentCancellation = () => {
    if (text(selectedAppointment?.status) !== "confirmed" || cancelSaving) return;
    setCancelConfirmOpen(true); setAppointmentFeedback(null);
  };

  const saveConfirmedCancellation = async () => {
    if (!selectedAppointment || cancelSaving || decisionSaving) return;
    if (text(selectedAppointment.status) !== "confirmed") { setAppointmentFeedback({ tone: "error", message: "אפשר לבטל מהיומן רק פגישה מאושרת." }); setCancelConfirmOpen(false); return; }
    const id = text(selectedAppointment.id);
    if (!id) { setAppointmentFeedback({ tone: "error", message: "לפגישה הזו חסר מזהה שמאפשר לשמור את הביטול." }); return; }
    setCancelSaving(true); setAppointmentFeedback(null);
    try {
      const result = await cancelConfirmedAppointment(appointmentSnapshotFromRecord(selectedAppointment));
      setCalendarSyncFeedback(calendarOutcomeFeedback(id, result.calendar, "remove"));
      if (result.calendar.status !== "failed") refreshGoogleCalendarViews();
      const saved = { ...selectedAppointment, status: "cancelled", cancelled_by: "admin" } as CrmRecord;
      patchLocalAppointment(saved); setSelectedAppointment(saved); setCancelConfirmOpen(false); setAppointmentFeedback(actionFeedback(result));
      try { await Promise.resolve(refreshData()); } catch (error) { console.error("Appointment cancellation saved, but CRM refresh failed:", error); setAppointmentFeedback((current) => current ? { ...current, tone: "info", message: `${current.message} רענון היומן לא הצליח, נסי לרענן שוב.` } : current); }
    } catch (error) {
      console.error("Failed to cancel CRM calendar appointment:", error);
      setAppointmentFeedback({ tone: "error", message: error instanceof Error ? error.message : "לא הצלחנו לבטל את הפגישה. נסי שוב." });
    } finally { setCancelSaving(false); }
  };

  const saveBooking = async () => {
    if (!quickBooking || savingBooking) return;
    const { date, time, draft, customerMode, selectedCustomerId } = quickBooking;
    const fail = (message: string) => setQuickBooking((current) => current ? { ...current, feedback: message } : current);
    const service = quickBookingServiceItems.find((item) => item.id === draft.serviceId);
    const name = draft.clientName.trim();
    const phone = draft.phone.trim();
    const email = draft.email.trim();
    const petName = draft.petName.trim();
    const species = draft.petSpecies.trim();

    if (customerMode === "existing" && (!selectedCustomerId || !customerRows.some((row) => row.id === selectedCustomerId))) return fail("בחרי לקוח קיים מהרשימה, או עברי ל״לקוח חדש״.");
    if (!service) return fail("נא לבחור שירות.");
    if (!isValidTime(time)) return fail("נא לבחור שעת התחלה תקינה.");
    if (isPastCalendarMoment(date, time, new Date())) return fail("לא ניתן לקבוע תור למועד שכבר עבר. בחרי יום ושעה עתידיים.");
    if (!name) return fail("נא למלא את שם הלקוח.");
    if (phone.replace(/\D/g, "").length < 7) return fail("נא למלא מספר טלפון תקין.");
    if (email && !email.includes("@")) return fail("כתובת האימייל אינה תקינה.");
    if (!petName) return fail("נא למלא את שם חיית המחמד.");
    if (!["dog", "cat", "other"].includes(species)) return fail("נא לבחור סוג חיית מחמד.");

    setSavingBooking(true);
    setQuickBooking((current) => current ? { ...current, feedback: "" } : current);
    const formattedDate = format(date, "yyyy-MM-dd");
    try {
      const startMinutes = timeToMinutes(time);
      const payload = { appointment_type: service.label, duration_minutes: service.duration, date: formattedDate, start_time: time, end_time: minutesToClock(startMinutes + service.duration), client_name: name, phone, email, pet_name: petName, pet_species: species, notes: draft.notes.trim(), status: "confirmed", sms_consent: false, sms_consent_language: "", cancel_token: cancelToken() };
      const created = await Appointment.create(payload);
      const saved = { ...payload, ...(created && typeof created === "object" ? created : {}) } as CrmRecord;
      void notifyBrowserPush("new_appointment", text(saved.id));
      const { record: syncedAppointment } = await syncCreatedAppointmentCalendar(saved);
      patchLocalAppointment(syncedAppointment);
      if (customerMode === "new") {
        try { await contacts({ first_name: name, phone: normalizeClientPhone(phone) || phone, contact_stage: "customer", source: "crm_calendar_booking", ...(email ? { email } : {}) }); } catch (error) { console.error("Appointment saved, but contact sync failed:", error); }
      }
      try { await Promise.resolve(refreshData()); } catch (error) { console.error("Appointment saved, but CRM refresh failed:", error); }
      setQuickBooking(null);
    } catch (error) {
      console.error("Failed to save CRM calendar appointment:", error);
      fail("לא הצלחנו לשמור את הפגישה. בדקי את הפרטים ונסי שוב.");
    } finally { setSavingBooking(false); }
  };

  const beginEditor = (nextMode: AppointmentActionMode) => { if (!selectedAppointment) return; setEditDraft(createAppointmentEditDraft(selectedAppointment, APPOINTMENT_TYPES)); setDetailMode(nextMode); setEditorFeedback(null); setAppointmentFeedback(null); setCancelConfirmOpen(false); setNoShowConfirmOpen(false); };
  const updateEditDraft = (field: keyof AppointmentEditDraft, value: string) => { setEditDraft((current) => current ? { ...current, [field]: value } : current); setEditorFeedback(null); };

  const saveAppointmentEditor = async () => {
    if (!selectedAppointment || !editDraft || detailMode === "view" || savingAppointment) return;

    const modeToSave = detailMode;
    const draft = editDraft;
    const service = APPOINTMENT_TYPES.find((item) => item.id === draft.serviceId);
    const validationError = validateAppointmentDraft(draft, service);
    if (validationError) { setEditorFeedback(validationError); return; }

    const appointmentDate = dateFromKey(draft.date);
    const startMinutes = timeToMinutes(draft.startTime);
    if (!appointmentDate || !Number.isFinite(startMinutes) || !service) {
      setEditorFeedback("פרטי התאריך או השירות אינם תקינים.");
      return;
    }
    const endMinutes = startMinutes + service.duration;
    if (!Number.isInteger(service.duration) || service.duration <= 0 || endMinutes > 1439) {
      setEditorFeedback("שעת הסיום אינה תקינה. בחרי שעת התחלה מוקדמת יותר.");
      return;
    }
    const normalizedStartTime = minutesToClock(startMinutes);
    const sourceId = text(selectedAppointment.id);
    if (!sourceId) {
      setEditorFeedback(modeToSave === "edit" ? "לפגישה הזו חסר מזהה שמאפשר לשמור שינויים." : "לפגישה המקורית חסר מזהה תקין, ולכן לא ניתן לשכפל אותה.");
      return;
    }

    const sourceDate = text(selectedAppointment.date);
    const sourceStartTime = text(selectedAppointment.start_time).slice(0, 5);
    const dateOrTimeChanged = sourceDate !== draft.date || sourceStartTime !== normalizedStartTime;
    const serviceChanged = serviceIdForRecord(selectedAppointment, APPOINTMENT_TYPES) !== draft.serviceId;
    const targetIsPast = isPastCalendarMoment(appointmentDate, normalizedStartTime, new Date());
    if ((modeToSave === "duplicate" || dateOrTimeChanged) && targetIsPast) {
      setEditorFeedback("לא ניתן לקבוע תור למועד שכבר עבר. בחרי יום ושעה עתידיים.");
      return;
    }

    const shouldCheckAvailability = modeToSave === "duplicate" || dateOrTimeChanged;
    const shouldCheckServiceSchedule = shouldCheckAvailability || (modeToSave === "edit" && serviceChanged);
    setSavingAppointment(true);
    setEditorFeedback(null);
    let externalLookupFallback = false;
    let availabilityDataFallback = false;
    let availabilityWarningMessages: string[] = [];
    const withAvailabilityNotices = (feedback: CalendarDetailFeedback): CalendarDetailFeedback => {
      const notices = [...new Set(availabilityWarningMessages)];
      if (externalLookupFallback) notices.push("בדיקת היומן החיצוני לא הייתה זמינה, ולכן נבדקה הזמינות הפנימית בלבד.");
      if (notices.length === 0) return feedback;
      return {
        tone: availabilityWarningMessages.length > 0 ? "warning" : "info",
        message: [feedback.message, ...notices].join(" "),
      };
    };

    try {
      let calendarBusy: CalendarBusyInterval[] = [];
      let freshRecords: CrmRecord[] = [];
      let blocksForAvailability = normalizedCalendarBlocks.filter((block) => block.date === draft.date);

      if (shouldCheckServiceSchedule) {
        try {
          const result = await getCalendarBusy({ date: draft.date });
          calendarBusy = Array.isArray(result?.busy) ? result.busy as CalendarBusyInterval[] : [];
        } catch (error) {
          externalLookupFallback = true;
          console.warn("Could not load external calendar busy times while saving CRM appointment:", error);
        }

        try {
          const fresh = await Appointment.query().where("date", draft.date).exec();
          if (!Array.isArray(fresh)) throw new Error("Appointment query returned an invalid response.");
          freshRecords = fresh as CrmRecord[];
        } catch (error) {
          console.error("Failed to verify edited appointment availability:", error);
          setEditorFeedback("לא הצלחנו לבדוק את הזמינות העדכנית. הפגישה לא נשמרה, נסי שוב.");
          return;
        }

        try {
          const freshBlocks = await AppointmentBlock.query().where("date", draft.date).exec();
          if (!Array.isArray(freshBlocks)) throw new Error("Calendar block query returned an invalid response.");
          blocksForAvailability = freshBlocks
            .map(normalizeCalendarBlock)
            .filter((block): block is CalendarBlockDisplay => Boolean(block));
        } catch (error) {
          availabilityDataFallback = true;
          console.warn("Could not load current calendar closures while saving CRM appointment:", error);
        }

        const recordsForAvailability = freshRecords
          .filter((record) => modeToSave !== "edit" || text(record.id) !== sourceId)
          .filter((record) => isActiveAppointment(record));
        const serviceWeeklyAvailability = catalogScheduleForAppointmentType(service, clinicServicesQuery.data);
        const availabilityType = { ...service, weeklyAvailability: serviceWeeklyAvailability };
        const availabilityConfigurationUnavailable = bookingDataUnavailable
          || settingsQuery.isLoading
          || windowsQuery.isLoading
          || clinicServicesQuery.isLoading
          || Boolean(clinicServicesQuery.error && !clinicServicesQuery.data);
        if (availabilityConfigurationUnavailable) availabilityDataFallback = true;

        const availabilityNow = shouldCheckAvailability ? new Date() : new Date(0);
        const minHoursBeforeBooking = shouldCheckAvailability
          ? Number(clinicSettings?.min_hours_before_booking ?? 4)
          : 0;
        try {
          const availableSlots = getAvailableManagerSlots({
            date: appointmentDate,
            type: availabilityType,
            appointments: recordsForAvailability,
            windows: appointmentWindows,
            calendarBusy,
            minHoursBeforeBooking,
            now: availabilityNow,
            clinicHours,
          });
          const managerWarnings = getManagerBookingWarnings({
            date: appointmentDate,
            startTime: normalizedStartTime,
            type: availabilityType,
            appointments: recordsForAvailability,
            windows: appointmentWindows,
            blocks: blocksForAvailability,
            calendarBusy,
            minHoursBeforeBooking,
            now: availabilityNow,
            clinicHours,
            serviceWeeklyAvailability,
          });
          availabilityWarningMessages = managerWarnings.map((warning) => warning.message);
          if (!availableSlots.includes(normalizedStartTime) && managerWarnings.length === 0) {
            availabilityWarningMessages.push("השעה שבחרת אינה מופיעה בשעות המוצעות. אפשר לשמור את התור לפי בחירתך.");
          }
        } catch (error) {
          availabilityDataFallback = true;
          console.warn("Could not evaluate manager appointment availability:", error);
        }

        if (availabilityDataFallback) {
          availabilityWarningMessages.push("לא ניתן היה להשלים את כל בדיקות הזמינות. הפגישה נשמרה לפי בחירתך.");
        }
      }

      const endTime = minutesToClock(endMinutes);
      const sharedFields = {
        appointment_type: service.label,
        duration_minutes: service.duration,
        date: draft.date,
        start_time: normalizedStartTime,
        end_time: endTime,
        client_name: draft.clientName.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        pet_name: draft.petName.trim(),
        pet_species: draft.petSpecies.trim(),
        notes: draft.notes.trim(),
      };

      if (modeToSave === "edit") {
        const wasConfirmed = text(selectedAppointment.status) === "confirmed";
        const changes = dateOrTimeChanged
          ? { ...sharedFields, day_before_reminder_sent_at: "", hour_before_reminder_sent_at: "" }
          : sharedFields;
        const updated = await Appointment.update(sourceId, changes);
        const saved = { ...selectedAppointment, ...changes, ...(updated && typeof updated === "object" ? updated : {}) } as CrmRecord;
        patchLocalAppointment(saved);
        setSelectedAppointment(saved);
        setDetailMode("view");
        setEditDraft(null);
        const movedDate = dateFromKey(text(saved.date));
        if (movedDate) selectDate(movedDate);

        let feedback: CalendarDetailFeedback = { tone: "success", message: "השינויים בפגישה נשמרו." };
        if (wasConfirmed) {
          try {
            const sideEffects = await syncUpdatedAppointment(appointmentSnapshotFromRecord(saved));
            feedback = actionFeedback(sideEffects);
            setCalendarSyncFeedback(calendarOutcomeFeedback(sourceId, sideEffects.calendar, "sync"));
            if (sideEffects.googleEventId) {
              const synced = { ...saved, google_event_id: sideEffects.googleEventId } as CrmRecord;
              patchLocalAppointment(synced);
              setSelectedAppointment(synced);
            }
            if (sideEffects.calendar.status !== "failed") refreshGoogleCalendarViews();
          } catch (error) {
            console.error("Appointment updated, but customer notifications or calendar sync failed:", error);
            feedback = { tone: "info", message: "השינויים בפגישה נשמרו, אך לא הצלחנו לאמת את הסנכרון ל-Google Calendar. אפשר לבדוק אותו שוב ביומן." };
            setCalendarSyncFeedback({ tone: "warning", message: "השינויים נשמרו, אך לא התקבל אישור על הסנכרון ל-Google Calendar. אפשר לנסות שוב בלי לשלוח הודעת עדכון נוספת.", retryAppointmentId: sourceId, retryAction: "sync" });
          }
        }
        setAppointmentFeedback(withAvailabilityNotices(feedback));
        try {
          await Promise.resolve(refreshData());
        } catch (error) {
          console.error("Appointment updated, but CRM refresh failed:", error);
          setAppointmentFeedback((current) => current ? {
            ...current,
            tone: current.tone === "warning" ? "warning" : "info",
            message: `${current.message} רענון היומן לא הצליח, נסי לרענן שוב.`,
          } : current);
        }
        return;
      }

      const payload = { ...sharedFields, status: "confirmed", sms_consent: false, sms_consent_language: "", cancel_token: cancelToken() };
      const created = await Appointment.create(payload);
      const saved = { ...payload, ...(created && typeof created === "object" ? created : {}) } as CrmRecord;
      void notifyBrowserPush("new_appointment", text(saved.id));
      const { record: syncedAppointment, outcome: calendarOutcome } = await syncCreatedAppointmentCalendar(saved);
      patchLocalAppointment(syncedAppointment);
      setSelectedAppointment(syncedAppointment);
      setDetailMode("view");
      setEditDraft(null);
      const newDate = dateFromKey(text(syncedAppointment.date));
      if (newDate) selectDate(newDate);
      const duplicateFeedback: CalendarDetailFeedback = calendarOutcome.status === "failed"
        ? { tone: "warning", message: "נוצרה פגישה חדשה משוכפלת ונשמרה ב-Buildy, אך הסנכרון ל-Google Calendar לא הושלם. אפשר לנסות שוב מהודעת הסנכרון ביומן." }
        : calendarOutcome.status === "success"
          ? { tone: "success", message: "נוצרה פגישה חדשה משוכפלת, והיא קושרה ל-Google Calendar." }
          : { tone: "info", message: `נוצרה פגישה חדשה משוכפלת. ${calendarOutcome.detail}.` };
      setAppointmentFeedback(withAvailabilityNotices(duplicateFeedback));
      try {
        await Promise.resolve(refreshData());
      } catch (error) {
        console.error("Appointment duplicated, but CRM refresh failed:", error);
      }
    } catch (error) {
      console.error("Failed to save CRM appointment edit or duplicate:", error);
      setEditorFeedback("לא הצלחנו לשמור את השינויים. בדקי את הפרטים ונסי שוב.");
    } finally {
      setSavingAppointment(false);
    }
  };

  const markNoShow = async () => {
    if (!selectedAppointment || noShowSaving || appointmentStatusTone(selectedAppointment.status) === "no_show") return;
    const id = text(selectedAppointment.id); if (!id) { setAppointmentFeedback({ tone: "error", message: "לפגישה הזו חסר מזהה שמאפשר לעדכן את הסטטוס." }); return; }
    setNoShowSaving(true); setAppointmentFeedback(null);
    try { const updated = await Appointment.update(id, { status: "no_show" }); const saved = { ...selectedAppointment, ...(updated && typeof updated === "object" ? updated : {}), status: "no_show" } as CrmRecord; patchLocalAppointment(saved); setSelectedAppointment(saved); setNoShowConfirmOpen(false); setAppointmentFeedback({ tone: "success", message: "הפגישה סומנה כ״לא הגיע״ ונשארה ביומן." }); void notifyBusinessNotification("appointment_no_show", id); try { await Promise.resolve(refreshData()); } catch (error) { console.error("No-show saved, but CRM refresh failed:", error); } } catch (error) { console.error("Failed to mark appointment as no-show:", error); setAppointmentFeedback({ tone: "error", message: "לא הצלחנו לעדכן את סטטוס הפגישה. נסי שוב." }); } finally { setNoShowSaving(false); }
  };

  const saveNote = async () => {
    const appointmentId = text(selectedAppointment?.id); const body = noteDraft.trim(); if (!appointmentId || !canManagePrivateNotes || !notesAvailable || savingNote) return; if (!body) { setNotesError("כתבי את תוכן ההערה לפני השמירה."); return; }
    setSavingNote(true); setNotesError(null);
    try { await AppointmentNote.create({ appointment_id: appointmentId, body, author_name: userLabel }); setNoteDraft(""); const refreshed = await loadNotes(appointmentId); setAppointmentFeedback({ tone: refreshed ? "success" : "info", message: refreshed ? "ההערה הפנימית נשמרה." : "ההערה נשמרה, אך רענון רשימת ההערות לא הצליח." }); } catch (error) { console.error("Failed to save private appointment note:", error); setNotesError("לא הצלחנו לשמור את ההערה. בדקי את ההרשאה ונסי שוב."); } finally { setSavingNote(false); }
  };

  const selectedAppointmentId = text(selectedAppointment?.id);
  const notesBelongToSelection = Boolean(selectedAppointment) && notesAppointmentId === selectedAppointmentId;
  const noteReadIsPendingForSelection = Boolean(
    selectedAppointment && selectedAppointmentId && canManagePrivateNotes && !notesBelongToSelection,
  );
  const visiblePrivateNotes = notesBelongToSelection ? notes : [];
  const visibleNotesLoading = notesBelongToSelection ? notesLoading : noteReadIsPendingForSelection;
  const visibleNotesAvailable = notesBelongToSelection ? notesAvailable : noteReadIsPendingForSelection;
  const visibleNotesError = notesBelongToSelection
    ? notesError
    : selectedAppointment && !selectedAppointmentId
      ? "להערות הפנימיות חסר מזהה פגישה תקין."
      : null;
  const visibleNotesRetryable = notesBelongToSelection && notesRetryable;

  const calendarBlockNotice = (blockFeedback || calendarBlocksQuery.error) ? <div role={calendarBlocksQuery.error ? "alert" : "status"} className={`crm-calendar-block-feedback flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-bold leading-5 ${calendarBlocksQuery.error ? "border-red-100 bg-red-50 text-red-800" : "border-emerald-100 bg-emerald-50 text-emerald-800"}`}><span className="inline-flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{calendarBlocksQuery.error ? "לא הצלחנו לטעון את סגירות הזמן בטווח הזה. התורים נשארו זמינים, נסי לרענן את היומן." : blockFeedback}</span>{calendarBlocksQuery.error && <button type="button" onClick={() => void calendarBlocksQuery.refetch()} className="rounded-lg border border-current px-3 py-1.5 text-[11px] font-black">נסי שוב</button>}</div> : null;
  const mobileCalendarPageData = {
    appointments: visibleAppointments,
    allAppointments,
    selectedDate,
    now,
    search,
    notificationCount,
    visibleServiceCount: calendarFilterItems.length,
    visibleServiceIds,
  };
  const navigateBentoTab = (tab: BentoDockTab) => {
    if (tab === "dashboard") openView({ kind: "overview" });
    else if (tab === "calendar") openView({ kind: "calendar" });
    else if (tab === "clients") openView({ kind: "clients" });
    else openView({ kind: "inbox" });
  };
  const openMobileAgenda = () => {
    setMobileCalendarView("agenda");
    setMode("agenda");
  };
  const openMobileDay = () => {
    setMobileCalendarView("timeline");
    setMode("day");
    setServicePickerOpen(false);
  };
  const calendarPageActions = {
    onNavigate: navigateBentoTab,
    onNewAppointment: openNewAppointment,
    onOpenAppointment: openAppointment,
    onSelectDate: selectDate,
    onOpenAgenda: openMobileAgenda,
    onOpenDay: openMobileDay,
    onOpenBlock: () => openBlockDialog(selectedDate),
    onSearchChange: setSearch,
  };
  const mobileAgendaContent = (
    <div className="calendar-agenda-stack">
      <BusinessCrmCalendarToolbar mode={mode} selectedDate={selectedDate} isTodayView={isTodayView} canCreateBooking={canCreateBooking} unsyncedCount={unsyncedConfirmedCount} serviceItems={calendarFilterItems} visibleServiceIds={visibleServiceIds} servicePickerOpen={servicePickerOpen} sidePanelOpen={sidePanelOpen} onModeChange={setMode} onPrevious={() => moveDate(-1)} onNext={() => moveDate(1)} onToday={() => selectDate(new Date())} onSelectDate={selectDate} onRefresh={() => { void refreshData(); void calendarBlocksQuery.refetch(); }} onToggleServicePicker={() => setServicePickerOpen((open) => !open)} onToggleService={toggleService} onToggleSidePanel={() => setSidePanelOpen((open) => !open)} onNewBooking={() => openQuickBooking(selectedDate, suggestedBookingTime)} onOpenBlock={openBlockDialog} onOpenSettings={() => openView({ kind: "settings", section: "calendar" })} />
      <CalendarAppointmentSyncSection className="crm-calendar-sync-in-calendar" syncFeedback={calendarSyncFeedback} onRetrySingle={(appointmentId) => void retrySingleCalendarAction(appointmentId)} onSyncSettled={refreshCrmAndGoogleCalendar} />
      <div className={`grid min-w-0 gap-5 ${sidePanelOpen ? "xl:grid-cols-[minmax(0,1fr)_310px]" : "grid-cols-1"}`} dir="ltr"><div className="min-w-0" dir="rtl"><BusinessCrmCalendarGrid mode={mode} selectedDate={selectedDate} monthDate={monthDate} isMobile={isMobileCalendar} appointments={visibleAppointments} calendarBusy={displayCalendarBusy} googleEvents={visibleGoogleEvents} services={appointmentServiceItems} now={now} onSelectDate={selectDate} onSelectSlot={openSlotAction} onSelectAppointment={openAppointment} calendarBlocks={normalizedCalendarBlocks} /></div>{sidePanelOpen && <BusinessCrmCalendarSidePanel selectedDate={selectedDate} monthDate={monthDate} appointments={visibleAppointments} calendarBusy={displayCalendarBusy} googleEvents={visibleGoogleEvents} calendarBlocks={normalizedCalendarBlocks} serviceItems={calendarFilterItems} visibleServiceIds={visibleServiceIds} onSelectDate={selectDate} onChangeMonth={setMonthDate} onToggleService={toggleService} onDeleteBlock={(block) => { void deleteCalendarBlock(block); }} />}</div>
    </div>
  );

  if (isDataLoading) {
    if (isMobileCalendar) return <CalendarPage data={{ ...mobileCalendarPageData, appointments: [], allAppointments: [] }} actions={calendarPageActions} agendaMode={false} statusContent={<CrmMobileSkeleton variant="calendar" label="טוען את נתוני היומן..." />} />;
    return <><div className="crm-mobile-loading-only"><CrmMobileSkeleton variant="calendar" label="טוען את נתוני היומן..." /></div><div className="crm-desktop-loading-only"><CalendarState loading /></div></>;
  }
  if (dataError) {
    if (isMobileCalendar) return <CalendarPage data={{ ...mobileCalendarPageData, appointments: [], allAppointments: [] }} actions={calendarPageActions} agendaMode={false} statusNotice={calendarBlockNotice} statusContent={<CalendarState onRetry={() => void refreshData()} />} />;
    return <CalendarState onRetry={() => void refreshData()} />;
  }
  return <>
    {isMobileCalendar ? (
      <CalendarPage
        data={mobileCalendarPageData}
        actions={calendarPageActions}
        agendaMode={mobileCalendarView === "agenda"}
        agendaContent={mobileAgendaContent}
        statusNotice={calendarBlockNotice}
      />
    ) : (
      <>
        <div dir="rtl" className="space-y-5">
      <BusinessCrmCalendarToolbar mode={mode} selectedDate={selectedDate} isTodayView={isTodayView} canCreateBooking={canCreateBooking} unsyncedCount={unsyncedConfirmedCount} serviceItems={calendarFilterItems} visibleServiceIds={visibleServiceIds} servicePickerOpen={servicePickerOpen} sidePanelOpen={sidePanelOpen} onModeChange={setMode} onPrevious={() => moveDate(-1)} onNext={() => moveDate(1)} onToday={() => selectDate(new Date())} onSelectDate={selectDate} onRefresh={() => { void refreshData(); void calendarBlocksQuery.refetch(); }} onToggleServicePicker={() => setServicePickerOpen((open) => !open)} onToggleService={toggleService} onToggleSidePanel={() => setSidePanelOpen((open) => !open)} onNewBooking={() => openQuickBooking(selectedDate, suggestedBookingTime)} onOpenBlock={openBlockDialog} onOpenSettings={() => openView({ kind: "settings", section: "calendar" })} />
      <CalendarAppointmentSyncSection className="crm-calendar-sync-in-calendar" syncFeedback={calendarSyncFeedback} onRetrySingle={(appointmentId) => void retrySingleCalendarAction(appointmentId)} onSyncSettled={refreshCrmAndGoogleCalendar} />
      {(blockFeedback || calendarBlocksQuery.error) && <div role={calendarBlocksQuery.error ? "alert" : "status"} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-bold leading-5 ${calendarBlocksQuery.error ? "border-red-100 bg-red-50 text-red-800" : "border-emerald-100 bg-emerald-50 text-emerald-800"}`}><span className="inline-flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{calendarBlocksQuery.error ? "לא הצלחנו לטעון את סגירות הזמן בטווח הזה. התורים נשארו זמינים, נסי לרענן את היומן." : blockFeedback}</span>{calendarBlocksQuery.error && <button type="button" onClick={() => void calendarBlocksQuery.refetch()} className="rounded-lg border border-current px-3 py-1.5 text-[11px] font-black">נסי שוב</button>}</div>}
      <div className={`grid min-w-0 gap-5 ${sidePanelOpen ? "xl:grid-cols-[minmax(0,1fr)_310px]" : "grid-cols-1"}`} dir="ltr"><div className="min-w-0" dir="rtl"><BusinessCrmCalendarGrid mode={mode} selectedDate={selectedDate} monthDate={monthDate} isMobile={isMobileCalendar} appointments={visibleAppointments} calendarBusy={displayCalendarBusy} googleEvents={visibleGoogleEvents} services={appointmentServiceItems} now={now} onSelectDate={selectDate} onSelectSlot={openSlotAction} onSelectAppointment={openAppointment} calendarBlocks={normalizedCalendarBlocks} /></div>{sidePanelOpen && <BusinessCrmCalendarSidePanel selectedDate={selectedDate} monthDate={monthDate} appointments={visibleAppointments} calendarBusy={displayCalendarBusy} googleEvents={visibleGoogleEvents} calendarBlocks={normalizedCalendarBlocks} serviceItems={calendarFilterItems} visibleServiceIds={visibleServiceIds} onSelectDate={selectDate} onChangeMonth={setMonthDate} onToggleService={toggleService} onDeleteBlock={(block) => { void deleteCalendarBlock(block); }} />}</div>
    </div>
    <button type="button" className="crm-calendar-fab inline-flex min-h-12 items-center gap-2 rounded-full bg-[#1A1A3E] px-5 text-sm font-black text-white shadow-[0_12px_30px_rgba(26,26,62,0.25)] transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => openQuickBooking(selectedDate, suggestedBookingTime)} disabled={!canCreateBooking} title={!canCreateBooking ? "אפשר לקבוע פגישה רק היום בשעה עתידית או במועד עתידי." : undefined} aria-label="תור חדש"><Plus className="h-5 w-5" aria-hidden="true" />תור חדש</button>
      </>
    )}
    {slotAction && <BusinessCrmCalendarSlotActionDialog date={slotAction.date} time={slotAction.time} onChooseAppointment={chooseSlotAppointment} onChooseBlock={chooseSlotBlock} onClose={() => setSlotAction(null)} />}
    {blockDialogOpen && <BusinessCrmCalendarBlockDialog draft={blockDraft} feedback={blockFeedback} overlapWarning={blockOverlapWarning} saving={blockSaving} onChange={updateBlockDraft} onSubmit={() => void saveCalendarBlock()} onClose={() => { if (!blockSaving) setBlockDialogOpen(false); }} />}
    {quickBooking && <CalendarQuickBooking date={quickBooking.date} time={quickBooking.time} now={now} services={quickBookingServiceItems} managerWarnings={quickBookingWarnings} publicSuggestedTimes={publicSuggestedTimes} publicAvailabilityLoading={publicAvailabilityLoading} publicAvailabilityError={publicAvailabilityError} availabilityChecksLoading={quickBookingAvailabilityLoading} availabilityChecksError={quickBookingAvailabilityErrorMessage} customers={customerRows} customerMode={quickBooking.customerMode} customerSearch={quickBooking.customerSearch} selectedCustomerId={quickBooking.selectedCustomerId} selectedCustomer={selectedQuickCustomer} onCustomerModeChange={changeQuickCustomerMode} onCustomerSearchChange={updateQuickCustomerSearch} onSelectCustomer={selectQuickCustomer} draft={quickBooking.draft} feedback={quickBooking.feedback} saving={savingBooking} onChange={updateQuickDraft} onTimeChange={updateQuickBookingTime} onSubmit={() => void saveBooking()} onClose={() => { if (!savingBooking) setQuickBooking(null); }} />}
    {selectedAppointment && <CalendarEventDetails record={selectedAppointment} service={appointmentServiceItems.find((item) => item.id === serviceIdForRecord(selectedAppointment, appointmentServiceItems))} services={appointmentServiceItems} canManageCalendar={canManageClinicCalendar} onClose={() => { setSelectedAppointment(null); setAppointmentFeedback(null); setCancelConfirmOpen(false); }} onOpenInbox={(clientName) => { setSelectedAppointment(null); setAppointmentFeedback(null); setCancelConfirmOpen(false); openView({ kind: "inbox" }); setSearch(clientName); }} editorMode={detailMode} editDraft={editDraft} editFeedback={editorFeedback} savingAppointment={savingAppointment} onBeginEditor={beginEditor} onEditDraftChange={updateEditDraft} onSubmitEditor={() => void saveAppointmentEditor()} onCancelEditor={() => { setDetailMode("view"); setEditDraft(null); setEditorFeedback(null); }} decisionSaving={decisionSaving} onApprove={() => void saveAppointmentDecision("approve")} onReject={() => void saveAppointmentDecision("reject")} cancelConfirmOpen={cancelConfirmOpen} cancelSaving={cancelSaving} onRequestCancel={requestAppointmentCancellation} onCancelCancel={() => setCancelConfirmOpen(false)} onConfirmCancel={() => void saveConfirmedCancellation()} calendarRemovalRetrying={calendarSyncFeedback?.retryAction === "remove" && calendarSyncFeedback?.busyAppointmentId === selectedAppointmentId} onRetryCalendarRemoval={() => void retrySingleCalendarAction(selectedAppointmentId, "remove")} noShowConfirmOpen={noShowConfirmOpen} noShowSaving={noShowSaving} onRequestNoShow={() => { setNoShowConfirmOpen(true); setAppointmentFeedback(null); }} onCancelNoShow={() => setNoShowConfirmOpen(false)} onConfirmNoShow={() => void markNoShow()} feedback={appointmentFeedback} notes={visiblePrivateNotes} notesLoading={visibleNotesLoading} notesAvailable={visibleNotesAvailable} notesError={visibleNotesError} notesRetryable={visibleNotesRetryable} onRetryNotes={() => { if (selectedAppointmentId) void loadNotes(selectedAppointmentId); }} noteDraft={noteDraft} savingNote={savingNote} onNoteDraftChange={(value) => { setNoteDraft(value); setNotesError(null); }} onSaveNote={() => void saveNote()} />}
  </>;
}
