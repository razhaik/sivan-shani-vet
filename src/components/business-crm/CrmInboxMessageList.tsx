import { AnimatePresence, motion } from "framer-motion";
import type { KeyboardEvent } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Inbox, ListFilter, Loader2, MessageCircle, RefreshCw, RefreshCw as RefreshIcon, UserRound, XCircle } from "lucide-react";

export type InboxLocation = "inbox" | "archive" | "trash";

export interface InboxMessage {
  id: string;
  sourceRecordId: string;
  kind: "inquiry" | "appointment" | "reschedule_request";
  senderName: string;
  hasSenderName: boolean;
  assignee: string;
  subject: string;
  preview: string;
  sourceLabel: string;
  dateLabel: string;
  dateTimeISO?: string;
  sortTimestamp: number;
  avatarSeed: string;
  isHandled: boolean;
  isUnread: boolean;
  inboxLocation: InboxLocation;
  recipientEmail?: string;
  status?: string;
  statusLabel?: string;
  detailRows?: Array<{ label: string; value: string }>;
  attentionPetLabel?: string;
  attentionServiceLabel?: string;
  attentionOriginalDateLabel?: string;
  attentionDateLabel?: string;
}

export type AppointmentAction = "approve" | "reject";
export interface AppointmentActionState { messageId: string; action: AppointmentAction; }
export type RescheduleAction = "approve" | "reject";
export interface RescheduleActionState { messageId: string; action: RescheduleAction; }
export interface InboxActionFeedback { messageId: string; tone: "success" | "partial" | "error"; message: string; }
export type InboxBulkAction = "reply" | "archive" | "delete";
export interface InboxBulkActionFeedback { tone: "success" | "partial" | "error"; message: string; }

interface CrmInboxMessageListProps {
  messages: InboxMessage[];
  unreadCount: number;
  selectedIds: Set<string>;
  selectedMessageId: string | null;
  onToggleMessage: (id: string) => void;
  onMarkHandled: (message: InboxMessage) => void | Promise<void>;
  onSelectMessage: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  emptyStateTitle: string;
  emptyStateBody: string;
  inboxActionState: InboxBulkAction | null;
  inboxActionFeedback: InboxBulkActionFeedback | null;
  onInboxAction: (action: InboxBulkAction) => void | Promise<void>;
  appointmentActionState: AppointmentActionState | null;
  actionFeedback: InboxActionFeedback | null;
  onApproveAppointment: (message: InboxMessage) => void | Promise<void>;
  onRejectAppointment: (message: InboxMessage) => void | Promise<void>;
  rescheduleActionState: RescheduleActionState | null;
  rescheduleFeedback: InboxActionFeedback | null;
  onApproveReschedule: (message: InboxMessage) => void | Promise<void>;
  onRejectReschedule: (message: InboxMessage) => void | Promise<void>;
}

const avatarColors = ["bg-[#C6E2B5] text-[#35672C]", "bg-[#F8C4B4] text-[#8D342E]", "bg-[#B9DCE0] text-[#205C67]", "bg-[#D7C6F2] text-[#54358A]", "bg-[#FFD98E] text-[#855517]", "bg-[#F2C8D8] text-[#8A355A]"];
function hash(value: string) { return Array.from(value).reduce((total, character) => ((total * 31) + character.charCodeAt(0)) | 0, 7); }
function avatarInitials(message: InboxMessage) { if (!message.hasSenderName) return "—"; const words = message.senderName.trim().split(/\s+/).filter(Boolean); if (words.length > 1) return `${words[0][0]}${words[1][0]}`; return message.senderName.trim().slice(0, 2); }
function avatarClass(message: InboxMessage) { return avatarColors[Math.abs(hash(message.avatarSeed)) % avatarColors.length]; }
function sourceIcon(message: InboxMessage) { return message.kind === "reschedule_request" ? RefreshIcon : message.kind === "appointment" ? CalendarDays : MessageCircle; }
function splitDateAndTime(label: string) {
  const separatorIndex = label.lastIndexOf(" · ");
  if (separatorIndex < 0) return { date: label, time: "" };
  return {
    date: label.slice(0, separatorIndex),
    time: label.slice(separatorIndex + 3),
  };
}
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center"><div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-[#D9DEE5] bg-[#FBFCFD] text-[#7C8795]"><span className="absolute inset-2 rounded-full border border-[#EEF0F3]" /><Inbox className="relative h-8 w-8" strokeWidth={1.45} aria-hidden="true" /></div><h2 className="text-base font-black text-[#1A1A3E]">{title}</h2><p className="mt-2 max-w-sm text-sm font-medium leading-6 text-slate-500">{body}</p></div>; }

