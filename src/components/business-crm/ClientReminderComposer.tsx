import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, CalendarClock, Loader2, Plus, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const REMINDER_TITLE_LIMIT = 120;
const REMINDER_NOTES_LIMIT = 1000;

type ReminderDraft = {
  title: string;
  date: string;
  time: string;
  notes: string;
};

export interface ClientReminderCreatePayload {
  title: string;
  notes: string;
  dueAt: string;
}

interface ClientReminderComposerProps {
  open: boolean;
  clientName: string;
  onClose: () => void;
  onCreate: (payload: ClientReminderCreatePayload) => Promise<void> | void;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function defaultDateTime(): Pick<ReminderDraft, "date" | "time"> {
  const now = new Date();
  const roundedMinutes = Math.ceil((now.getMinutes() + 1) / 15) * 15;
  now.setMinutes(roundedMinutes, 0, 0);
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

function emptyDraft(): ReminderDraft {
  return { title: "", ...defaultDateTime(), notes: "" };
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeNotes(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .trim();
}

/** Construct a local browser date and reject impossible calendar/time values. */
function parseLocalDateTime(dateValue: string, timeValue: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);
  if (![year, month, day, hours, minutes].every(Number.isInteger) || month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59) return null;
  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (!Number.isFinite(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day || parsed.getHours() !== hours || parsed.getMinutes() !== minutes) return null;
  return parsed;
}

function friendlySaveError(error: unknown): string {
  console.error("Failed to save client reminder:", error);
  return "לא הצלחנו לשמור את התזכורת. בדקי את ההרשאה ונסי שוב.";
}

export function ClientReminderComposer({ open, clientName, onClose, onCreate }: ClientReminderComposerProps) {
  const [draft, setDraft] = useState<ReminderDraft>(() => emptyDraft());
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(emptyDraft());
    setFormError("");
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [clientName, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isSaving, onClose, open]);

  const updateField = (field: keyof ReminderDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setFormError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    const title = normalizeTitle(draft.title);
    const notes = normalizeNotes(draft.notes);
    const dueDate = parseLocalDateTime(draft.date, draft.time);
    if (!title) {
      setFormError("נדרשת כותרת לתזכורת.");
      return;
    }
    if (title.length > REMINDER_TITLE_LIMIT) {
      setFormError(`כותרת התזכורת יכולה להכיל עד ${REMINDER_TITLE_LIMIT} תווים.`);
      return;
    }
    if (!dueDate) {
      setFormError("בחרי תאריך ושעה תקינים לתזכורת.");
      return;
    }
    if (notes.length > REMINDER_NOTES_LIMIT) {
      setFormError(`ההערה יכולה להכיל עד ${REMINDER_NOTES_LIMIT.toLocaleString("he-IL")} תווים.`);
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      await onCreate({ title, notes, dueAt: dueDate.toISOString() });
      onClose();
    } catch (error) {
      setFormError(friendlySaveError(error));
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[120] flex items-end justify-center bg-[#1A1A3E]/[0.52] p-3 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-reminder-title"
        aria-describedby="client-reminder-description"
        aria-busy={isSaving}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[#DCE7E8] bg-white p-5 shadow-2xl sm:p-6"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#E5EEF0] pb-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF7F5] text-[#236B68]"><CalendarClock className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-black tracking-[0.14em] text-[#6D9998]">מעקב פנימי לצוות</p>
              <h2 id="client-reminder-title" className="mt-1 text-xl font-black text-[#152E4D]">הוספת תזכורת ל{clientName}</h2>
              <p id="client-reminder-description" className="mt-1 text-xs font-medium leading-5 text-slate-500">התזכורת תופיע בתיק הלקוח לצוות המרפאה. היא לא תשלח ללקוח הודעה אוטומטית.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="סגירת תזכורת פנימית" className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-[#F4F8F8] hover:text-[#152E4D] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40"><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="block">
            <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-sm font-black text-[#152E4D]">כותרת התזכורת <b className="text-red-600" aria-hidden="true">*</b></span><span className="text-[10px] font-bold text-slate-400">{draft.title.length}/{REMINDER_TITLE_LIMIT}</span></div>
            <input ref={titleRef} id="client-reminder-title-input" value={draft.title} onChange={(event) => updateField("title", event.target.value)} maxLength={REMINDER_TITLE_LIMIT + 1} disabled={isSaving} aria-required="true" className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162]" placeholder="למשל, לחזור ללקוח לגבי תוצאות בדיקה" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-black text-[#152E4D]">תאריך <b className="text-red-600" aria-hidden="true">*</b></span>
              <input id="client-reminder-date" type="date" value={draft.date} onChange={(event) => updateField("date", event.target.value)} disabled={isSaving} required dir="ltr" className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-right text-sm font-semibold text-[#152E4D] outline-none transition focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162]" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-black text-[#152E4D]">שעה <b className="text-red-600" aria-hidden="true">*</b></span>
              <input id="client-reminder-time" type="time" value={draft.time} onChange={(event) => updateField("time", event.target.value)} disabled={isSaving} required dir="ltr" className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-right text-sm font-semibold text-[#152E4D] outline-none transition focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162]" />
            </label>
          </div>

          <label className="block">
            <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-sm font-black text-[#152E4D]">הערה פנימית <span className="font-medium text-slate-400">(אופציונלי)</span></span><span className="text-[10px] font-bold text-slate-400">{draft.notes.length}/{REMINDER_NOTES_LIMIT}</span></div>
            <Textarea id="client-reminder-notes" value={draft.notes} onChange={(event) => updateField("notes", event.target.value)} maxLength={REMINDER_NOTES_LIMIT + 1} rows={4} disabled={isSaving} className="resize-y rounded-2xl border-[#D4E0E2] text-right text-sm font-semibold leading-6 focus:border-[#236B68]/50 focus:ring-[#F2D162]" placeholder="מה חשוב לזכור לפני המעקב?" />
          </label>

          <div role="note" className="flex items-start gap-2 rounded-2xl border border-[#D9E5F4] bg-[#F7F9FF] px-3 py-3 text-[11px] font-bold leading-5 text-[#33447A]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" /><p>זו תזכורת עבודה של צוות המרפאה בלבד. היא אינה שולחת SMS, אימייל או התראה ללקוח.</p></div>
          {formError && <div role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-2xl border border-[#F3D0D0] bg-[#FFF8F8] px-3 py-3 text-xs font-extrabold leading-5 text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{formError}</div>}

          <footer className="flex flex-col-reverse gap-2 border-t border-[#E5EEF0] pt-4 sm:flex-row sm:justify-start">
            <button type="button" onClick={onClose} disabled={isSaving} className="min-h-11 rounded-xl border border-[#CAD8DA] bg-white px-5 text-sm font-extrabold text-[#152E4D] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50">ביטול</button>
            <button type="submit" disabled={isSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#152E4D] px-5 text-sm font-extrabold text-white transition hover:bg-[#244568] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-wait disabled:opacity-60">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4 text-[#F2D162]" aria-hidden="true" />}{isSaving ? "שומרת את התזכורת..." : "שמירת התזכורת"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
