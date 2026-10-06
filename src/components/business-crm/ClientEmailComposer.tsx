import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail, Send, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { sendEmail } from "@/integrations/core";
import { buildMarketingEmailHtml } from "@/lib/emailTemplates";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

const MAX_SUBJECT_LENGTH = 180;
const MAX_BODY_LENGTH = 8000;

interface ClientEmailComposerProps {
  open: boolean;
  clientName: string;
  email: string;
  canEditProfile?: boolean;
  onEditProfile?: () => void;
  onClose: () => void;
  onSent: () => void | Promise<void>;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value.trim());
}

function emailSendFailed(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const payload = result as Record<string, unknown>;
  return Boolean(payload.error) || payload.success === false || payload.status === "error" || payload.status === "failed";
}

function friendlySendError(error: unknown): string {
  console.error("Client email send failed:", error);
  return "לא הצלחנו לשלוח את האימייל. בדקי את כתובת הלקוח ונסי שוב.";
}

export function ClientEmailComposer({ open, clientName, email, canEditProfile = false, onEditProfile, onClose, onSent }: ClientEmailComposerProps) {
  const [subject, setSubject] = useState("עדכון מהמרפאה");
  const [body, setBody] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const recipient = email.trim();
  const recipientValid = isValidEmail(recipient);
  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  const canReview = recipientValid && Boolean(trimmedSubject) && Boolean(trimmedBody) && subject.length <= MAX_SUBJECT_LENGTH && body.length <= MAX_BODY_LENGTH;
  const validationMessage = !recipientValid
    ? "אי אפשר לשלוח בלי כתובת אימייל תקינה בתיק הלקוח."
    : !trimmedSubject
      ? "יש להוסיף נושא לאימייל."
      : !trimmedBody
        ? "יש לכתוב את תוכן ההודעה."
        : subject.length > MAX_SUBJECT_LENGTH
          ? `הנושא ארוך מדי. אפשר להשתמש בעד ${MAX_SUBJECT_LENGTH} תווים.`
          : body.length > MAX_BODY_LENGTH
            ? `תוכן ההודעה ארוך מדי. אפשר להשתמש בעד ${MAX_BODY_LENGTH} תווים.`
            : "";

  useEffect(() => {
    if (!open) return;
    setSubject("עדכון מהמרפאה");
    setBody("");
    setError("");
    setReviewOpen(false);
  }, [email, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSending && !reviewOpen) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isSending, onClose, open, reviewOpen]);

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
    const htmlBody = buildMarketingEmailHtml({
      clinicName: VETERINARY_CLINIC_PROFILE.businessName,
      clinicTagline: VETERINARY_CLINIC_PROFILE.tagline,
      title: trimmedSubject,
      subtitle: `שלום ${clientName.trim() || ""},`,
      body: trimmedBody,
    });
    try {
      const result = await sendEmail({ to: recipient, subject: trimmedSubject, body_html: htmlBody }) as unknown;
      if (emailSendFailed(result)) throw new Error("email delivery failed");
      setReviewOpen(false);
      await onSent();
      onClose();
    } catch (sendError) {
      setReviewOpen(false);
      setError(friendlySendError(sendError));
    } finally {
      setIsSending(false);
    }
  };

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1A1A3E]/[0.52] p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSending && !reviewOpen) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="client-email-title" aria-describedby="client-email-description" aria-busy={isSending} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#DCE7E8] bg-[#FFFDFB] p-5 text-[#152E4D] shadow-2xl sm:p-6">
        <header className="flex items-start justify-between gap-4 border-b border-[#E5EEF0] pb-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF0FF] text-[#5267A8]"><Mail className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-black tracking-[0.14em] text-[#5267A8]">תקשורת עם הלקוח</p>
              <h2 id="client-email-title" className="mt-1 text-xl font-black leading-tight sm:text-2xl">שליחת אימייל ל{clientName}</h2>
              <p id="client-email-description" className="mt-1 text-xs font-medium leading-5 text-slate-500">ההודעה תישלח לנמען אחד, לאחר בדיקה ואישור סופיים. הטקסט יעבור דרך תבנית האימייל של המרפאה.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSending} aria-label="סגירת כתיבת האימייל" className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-[#F2F4F7] hover:text-[#152E4D] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40"><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>

        <div className="mt-5 rounded-2xl border border-[#DCE2F4] bg-[#F8F9FF] p-3.5">
          <p className="text-[11px] font-extrabold text-[#5267A8]">נמען</p>
          {recipientValid ? <div className="mt-1 flex flex-wrap items-center gap-2"><span className="font-black text-[#152E4D]">{clientName}</span><span dir="ltr" className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#5267A8]">{recipient}</span></div> : <div className="mt-2 flex items-start gap-2 text-xs font-bold leading-5 text-[#785D17]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p>אין בתיק כתובת אימייל תקינה, ולכן השליחה אינה זמינה.</p><p className="mt-1 font-medium">הוסיפי או תקני את הכתובת בעריכת תיק הלקוח לפני השליחה.</p>{canEditProfile && onEditProfile && <button type="button" onClick={onEditProfile} className="mt-2 rounded-lg border border-[#C6D2EF] bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#5267A8] transition hover:border-[#5267A8] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">עריכת תיק הלקוח</button>}</div></div>}
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="client-email-subject" className="flex items-center justify-between gap-3 text-sm font-black"><span>נושא האימייל</span><span className={subject.length > MAX_SUBJECT_LENGTH ? "text-red-600" : "text-slate-400"}>{subject.length}/{MAX_SUBJECT_LENGTH}</span></label>
            <input id="client-email-subject" value={subject} maxLength={MAX_SUBJECT_LENGTH + 1} onChange={(event) => { setSubject(event.target.value); setError(""); }} disabled={isSending || !recipientValid} className="mt-2 h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-[#5267A8]/50 focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:bg-[#F7F8FA] disabled:text-slate-400" placeholder="לדוגמה: עדכון חשוב מהמרפאה" />
          </div>
          <div>
            <label htmlFor="client-email-body" className="flex items-center justify-between gap-3 text-sm font-black"><span>תוכן ההודעה</span><span className={body.length > MAX_BODY_LENGTH ? "text-red-600" : "text-slate-400"}>{body.length}/{MAX_BODY_LENGTH}</span></label>
            <Textarea id="client-email-body" value={body} maxLength={MAX_BODY_LENGTH + 1} onChange={(event) => { setBody(event.target.value); setError(""); }} disabled={isSending || !recipientValid} rows={8} className="mt-2 resize-y rounded-2xl border-[#D4E0E2] text-right text-sm font-semibold leading-6 focus:border-[#5267A8]/50 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:bg-[#F7F8FA] disabled:text-slate-400" placeholder="כתבי כאן את ההודעה ללקוח. שורות ריקות יופרדו לפסקאות." />
            <p className="mt-1 text-[11px] font-medium leading-5 text-slate-400">הטקסט נשמר כטקסט פשוט בלבד ומעוצב בתוך תבנית האימייל המאושרת של המרפאה.</p>
          </div>
        </div>

        {error && <div role="alert" aria-live="assertive" className="mt-4 flex items-start gap-2 rounded-2xl border border-[#F3D0D0] bg-[#FFF8F8] p-3 text-xs font-extrabold leading-5 text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {isSending && <p role="status" aria-live="polite" className="mt-4 flex items-center gap-2 text-xs font-bold text-[#5267A8]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />שולחים את האימייל ללקוח...</p>}

        <footer className="mt-5 flex flex-col-reverse gap-2 border-t border-[#E5EEF0] pt-4 sm:flex-row sm:justify-start">
          <button type="button" onClick={onClose} disabled={isSending} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#CAD8DA] bg-white px-5 text-sm font-extrabold text-[#152E4D] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50">ביטול</button>
          <button type="button" onClick={openReview} disabled={isSending || !recipientValid} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#152E4D] px-5 text-sm font-extrabold text-white transition hover:bg-[#244568] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" aria-hidden="true" />בדיקה לפני שליחה</button>
        </footer>

        <AlertDialog open={reviewOpen} onOpenChange={(nextOpen) => { if (!isSending) setReviewOpen(nextOpen); }}>
          <AlertDialogContent dir="rtl" className="z-[160] max-w-lg rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-right">אישור סופי לשליחת האימייל</AlertDialogTitle>
              <AlertDialogDescription className="text-right leading-relaxed">האימייל יישלח ללקוח אחד. בדקי את הנמען ואת תוכן ההודעה לפני השליחה.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 text-right">
              <div className="rounded-2xl border border-[#DCE2F4] bg-[#F8F9FF] p-3"><p className="text-[11px] font-extrabold text-[#5267A8]">נמען</p><p className="mt-1 break-words text-sm font-black text-[#152E4D]">{clientName}</p><p dir="ltr" className="mt-1 break-all text-left text-xs font-bold text-[#5267A8]">{recipient}</p></div>
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3"><p className="text-[11px] font-extrabold text-slate-400">נושא</p><p className="mt-1 break-words text-sm font-black text-[#152E4D]">{trimmedSubject}</p></div>
              <div className="max-h-48 overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-3"><p className="mb-2 text-[11px] font-extrabold text-slate-400">תצוגה מקדימה</p><p className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-700">{trimmedBody}</p></div>
            </div>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleSend(); }} disabled={isSending} className="bg-[#152E4D] font-black text-white hover:bg-[#244568]">{isSending ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />שולחים...</> : <><CheckCircle2 className="ml-2 h-4 w-4" />אישור ושליחה</>}</AlertDialogAction>
              <AlertDialogCancel disabled={isSending} className="font-black">חזרה לעריכה</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
      {reviewOpen && <div className="fixed inset-0 z-[140] bg-[#1A1A3E]/[0.38]" aria-hidden="true" />}
    </div>
  );
}