function feedbackClass(tone: InboxBulkActionFeedback["tone"]) {
  if (tone === "success") return "border-green-200 bg-green-50 text-green-900";
  if (tone === "partial") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-red-200 bg-red-50 text-red-900";
}

function BulkActionFeedback({ feedback }: { feedback: InboxBulkActionFeedback }) {
  const Icon = feedback.tone === "success" ? CheckCircle2 : feedback.tone === "partial" ? RefreshCw : XCircle;
  return <div role={feedback.tone === "success" ? "status" : "alert"} aria-live="polite" className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold leading-5 ${feedbackClass(feedback.tone)}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{feedback.message}</span></div>;
}

function AppointmentDecisionActions({ message, state, feedback, onApprove, onReject, compact = false }: { message: InboxMessage; state: AppointmentActionState | null; feedback: InboxActionFeedback | null; onApprove: (message: InboxMessage) => void | Promise<void>; onReject: (message: InboxMessage) => void | Promise<void>; compact?: boolean; }) {
  const activeAction = state?.messageId === message.id ? state.action : null;
  const busy = Boolean(state);
  const sectionClass = compact ? "mt-3 rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_24px_-20px_rgba(26,26,62,0.8)]" : "mt-6 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_-20px_rgba(26,26,62,0.8)]";
  const helperClass = compact ? "text-[11px] font-bold leading-5 text-slate-500" : "text-xs font-bold leading-5 text-slate-500";
  const actionsClass = compact ? "mt-3 grid grid-cols-2 gap-2" : "mt-4 grid gap-3 sm:grid-cols-2";
  const buttonClass = compact ? "inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-black transition focus:outline-none disabled:cursor-wait disabled:opacity-60" : "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition focus:outline-none disabled:cursor-wait disabled:opacity-60";
  const feedbackClassName = compact ? "mt-3 rounded-xl border px-3 py-2.5 text-xs font-bold leading-5" : "mt-4 rounded-xl border px-3 py-2.5 text-xs font-bold leading-5";
  return <section className={sectionClass} aria-label="פעולות בקשת תור"><p className={helperClass}>הפעולה תעדכן את סטטוס התור ותשלח ללקוח הודעה בהתאם.</p><div className={actionsClass} role="group" aria-label="אישור או סירוב בקשת התור"><button type="button" disabled={busy} aria-label="אישור הבקשה ושליחת הודעת אישור ללקוח" onClick={() => void onApprove(message)} className={`${buttonClass} border-[#B8D9C0] bg-[#F0FAF2] text-[#1F6A38] hover:bg-[#E5F5E9] focus:ring-2 focus:ring-[#76B887]`}>{activeAction === "approve" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}{activeAction === "approve" ? "מאשר..." : "אישור הבקשה"}</button><button type="button" disabled={busy} aria-label="סירוב הבקשה ושליחת הודעת ביטול ללקוח" onClick={() => void onReject(message)} className={`${buttonClass} border-[#E8B8B8] bg-[#FFF3F3] text-[#A52D2D] hover:bg-[#FDE7E7] focus:ring-2 focus:ring-[#D96868]`}>{activeAction === "reject" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}{activeAction === "reject" ? "מסרב..." : "סירוב לבקשה"}</button></div>{feedback && <div role={feedback.tone === "success" ? "status" : "alert"} aria-live="polite" className={`${feedbackClassName} ${feedback.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : feedback.tone === "partial" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-red-200 bg-red-50 text-red-700"}`}>{feedback.message}</div>}</section>;
}

