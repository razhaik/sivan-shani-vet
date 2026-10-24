import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, CheckCircle2, ChevronDown, Inbox, ListFilter, Loader2, MessageCircle, RefreshCw, RefreshCw as RefreshIcon, UserRound, X, XCircle } from "lucide-react";

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
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="crm-inbox-empty-state flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center"><div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-[#D9DEE5] bg-[#FBFCFD] text-[#7C8795]"><span className="absolute inset-2 rounded-full border border-[#EEF0F3]" /><Inbox className="relative h-8 w-8" strokeWidth={1.45} aria-hidden="true" /></div><h2 className="text-base font-black text-[#1A1A3E]">{title}</h2><p className="mt-2 max-w-sm text-sm font-medium leading-6 text-slate-500">{body}</p></div>; }

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
  return <section className={`crm-inbox-decision-actions ${sectionClass}`} aria-label="פעולות בקשת תור"><p className={helperClass}>הפעולה תעדכן את סטטוס התור ותשלח ללקוח הודעה בהתאם.</p><div className={`crm-inbox-decision-buttons ${actionsClass}`} role="group" aria-label="אישור או סירוב בקשת התור"><button type="button" disabled={busy} aria-label="אישור הבקשה ושליחת הודעת אישור ללקוח" onClick={() => void onApprove(message)} className={`${buttonClass} border-[#B8D9C0] bg-[#F0FAF2] text-[#1F6A38] hover:bg-[#E5F5E9] focus:ring-2 focus:ring-[#76B887]`}>{activeAction === "approve" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}{activeAction === "approve" ? "מאשר..." : "אישור הבקשה"}</button><button type="button" disabled={busy} aria-label="סירוב הבקשה ושליחת הודעת ביטול ללקוח" onClick={() => void onReject(message)} className={`${buttonClass} border-[#E8B8B8] bg-[#FFF3F3] text-[#A52D2D] hover:bg-[#FDE7E7] focus:ring-2 focus:ring-[#D96868]`}>{activeAction === "reject" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}{activeAction === "reject" ? "מסרב..." : "סירוב לבקשה"}</button></div>{feedback && <div role={feedback.tone === "success" ? "status" : "alert"} aria-live="polite" className={`${feedbackClassName} ${feedback.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : feedback.tone === "partial" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-red-200 bg-red-50 text-red-700"}`}>{feedback.message}</div>}</section>;
}

