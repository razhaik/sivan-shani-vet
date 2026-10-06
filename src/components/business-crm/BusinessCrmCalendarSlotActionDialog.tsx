import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarDays, Clock3, LockKeyhole, X } from "lucide-react";

interface CalendarSlotActionDialogProps {
  date: Date;
  time: string;
  onChooseAppointment: () => void;
  onChooseBlock: () => void;
  onClose: () => void;
}

const FOCUSABLE_BUTTONS = "button:not([disabled])";

export function BusinessCrmCalendarSlotActionDialog({ date, time, onChooseAppointment, onChooseBlock, onClose }: CalendarSlotActionDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const appointmentButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => appointmentButtonRef.current?.focus());
    const getFocusableButtons = () => Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>(FOCUSABLE_BUTTONS) || []);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = getFocusableButtons();
      if (buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, []);

  const dateLabel = format(date, "EEEE, d בMMMM yyyy", { locale: he });

  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#1A1A3E]/[0.42] p-3 backdrop-blur-sm sm:items-center">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="calendar-slot-action-title" aria-describedby="calendar-slot-action-description" dir="rtl" className="w-full max-w-md overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl">
      <header className="border-b border-[#EEF0F3] bg-[#FBFCFD] px-5 pb-5 pt-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-[#5267A8]">פעולה בשעה שנבחרה</p>
            <h2 id="calendar-slot-action-title" className="mt-1 text-2xl font-black text-[#1A1A3E]">מה תרצי לעשות?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="סגירת אפשרויות השעה" className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><X className="h-5 w-5" /></button>
        </div>
        <p id="calendar-slot-action-description" className="mt-2 text-sm font-semibold leading-6 text-slate-500">בחרי אם ליצור תור חדש או לסגור את חלון הזמן הזה ביומן.</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-[#FFFBEA] px-4 py-3 text-sm font-black text-[#1A1A3E]">
          <span className="inline-flex min-w-0 items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-[#8B6B00]" /><span className="truncate">{dateLabel}</span></span>
          <span className="hidden text-[#C8A62F] sm:inline" aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-2" dir="ltr"><Clock3 className="h-4 w-4 text-[#8B6B00]" /><span>{time}</span></span>
        </div>
      </header>
      <div className="space-y-3 p-5 sm:p-6">
        <button ref={appointmentButtonRef} type="button" onClick={onChooseAppointment} className="group flex min-h-[78px] w-full items-center gap-4 rounded-2xl border border-[#CBD8F2] bg-[#F7F9FD] p-4 text-right transition hover:border-[#5267A8] hover:bg-[#EEF3FF] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E4ECFF] text-[#5267A8] transition group-hover:bg-white"><CalendarDays className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-base font-black text-[#1A1A3E]">קביעת תור</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">פתיחת טופס פגישה חדשה עם התאריך והשעה שסומנו.</span></span>
        </button>
        <button type="button" onClick={onChooseBlock} className="group flex min-h-[78px] w-full items-center gap-4 rounded-2xl border border-[#E6D79A] bg-[#FFFBEA] p-4 text-right transition hover:border-[#BFA12E] hover:bg-[#FFF6CF] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F8E9A8] text-[#80620B] transition group-hover:bg-white"><LockKeyhole className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-base font-black text-[#1A1A3E]">סגירת חלון זמן</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">פתיחת סגירה חד־פעמית, עם התחלה של {time} וסיום שניתן לערוך.</span></span>
        </button>
        <button type="button" onClick={onClose} className="mt-1 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[#D9DEE5] px-4 text-sm font-extrabold text-slate-600 transition hover:bg-[#FBFCFD] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">ביטול</button>
      </div>
    </section>
  </div>;
}
