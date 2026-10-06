import { useMemo } from "react";
import { AlertCircle, Clock3, LockKeyhole, Save, X } from "lucide-react";
import { timeToMinutes } from "@/lib/crmCalendar";

export interface CalendarBlockDraft {
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
}

interface CalendarBlockDialogProps {
  draft: CalendarBlockDraft;
  feedback?: string | null;
  overlapWarning?: string | null;
  saving: boolean;
  onChange: (field: keyof CalendarBlockDraft, value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const fieldClass = "h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none transition focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:bg-[#FBFCFD] disabled:text-slate-400";

export function BusinessCrmCalendarBlockDialog({ draft, feedback, overlapWarning, saving, onChange, onSubmit, onClose }: CalendarBlockDialogProps) {
  const timeError = useMemo(() => {
    const start = timeToMinutes(draft.startTime);
    const end = timeToMinutes(draft.endTime);
    if (!draft.startTime || !draft.endTime) return "בחרי שעת התחלה ושעת סיום.";
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "יש להזין שעות תקינות בפורמט HH:MM.";
    return end <= start ? "שעת הסיום חייבת להיות מאוחרת משעת ההתחלה." : null;
  }, [draft.endTime, draft.startTime]);
  const canSubmit = !saving && Boolean(draft.date) && !timeError;

  return <div className="fixed inset-0 z-[85] flex items-end justify-center bg-[#1A1A3E]/[0.38] p-3 backdrop-blur-sm sm:items-center">
    <section role="dialog" aria-modal="true" aria-labelledby="calendar-block-title" dir="rtl" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-2xl sm:p-7">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#5267A8]"><LockKeyhole className="h-3.5 w-3.5" />ניהול זמינות</p>
          <h2 id="calendar-block-title" className="mt-1 text-2xl font-black text-[#1A1A3E]">סגירת חלון זמן</h2>
          <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">סגירה חד־פעמית ליום שנבחר. הלקוחות לא יראו שעות שחופפות לטווח הזה, ותורים קיימים יישארו ללא שינוי.</p>
        </div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="סגירת חלון הזמן" className="rounded-xl p-2 text-slate-400 transition hover:bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:opacity-50"><X className="h-5 w-5" /></button>
      </header>
      <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#FFFBEA] p-4"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#8B6B00]" /><p className="text-xs font-bold leading-5 text-[#69550C]">החלון נשמר כתיעוד נפרד ביומן. הוא אינו יוצר פגישה, אינו שולח הודעה ללקוח ואפשר להסיר אותו מפאנל היום.</p></div>
      {feedback && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-xs font-bold leading-5 text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{feedback}</div>}
      {overlapWarning && <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold leading-5 text-amber-950"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span>{overlapWarning}</span></div>}
      <form onSubmit={(event) => { event.preventDefault(); if (canSubmit) onSubmit(); }} className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">תאריך <b className="text-red-500">*</b></span><input type="date" required value={draft.date} onChange={(event) => onChange("date", event.target.value)} disabled={saving} className={fieldClass} /></label>
        <label><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">משעה <b className="text-red-500">*</b></span><input type="time" required step="60" value={draft.startTime} onChange={(event) => onChange("startTime", event.target.value)} disabled={saving} dir="ltr" className={`${fieldClass} text-right`} /></label>
        <label><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">עד שעה <b className="text-red-500">*</b></span><input type="time" required step="60" value={draft.endTime} onChange={(event) => onChange("endTime", event.target.value)} disabled={saving} dir="ltr" aria-invalid={Boolean(timeError)} className={`${fieldClass} text-right ${timeError ? "border-red-300 focus:border-red-400 focus:ring-red-100" : ""}`} /></label>
        {timeError && <p role="alert" className="sm:col-span-2 -mt-1 text-xs font-bold text-red-700">{timeError}</p>}
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">סיבה <span className="font-semibold text-slate-400">(אופציונלי)</span></span><textarea value={draft.reason} onChange={(event) => onChange("reason", event.target.value)} disabled={saving} rows={3} maxLength={500} placeholder="למשל: ישיבת צוות או הפסקה חד־פעמית" className="w-full resize-none rounded-xl border border-[#D9DEE5] px-3 py-2.5 text-sm font-medium text-[#1A1A3E] outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:bg-[#FBFCFD]" /></label>
        <div className="sm:col-span-2 mt-1 flex flex-col-reverse gap-2 border-t border-[#EEF0F3] pt-5 sm:flex-row sm:justify-start"><button type="button" onClick={onClose} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D9DEE5] px-5 text-sm font-extrabold text-slate-600 transition hover:bg-[#FBFCFD] disabled:opacity-50"><X className="h-4 w-4" />ביטול</button><button type="submit" disabled={!canSubmit} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-4 w-4" />}{saving ? "שומרת סגירה..." : "שמירת סגירת החלון"}</button></div>
      </form>
    </section>
  </div>;
}