function RescheduleDecisionActions({ message, state, feedback, onApprove, onReject, compact = false }: { message: InboxMessage; state: RescheduleActionState | null; feedback: InboxActionFeedback | null; onApprove: (message: InboxMessage) => void | Promise<void>; onReject: (message: InboxMessage) => void | Promise<void>; compact?: boolean; }) {
  const activeAction = state?.messageId === message.id ? state.action : null;
  const busy = Boolean(state);
  const sectionClass = compact ? "mt-3 rounded-xl border border-[#DCE2F4] bg-[#F8F9FF] p-3 shadow-[0_8px_24px_-20px_rgba(82,103,168,0.8)]" : "mt-6 rounded-2xl border border-[#DCE2F4] bg-[#F8F9FF] p-4 shadow-[0_8px_24px_-20px_rgba(82,103,168,0.8)]";
  const helperClass = compact ? "text-[11px] font-bold leading-5 text-slate-600" : "text-xs font-bold leading-5 text-slate-600";
  const actionsClass = compact ? "mt-3 grid grid-cols-2 gap-2" : "mt-4 grid gap-3 sm:grid-cols-2";
  const buttonClass = compact ? "inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-black transition focus:outline-none disabled:cursor-wait disabled:opacity-60" : "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition focus:outline-none disabled:cursor-wait disabled:opacity-60";
  const feedbackClassName = compact ? "mt-3 rounded-xl border px-3 py-2.5 text-xs font-bold leading-5" : "mt-4 rounded-xl border px-3 py-2.5 text-xs font-bold leading-5";
  return <section className={sectionClass} aria-label="פעולות בקשת שינוי מועד"><p className={helperClass}>אישור יעביר את התור למועד המוצע. דחייה תשאיר את התור המקורי כפי שהוא.</p><div className={actionsClass} role="group" aria-label="אישור או דחיית שינוי המועד"><button type="button" disabled={busy} aria-label="אישור שינוי המועד" onClick={() => void onApprove(message)} className={`${buttonClass} border-[#B8D9C0] bg-[#F0FAF2] text-[#1F6A38] hover:bg-[#E5F5E9] focus:ring-2 focus:ring-[#76B887]`}>{activeAction === "approve" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}{activeAction === "approve" ? "מאשר שינוי..." : "אישור שינוי המועד"}</button><button type="button" disabled={busy} aria-label="דחיית שינוי המועד והשארת התור המקורי" onClick={() => void onReject(message)} className={`${buttonClass} border-[#E8B8B8] bg-[#FFF3F3] text-[#A52D2D] hover:bg-[#FDE7E7] focus:ring-2 focus:ring-[#D96868]`}>{activeAction === "reject" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}{activeAction === "reject" ? "דוחה שינוי..." : "דחיית שינוי המועד"}</button></div>{feedback && <div role={feedback.tone === "success" ? "status" : "alert"} aria-live="polite" className={`${feedbackClassName} ${feedback.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : feedback.tone === "partial" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-red-700/10 bg-red-700/10 text-red-700"}`}>{feedback.message}</div>}</section>;
}

interface MobileAttentionTrayProps {
  messages: InboxMessage[];
  selectedMessage: InboxMessage | null;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onSelectMessage: (id: string) => void;
  appointmentActionState: AppointmentActionState | null;
  appointmentFeedback: InboxActionFeedback | null;
  onApproveAppointment: (message: InboxMessage) => void | Promise<void>;
  onRejectAppointment: (message: InboxMessage) => void | Promise<void>;
  rescheduleActionState: RescheduleActionState | null;
  rescheduleFeedback: InboxActionFeedback | null;
  onApproveReschedule: (message: InboxMessage) => void | Promise<void>;
  onRejectReschedule: (message: InboxMessage) => void | Promise<void>;
}

