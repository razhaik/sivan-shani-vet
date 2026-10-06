import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail, Send, Users, X } from "lucide-react";
import { sendEmail } from "@/integrations/core";
import { Button } from "@/components/ui/button";
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
import type { ClientRow } from "@/lib/crmClientData";

const MAX_SUBJECT_LENGTH = 180;
const MAX_BODY_LENGTH = 8000;

export interface BulkEmailResult {
  sent: number;
  skipped: number;
  failed: number;
}

interface BulkEmailComposerProps {
  selectedClients: ClientRow[];
  senderName: string;
  onClose: () => void;
  onSuccess: (result: BulkEmailResult) => void;
}

interface EmailRecipient {
  address: string;
  name: string;
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

export default function BulkEmailComposer({ selectedClients, senderName, onClose, onSuccess }: BulkEmailComposerProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ sent: 0, failed: 0 });
  const [error, setError] = useState("");

  const recipients = useMemo<EmailRecipient[]>(() => {
    const byAddress = new Map<string, EmailRecipient>();
    selectedClients.forEach((client) => {
      const address = client.email.trim();
      if (!isValidEmail(address)) return;
      const normalized = address.toLocaleLowerCase("en-US");
      if (!byAddress.has(normalized)) byAddress.set(normalized, { address, name: client.name });
    });
    return Array.from(byAddress.values());
  }, [selectedClients]);

  const skippedCount = Math.max(0, selectedClients.length - recipients.length);
  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  const canReview = recipients.length > 0 && Boolean(trimmedSubject) && Boolean(trimmedBody) && subject.length <= MAX_SUBJECT_LENGTH && body.length <= MAX_BODY_LENGTH;

  const openReview = () => {
    if (!canReview) return;
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
      } catch (sendError) {
        failed += 1;
        console.error("Bulk email recipient failed:", sendError);
      }
      setSendProgress({ sent, failed });
    }

    setReviewOpen(false);
    onSuccess({ sent, skipped: skippedCount, failed });
    setIsSending(false);
  };

  return (
    <section role="dialog" aria-labelledby="bulk-email-title" aria-describedby="bulk-email-description" className="rounded-3xl border border-[#E6DDF4] bg-white p-4 shadow-[0_18px_50px_-34px_rgba(83,58,120,0.55)] sm:p-5" dir="rtl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F5F0FB] text-[#705493]"><Mail className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 id="bulk-email-title" className="text-base font-black text-[#1A1A3E]">שליחת אימייל ללקוחות שנבחרו</h2>
            <p id="bulk-email-description" className="mt-1 text-xs font-medium leading-5 text-slate-500">נשלח אימייל אחד לכל כתובת תקינה וייחודית. רשומות בלי אימייל תקין יישארו ללא שליחה.</p>
          </div>
        </div>
        <button type="button" onClick={onClose} disabled={isSending} aria-label="סגירת כתיבת אימייל" className="rounded-xl p-2 text-slate-400 transition hover:bg-[#F7F7F7] hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40"><X className="h-5 w-5" /></button>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2" aria-label="סיכום נמעני אימייל">
        <div className="rounded-2xl bg-[#FBFCFD] p-3 text-center"><p className="text-xl font-black text-[#1A1A3E]">{selectedClients.length}</p><p className="text-[10px] font-bold text-slate-500">נבחרו</p></div>
        <div className="rounded-2xl bg-[#F5F0FB] p-3 text-center"><p className="text-xl font-black text-[#705493]">{recipients.length}</p><p className="text-[10px] font-bold text-[#705493]">נמענים ייחודיים</p></div>
        <div className="rounded-2xl bg-[#FFF8E6] p-3 text-center"><p className="text-xl font-black text-[#8A6B19]">{skippedCount}</p><p className="text-[10px] font-bold text-[#8A6B19]">יידלגו</p></div>
      </div>

      <div className="space-y-4">
        <label htmlFor="bulk-email-subject" className="block text-sm font-black text-[#1A1A3E]">נושא האימייל</label>
        <div>
          <input id="bulk-email-subject" value={subject} maxLength={MAX_SUBJECT_LENGTH + 1} onChange={(event) => setSubject(event.target.value)} placeholder="לדוגמה: עדכון חשוב מהמרפאה" className="h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#B9A4D2] focus:ring-2 focus:ring-[#E6DDF4]" />
          <p className={`mt-1 text-[11px] font-medium ${subject.length > MAX_SUBJECT_LENGTH ? "text-red-600" : "text-slate-400"}`}>{subject.length}/{MAX_SUBJECT_LENGTH} תווים</p>
        </div>

        <div>
          <label htmlFor="bulk-email-body" className="flex items-center justify-between gap-3 text-sm font-black text-[#1A1A3E]"><span>תוכן ההודעה</span><span className={body.length > MAX_BODY_LENGTH ? "text-red-600" : "text-slate-400"}>{body.length}/{MAX_BODY_LENGTH}</span></label>
          <Textarea id="bulk-email-body" value={body} maxLength={MAX_BODY_LENGTH + 1} onChange={(event) => setBody(event.target.value)} placeholder="כתבי כאן את ההודעה. שורות ריקות יופרדו לפסקאות, והטקסט יישלח כאימייל בטוח לקריאה." rows={7} className="mt-2 resize-y rounded-2xl border-[#D9DEE5] text-right leading-relaxed focus:border-[#B9A4D2] focus:ring-[#E6DDF4]" />
          <p className="mt-1 text-[11px] font-medium leading-5 text-slate-400">הטקסט יישלח כפי שנכתב, ללא אפשרות להוסיף קוד או עיצוב HTML.</p>
        </div>
      </div>

      {skippedCount > 0 && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#F4E5B7] bg-[#FFFBEE] p-3 text-xs font-bold leading-5 text-[#785D17]"><Users className="mt-0.5 h-4 w-4 shrink-0" />{skippedCount} רשומות יידלגו בגלל כתובת חסרה, לא תקינה או כפולה.</div>}
      {recipients.length === 0 && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#F4E5B7] bg-[#FFFBEE] p-3 text-xs font-bold leading-5 text-[#785D17]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />אין בין הלקוחות שנבחרו כתובת אימייל תקינה וייחודית לשליחה.</div>}
      {isSending && <p role="status" aria-live="polite" className="mt-4 text-xs font-bold text-[#705493]">נשלחו {sendProgress.sent} מתוך {recipients.length}. נכשלו {sendProgress.failed} עד עכשיו.</p>}
      {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSending} className="h-11 rounded-xl border-[#D9DEE5] font-black">ביטול</Button>
        <Button type="button" onClick={openReview} disabled={!canReview || isSending} className="h-11 rounded-xl bg-[#705493] font-black text-white hover:bg-[#5E467A] focus-visible:ring-[#F2D162] disabled:opacity-50"><Send className="ml-2 h-4 w-4" />בדיקה לפני שליחה</Button>
      </div>

      <AlertDialog open={reviewOpen} onOpenChange={(open) => { if (!isSending) setReviewOpen(open); }}>
        <AlertDialogContent dir="rtl" className="max-w-lg rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">אישור סופי לשליחת אימייל</AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-relaxed">האימייל יישלח ל-{recipients.length} כתובות ייחודיות. {skippedCount > 0 ? `${skippedCount} רשומות יידלגו.` : "כל הרשומות שנבחרו כוללות כתובת תקינה."}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-right">
            <div className="rounded-2xl border border-[#E6DDF4] bg-[#FBF9FE] p-3"><p className="text-[11px] font-extrabold text-[#705493]">נושא</p><p className="mt-1 break-words text-sm font-black text-[#1A1A3E]">{trimmedSubject}</p></div>
            <div className="max-h-48 overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-3"><p className="mb-2 text-[11px] font-extrabold text-slate-400">תצוגה מקדימה</p><p className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-700">{trimmedBody}</p></div>
          </div>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleSend(); }} disabled={isSending} className="bg-[#705493] font-black text-white hover:bg-[#5E467A]">{isSending ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />שולח...</> : <><CheckCircle2 className="ml-2 h-4 w-4" />אישור ושליחה</>}</AlertDialogAction>
            <AlertDialogCancel disabled={isSending} className="font-black">חזרה לעריכה</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