function RescheduleDecisionActions({ message, state, feedback, onApprove, onReject, compact = false }: { message: InboxMessage; state: RescheduleActionState | null; feedback: InboxActionFeedback | null; onApprove: (message: InboxMessage) => void | Promise<void>; onReject: (message: InboxMessage) => void | Promise<void>; compact?: boolean; }) {
  const activeAction = state?.messageId === message.id ? state.action : null;
  const busy = Boolean(state);
  const sectionClass = compact ? "mt-3 rounded-xl border border-[#DCE2F4] bg-[#F8F9FF] p-3 shadow-[0_8px_24px_-20px_rgba(82,103,168,0.8)]" : "mt-6 rounded-2xl border border-[#DCE2F4] bg-[#F8F9FF] p-4 shadow-[0_8px_24px_-20px_rgba(82,103,168,0.8)]";
  const helperClass = compact ? "text-[11px] font-bold leading-5 text-slate-600" : "text-xs font-bold leading-5 text-slate-600";
  const actionsClass = compact ? "mt-3 grid grid-cols-2 gap-2" : "mt-4 grid gap-3 sm:grid-cols-2";
  const buttonClass = compact ? "inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-black transition focus:outline-none disabled:cursor-wait disabled:opacity-60" : "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition focus:outline-none disabled:cursor-wait disabled:opacity-60";
  const feedbackClassName = compact ? "mt-3 rounded-xl border px-3 py-2.5 text-xs font-bold leading-5" : "mt-4 rounded-xl border px-3 py-2.5 text-xs font-bold leading-5";
  return <section className={`crm-inbox-decision-actions ${sectionClass}`} aria-label="פעולות בקשת שינוי מועד"><p className={helperClass}>אישור יעביר את התור למועד המוצע. דחייה תשאיר את התור המקורי כפי שהוא.</p><div className={`crm-inbox-decision-buttons ${actionsClass}`} role="group" aria-label="אישור או דחיית שינוי המועד"><button type="button" disabled={busy} aria-label="אישור שינוי המועד" onClick={() => void onApprove(message)} className={`${buttonClass} border-[#B8D9C0] bg-[#F0FAF2] text-[#1F6A38] hover:bg-[#E5F5E9] focus:ring-2 focus:ring-[#76B887]`}>{activeAction === "approve" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}{activeAction === "approve" ? "מאשר שינוי..." : "אישור שינוי המועד"}</button><button type="button" disabled={busy} aria-label="דחיית שינוי המועד והשארת התור המקורי" onClick={() => void onReject(message)} className={`${buttonClass} border-[#E8B8B8] bg-[#FFF3F3] text-[#A52D2D] hover:bg-[#FDE7E7] focus:ring-2 focus:ring-[#D96868]`}>{activeAction === "reject" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}{activeAction === "reject" ? "דוחה שינוי..." : "דחיית שינוי המועד"}</button></div>{feedback && <div role={feedback.tone === "success" ? "status" : "alert"} aria-live="polite" className={`${feedbackClassName} ${feedback.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : feedback.tone === "partial" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-red-700/10 bg-red-700/10 text-red-700"}`}>{feedback.message}</div>}</section>;
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

const ATTENTION_PEEK_REST = 14;
const ATTENTION_PEEK_INTRO = 62;
const ATTENTION_MAX_BEHIND = 2;
const ATTENTION_SWIPE_DISTANCE = 90;

function attentionDetailsFor(message: InboxMessage) {
  return [
    message.attentionPetLabel ? { label: "חיית מחמד", value: message.attentionPetLabel } : null,
    message.attentionServiceLabel ? { label: "שירות", value: message.attentionServiceLabel } : null,
    message.kind === "reschedule_request" ? { label: "מועד מקורי", value: message.attentionOriginalDateLabel || "המועד המקורי לא צוין" } : null,
    { label: message.kind === "reschedule_request" ? "מועד מוצע" : "מועד מבוקש", value: message.attentionDateLabel || message.dateLabel },
  ].filter(Boolean) as Array<{ label: string; value: string }>;
}

function AttentionCardHeader({ message }: { message: InboxMessage }) {
  const Icon = sourceIcon(message);
  const time = splitDateAndTime(message.attentionDateLabel || message.dateLabel).time;
  return <div className="crm-attention-card-head">
    <span className="crm-attention-card-icon" aria-hidden="true"><Icon /></span>
    <div className="min-w-0 flex-1"><p className="crm-attention-card-kind">{message.sourceLabel}</p><h3 className="crm-attention-card-name" dir="auto">{message.senderName}</h3></div>
    {time && <span className="crm-attention-card-time" dir={time.includes(":") ? "ltr" : undefined}>{time}</span>}
  </div>;
}

export function MobileAttentionTray({ messages, selectedMessage, onCloseMenu, onSelectMessage, appointmentActionState, appointmentFeedback, onApproveAppointment, onRejectAppointment, rescheduleActionState, rescheduleFeedback, onApproveReschedule, onRejectReschedule }: MobileAttentionTrayProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const [introPlayed, setIntroPlayed] = useState(reducedMotion);
  const [exitDirection, setExitDirection] = useState<1 | -1>(-1);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (introPlayed) return;
    const timer = window.setTimeout(() => setIntroPlayed(true), 650);
    return () => window.clearTimeout(timer);
  }, [introPlayed]);

  useEffect(() => { firstRenderRef.current = false; }, []);

  if (!selectedMessage || messages.length === 0) return null;

  const currentIndex = Math.max(0, messages.findIndex((message) => message.id === selectedMessage.id));
  const behind = Array.from({ length: Math.min(ATTENTION_MAX_BEHIND, messages.length - 1) }, (_, offset) => messages[(currentIndex + offset + 1) % messages.length]);
  const peek = introPlayed ? ATTENTION_PEEK_REST : ATTENTION_PEEK_INTRO;
  const transition = reducedMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.9 };

  const goTo = (index: number, direction: 1 | -1) => {
    if (messages.length < 2) return;
    const wrapped = (index + messages.length) % messages.length;
    setExitDirection(direction);
    onCloseMenu();
    onSelectMessage(messages[wrapped].id);
  };
  const goNext = () => goTo(currentIndex + 1, -1);
  const goPrevious = () => goTo(currentIndex - 1, 1);

  const details = attentionDetailsFor(selectedMessage);
  const isAppointment = selectedMessage.kind === "appointment" && selectedMessage.status === "requested";
  const isReschedule = selectedMessage.kind === "reschedule_request" && selectedMessage.status === "pending";
  const actionState = isAppointment ? appointmentActionState : isReschedule ? rescheduleActionState : null;
  const activeAction = actionState?.messageId === selectedMessage.id ? actionState.action : null;
  const busy = Boolean(actionState);
  const feedback = isAppointment
    ? (appointmentFeedback?.messageId === selectedMessage.id ? appointmentFeedback : null)
    : (rescheduleFeedback?.messageId === selectedMessage.id ? rescheduleFeedback : null);
  const approve = () => { if (isAppointment) void onApproveAppointment(selectedMessage); else if (isReschedule) void onApproveReschedule(selectedMessage); };
  const reject = () => { if (isAppointment) void onRejectAppointment(selectedMessage); else if (isReschedule) void onRejectReschedule(selectedMessage); };

  return <section dir="rtl" className="crm-inbox-attention-tray crm-attention-deck-section mb-5" aria-labelledby="crm-mobile-attention-title" aria-roledescription="חפיסת בקשות">
    <div className="crm-attention-deck-head">
      <span className="crm-attention-deck-dot" aria-hidden="true" />
      <h2 id="crm-mobile-attention-title">נדרשת תשומת לב</h2>
      <span className="crm-attention-deck-count" role="status" aria-live="polite" aria-label={`${messages.length} בקשות ממתינות`}>{messages.length > 99 ? "99+" : messages.length}</span>
      {messages.length > 1 && <span className="crm-attention-deck-position" aria-live="polite">{currentIndex + 1} מתוך {messages.length}</span>}
    </div>

    <motion.div className="crm-attention-deck" initial={false} animate={{ paddingTop: behind.length * peek }} transition={transition}>
      <div className="crm-attention-deck-stack">
        {behind.map((message, offset) => {
          const depth = offset + 1;
          return <motion.button
            key={`behind-${message.id}`}
            type="button"
            className="crm-attention-card crm-attention-card-behind"
            style={{ zIndex: 10 - depth }}
            initial={firstRenderRef.current && !reducedMotion ? { y: -depth * ATTENTION_PEEK_INTRO, scale: 1 } : false}
            animate={{ y: -depth * peek, scale: introPlayed ? 1 - depth * 0.05 : 1 - depth * 0.015 }}
            transition={transition}
            onClick={() => goTo(currentIndex + depth, -1)}
            aria-label={`מעבר לבקשה של ${message.senderName}`}
            tabIndex={-1}
          >
            <AttentionCardHeader message={message} />
          </motion.button>;
        })}

        <AnimatePresence initial={false} mode="popLayout" custom={exitDirection}>
          <motion.article
            key={selectedMessage.id}
            className="crm-attention-card crm-attention-card-front"
            style={{ zIndex: 20 }}
            custom={exitDirection}
            initial={reducedMotion ? false : { y: -ATTENTION_PEEK_REST, scale: 0.95, opacity: 0.6 }}
            animate={{ y: 0, x: 0, scale: 1, opacity: 1, rotate: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { x: exitDirection * 420, rotate: exitDirection * 12, opacity: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
            transition={transition}
            drag={messages.length > 1 && !busy ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.9}
            onDragEnd={(_, info) => {
              if (info.offset.x < -ATTENTION_SWIPE_DISTANCE || info.velocity.x < -600) goNext();
              else if (info.offset.x > ATTENTION_SWIPE_DISTANCE || info.velocity.x > 600) goPrevious();
            }}
            aria-label={`${selectedMessage.sourceLabel} של ${selectedMessage.senderName}`}
          >
            <AttentionCardHeader message={selectedMessage} />
            <dl className="crm-attention-card-details">
              {details.map((detail) => {
                const isDate = ["מועד מקורי", "מועד מוצע", "מועד מבוקש"].includes(detail.label);
                const parts = isDate ? splitDateAndTime(detail.value) : null;
                return <div key={detail.label} className={detail.label === "מועד מוצע" ? "is-proposed" : undefined}>
                  <dt>{detail.label}</dt>
                  <dd title={detail.value}>{parts ? <>{parts.date}{parts.time && <> · <bdi dir={parts.time.includes(":") ? "ltr" : "auto"}>{parts.time}</bdi></>}</> : detail.value}</dd>
                </div>;
              })}
            </dl>
            {(isAppointment || isReschedule) && <div className="crm-attention-card-actions" role="group" aria-label={isAppointment ? "אישור או סירוב בקשת התור" : "אישור או דחיית שינוי המועד"}>
              <button type="button" className="is-reject" disabled={busy} onClick={reject} aria-label={isAppointment ? "סירוב הבקשה ושליחת הודעת ביטול ללקוח" : "דחיית שינוי המועד והשארת התור המקורי"}>
                {activeAction === "reject" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
                {activeAction === "reject" ? "שומר..." : isAppointment ? "סירוב" : "השארת המועד"}
              </button>
              <button type="button" className="is-approve" disabled={busy} onClick={approve} aria-label={isAppointment ? "אישור הבקשה ושליחת הודעת אישור ללקוח" : "אישור שינוי המועד"}>
                {activeAction === "approve" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                {activeAction === "approve" ? "מאשר..." : isAppointment ? "אישור" : "אישור השינוי"}
              </button>
            </div>}
            {feedback && <p role={feedback.tone === "success" ? "status" : "alert"} aria-live="polite" className={`crm-attention-card-feedback is-${feedback.tone}`}>{feedback.message}</p>}
          </motion.article>
        </AnimatePresence>
      </div>
    </motion.div>

    {messages.length > 1 && <>
      <div className="crm-attention-deck-dots" role="tablist" aria-label="מעבר בין הבקשות">
        {messages.slice(0, 8).map((message, index) => <button key={message.id} type="button" role="tab" aria-selected={index === currentIndex} aria-label={`בקשה ${index + 1}: ${message.senderName}`} className={index === currentIndex ? "is-active" : undefined} onClick={() => goTo(index, index > currentIndex ? -1 : 1)} />)}
      </div>
      <p className="crm-attention-deck-hint">החליקו הצידה לבקשה הבאה</p>
    </>}
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
  return <motion.div role="listitem" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(index * 0.025, 0.18) }} className="crm-inbox-message-item border-b border-[#EEF0F3] last:border-b-0"><div id={triggerId} role="button" tabIndex={0} aria-expanded={active} aria-controls={detailId} aria-label={rowLabel} onClick={openMessage} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openMessage(); } }} className={`crm-inbox-message-trigger group flex min-w-0 items-start gap-3 px-3 py-4 text-right transition sm:items-center sm:gap-4 sm:px-5 ${active ? "bg-[#FFFBEA]" : "bg-white hover:bg-[#FBFCFD]"} focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#F2D162]`}><label className="crm-inbox-message-checkbox mt-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center sm:mt-0" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => onToggle(message.id)} className="h-4 w-4 cursor-pointer accent-[#1A1A3E]" aria-label={`בחירת ההודעה של ${message.senderName}`} /></label><span className={`crm-inbox-message-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black ${avatarClass(message)}`} aria-hidden="true">{avatarInitials(message)}</span><div className="crm-inbox-message-content min-w-0 flex-1"><div className="crm-inbox-message-summary flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-5"><div className="crm-inbox-sender-block min-w-0 sm:w-[180px] sm:shrink-0"><p title={message.senderName} className={`crm-inbox-message-sender truncate text-sm ${message.isUnread ? "font-black" : "font-medium"} text-[#1A1A3E]`}>{message.senderName}</p><div className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-slate-400"><UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate" title={message.assignee}>{message.assignee}</span></div></div><div className="crm-inbox-subject-block min-w-0 flex-1"><div className="crm-inbox-subject-line flex min-w-0 flex-wrap items-center gap-2"><p title={message.subject} className={`crm-inbox-subject truncate text-sm ${message.isUnread ? "font-black" : "font-medium"} text-[#1A1A3E]`}>{message.subject}</p>{message.statusLabel && <span className="inline-flex shrink-0 rounded-full border border-[#F1D38A] bg-[#FFF8DE] px-2 py-0.5 text-[10px] font-black text-[#8A6415]">{message.statusLabel}</span>}</div><p title={message.preview} className="crm-inbox-message-preview-text mt-1 truncate text-xs font-medium text-slate-500">{message.preview}</p></div></div><div className="crm-inbox-message-source-inline mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-400 sm:hidden"><SourceIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{message.sourceLabel}</span></div></div><div className="crm-inbox-message-source-desktop hidden w-[118px] shrink-0 items-center gap-2 text-xs font-bold text-slate-400 sm:flex" title={message.sourceLabel}><SourceIcon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{message.sourceLabel}</span></div><time dateTime={message.dateTimeISO} title={message.dateLabel} aria-label={message.dateLabel} className="crm-inbox-message-date w-[72px] shrink-0 pt-1 text-left text-[11px] font-bold leading-4 text-slate-400 sm:pt-0"><span className="block break-words">{dateParts.date}</span>{dateParts.time && <span dir={dateParts.time.includes(":") ? "ltr" : undefined} className="mt-0.5 block whitespace-nowrap font-black leading-4 tabular-nums text-[#5267A8]">{dateParts.time}</span>}</time></div><AnimatePresence initial={false}>{active && <Preview message={message} detailId={detailId} triggerId={triggerId} onCollapse={() => onSelect(message.id)} appointmentActionState={appointmentActionState} actionFeedback={actionFeedback} onApproveAppointment={onApproveAppointment} onRejectAppointment={onRejectAppointment} rescheduleActionState={rescheduleActionState} rescheduleFeedback={rescheduleFeedback} onApproveReschedule={onApproveReschedule} onRejectReschedule={onRejectReschedule} />}</AnimatePresence></motion.div>;
}