export function MobileAttentionTray({ messages, selectedMessage, isMenuOpen, onToggleMenu, onCloseMenu, onSelectMessage, appointmentActionState, appointmentFeedback, onApproveAppointment, onRejectAppointment, rescheduleActionState, rescheduleFeedback, onApproveReschedule, onRejectReschedule }: MobileAttentionTrayProps) {
  if (!selectedMessage || messages.length === 0) return null;

  const SourceIcon = sourceIcon(selectedMessage);
  const appointmentFeedbackForMessage = appointmentFeedback?.messageId === selectedMessage.id ? appointmentFeedback : null;
  const rescheduleFeedbackForMessage = rescheduleFeedback?.messageId === selectedMessage.id ? rescheduleFeedback : null;
  const selectFromMenu = (id: string) => {
    onSelectMessage(id);
    onCloseMenu();
    window.requestAnimationFrame(() => document.getElementById("crm-mobile-attention-menu-button")?.focus());
  };
  const handleMenuKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseMenu();
      window.requestAnimationFrame(() => document.getElementById("crm-mobile-attention-menu-button")?.focus());
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? messages.length - 1 : event.key === "ArrowDown" ? Math.min(messages.length - 1, index + 1) : Math.max(0, index - 1);
    document.getElementById(`crm-mobile-attention-option-${nextIndex}`)?.focus();
  };
  const attentionDetails = [
    selectedMessage.attentionPetLabel ? { label: "חיית מחמד", value: selectedMessage.attentionPetLabel } : null,
    selectedMessage.attentionServiceLabel ? { label: "שירות", value: selectedMessage.attentionServiceLabel } : null,
    selectedMessage.kind === "reschedule_request" ? { label: "מועד מקורי", value: selectedMessage.attentionOriginalDateLabel || "המועד המקורי לא צוין" } : null,
    { label: selectedMessage.kind === "reschedule_request" ? "מועד מוצע" : "מועד מבוקש", value: selectedMessage.attentionDateLabel || selectedMessage.dateLabel },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return <section dir="rtl" className="mb-5 overflow-hidden rounded-2xl border border-[#E7D88D] bg-[#FFFDF1] shadow-[0_14px_32px_-24px_rgba(26,26,62,0.8)] sm:hidden" aria-labelledby="crm-mobile-attention-title">
    <div className="flex items-start gap-2 border-b border-[#F0E6B5] px-3 py-3">
      <button id="crm-mobile-attention-menu-button" type="button" onClick={onToggleMenu} aria-expanded={isMenuOpen} aria-controls="crm-mobile-attention-menu" aria-haspopup="listbox" aria-label={isMenuOpen ? "סגירת רשימת הבקשות שממתינות" : "בחירת בקשה שממתינה"} className="order-first flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1A1A3E] text-white transition hover:bg-[#29295A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] focus:ring-offset-2 focus:ring-offset-[#FFFDF1]"><ChevronDown className={`h-4 w-4 transition-transform ${isMenuOpen ? "rotate-180" : ""}`} aria-hidden="true" /></button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#D94C4C]" aria-hidden="true" />
          <h2 id="crm-mobile-attention-title" className="truncate text-base font-black text-[#1A1A3E]">נדרשת תשומת לב</h2>
          <span role="status" aria-live="polite" aria-label={`${messages.length} בקשות ממתינות`} className="min-w-6 rounded-full bg-[#F2D162] px-1.5 text-center text-[11px] font-black leading-5 text-[#1A1A3E]">{messages.length > 99 ? "99+" : messages.length}</span>
        </div>
        <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">בקשות תור ושינוי מועד מחכות לאישור המרפאה.</p>
      </div>
    </div>

    {isMenuOpen && <div id="crm-mobile-attention-menu" role="listbox" aria-label="בקשות שממתינות לאישור" className="max-h-48 space-y-1 overflow-y-auto border-b border-[#F0E6B5] bg-white/75 p-2">
      {messages.map((message, index) => {
        const active = message.id === selectedMessage.id;
        const ItemIcon = sourceIcon(message);
        const attentionDateLabel = message.attentionDateLabel || message.dateLabel;
        const dateParts = splitDateAndTime(attentionDateLabel);
        return <button id={`crm-mobile-attention-option-${index}`} key={message.id} type="button" role="option" aria-label={`${message.sourceLabel}, ${message.senderName}, ${attentionDateLabel}`} aria-selected={active} onClick={() => selectFromMenu(message.id)} onKeyDown={(event) => handleMenuKeyDown(event, index)} className={`flex min-h-14 w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-right transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${active ? "border-[#D9BF55] bg-[#FFF8D9]" : "border-transparent bg-white hover:border-[#E5E7EB]"}`}>
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F1F3FA] text-[#5267A8]"><ItemIcon className="h-3.5 w-3.5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-black text-slate-500">{message.sourceLabel}</span><span className="mt-0.5 block truncate text-xs font-black text-[#1A1A3E]">{message.senderName}</span><span className="mt-0.5 block break-words text-[10px] font-semibold leading-4 text-slate-400" title={attentionDateLabel}>{dateParts.date}</span>{dateParts.time && <span dir={dateParts.time.includes(":") ? "ltr" : undefined} className="block text-right text-[10px] font-black leading-4 tabular-nums text-[#5267A8]">{dateParts.time}</span>}</span>
          {active && <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#5267A8]" aria-hidden="true" />}
        </button>;
      })}
    </div>}

    <div className="p-3">
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F2D162]/[0.35] text-[#1A1A3E]"><SourceIcon className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0"><p className="truncate text-[10px] font-black text-[#5267A8]">{selectedMessage.sourceLabel}</p><h3 className="truncate text-sm font-black text-[#1A1A3E]">{selectedMessage.senderName}</h3></div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {attentionDetails.map((detail) => {
            const isOriginalDate = detail.label === "מועד מקורי";
            const isProposedDate = detail.label === "מועד מוצע";
            const isDateDetail = isOriginalDate || isProposedDate || detail.label === "מועד מבוקש";
            const dateParts = isDateDetail ? splitDateAndTime(detail.value) : null;
            const cardTone = isProposedDate ? "border border-[#DCE2F4] bg-[#F2F5FF]" : isOriginalDate ? "border border-[#E5E7EB] bg-[#F7F8FA]" : "bg-[#F7F8FA]";
            const labelTone = isProposedDate ? "text-[#5267A8]" : isOriginalDate ? "text-slate-500" : "text-slate-400";
            const timeTone = isOriginalDate ? "text-slate-500" : "text-[#5267A8]";
            return <div key={detail.label} className={`min-w-0 rounded-lg px-2.5 py-2 ${cardTone}`}><dt className={`text-[10px] font-extrabold ${labelTone}`}>{detail.label}</dt><dd className={`mt-0.5 ${dateParts ? "break-words" : "truncate"} text-xs font-black text-[#1A1A3E]`} title={detail.value} aria-label={dateParts ? detail.value : undefined}>{dateParts ? <><span className="block break-words">{dateParts.date}</span>{dateParts.time && <span dir={dateParts.time.includes(":") ? "ltr" : undefined} className={`mt-0.5 block text-right text-[11px] font-black leading-4 tabular-nums ${timeTone}`}>{dateParts.time}</span>}</> : detail.value}</dd></div>;
          })}
        </dl>
        {selectedMessage.kind === "appointment" && selectedMessage.status === "requested" && <AppointmentDecisionActions compact message={selectedMessage} state={appointmentActionState} feedback={appointmentFeedbackForMessage} onApprove={(message) => { onCloseMenu(); return onApproveAppointment(message); }} onReject={(message) => { onCloseMenu(); return onRejectAppointment(message); }} />}
        {selectedMessage.kind === "reschedule_request" && selectedMessage.status === "pending" && <RescheduleDecisionActions compact message={selectedMessage} state={rescheduleActionState} feedback={rescheduleFeedbackForMessage} onApprove={(message) => { onCloseMenu(); return onApproveReschedule(message); }} onReject={(message) => { onCloseMenu(); return onRejectReschedule(message); }} />}
      </div>
    </div>
  </section>;
}

