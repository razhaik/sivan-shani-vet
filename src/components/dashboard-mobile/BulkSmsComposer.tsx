import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare, Send, ShieldCheck, X } from "lucide-react";
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
import { sendBulkClientSms } from "@/functions";

const MAX_MESSAGE_LENGTH = 500;

export interface BulkSmsClient {
  key: string;
  name: string;
  eligiblePhones: string[];
}

export interface BulkSmsResult {
  sent: number;
  skipped: number;
  failed: number;
  message?: string;
}

interface BulkSmsComposerProps {
  selectedClients: BulkSmsClient[];
  onClose: () => void;
  onSuccess: (result: BulkSmsResult) => void;
}

export default function BulkSmsComposer({ selectedClients, onClose, onSuccess }: BulkSmsComposerProps) {
  const [message, setMessage] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const eligiblePhoneCount = useMemo(
    () => new Set(selectedClients.flatMap((client) => client.eligiblePhones)).size,
    [selectedClients],
  );
  const eligibleClientCount = selectedClients.filter((client) => client.eligiblePhones.length > 0).length;
  const skippedCount = selectedClients.length - eligibleClientCount;
  const trimmedMessage = message.trim();
  const canReview = selectedClients.length > 0 && eligiblePhoneCount > 0 && trimmedMessage.length > 0 && message.length <= MAX_MESSAGE_LENGTH;

  const openReview = () => {
    if (!canReview) return;
    setError("");
    setReviewOpen(true);
  };

  const handleSend = async () => {
    if (!canReview || isSending) return;
    setIsSending(true);
    setError("");
    try {
      const result = await sendBulkClientSms({
        customer_keys: selectedClients.map((client) => client.key),
        message: trimmedMessage,
      });
      if (!result || result.error) throw new Error("bulk send failed");
      onSuccess({
        sent: Number(result.sent) || 0,
        skipped: Number(result.skipped) || 0,
        failed: Number(result.failed) || 0,
        message: typeof result.message === "string" ? result.message : undefined,
      });
      setReviewOpen(false);
    } catch (sendError) {
      console.error("Bulk SMS send failed:", sendError);
      setError("לא הצלחנו לשלוח את ההודעה. בדקי את הגדרות ה-SMS ונסי שוב.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section role="dialog" aria-labelledby="bulk-sms-title" aria-describedby="bulk-sms-description" className="rounded-3xl border border-orange-200 bg-white p-4 shadow-lg shadow-orange-100/60 sm:p-5" dir="rtl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700"><MessageSquare className="h-5 w-5" /></div>
          <div className="min-w-0"><h2 id="bulk-sms-title" className="text-base font-black text-slate-900">הודעת SMS מרוכזת</h2><p id="bulk-sms-description" className="mt-1 text-xs font-medium leading-5 text-slate-500">ההודעה תישלח רק למספרים עם הסכמה מפורשת ונוסח הסכמה שמור.</p></div>
        </div>
        <button type="button" onClick={onClose} disabled={isSending} aria-label="סגירת כתיבת הודעה" className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-40"><X className="h-5 w-5" /></button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2" aria-label="סיכום נמעני SMS">
        <div className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-xl font-black text-slate-900">{selectedClients.length}</p><p className="text-[10px] font-bold text-slate-500">לקוחות שנבחרו</p></div>
        <div className="rounded-2xl bg-emerald-50 p-3 text-center"><p className="text-xl font-black text-emerald-700">{eligiblePhoneCount}</p><p className="text-[10px] font-bold text-emerald-700">מספרים עם הסכמה</p></div>
        <div className="rounded-2xl bg-amber-50 p-3 text-center"><p className="text-xl font-black text-amber-700">{skippedCount}</p><p className="text-[10px] font-bold text-amber-700">לקוחות שיידלגו</p></div>
      </div>

      <div className="space-y-2">
        <label htmlFor="bulk-sms-message" className="flex items-center justify-between text-sm font-black text-slate-800"><span>תוכן ההודעה</span><span className={message.length > MAX_MESSAGE_LENGTH ? "text-red-600" : "text-slate-400"}>{message.length}/{MAX_MESSAGE_LENGTH}</span></label>
        <Textarea id="bulk-sms-message" value={message} maxLength={MAX_MESSAGE_LENGTH + 1} onChange={(event) => setMessage(event.target.value)} placeholder="לדוגמה: שלום, המרפאה תהיה סגורה ביום חמישי. תודה על ההבנה." rows={4} className="resize-none rounded-2xl border-slate-200 text-right leading-relaxed focus:border-orange-400 focus:ring-orange-100" />
        <p className="text-xs font-medium text-slate-400">עד {MAX_MESSAGE_LENGTH} תווים. כדאי לנסח הודעה קצרה וברורה.</p>
      </div>

      {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {eligiblePhoneCount === 0 && <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm font-bold leading-relaxed text-amber-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />אין בין הלקוחות שנבחרו מספר עם הסכמה מפורשת, נוסח הסכמה שמור ומספר תקין.</div>}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSending} className="h-11 rounded-xl font-black">ביטול</Button>
        <Button type="button" onClick={openReview} disabled={!canReview || isSending} className="h-11 rounded-xl bg-orange-600 font-black text-white hover:bg-orange-700 disabled:opacity-50"><Send className="ml-2 h-4 w-4" />בדיקה לפני שליחה</Button>
      </div>

      <AlertDialog open={reviewOpen} onOpenChange={(open) => { if (!isSending) setReviewOpen(open); }}>
        <AlertDialogContent dir="rtl" className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">אישור סופי לשליחת SMS</AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-relaxed">ההודעה תישלח ל-{eligiblePhoneCount} מספרים עם הסכמה מפורשת ונוסח שמור. {skippedCount > 0 ? `${skippedCount} לקוחות יידלגו.` : "כל הלקוחות שנבחרו זכאים לקבלה."}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-right text-sm font-bold leading-relaxed text-slate-700 whitespace-pre-wrap">{trimmedMessage}</div>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleSend(); }} disabled={isSending} className="bg-orange-600 font-black text-white hover:bg-orange-700">{isSending ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />שולח...</> : <><CheckCircle2 className="ml-2 h-4 w-4" />אישור ושליחה</>}</AlertDialogAction>
            <AlertDialogCancel disabled={isSending} className="font-black">חזרה לעריכה</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
