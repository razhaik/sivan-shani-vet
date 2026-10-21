import { useEffect, useMemo, useRef, useState } from "react";
import { format, isValid, parse } from "date-fns";
import { he } from "date-fns/locale";
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, Mail, MessageCircle, RefreshCw, Search, Settings2, ShieldAlert, X, XCircle } from "lucide-react";
import { Appointment, AppointmentRescheduleRequest, ContactInquiry } from "@/entities";
import { useCrmContext, type CrmRecord } from "@/components/business-crm/CrmContext";
import { SEO } from "@/components/SEO";
import { BentoDock, type BentoDockTab } from "@/components/business-crm/bento-ui";
import { CrmInboxFolders, type InboxFolderKey } from "@/components/business-crm/CrmInboxFolders";
import { CrmInboxMessageList, MobileAttentionTray, type AppointmentAction, type AppointmentActionState, type InboxActionFeedback, type InboxBulkAction, type InboxBulkActionFeedback, type InboxMessage, type RescheduleAction, type RescheduleActionState } from "@/components/business-crm/CrmInboxMessageList";
import InboxReplyComposer, { type InboxReplyResult } from "@/components/business-crm/InboxReplyComposer";
import { approveAppointmentRequest, rejectAppointmentRequest, type AppointmentDecisionSnapshot } from "@/lib/crmAppointmentDecision";
import { approveRescheduleRequest, rejectRescheduleRequest } from "@/lib/crmRescheduleDecision";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";
type RecordValue = CrmRecord;

type InboxMarkerAction = "archive" | "delete";

const INBOX_SOURCE_FILTERS = [
  { value: "all", label: "הכל", icon: Mail },
  { value: "appointment", label: "בקשות תור", icon: CalendarDays },
  { value: "reschedule_request", label: "שינוי מועד", icon: RefreshCw },
  { value: "inquiry", label: "פניות", icon: MessageCircle },
] as const;
type InboxSourceFilter = typeof INBOX_SOURCE_FILTERS[number]["value"];
type InboxSourceFilterCounts = Record<InboxSourceFilter, number>;