interface PreviewProps {
  message: InboxMessage;
  detailId: string;
  triggerId: string;
  onCollapse: () => void;
  appointmentActionState: AppointmentActionState | null;
  actionFeedback: InboxActionFeedback | null;
  onApproveAppointment: (message: InboxMessage) => void | Promise<void>;
  onRejectAppointment: (message: InboxMessage) => void | Promise<void>;
  rescheduleActionState: RescheduleActionState | null;
  rescheduleFeedback: InboxActionFeedback | null;
  onApproveReschedule: (message: InboxMessage) => void | Promise<void>;
  onRejectReschedule: (message: InboxMessage) => void | Promise<void>;
}

interface MessageRowProps {
  message: InboxMessage;
  index: number;
  selected: boolean;
  active: boolean;
  detailId: string;
  triggerId: string;
  onToggle: (id: string) => void;
  onMarkHandled: (message: InboxMessage) => void | Promise<void>;
  onSelect: (id: string) => void;
  appointmentActionState: AppointmentActionState | null;
  actionFeedback: InboxActionFeedback | null;
  onApproveAppointment: (message: InboxMessage) => void | Promise<void>;
  onRejectAppointment: (message: InboxMessage) => void | Promise<void>;
  rescheduleActionState: RescheduleActionState | null;
  rescheduleFeedback: InboxActionFeedback | null;
  onApproveReschedule: (message: InboxMessage) => void | Promise<void>;
  onRejectReschedule: (message: InboxMessage) => void | Promise<void>;
}

