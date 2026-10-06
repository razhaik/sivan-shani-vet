import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail, Send, Users, X } from "lucide-react";
import { sendEmail } from "@/integrations/core";
import { Textarea } from "@/components/ui/textarea";
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
import type { InboxMessage } from "@/components/business-crm/CrmInboxMessageList";

const MAX_SUBJECT_LENGTH = 180;
const MAX_BODY_LENGTH = 8000;

export interface InboxReplyResult {
  sent: number;
  skipped: number;
  invalid: number;
  duplicate: number;
  failed: number;
  sentMessageIds: string[];
  failedAddresses: string[];
}

interface InboxReplyComposerProps {
  selectedMessages: InboxMessage[];
  senderName: string;
  onClose: () => void;
  onSuccess: (result: InboxReplyResult) => void | Promise<void>;
}

interface ReplyRecipient {
  address: string;
  name: string;
  messageIds: string[];
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainTextToHtml(value: string): string {
  const blocks: string[] = [];
  let lines: string[] = [];
  const flush = () => {
    if (!lines.length) return;
    blocks.push(`<p style="margin:0 0 14px;line-height:1.75;">${lines.join("<br />")}</p>`);
    lines = [];
  };

  value.trim().split(/\r?\n/).forEach((line) => {
    if (line.trim()) lines.push(escapeHtml(line));
    else flush();
  });
  flush();

  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;color:#1A1A3E;font-size:16px;line-height:1.75;">${blocks.join("")}</div>`;
}

function emailSendFailed(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const payload = result as Record<string, unknown>;
  return Boolean(payload.error) || payload.success === false || payload.status === "error" || payload.status === "failed";
}

function actionFeedbackClass(tone: "success" | "partial" | "error") {
  if (tone === "success") return "border-green-200 bg-green-50 text-green-900";
  if (tone === "partial") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-red-200 bg-red-50 text-red-900";
}

export default function InboxReplyComposer({ selectedMessages, senderName, onClose, onSuccess }: InboxReplyComposerProps) {
  const [subject, setSubject] = useState("מענה מהמרפאה הווטרינרית");
  const [body, setBody] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ sent: 0, failed: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isSending || reviewOpen) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isSending, onClose, reviewOpen]);

  const recipientAnalysis = useMemo(() => {
    const byAddress = new Map<string, ReplyRecipient>();
    let invalid = 0;
    let duplicate = 0;

    selectedMessages.forEach((message) => {
      const address = (message.recipientEmail || "").trim();
      if (!isValidEmail(address)) {
        invalid += 1;
        return;
      }
      const normalized = address.toLocaleLowerCase("en-US");
      const existing = byAddress.get(normalized);
      if (existing) {
        duplicate += 1;
        if (!existing.messageIds.includes(message.id)) existing.messageIds.push(message.id);
        return;
      }
      byAddress.set(normalized, {
        address,
        name: message.senderName,
        messageIds: [message.id],
      });
    });

    return {
      recipients: Array.from(byAddress.values()),
      invalid,
      duplicate,
    };
  }, [selectedMessages]);

  const recipients = recipientAnalysis.recipients;
  const skipped = recipientAnalysis.invalid + recipientAnalysis.duplicate;
  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  const canReview = recipients.length > 0 && Boolean(trimmedSubject) && Boolean(trimmedBody) && subject.length <= MAX_SUBJECT_LENGTH && body.length <= MAX_BODY_LENGTH;
  const validationMessage = !recipients.length
    ? "אין בהודעות שנבחרו כתובת אימייל תקינה לשליחה."
    : !trimmedSubject
      ? "יש להוסיף נושא לאימייל."
      : !trimmedBody
        ? "יש לכתוב את תוכן המענה."
        : subject.length > MAX_SUBJECT_LENGTH
          ? `הנושא ארוך מדי. אפשר להשתמש בעד ${MAX_SUBJECT_LENGTH} תווים.`
          : body.length > MAX_BODY_LENGTH
            ? `תוכן המענה ארוך מדי. אפשר להשתמש בעד ${MAX_BODY_LENGTH} תווים.`
            : "";

  const openReview = () => {
    if (!canReview) {
      setError(validationMessage);
      return;
    }
    setError("");
    setReviewOpen(true);
  };

  const handleSend = async () => {
    if (!canReview || isSending) return;
    setIsSending(true);
    setError("");
    setSendProgress({ sent: 0, failed: 0 });

    const htmlBody = plainTextToHtml(trimmedBody);
    let sent = 0;
    let failed = 0;
    const sentMessageIds: string[] = [];
    const failedAddresses: string[] = [];

    for (const recipient of recipients) {
      try {
        const result = await sendEmail({
          to: recipient.address,
          subject: trimmedSubject,
          body_html: htmlBody,
          from_name: senderName,
        }) as unknown;
        if (emailSendFailed(result)) {
          const payload = result as Record<string, unknown>;
          throw new Error(String(payload.error || "שירות האימייל לא אישר את השליחה."));
        }
        sent += 1;
        sentMessageIds.push(...recipient.messageIds);
      } catch (sendError) {
        failed += 1;
        failedAddresses.push(recipient.address);
        console.error("Inbox reply recipient failed:", sendError);
      }
      setSendProgress({ sent, failed });
    }

    setReviewOpen(false);
    try {
      await onSuccess({
        sent,
        skipped,
        invalid: recipientAnalysis.invalid,
        duplicate: recipientAnalysis.duplicate,
        failed,
        sentMessageIds,
        failedAddresses,
      });
    } catch (callbackError) {
      console.error("Inbox reply follow-up failed:", callbackError);
      setError("המענה נשלח, אך לא הצלחנו להשלים את רענון תיבת הדואר. אפשר לרענן ולבדוק את הרשומות.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1A1A3E]/[0.52] p-3 backdrop-blur-[3px] sm:p-5"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSending) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-reply-title"
        aria-describedby="inbox-reply-description"
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-[1.5rem] border border-[#E1E4E8] bg-[#FFFDFB] p-4 text-[#1A1A3E] shadow-[0_24px_80px_-30px_rgba(26,26,62,0.5)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E9EEF9] text-[#5267A8]"><Mail className="h-5 w-5" aria-hidden="true" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-black tracking-[0.16em] text-[#5267A8]">תיבת הדואר · מענה</p>
              <h2 id="inbox-reply-title" className="mt-1 text-xl font-black leading-tight sm:text-2xl">כתיבת מענה ללקוחות</h2>
              <p id="inbox-reply-description" className="mt-1 text-xs font-medium leading-5 text-slate-500">המענה יישלח באימייל אחד לכל כתובת ייחודית, לאחר בדיקה ואישור סופיים.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSending} aria-label="סגירת חלון המענה" className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-[#F2F4F7] hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2" aria-label="סיכום נמעני המענה">
          <div className="rounded-2xl bg-[#F7F8FA] p-3 text-center"><p className="text-xl font-black text-[#1A1A3E]">{selectedMessages.length}</p><p className="text-[10px] font-bold text-slate-500">נבחרו</p></div>
          <div className="rounded-2xl bg-[#EEF2FB] p-3 text-center"><p className="text-xl font-black text-[#5267A8]">{recipients.length}</p><p className="text-[10px] font-bold text-[#5267A8]">כתובות ייחודיות</p></div>
          <div className="rounded-2xl bg-[#FFF8E6] p-3 text-center"><p className="text-xl font-black text-[#8A6B19]">{skipped}</p><p className="text-[10px] font-bold text-[#8A6B19]">לא יישלחו</p></div>
        </div>

        <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black text-[#1A1A3E]">נמענים תקינים</p>
            <span className="text-[11px] font-bold text-slate-400">{recipients.length} כתובות</span>
          </div>
          {recipients.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">
            {recipients.slice(0, 8).map((recipient) => <span key={recipient.address.toLocaleLowerCase("en-US")} dir="ltr" title={recipient.name} className="max-w-full rounded-full border border-[#DCE2F4] bg-[#F8F9FF] px-2.5 py-1 text-[11px] font-bold text-[#5267A8]">{recipient.address}</span>)}
            {recipients.length > 8 && <span className="rounded-full bg-[#F7F8FA] px-2.5 py-1 text-[11px] font-bold text-slate-500">ועוד {recipients.length - 8}</span>}
          </div> : <p className="mt-2 text-xs font-semibold text-slate-500">לא נמצאה כתובת שאפשר לשלוח אליה.</p>}
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="inbox-reply-subject" className="block text-sm font-black text-[#1A1A3E]">נושא האימייל</label>
            <input id="inbox-reply-subject" value={subject} maxLength={MAX_SUBJECT_LENGTH + 1} onChange={(event) => setSubject(event.target.value)} placeholder="לדוגמה: מענה לפנייה שלך למרפאה" className="mt-2 h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#AAB7DD] focus:ring-2 focus:ring-[#DCE2F4]" />
            <p className={`mt-1 text-[11px] font-medium ${subject.length > MAX_SUBJECT_LENGTH ? "text-red-600" : "text-slate-400"}`}>{subject.length}/{MAX_SUBJECT_LENGTH} תווים</p>
          </div>

          <div>
            <label htmlFor="inbox-reply-body" className="flex items-center justify-between gap-3 text-sm font-black text-[#1A1A3E]"><span>תוכן המענה</span><span className={body.length > MAX_BODY_LENGTH ? "text-red-600" : "text-slate-400"}>{body.length}/{MAX_BODY_LENGTH}</span></label>
            <Textarea id="inbox-reply-body" value={body} maxLength={MAX_BODY_LENGTH + 1} onChange={(event) => setBody(event.target.value)} placeholder="כתבי כאן את המענה ללקוח. שורות ריקות יופרדו לפסקאות." rows={8} className="mt-2 resize-y rounded-2xl border-[#D9DEE5] text-right leading-relaxed focus:border-[#AAB7DD] focus:ring-[#DCE2F4]" />
            <p className="mt-1 text-[11px] font-medium leading-5 text-slate-400">הטקסט יישלח כפי שנכתב, ללא אפשרות להוסיף קוד או עיצוב HTML.</p>
          </div>
        </div>

        {recipientAnalysis.invalid > 0 && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#F4E5B7] bg-[#FFFBEE] p-3 text-xs font-bold leading-5 text-[#785D17]"><Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{recipientAnalysis.invalid} הודעות יידלגו בגלל כתובת אימייל חסרה או לא תקינה.</div>}
        {recipientAnalysis.duplicate > 0 && <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-3 text-xs font-bold leading-5 text-slate-600"><Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{recipientAnalysis.duplicate} הודעות חולקות כתובת עם הודעה אחרת. תישלח תגובה אחת לכל כתובת.</div>}
        {recipients.length === 0 && <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-[#F4E5B7] bg-[#FFFBEE] p-3 text-xs font-bold leading-5 text-[#785D17]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />אפשר לסגור את החלון ולבחור הודעות עם כתובת אימייל, או להשלים את הכתובת ברשומת הלקוח.</div>}
        {isSending && <p role="status" aria-live="polite" className="mt-4 flex items-center gap-2 text-xs font-bold text-[#5267A8]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />נשלחו {sendProgress.sent} מתוך {recipients.length}. נכשלו {sendProgress.failed} עד עכשיו.</p>}
        {error && <div role="alert" className={`mt-4 flex items-start gap-2 rounded-2xl border p-3 text-sm font-bold leading-5 ${actionFeedbackClass("error")}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</div>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
          <button type="button" onClick={onClose} disabled={isSending} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm font-black text-[#1A1A3E] transition hover:bg-[#F7F8FA] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50">ביטול</button>
          <button type="button" onClick={openReview} disabled={isSending} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1A1A3E] px-5 text-sm font-black text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-wait disabled:opacity-50"><Send className="ml-2 h-4 w-4" aria-hidden="true" />בדיקה לפני שליחה</button>
        </div>

        <AlertDialog open={reviewOpen} onOpenChange={(open) => { if (!isSending) setReviewOpen(open); }}>
          <AlertDialogContent dir="rtl" className="max-w-lg rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-right">אישור סופי לשליחת המענה</AlertDialogTitle>
              <AlertDialogDescription className="text-right leading-relaxed">המענה יישלח ל-{recipients.length} כתובות ייחודיות. {skipped > 0 ? `${skipped} הודעות לא ייכללו בשליחה.` : "כל ההודעות שנבחרו כוללות כתובת תקינה."}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 text-right">
              <div className="rounded-2xl border border-[#DCE2F4] bg-[#F8F9FF] p-3"><p className="text-[11px] font-extrabold text-[#5267A8]">נושא</p><p className="mt-1 break-words text-sm font-black text-[#1A1A3E]">{trimmedSubject}</p></div>
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3"><p className="mb-2 text-[11px] font-extrabold text-slate-400">נמענים</p><p dir="ltr" className="max-h-20 overflow-y-auto break-words text-left text-xs font-bold leading-5 text-slate-600">{recipients.map((recipient) => recipient.address).join(", ")}</p></div>
              <div className="max-h-48 overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-3"><p className="mb-2 text-[11px] font-extrabold text-slate-400">תצוגה מקדימה</p><p className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-700">{trimmedBody}</p></div>
            </div>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleSend(); }} disabled={isSending} className="bg-[#1A1A3E] font-black text-white hover:bg-[#2A2A5A]">{isSending ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />שולח...</> : <><CheckCircle2 className="ml-2 h-4 w-4" />אישור ושליחה</>}</AlertDialogAction>
              <AlertDialogCancel disabled={isSending} className="font-black">חזרה לעריכה</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