function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function storedDate(value: unknown) { const valueText = text(value); if (!valueText) return null; const date = new Date(valueText); return isValid(date) ? date : null; }
function isHandledRecord(record: RecordValue) { return Boolean(text(record.inbox_handled_at)); }
function inboxLocation(record: RecordValue): InboxMessage["inboxLocation"] { if (text(record.inbox_deleted_at)) return "trash"; if (text(record.inbox_archived_at)) return "archive"; return "inbox"; }
function appointmentDate(dateValue: unknown, timeValue: unknown) { const dateText = text(dateValue); if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null; const timeText = text(timeValue).slice(0, 5) || "00:00"; const parsed = parse(`${dateText} ${timeText}`, "yyyy-MM-dd HH:mm", new Date()); return isValid(parsed) ? parsed : null; }
function ownerLabel(record: RecordValue) { const owner = ["assignee_name", "assigned_to_name", "owner_name", "assignee", "assigned_to", "owner"].map((key) => text(record[key])).find(Boolean); return owner || "צוות המרפאה"; }
function timeLabel(value: unknown) { const valueText = text(value).slice(0, 5); return /^\d{2}:\d{2}$/.test(valueText) ? valueText : ""; }
function timeRangeLabel(startValue: unknown, endValue: unknown) { const start = timeLabel(startValue); const end = timeLabel(endValue); if (start && end) return `${start}–${end}`; return start || end || "שעה לא צוין"; }
function inquiryDateLabel(date: Date | null) { if (!date) return "תאריך לא צוין"; const today = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"); return today ? `היום · ${format(date, "HH:mm")}` : `${format(date, "d בMMM", { locale: he })} · ${format(date, "HH:mm")}`; }
function requestedDateLabel(date: Date | null, time: string) { if (!date) return "תאריך התור לא צוין"; return `${format(date, "EEEE, d בMMM", { locale: he })}${time ? ` · ${time}` : " · שעה לא צוין"}`; }
function rowId(kind: InboxMessage["kind"], record: RecordValue, index: number) { const realId = text(record.id); if (realId) return `${kind}-${realId}`; const identity = text(record.created_at) || text(record.date) || text(record.proposed_appointment_date) || "ללא-תאריך"; const sender = text(record.name) || text(record.client_name) || "ללא-שם"; return `${kind}-${index}-${identity}-${sender}`; }
function rescheduleStatusLabel(status: string) { if (status === "pending") return "ממתין לאישור המרפאה"; if (status === "approved") return "שינוי המועד אושר"; if (status === "rejected") return "שינוי המועד נדחה"; return status ? `סטטוס: ${status}` : ""; }

function toInboxMessages(inquiries: RecordValue[], appointments: RecordValue[], rescheduleRequests: RecordValue[]): InboxMessage[] {
  const inquiryRows = inquiries.map((record, index): InboxMessage => {
    const sender = text(record.name);
    const created = storedDate(record.created_at);
    const preview = text(record.message);
    const id = rowId("inquiry", record, index);
    const isHandled = isHandledRecord(record);
    return {
      id,
      sourceRecordId: text(record.id),
      kind: "inquiry",
      senderName: sender || "שם הפונה לא צוין",
      hasSenderName: Boolean(sender),
      assignee: ownerLabel(record),
      subject: "פנייה חדשה מהאתר",
      preview: preview || "לא צורף תוכן לפנייה",
      sourceLabel: "טופס יצירת קשר",
      dateLabel: inquiryDateLabel(created),
      dateTimeISO: created?.toISOString(),
      sortTimestamp: created?.getTime() || 0,
      avatarSeed: `${sender}-${id}`,
      isHandled,
      isUnread: !isHandled,
      inboxLocation: inboxLocation(record),
      recipientEmail: text(record.email) || undefined,
    };
  });

  const appointmentRows = appointments
    .filter((record) => text(record.status) === "requested" || inboxLocation(record) !== "inbox")
    .map((record, index): InboxMessage => {
      const sender = text(record.client_name);
      const requested = appointmentDate(record.date, record.start_time);
      const startTime = timeLabel(record.start_time);
      const details = [
        text(record.pet_name) ? `חיית מחמד: ${text(record.pet_name)}` : "",
        requested ? `תאריך מבוקש: ${requestedDateLabel(requested, startTime)}` : "",
        text(record.notes) ? `הערה: ${text(record.notes)}` : "",
      ].filter(Boolean);
      const created = storedDate(record.created_at);
      const sortDate = created || requested;
      const id = rowId("appointment", record, index);
      const isHandled = isHandledRecord(record);
      const status = text(record.status);
      return {
        id,
        sourceRecordId: text(record.id),
        kind: "appointment",
        status,
        senderName: sender || "שם הלקוח לא צוין",
        hasSenderName: Boolean(sender),
        assignee: ownerLabel(record),
        subject: `בקשת תור · ${text(record.appointment_type) || "סוג התור לא צוין"}`,
        preview: details.join(" · ") || "בקשת תור ללא פרטים נוספים",
        attentionPetLabel: text(record.pet_name) || "לא צוין",
        attentionServiceLabel: text(record.appointment_type) || "סוג התור לא צוין",
        attentionDateLabel: requestedDateLabel(requested, startTime),
        sourceLabel: "בקשת תור",
        dateLabel: requestedDateLabel(requested, startTime),
        dateTimeISO: requested?.toISOString() || created?.toISOString(),
        sortTimestamp: sortDate?.getTime() || 0,
        avatarSeed: `${sender}-${id}`,
        isHandled,
        isUnread: !isHandled,
        inboxLocation: inboxLocation(record),
        recipientEmail: text(record.email) || undefined,
      };
    });

  const appointmentById = new Map(appointments.map((record) => [text(record.id), record]));
  const rescheduleRows = rescheduleRequests
    .filter((record) => text(record.status) === "pending" || inboxLocation(record) !== "inbox")
    .map((record, index): InboxMessage => {
      const appointment = appointmentById.get(text(record.appointment_id));
      const sender = text(appointment?.client_name);
      const petName = text(appointment?.pet_name);
      const serviceName = text(appointment?.appointment_type) || text(record.service_identifier) || "סוג הטיפול לא צוין";
      const originalDate = appointmentDate(record.old_appointment_date, record.old_start_time);
      const proposedDate = appointmentDate(record.proposed_appointment_date, record.proposed_start_time);
      const originalLabel = requestedDateLabel(originalDate, timeRangeLabel(record.old_start_time, record.old_end_time));
      const proposedLabel = requestedDateLabel(proposedDate, timeRangeLabel(record.proposed_start_time, record.proposed_end_time));
      const created = storedDate(record.created_at);
      const sortDate = created || proposedDate || originalDate;
      const id = rowId("reschedule_request", record, index);
      const isHandled = isHandledRecord(record);
      const status = text(record.status);
      return {
        id,
        sourceRecordId: text(record.id),
        kind: "reschedule_request",
        status,
        statusLabel: rescheduleStatusLabel(status),
        senderName: sender || "שם הלקוח לא צוין",
        hasSenderName: Boolean(sender),
        assignee: ownerLabel(record),
        subject: `בקשת שינוי מועד · ${serviceName}`,
        preview: `${petName ? `חיית מחמד: ${petName} · ` : ""}מועד מקורי: ${originalLabel} · מועד מוצע: ${proposedLabel}`,
        detailRows: [
          { label: "לקוח", value: sender || "שם הלקוח לא צוין" },
          { label: "חיית מחמד", value: petName || "לא צוין" },
          { label: "טיפול", value: serviceName },
          { label: "מועד מקורי", value: originalLabel },
          { label: "מועד מוצע", value: proposedLabel },
        ],
        attentionPetLabel: petName || "לא צוין",
        attentionServiceLabel: serviceName,
        attentionOriginalDateLabel: originalLabel,
        attentionDateLabel: proposedLabel,
        sourceLabel: "בקשת שינוי מועד",
        dateLabel: proposedDate ? requestedDateLabel(proposedDate, timeRangeLabel(record.proposed_start_time, record.proposed_end_time)) : inquiryDateLabel(created),
        dateTimeISO: proposedDate?.toISOString() || created?.toISOString(),
        sortTimestamp: sortDate?.getTime() || 0,
        avatarSeed: `${sender}-${id}`,
        isHandled,
        isUnread: !isHandled,
        inboxLocation: inboxLocation(record),
        recipientEmail: text(appointment?.email) || undefined,
      };
    });

  return [...inquiryRows, ...appointmentRows, ...rescheduleRows].sort((first, second) => second.sortTimestamp - first.sortTimestamp);
}

function appointmentSnapshot(record: RecordValue): AppointmentDecisionSnapshot {
  return {
    id: text(record.id), status: text(record.status), client_name: text(record.client_name), phone: text(record.phone), email: text(record.email), pet_name: text(record.pet_name), appointment_type: text(record.appointment_type), date: text(record.date), start_time: text(record.start_time), end_time: text(record.end_time), notes: text(record.notes), google_event_id: text(record.google_event_id), cancel_token: text(record.cancel_token),
  };
}

function withInboxTimeout(work: () => void | Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = Promise.resolve().then(work);
  return new Promise<void>((resolve, reject) => { timer = setTimeout(() => reject(new Error("רענון תיבת הדואר ארך זמן רב מדי.")), 12000); operation.then(() => { if (timer) clearTimeout(timer); resolve(); }, (error) => { if (timer) clearTimeout(timer); reject(error); }); });
}

async function updateInboxSource(message: InboxMessage, payload: Record<string, unknown>) {
  if (!message.sourceRecordId) throw new Error("חסר מזהה לרשומת המקור.");
  if (message.kind === "inquiry") return ContactInquiry.update(message.sourceRecordId, payload);
  if (message.kind === "appointment") return Appointment.update(message.sourceRecordId, payload);
  return AppointmentRescheduleRequest.update(message.sourceRecordId, payload);
}

function ContentLoading() { return <div dir="rtl" className="crm-inbox-loading-state flex min-h-[260px] items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white px-6 text-center"><div><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5267A8]" /><p className="mt-4 text-sm font-extrabold text-[#1A1A3E]">טוען את תיבת הדואר...</p><p className="mt-1 text-xs font-medium text-slate-500">המסך נשאר זמין בזמן טעינת הרשומות.</p></div></div>; }
function ContentError({ onRetry }: { onRetry: () => void }) { return <div dir="rtl" className="crm-inbox-error-state flex min-h-[260px] items-center justify-center rounded-2xl border border-red-100 bg-white px-5 text-center"><div className="max-w-md"><ShieldAlert className="mx-auto h-9 w-9 text-red-500" /><h1 className="mt-4 text-lg font-extrabold text-[#1A1A3E]">לא הצלחנו לטעון את תיבת הדואר</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">אפשר לנסות שוב. אם הבעיה נמשכת, חזרי למערכת התורים הקיימת.</p><button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><RefreshCw className="h-4 w-4" />נסי שוב</button></div></div>; }

function AppointmentFeedbackBanner({ feedback }: { feedback: InboxActionFeedback }) {
  const tone = feedback.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : feedback.tone === "partial" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-red-200 bg-red-50 text-red-900";
  const Icon = feedback.tone === "success" ? CheckCircle2 : feedback.tone === "partial" ? AlertTriangle : XCircle;
  return <div role={feedback.tone === "success" ? "status" : "alert"} aria-live="polite" className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-bold leading-6 ${tone}`}><Icon className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /><span>{feedback.message}</span></div>;
}

function MobileInboxSourceFilters({ selected, counts, onChange }: { selected: InboxSourceFilter; counts: InboxSourceFilterCounts; onChange: (filter: InboxSourceFilter) => void }) {
  return <div className="crm-inbox-source-filters" role="group" aria-label="סינון לפי מקור ההודעה">
    {INBOX_SOURCE_FILTERS.map(({ value, label, icon: Icon }) => {
      const count = counts[value];
      return <button key={value} type="button" className={`crm-inbox-source-filter${selected === value ? " is-active" : ""}`} aria-pressed={selected === value} aria-label={`${label}, ${count} הודעות לא טופלו`} onClick={() => onChange(value)}>
        <Icon className="crm-inbox-source-icon" aria-hidden="true" />
        <span className="crm-inbox-source-label">{label}</span>
        <span className="crm-inbox-source-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>
      </button>;
    })}
  </div>;
}

export default function BusinessCrmInbox() {
  const { appointments, inquiries, rescheduleRequests, search, setSearch, isDataLoading, dataError, refreshData, isDataFetching, openView, openNewAppointment, notificationCount } = useCrmContext();
  const [activeFolder, setActiveFolder] = useState<InboxFolderKey>("inbox");
  const [foldersCollapsed, setFoldersCollapsed] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<InboxSourceFilter>("all");
  const [isPhoneWidth, setIsPhoneWidth] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [optimisticallyHandledIds, setOptimisticallyHandledIds] = useState<Set<string>>(new Set());
  const [handledError, setHandledError] = useState<string | null>(null);
  const [inboxActionState, setInboxActionState] = useState<InboxBulkAction | null>(null);
  const [inboxActionFeedback, setInboxActionFeedback] = useState<InboxBulkActionFeedback | null>(null);
  const [replyMessages, setReplyMessages] = useState<InboxMessage[] | null>(null);
  const [appointmentActionState, setAppointmentActionState] = useState<AppointmentActionState | null>(null);
  const [appointmentFeedback, setAppointmentFeedback] = useState<InboxActionFeedback | null>(null);
  const [rescheduleActionState, setRescheduleActionState] = useState<RescheduleActionState | null>(null);
  const [rescheduleFeedback, setRescheduleFeedback] = useState<InboxActionFeedback | null>(null);
  const [selectedAttentionId, setSelectedAttentionId] = useState<string | null>(null);
  const [attentionMenuOpen, setAttentionMenuOpen] = useState(false);
  const attentionIdsRef = useRef<string[]>([]);
  const handlingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const phoneWidth = window.matchMedia("(max-width: 767px)");
    const updatePhoneWidth = () => setIsPhoneWidth(phoneWidth.matches);
    updatePhoneWidth();
    phoneWidth.addEventListener("change", updatePhoneWidth);
    return () => phoneWidth.removeEventListener("change", updatePhoneWidth);
  }, []);

  const messages = useMemo(() => { const baseMessages = toInboxMessages(inquiries, appointments, rescheduleRequests); return baseMessages.map((message) => optimisticallyHandledIds.has(message.id) ? { ...message, isHandled: true, isUnread: false } : message); }, [appointments, inquiries, optimisticallyHandledIds, rescheduleRequests]);
  const inboxMessages = useMemo(() => messages.filter((message) => message.inboxLocation === "inbox"), [messages]);
  const unreadCount = useMemo(() => inboxMessages.filter((message) => message.isUnread).length, [inboxMessages]);
  const isAttentionMessage = (message: InboxMessage) => (message.kind === "appointment" && message.status === "requested") || (message.kind === "reschedule_request" && message.status === "pending") || (message.kind === "inquiry" && message.isUnread);
  const attentionCount = useMemo(() => inboxMessages.filter(isAttentionMessage).length, [inboxMessages]);
  const pendingAttentionMessages = useMemo(() => inboxMessages.filter((message) => (message.kind === "appointment" && message.status === "requested") || (message.kind === "reschedule_request" && message.status === "pending")), [inboxMessages]);
  const selectedAttentionMessage = pendingAttentionMessages.find((message) => message.id === selectedAttentionId) || pendingAttentionMessages[0] || null;
  const folderMessages = useMemo(() => {
    if (activeFolder === "inbox") return inboxMessages;
    if (activeFolder === "attention") return inboxMessages.filter(isAttentionMessage);
    if (activeFolder === "archive") return messages.filter((message) => message.inboxLocation === "archive");
    if (activeFolder === "trash") return messages.filter((message) => message.inboxLocation === "trash");
    return [];
  }, [activeFolder, inboxMessages, messages]);
  const normalizedSearch = search.trim().toLocaleLowerCase("he");
  const searchedMessages = useMemo(() => !normalizedSearch ? folderMessages : folderMessages.filter((message) => `${message.senderName} ${message.subject} ${message.preview} ${message.sourceLabel}`.toLocaleLowerCase("he").includes(normalizedSearch)), [folderMessages, normalizedSearch]);
  const currentFolderUnreadCount = useMemo(() => folderMessages.filter((message) => message.isUnread).length, [folderMessages]);
  const sourceFilterCounts = useMemo<InboxSourceFilterCounts>(() => ({
    all: currentFolderUnreadCount,
    appointment: folderMessages.filter((message) => message.kind === "appointment" && message.isUnread).length,
    reschedule_request: folderMessages.filter((message) => message.kind === "reschedule_request" && message.isUnread).length,
    inquiry: folderMessages.filter((message) => message.kind === "inquiry" && message.isUnread).length,
  }), [currentFolderUnreadCount, folderMessages]);
  const visibleMessages = useMemo(() => {
    if (!isPhoneWidth || sourceFilter === "all") return searchedMessages;
    return searchedMessages.filter((message) => message.kind === sourceFilter);
  }, [isPhoneWidth, searchedMessages, sourceFilter]);
  const visibleUnreadCount = useMemo(() => visibleMessages.filter((message) => message.isUnread).length, [visibleMessages]);
  const selectedMessages = useMemo(() => visibleMessages.filter((message) => selectedIds.has(message.id)), [selectedIds, visibleMessages]);

  useEffect(() => { const visibleIds = new Set(visibleMessages.map((message) => message.id)); setSelectedIds((current) => { const next = new Set([...current].filter((id) => visibleIds.has(id))); return next.size === current.size ? current : next; }); if (selectedMessageId && !visibleIds.has(selectedMessageId)) setSelectedMessageId(null); }, [selectedMessageId, visibleMessages]);
  useEffect(() => {
    const nextIds = pendingAttentionMessages.map((message) => message.id);
    const previousIds = attentionIdsRef.current;
    attentionIdsRef.current = nextIds;
    setSelectedAttentionId((current) => {
      if (current && nextIds.includes(current)) return current;
      if (nextIds.length === 0) return null;
      const previousIndex = current ? previousIds.indexOf(current) : -1;
      const nextIndex = previousIndex >= 0 ? Math.min(previousIndex, nextIds.length - 1) : 0;
      return nextIds[nextIndex] || nextIds[0];
    });
    if (nextIds.length === 0) setAttentionMenuOpen(false);
  }, [pendingAttentionMessages]);
  const toggleExpandedMessage = (id: string) => setSelectedMessageId((current) => current === id ? null : id);
  const selectAttentionMessage = (id: string) => {
    setSelectedAttentionId(id);
    setAttentionMenuOpen(false);
  };
  const emptyState = useMemo(() => {
    if (activeFolder === "follow-up" || activeFolder === "marketing") return { title: "אין הודעות בתיקייה זו", body: "התיקייה הזו אינה מחוברת כרגע למקור נתונים במערכת." };
    if (normalizedSearch && searchedMessages.length === 0) return { title: "לא נמצאו הודעות תואמות", body: "נסי מונח אחר או נקי את שדה החיפוש כדי לראות את ההודעות בתיקייה." };
    if (isPhoneWidth && sourceFilter !== "all" && searchedMessages.length > 0 && visibleMessages.length === 0) return { title: "אין הודעות מהמקור הזה", body: "לא נמצאו הודעות מהסוג הזה בחיפוש ובתיקייה שבחרת. בחרי מקור אחר כדי לראות פריטים נוספים." };
    if (activeFolder === "archive") return { title: "הארכיון ריק", body: "הודעות שתעבירי לארכיון יישמרו כאן בלי להופיע בתיבת הדואר הראשית." };
    if (activeFolder === "trash") return { title: "האשפה ריקה", body: "מחיקה מעבירה הודעות לכאן. הרשומות המקוריות והיסטוריית התורים נשמרות במערכת." };
    if (activeFolder === "inbox" && folderMessages.length === 0) return messages.length === 0 ? { title: "תיבת הדואר ריקה", body: "פניות מהאתר ובקשות תור יופיעו כאן לאחר שיישלחו." } : { title: "אין הודעות בתיבת הדואר", body: "הודעות שהועברו לארכיון או לאשפה יופיעו בתיקייה המתאימה שלהן." };
    return { title: "אין הודעות שדורשות טיפול", body: "בקשות תור ופניות שיגיעו למערכת יופיעו כאן לפי הצורך." };
  }, [activeFolder, folderMessages.length, isPhoneWidth, messages.length, normalizedSearch, searchedMessages.length, sourceFilter, visibleMessages.length]);
  const mobileFolderSummary = activeFolder === "follow-up" || activeFolder === "marketing"
    ? "התיקייה עדיין לא מחוברת למקור נתונים"
    : currentFolderUnreadCount > 0
      ? `${currentFolderUnreadCount} הודעות לא טופלו בתיקייה`
      : (activeFolder === "inbox" || activeFolder === "attention") && attentionCount > 0
        ? `${attentionCount} בקשות עדיין ממתינות להחלטה`
        : "אין הודעות חדשות בתיקייה";
  const navigateBentoTab = (tab: BentoDockTab) => {
    if (tab === "dashboard") openView({ kind: "overview" });
    else if (tab === "calendar") openView({ kind: "calendar" });
    else if (tab === "clients") openView({ kind: "clients" });
    else openView({ kind: "inbox" });
  };
  const toggleMessage = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const markMessageHandled = async (message: InboxMessage) => {
    if (!message.isUnread || handlingIdsRef.current.has(message.id)) return;
    if (!message.sourceRecordId) { setHandledError("לא הצלחנו לסמן את ההודעה כטופלה כי חסר לה מזהה. נסי לרענן את תיבת הדואר."); return; }
    handlingIdsRef.current.add(message.id); setHandledError(null); setOptimisticallyHandledIds((current) => new Set(current).add(message.id));
    try {
      await updateInboxSource(message, { inbox_handled_at: new Date().toISOString() });
    } catch (error) {
      console.error("Failed to mark CRM inbox message handled:", error);
      setOptimisticallyHandledIds((current) => { const next = new Set(current); next.delete(message.id); return next; });
      setHandledError("לא הצלחנו לסמן את ההודעה כטופלה. השינוי לא נשמר, נסי שוב.");
      handlingIdsRef.current.delete(message.id);
      return;
    }
    try {
      await refreshData();
    } catch (error) {
      console.error("Inbox message handled, but CRM refresh failed:", error);
      setHandledError("ההודעה סומנה כטופלה, אך רענון תיבת הדואר לא הצליח. נסי לרענן שוב.");
    } finally {
      handlingIdsRef.current.delete(message.id);
    }
  };

  const moveSelectedMessages = async (action: InboxMarkerAction) => {
    if (inboxActionState) return;
    const currentMessages = visibleMessages.filter((message) => selectedIds.has(message.id));
    if (!currentMessages.length) {
      setInboxActionFeedback({ tone: "error", message: "יש לבחור לפחות הודעה אחת לפני בחירת פעולה." });
      return;
    }

    setInboxActionState(action);
    setInboxActionFeedback(null);
    setHandledError(null);
    const markerTime = new Date().toISOString();
    const payload = action === "archive" ? { inbox_archived_at: markerTime, inbox_deleted_at: "" } : { inbox_deleted_at: markerTime, inbox_archived_at: "" };
    const outcomes = await Promise.allSettled(currentMessages.map(async (message) => {
      if (!message.sourceRecordId) throw new Error("חסר מזהה לרשומת המקור.");
      await updateInboxSource(message, payload);
      return message.id;
    }));
    const successfulIds = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
    const failedCount = outcomes.length - successfulIds.length;
    outcomes.forEach((outcome, index) => { if (outcome.status === "rejected") console.error(`Failed to move CRM inbox message ${currentMessages[index].id}:`, outcome.reason); });

    if (successfulIds.length > 0) {
      const successfulSet = new Set(successfulIds);
      setSelectedIds((current) => new Set([...current].filter((id) => !successfulSet.has(id))));
      setSelectedMessageId((current) => current && successfulSet.has(current) ? null : current);
    }

    let refreshError = false;
    try {
      await withInboxTimeout(() => refreshData());
    } catch (error) {
      refreshError = true;
      console.error("Inbox location saved, but CRM inbox refresh failed:", error);
    }

    const verb = action === "archive" ? "הועברו לארכיון" : "הועברו לאשפה";
    const details: string[] = [];
    if (successfulIds.length > 0) details.push(`${successfulIds.length} הודעות ${verb}`);
    if (failedCount > 0) details.push(`${failedCount} הודעות לא הועברו כי השמירה נכשלה או שחסר מזהה מקור`);
    if (refreshError && successfulIds.length > 0) details.push("השינויים נשמרו, אך רענון התצוגה לא הצליח");
    const tone: InboxBulkActionFeedback["tone"] = successfulIds.length === 0 ? "error" : failedCount > 0 || refreshError ? "partial" : "success";
    setInboxActionFeedback({ tone, message: details.join(". ") || "לא בוצע שינוי בתיבת הדואר." });
    setInboxActionState(null);
  };

  const handleInboxAction = (action: InboxBulkAction) => {
    if (inboxActionState) return;
    if (selectedMessages.length === 0) {
      setInboxActionFeedback({ tone: "error", message: "יש לבחור לפחות הודעה אחת לפני בחירת פעולה." });
      return;
    }
    if (action === "reply") {
      setInboxActionFeedback(null);
      setReplyMessages(selectedMessages);
      return;
    }
    void moveSelectedMessages(action);
  };

  const handleReplySuccess = async (result: InboxReplyResult) => {
    const replySnapshot = replyMessages || [];
    const sentIds = new Set(result.sentMessageIds);
    const visibleIds = new Set(visibleMessages.map((message) => message.id));
    const messagesToMarkHandled = replySnapshot.filter((message) => sentIds.has(message.id) && visibleIds.has(message.id) && Boolean(message.sourceRecordId));
    const handledAt = new Date().toISOString();
    const handledOutcomes = await Promise.allSettled(messagesToMarkHandled.map(async (message) => {
      await updateInboxSource(message, { inbox_handled_at: handledAt });
      return message.id;
    }));
    const handledFailures = handledOutcomes.filter((outcome) => outcome.status === "rejected").length;
    handledOutcomes.forEach((outcome, index) => { if (outcome.status === "rejected") console.error(`Reply sent, but marking inbox message ${messagesToMarkHandled[index].id} handled failed:`, outcome.reason); });

    let refreshError = false;
    try {
      await withInboxTimeout(() => refreshData());
    } catch (error) {
      refreshError = true;
      console.error("Reply sent, but CRM inbox refresh failed:", error);
    }

    if (result.sentMessageIds.length > 0) {
      const sentVisibleIds = new Set(replySnapshot.filter((message) => sentIds.has(message.id) && visibleIds.has(message.id)).map((message) => message.id));
      setSelectedIds((current) => new Set([...current].filter((id) => !sentVisibleIds.has(id))));
    }

    const summary: string[] = [];
    if (result.sent > 0) summary.push(`נשלחו ${result.sent} תגובות לכתובות תקינות`);
    if (result.sent === 0) summary.push("לא נשלחה אף תגובה");
    if (result.invalid > 0) summary.push(`${result.invalid} הודעות דולגו בגלל כתובת חסרה או לא תקינה`);
    if (result.duplicate > 0) summary.push(`${result.duplicate} הודעות חלקו כתובת עם הודעה אחרת`);
    if (result.failed > 0) summary.push(`${result.failed} כתובות לא קיבלו את המענה בגלל כשל בשליחה`);
    if (handledFailures > 0) summary.push(`${handledFailures} הודעות לא סומנו כטופלו לאחר השליחה`);
    if (refreshError) summary.push("רענון תיבת הדואר לא הצליח, נסי לרענן שוב");
    const tone: InboxBulkActionFeedback["tone"] = result.sent === 0 ? "error" : result.failed > 0 || handledFailures > 0 || refreshError ? "partial" : "success";
    setInboxActionFeedback({ tone, message: summary.join(". ") || "המענה הסתיים." });
    setReplyMessages(null);
  };

  const handleAppointmentDecision = async (message: InboxMessage, action: AppointmentAction) => {
    if (message.kind !== "appointment" || message.status !== "requested" || appointmentActionState) return;
    const sourceRecord = appointments.find((record) => text(record.id) === message.sourceRecordId);
    const snapshot = sourceRecord ? appointmentSnapshot(sourceRecord) : null;
    if (!snapshot?.id) { setAppointmentFeedback({ messageId: message.id, tone: "error", message: "לא הצלחנו למצוא את בקשת התור העדכנית. רענני את תיבת הדואר ונסי שוב." }); return; }
    setAppointmentActionState({ messageId: message.id, action }); setAppointmentFeedback(null); setHandledError(null);
    try {
      const result = action === "approve" ? await approveAppointmentRequest(snapshot) : await rejectAppointmentRequest(snapshot);
      setAppointmentFeedback({ messageId: message.id, tone: result.isPartial ? "partial" : "success", message: result.summary });
    } catch (error) {
      console.error(`Failed to ${action} CRM appointment request:`, error);
      setAppointmentFeedback({ messageId: message.id, tone: "error", message: error instanceof Error ? error.message : "לא הצלחנו להשלים את הפעולה. נסי שוב." });
    } finally {
      try { await withInboxTimeout(() => refreshData()); } catch (error) { console.error("Appointment decision saved, but CRM inbox refresh failed:", error); setAppointmentFeedback((current) => current ? { ...current, tone: current.tone === "success" ? "partial" : current.tone, message: `${current.message} רענון תיבת הדואר לא הצליח, נסי לרענן שוב.` } : { messageId: message.id, tone: "error", message: "הפעולה הסתיימה, אך רענון תיבת הדואר לא הצליח. נסי לרענן שוב." }); } finally { setAppointmentActionState(null); }
    }
  };

  const handleRescheduleDecision = async (message: InboxMessage, action: RescheduleAction) => {
    if (message.kind !== "reschedule_request" || message.status !== "pending" || rescheduleActionState || appointmentActionState) return;
    if (!message.sourceRecordId) { setRescheduleFeedback({ messageId: message.id, tone: "error", message: "לא הצלחנו למצוא את בקשת שינוי המועד העדכנית. רענני את תיבת הדואר ונסי שוב." }); return; }
    setRescheduleActionState({ messageId: message.id, action }); setRescheduleFeedback(null); setAppointmentFeedback(null); setHandledError(null);
    try {
      const result = action === "approve" ? await approveRescheduleRequest(message.sourceRecordId) : await rejectRescheduleRequest(message.sourceRecordId);
      setRescheduleFeedback({ messageId: message.id, tone: result.isPartial ? "partial" : "success", message: result.summary });
    } catch (error) {
      console.error(`Failed to ${action} CRM reschedule request:`, error);
      setRescheduleFeedback({ messageId: message.id, tone: "error", message: error instanceof Error ? error.message : "לא הצלחנו להשלים את הפעולה. נסי שוב." });
    } finally {
      try { await withInboxTimeout(() => refreshData()); } catch (error) { console.error("Reschedule decision saved, but CRM inbox refresh failed:", error); setRescheduleFeedback((current) => current ? { ...current, tone: current.tone === "success" ? "partial" : current.tone, message: `${current.message} רענון תיבת הדואר לא הצליח, נסי לרענן שוב.` } : { messageId: message.id, tone: "error", message: "הפעולה הסתיימה, אך רענון תיבת הדואר לא הצליח. נסי לרענן שוב." }); } finally { setRescheduleActionState(null); }
    }
  };

  return (
    <>
      <SEO title={`תיבת דואר | ${VETERINARY_CLINIC_PROFILE.businessName}`} description="תיבת דואר פנימית לפניות מהאתר ולבקשות תור במרפאה הווטרינרית." url={`${VETERINARY_CLINIC_PROFILE.publicOrigin}${VETERINARY_CLINIC_PROFILE.crmBasePath}/inbox`} noindex siteName={VETERINARY_CLINIC_PROFILE.businessName} />
      <div dir="rtl" className="crm-inbox-page">
        <div className="crm-inbox-mobile-gate">
          <header className="crm-inbox-mobile-header">
            <div className="crm-inbox-mobile-heading-row">
              <div className="crm-inbox-mobile-title-copy">
                <p className="crm-inbox-mobile-clinic">{VETERINARY_CLINIC_PROFILE.businessName}</p>
                <h1>תיבת דואר</h1>
              </div>
              <div className="crm-inbox-mobile-count" aria-label={`${currentFolderUnreadCount} הודעות לא טופלו בתיקייה`}>
                <strong>{currentFolderUnreadCount > 99 ? "99+" : currentFolderUnreadCount}</strong>
                <span>לא טופלו</span>
              </div>
            </div>
            <p className="crm-inbox-mobile-summary" aria-live="polite">{mobileFolderSummary}</p>
            <div className="crm-inbox-mobile-search">
              <Search aria-hidden="true" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש בשם, בנושא או בהודעה" aria-label="חיפוש בתיבת הדואר לפי שם, נושא או תוכן" autoComplete="off" />
              {search.length > 0 && <button type="button" onClick={() => setSearch("")} aria-label="ניקוי החיפוש"><X aria-hidden="true" /></button>}
            </div>
          </header>
          {!isDataLoading && !dataError && activeFolder === "inbox" && pendingAttentionMessages.length > 0 && <MobileAttentionTray messages={pendingAttentionMessages} selectedMessage={selectedAttentionMessage} isMenuOpen={attentionMenuOpen} onToggleMenu={() => setAttentionMenuOpen((current) => !current)} onCloseMenu={() => setAttentionMenuOpen(false)} onSelectMessage={selectAttentionMessage} appointmentActionState={appointmentActionState} appointmentFeedback={appointmentFeedback} onApproveAppointment={(message) => void handleAppointmentDecision(message, "approve")} onRejectAppointment={(message) => void handleAppointmentDecision(message, "reject")} rescheduleActionState={rescheduleActionState} rescheduleFeedback={rescheduleFeedback} onApproveReschedule={(message) => void handleRescheduleDecision(message, "approve")} onRejectReschedule={(message) => void handleRescheduleDecision(message, "reject")} />}
          <div className="crm-inbox-mobile-controls">
            <CrmInboxFolders activeFolder={activeFolder} onFolderChange={setActiveFolder} inboxCount={unreadCount} attentionCount={attentionCount} collapsed={false} onToggleCollapsed={() => setFoldersCollapsed(false)} />
            <MobileInboxSourceFilters selected={sourceFilter} counts={sourceFilterCounts} onChange={setSourceFilter} />
          </div>
        </div>
        {isDataLoading ? <ContentLoading /> : dataError ? <ContentError onRetry={refreshData} /> : <div dir="rtl">
          <div className="crm-inbox-desktop-header flex items-start justify-between gap-4">
            <div className="min-w-0"><p className="mb-2 text-xs font-extrabold tracking-wide text-slate-500">{VETERINARY_CLINIC_PROFILE.businessName}</p><h1 className="text-3xl font-black tracking-tight text-[#1A1A3E] sm:text-4xl">תיבת דואר</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">פניות מהאתר ובקשות תור מרוכזות כאן, לפי הרשומות שנשמרו במערכת.</p></div>
            <button type="button" disabled title="הגדרות תצוגה אינן זמינות עדיין" aria-label="הגדרות תצוגה" className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E1E4E8] bg-white text-slate-400 opacity-80 shadow-sm"><Settings2 className="h-4 w-4" /></button>
          </div>
          {handledError && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-800">{handledError}</div>}
          {appointmentFeedback && <AppointmentFeedbackBanner feedback={appointmentFeedback} />}
          {rescheduleFeedback && <AppointmentFeedbackBanner feedback={rescheduleFeedback} />}
          <div className={`crm-inbox-content-grid mt-6 grid min-w-0 gap-4 lg:items-start ${foldersCollapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[280px_minmax(0,1fr)]"}`}>
            <CrmInboxFolders activeFolder={activeFolder} onFolderChange={setActiveFolder} inboxCount={unreadCount} attentionCount={attentionCount} collapsed={foldersCollapsed} onToggleCollapsed={() => setFoldersCollapsed((current) => !current)} />
            <CrmInboxMessageList messages={visibleMessages} unreadCount={visibleUnreadCount} selectedIds={selectedIds} selectedMessageId={selectedMessageId} onToggleMessage={toggleMessage} onMarkHandled={markMessageHandled} onSelectMessage={toggleExpandedMessage} onSelectAll={() => setSelectedIds(new Set(visibleMessages.map((message) => message.id)))} onClearSelection={() => setSelectedIds(new Set())} onRefresh={refreshData} isRefreshing={isDataFetching} emptyStateTitle={emptyState.title} emptyStateBody={emptyState.body} inboxActionState={inboxActionState} inboxActionFeedback={inboxActionFeedback} onInboxAction={handleInboxAction} appointmentActionState={appointmentActionState} actionFeedback={appointmentFeedback} onApproveAppointment={(message) => void handleAppointmentDecision(message, "approve")} onRejectAppointment={(message) => void handleAppointmentDecision(message, "reject")} rescheduleActionState={rescheduleActionState} rescheduleFeedback={rescheduleFeedback} onApproveReschedule={(message) => void handleRescheduleDecision(message, "approve")} onRejectReschedule={(message) => void handleRescheduleDecision(message, "reject")} />
          </div>
        </div>}
      </div>
      <div className="bn crm-inbox-mobile-dock md:hidden" dir="rtl">
        <BentoDock active="inbox" onChange={navigateBentoTab} onAdd={openNewAppointment} badgeCount={notificationCount} />
      </div>
      {replyMessages && <InboxReplyComposer selectedMessages={replyMessages} senderName={VETERINARY_CLINIC_PROFILE.businessName} onClose={() => setReplyMessages(null)} onSuccess={handleReplySuccess} />}
    </>
  );
}