function MessageRow({ message, index, selected, active, detailId, triggerId, onToggle, onMarkHandled, onSelect, appointmentActionState, actionFeedback, onApproveAppointment, onRejectAppointment, rescheduleActionState, rescheduleFeedback, onApproveReschedule, onRejectReschedule }: MessageRowProps) {
  const SourceIcon = sourceIcon(message);
  const dateParts = splitDateAndTime(message.dateLabel);
  const openMessage = () => {
    void onMarkHandled(message);
    onSelect(message.id);
  };
  const rowLabel = `${message.subject}, ${message.senderName}, ${message.dateLabel}, ${message.isUnread ? "לא נקראה" : "טופלה"}, ${active ? "סגירת התוכן" : "פתיחת התוכן"}`;
  return <motion.div role="listitem" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(index * 0.025, 0.18) }} className="border-b border-[#EEF0F3] last:border-b-0"><div id={triggerId} role="button" tabIndex={0} aria-expanded={active} aria-controls={detailId} aria-label={rowLabel} onClick={openMessage} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openMessage(); } }} className={`group flex min-w-0 items-start gap-3 px-3 py-4 text-right transition sm:items-center sm:gap-4 sm:px-5 ${active ? "bg-[#FFFBEA]" : "bg-white hover:bg-[#FBFCFD]"} focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#F2D162]`}><label className="mt-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center sm:mt-0" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => onToggle(message.id)} className="h-4 w-4 cursor-pointer accent-[#1A1A3E]" aria-label={`בחירת ההודעה של ${message.senderName}`} /></label><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black ${avatarClass(message)}`} aria-hidden="true">{avatarInitials(message)}</span><div className="min-w-0 flex-1"><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-5"><div className="min-w-0 sm:w-[180px] sm:shrink-0"><p title={message.senderName} className={`truncate text-sm ${message.isUnread ? "font-black" : "font-medium"} text-[#1A1A3E]`}>{message.senderName}</p><p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] font-semibold text-slate-400"><UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate" title={message.assignee}>{message.assignee}</span></p></div><div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><p title={message.subject} className={`truncate text-sm ${message.isUnread ? "font-black" : "font-medium"} text-[#1A1A3E]`}>{message.subject}</p>{message.statusLabel && <span className="inline-flex shrink-0 rounded-full border border-[#F1D38A] bg-[#FFF8DE] px-2 py-0.5 text-[10px] font-black text-[#8A6415]">{message.statusLabel}</span>}</div><p title={message.preview} className="mt-1 truncate text-xs font-medium text-slate-500">{message.preview}</p></div></div><div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-400 sm:hidden"><SourceIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{message.sourceLabel}</span></div></div><div className="hidden w-[118px] shrink-0 items-center gap-2 text-xs font-bold text-slate-400 sm:flex" title={message.sourceLabel}><SourceIcon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{message.sourceLabel}</span></div><time dateTime={message.dateTimeISO} title={message.dateLabel} aria-label={message.dateLabel} className="w-[72px] shrink-0 pt-1 text-left text-[11px] font-bold leading-4 text-slate-400 sm:pt-0"><span className="block break-words">{dateParts.date}</span>{dateParts.time && <span dir={dateParts.time.includes(":") ? "ltr" : undefined} className="mt-0.5 block whitespace-nowrap font-black leading-4 tabular-nums text-[#5267A8]">{dateParts.time}</span>}</time></div><AnimatePresence initial={false}>{active && <Preview message={message} detailId={detailId} triggerId={triggerId} onCollapse={() => onSelect(message.id)} appointmentActionState={appointmentActionState} actionFeedback={actionFeedback} onApproveAppointment={onApproveAppointment} onRejectAppointment={onRejectAppointment} rescheduleActionState={rescheduleActionState} rescheduleFeedback={rescheduleFeedback} onApproveReschedule={onApproveReschedule} onRejectReschedule={onRejectReschedule} />}</AnimatePresence></motion.div>;
}