function Preview({ message, detailId, triggerId, onCollapse, appointmentActionState, actionFeedback, onApproveAppointment, onRejectAppointment, rescheduleActionState, rescheduleFeedback, onApproveReschedule, onRejectReschedule }: PreviewProps) {
  const SourceIcon = sourceIcon(message);
  const feedback = actionFeedback?.messageId === message.id ? actionFeedback : null;
  const requestFeedback = rescheduleFeedback?.messageId === message.id ? rescheduleFeedback : null;
  return <motion.div id={detailId} role="region" aria-labelledby={triggerId} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="crm-inbox-message-expanded overflow-hidden border-t border-[#E7D88D] bg-[#FFFDF1]" aria-label="תוכן ההודעה"><div className="border-r-4 border-[#F2D162] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-extrabold text-[#5267A8]"><SourceIcon className="h-4 w-4" aria-hidden="true" />תוכן ההודעה · {message.sourceLabel}</span><button type="button" onClick={onCollapse} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-extrabold text-slate-500 transition hover:bg-white/80 hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><ChevronDown className="h-4 w-4 rotate-180" aria-hidden="true" />סגירת התוכן</button></div><h2 className="mt-4 text-lg font-black text-[#1A1A3E]">{message.subject}</h2><div className="mt-4 flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-black ${avatarClass(message)}`} aria-hidden="true">{avatarInitials(message)}</span><div className="min-w-0"><p className="truncate text-sm font-extrabold text-[#1A1A3E]">{message.senderName}</p><p className="mt-1 text-xs font-semibold text-slate-400">{message.assignee} · {message.dateLabel}</p></div></div>{message.statusLabel && <div role="status" className="mt-5 flex items-center gap-2 rounded-xl border border-[#F1D38A] bg-[#FFF8DE] px-3 py-2.5 text-sm font-black text-[#8A6415]"><RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />{message.statusLabel}</div>}<p className="mt-5 max-w-3xl whitespace-pre-wrap break-words text-sm font-medium leading-7 text-slate-600">{message.preview}</p>{message.detailRows && <dl className="mt-5 grid gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-4 sm:grid-cols-2">{message.detailRows.map((row) => <div key={row.label} className="rounded-xl bg-[#F7F8FA] px-3 py-2.5"><dt className="text-[11px] font-extrabold text-slate-400">{row.label}</dt><dd className="mt-1 text-sm font-black text-[#1A1A3E]">{row.value}</dd></div>)}</dl>}{message.kind === "appointment" && message.status === "requested" && <AppointmentDecisionActions message={message} state={appointmentActionState} feedback={feedback} onApprove={onApproveAppointment} onReject={onRejectAppointment} />}{message.kind === "reschedule_request" && message.status === "pending" && <RescheduleDecisionActions message={message} state={rescheduleActionState} feedback={requestFeedback} onApprove={onApproveReschedule} onReject={onRejectReschedule} />}</div></motion.div>;
}

export function CrmInboxMessageList({ messages, unreadCount, selectedIds, selectedMessageId, onToggleMessage, onMarkHandled, onSelectMessage, onSelectAll, onClearSelection, onRefresh, isRefreshing, emptyStateTitle, emptyStateBody, inboxActionState, inboxActionFeedback, onInboxAction, appointmentActionState, actionFeedback, onApproveAppointment, onRejectAppointment, rescheduleActionState, rescheduleFeedback, onApproveReschedule, onRejectReschedule }: CrmInboxMessageListProps) {
  const actionDisabled = selectedIds.size === 0 || Boolean(inboxActionState);
  const actionTitle = inboxActionState ? "הפעולה מתבצעת" : selectedIds.size === 0 ? "יש לבחור לפחות הודעה אחת" : "בחירת פעולה להודעות שנבחרו";
  const actionStatus = inboxActionState === "reply" ? "פותח את חלון המענה..." : inboxActionState === "archive" ? "מעביר את ההודעות לארכיון..." : inboxActionState === "delete" ? "מעביר את ההודעות לאשפה..." : selectedIds.size > 0 ? `${selectedIds.size} הודעות נבחרו לפעולה` : "יש לבחור לפחות הודעה אחת כדי להפעיל פעולה";

  return <section id="crm-inbox-message-list" className={`crm-inbox-message-list${selectedIds.size > 0 || inboxActionFeedback ? " has-selection" : ""} min-w-0 overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_10px_30px_-24px_rgba(26,26,62,0.65)]`} aria-label="רשימת הודעות"><div className="crm-inbox-list-toolbar-header border-b border-[#EEF0F3] px-3 py-3 sm:px-5"><div className="crm-inbox-toolbar flex flex-wrap items-center justify-between gap-3"><div className="crm-inbox-toolbar-help flex min-h-10 items-center gap-2 rounded-lg border border-[#E1E4E8] bg-[#F7F8FA] px-3 text-xs font-extrabold text-[#1A1A3E]"><ListFilter className="h-4 w-4 text-slate-500" aria-hidden="true" /><span>פתיחת הודעה מסמנת אותה כטופלה</span></div><div className="crm-inbox-toolbar-controls flex min-w-0 items-center gap-2"><label className="crm-inbox-select-all relative flex min-h-10 items-center rounded-lg border border-[#E1E4E8] bg-[#F7F8FA] px-3 text-xs font-extrabold text-[#1A1A3E]"><select defaultValue="" onChange={(event) => { if (event.target.value === "all") onSelectAll(); if (event.target.value === "clear") onClearSelection(); event.currentTarget.value = ""; }} className="h-8 appearance-none bg-transparent pl-5 text-xs font-extrabold text-[#1A1A3E] outline-none" aria-label="סימון הודעות"><option value="">סימון</option><option value="all">סימון כל ההודעות המוצגות</option><option value="clear">ניקוי הבחירה</option></select><ChevronDown className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" /></label><button type="button" onClick={onRefresh} disabled={isRefreshing} className="crm-inbox-refresh flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E1E4E8] bg-[#F7F8FA] text-slate-500 transition hover:border-[#CBD2DB] hover:bg-white hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-wait disabled:opacity-60" aria-label="רענון תיבת הדואר" title="רענון תיבת הדואר"><RefreshCw className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" /></button><label className={`crm-inbox-action-select relative flex min-h-10 items-center rounded-lg border px-3 text-xs font-extrabold ${actionDisabled ? "cursor-not-allowed border-[#E1E4E8] bg-[#F7F8FA] text-slate-400" : "border-[#DCE2F4] bg-[#F8F9FF] text-[#5267A8]"}`}><select defaultValue="" disabled={actionDisabled} onChange={(event) => { const action = event.target.value as InboxBulkAction; if (action) void onInboxAction(action); event.currentTarget.value = ""; }} className="h-8 max-w-[132px] appearance-none bg-transparent pl-5 text-xs font-extrabold outline-none disabled:cursor-not-allowed" aria-label="בחירת פעולה" aria-describedby="inbox-action-help" title={actionTitle}><option value="">בחירת פעולה</option><option value="reply">מענה</option><option value="archive">העברה לארכיון</option><option value="delete">מחיקה</option></select><ChevronDown className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" /></label></div></div><p id="inbox-action-help" role="status" aria-live="polite" className="crm-inbox-action-help mt-2 text-[11px] font-semibold text-slate-400">{actionStatus}</p>{inboxActionFeedback && <BulkActionFeedback feedback={inboxActionFeedback} />}<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-400"><div className="flex flex-wrap items-center gap-2"><span>{messages.length > 0 ? `${messages.length} הודעות מוצגות` : "אין הודעות להצגה"}</span>{unreadCount > 0 && <><span aria-hidden="true">·</span><span className="font-extrabold text-[#5267A8]">{unreadCount} לא נקראו</span></>}</div>{selectedIds.size > 0 && <span className="text-[#5267A8]">{selectedIds.size} נבחרו במסך זה בלבד</span>}</div></div>{messages.length === 0 ? <EmptyState title={emptyStateTitle} body={emptyStateBody} /> : <div className="crm-inbox-message-items" role="list" aria-label="הודעות בתיבת הדואר">{messages.map((message, index) => { const domToken = `${index}-${Math.abs(hash(message.id))}`; const detailId = `crm-inbox-detail-${domToken}`; const triggerId = `crm-inbox-trigger-${domToken}`; return <MessageRow key={message.id} message={message} index={index} selected={selectedIds.has(message.id)} active={selectedMessageId === message.id} detailId={detailId} triggerId={triggerId} onToggle={onToggleMessage} onMarkHandled={onMarkHandled} onSelect={onSelectMessage} appointmentActionState={appointmentActionState} actionFeedback={actionFeedback} onApproveAppointment={onApproveAppointment} onRejectAppointment={onRejectAppointment} rescheduleActionState={rescheduleActionState} rescheduleFeedback={rescheduleFeedback} onApproveReschedule={onApproveReschedule} onRejectReschedule={onRejectReschedule} />; })}</div>}</section>;
}