function Preview({ message, detailId, triggerId, onCollapse, appointmentActionState, actionFeedback, onApproveAppointment, onRejectAppointment, rescheduleActionState, rescheduleFeedback, onApproveReschedule, onRejectReschedule }: PreviewProps) {
  const SourceIcon = sourceIcon(message);
  const feedback = actionFeedback?.messageId === message.id ? actionFeedback : null;
  const requestFeedback = rescheduleFeedback?.messageId === message.id ? rescheduleFeedback : null;
  return <motion.div id={detailId} role="region" aria-labelledby={triggerId} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-[#E7D88D] bg-[#FFFDF1]" aria-label="תוכן ההודעה"><div className="border-r-4 border-[#F2D162] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-extrabold text-[#5267A8]"><SourceIcon className="h-4 w-4" aria-hidden="true" />תוכן ההודעה · {message.sourceLabel}</span><button type="button" onClick={onCollapse} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-extrabold text-slate-500 transition hover:bg-white/80 hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><ChevronDown className="h-4 w-4 rotate-180" aria-hidden="true" />סגירת התוכן</button></div><h2 className="mt-4 text-lg font-black text-[#1A1A3E]">{message.subject}</h2><div className="mt-4 flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-black ${avatarClass(message)}`} aria-hidden="true">{avatarInitials(message)}</span><div className="min-w-0"><p className="truncate text-sm font-extrabold text-[#1A1A3E]">{message.senderName}</p><p className="mt-1 text-xs font-semibold text-slate-400">{message.assignee} · {message.dateLabel}</p></div></div>{message.statusLabel && <div role="status" className="mt-5 flex items-center gap-2 rounded-xl border border-[#F1D38A] bg-[#FFF8DE] px-3 py-2.5 text-sm font-black text-[#8A6415]"><RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />{message.statusLabel}</div>}<p className="mt-5 max-w-3xl whitespace-pre-wrap break-words text-sm font-medium leading-7 text-slate-600">{message.preview}</p>{message.detailRows && <dl className="mt-5 grid gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-4 sm:grid-cols-2">{message.detailRows.map((row) => <div key={row.label} className="rounded-xl bg-[#F7F8FA] px-3 py-2.5"><dt className="text-[11px] font-extrabold text-slate-400">{row.label}</dt><dd className="mt-1 text-sm font-black text-[#1A1A3E]">{row.value}</dd></div>)}</dl>}{message.kind === "appointment" && message.status === "requested" && <AppointmentDecisionActions message={message} state={appointmentActionState} feedback={feedback} onApprove={onApproveAppointment} onReject={onRejectAppointment} />}{message.kind === "reschedule_request" && message.status === "pending" && <RescheduleDecisionActions message={message} state={rescheduleActionState} feedback={requestFeedback} onApprove={onApproveReschedule} onReject={onRejectReschedule} />}</div></motion.div>;
}

export function CrmInboxMessageList({ messages, unreadCount, selectedIds, selectedMessageId, onToggleMessage, onMarkHandled, onSelectMessage, onSelectAll, onClearSelection, onRefresh, isRefreshing, emptyStateTitle, emptyStateBody, inboxActionState, inboxActionFeedback, onInboxAction, appointmentActionState, actionFeedback, onApproveAppointment, onRejectAppointment, rescheduleActionState, rescheduleFeedback, onApproveReschedule, onRejectReschedule }: CrmInboxMessageListProps) {
  const actionDisabled = selectedIds.size === 0 || Boolean(inboxActionState);
  const actionTitle = inboxActionState ? "הפעולה מתבצעת" : selectedIds.size === 0 ? "יש לבחור לפחות הודעה אחת" : "בחירת פעולה להודעות שנבחרו";
  const actionStatus = inboxActionState === "reply" ? "פותח את חלון המענה..." : inboxActionState === "archive" ? "מעביר את ההודעות לארכיון..." : inboxActionState === "delete" ? "מעביר את ההודעות לאשפה..." : selectedIds.size > 0 ? `${selectedIds.size} הודעות נבחרו לפעולה` : "יש לבחור לפחות הודעה אחת כדי להפעיל פעולה";

  return <section className="min-w-0 overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_10px_30px_-24px_rgba(26,26,62,0.65)]" aria-label="רשימת הודעות"><div className="border-b border-[#EEF0F3] px-3 py-3 sm:px-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-h-10 items-center gap-2 rounded-lg border border-[#E1E4E8] bg-[#F7F8FA] px-3 text-xs font-extrabold text-[#1A1A3E]"><ListFilter className="h-4 w-4 text-slate-500" aria-hidden="true" /><span>התוכן נפתח מתחת להודעה</span></div><div className="flex min-w-0 items-center gap-2"><label className="relative flex min-h-10 items-center rounded-lg border border-[#E1E4E8] bg-[#F7F8FA] px-3 text-xs font-extrabold text-[#1A1A3E]"><select defaultValue="" onChange={(event) => { if (event.target.value === "all") onSelectAll(); if (event.target.value === "clear") onClearSelection(); event.currentTarget.value = ""; }} className="h-8 appearance-none bg-transparent pl-5 text-xs font-extrabold text-[#1A1A3E] outline-none" aria-label="סימון הודעות"><option value="">סימון</option><option value="all">סימון כל ההודעות המוצגות</option><option value="clear">ניקוי הבחירה</option></select><ChevronDown className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" /></label><button type="button" onClick={onRefresh} disabled={isRefreshing} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E1E4E8] bg-[#F7F8FA] text-slate-500 transition hover:border-[#CBD2DB] hover:bg-white hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-wait disabled:opacity-60" aria-label="רענון תיבת הדואר" title="רענון תיבת הדואר"><RefreshCw className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" /></button><label className={`relative flex min-h-10 items-center rounded-lg border px-3 text-xs font-extrabold ${actionDisabled ? "cursor-not-allowed border-[#E1E4E8] bg-[#F7F8FA] text-slate-400" : "border-[#DCE2F4] bg-[#F8F9FF] text-[#5267A8]"}`}><select defaultValue="" disabled={actionDisabled} onChange={(event) => { const action = event.target.value as InboxBulkAction; if (action) void onInboxAction(action); event.currentTarget.value = ""; }} className="h-8 max-w-[132px] appearance-none bg-transparent pl-5 text-xs font-extrabold outline-none disabled:cursor-not-allowed" aria-label="בחירת פעולה" aria-describedby="inbox-action-help" title={actionTitle}><option value="">בחירת פעולה</option><option value="reply">מענה</option><option value="archive">העברה לארכיון</option><option value="delete">מחיקה</option></select><ChevronDown className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" /></label></div></div><p id="inbox-action-help" role="status" aria-live="polite" className="mt-2 text-[11px] font-semibold text-slate-400">{actionStatus}</p>{inboxActionFeedback && <BulkActionFeedback feedback={inboxActionFeedback} />}<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-400"><div className="flex flex-wrap items-center gap-2"><span>{messages.length > 0 ? `${messages.length} הודעות מוצגות` : "אין הודעות להצגה"}</span>{unreadCount > 0 && <><span aria-hidden="true">·</span><span className="font-extrabold text-[#5267A8]">{unreadCount} לא נקראו</span></>}</div>{selectedIds.size > 0 && <span className="text-[#5267A8]">{selectedIds.size} נבחרו במסך זה בלבד</span>}</div></div>{messages.length === 0 ? <EmptyState title={emptyStateTitle} body={emptyStateBody} /> : <div role="list" aria-label="הודעות בתיבת הדואר">{messages.map((message, index) => { const domToken = `${index}-${Math.abs(hash(message.id))}`; const detailId = `crm-inbox-detail-${domToken}`; const triggerId = `crm-inbox-trigger-${domToken}`; return <MessageRow key={message.id} message={message} index={index} selected={selectedIds.has(message.id)} active={selectedMessageId === message.id} detailId={detailId} triggerId={triggerId} onToggle={onToggleMessage} onMarkHandled={onMarkHandled} onSelect={onSelectMessage} appointmentActionState={appointmentActionState} actionFeedback={actionFeedback} onApproveAppointment={onApproveAppointment} onRejectAppointment={onRejectAppointment} rescheduleActionState={rescheduleActionState} rescheduleFeedback={rescheduleFeedback} onApproveReschedule={onApproveReschedule} onRejectReschedule={onRejectReschedule} />; })}</div>}</section>;
}
