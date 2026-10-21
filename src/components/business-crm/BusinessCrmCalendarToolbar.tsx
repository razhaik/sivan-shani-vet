import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { addDays, format, isSameDay } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CloudOff, PanelRight, RefreshCw, Settings, X } from "lucide-react";
import { CALENDAR_MODE_LABELS, rangeLabel, serviceColor, type CalendarMode } from "@/lib/crmCalendar";
import { VETERINARY_CLINIC_PROFILE, clinicDisplayLabel } from "@/lib/clinicProfile";

export type CalendarServiceItem = { id: string; label: string; duration: number; remote: boolean; weeklyAvailability?: unknown };

interface ToolbarProps {
  mode: CalendarMode;
  selectedDate: Date;
  serviceItems: CalendarServiceItem[];
  visibleServiceIds: Set<string>;
  servicePickerOpen: boolean;
  sidePanelOpen: boolean;
  isTodayView: boolean;
  canCreateBooking: boolean;
  unsyncedCount: number;
  onModeChange: (mode: CalendarMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelectDate: (date: Date) => void;
  onRefresh: () => void;
  onToggleServicePicker: () => void;
  onToggleService: (id: string) => void;
  onToggleSidePanel: () => void;
  onNewBooking: () => void;
  onOpenBlock: () => void;
  onOpenSettings: () => void;
}

export function BusinessCrmCalendarToolbar({ mode, selectedDate, serviceItems, visibleServiceIds, servicePickerOpen, sidePanelOpen, isTodayView, canCreateBooking, unsyncedCount, onModeChange, onPrevious, onNext, onToday, onSelectDate, onRefresh, onToggleServicePicker, onToggleService, onToggleSidePanel, onNewBooking, onOpenBlock, onOpenSettings }: ToolbarProps) {
  const [actionOpen, setActionOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const optionsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const optionsCloseRef = useRef<HTMLButtonElement | null>(null);
  const optionsDialogRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(true);
  const optionsId = useId();
  const optionsTitleId = `${optionsId}-title`;
  const dateStripDates = Array.from({ length: 14 }, (_, index) => addDays(selectedDate, index - 2));

  const closeOptions = (restoreFocus = true) => {
    restoreFocusRef.current = restoreFocus;
    setOptionsOpen(false);
  };

  useEffect(() => {
    if (!optionsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => optionsCloseRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOptions(true);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = optionsDialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreFocusRef.current) window.requestAnimationFrame(() => optionsTriggerRef.current?.focus());
    };
  }, [optionsOpen]);

  return <>
    <div className="crm-calendar-desktop-toolbar">
      <div dir="rtl" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="mb-2 text-xs font-extrabold tracking-wide text-slate-500">{clinicDisplayLabel(VETERINARY_CLINIC_PROFILE)}</p><h1 className="text-3xl font-black tracking-tight text-[#1A1A3E] sm:text-4xl">יומן</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">תצוגת פגישות חיה מתוך התורים שנשמרו במערכת.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><button type="button" onClick={() => setActionOpen((open) => !open)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#F2D162] px-4 text-xs font-black text-[#1A1A3E] shadow-sm transition hover:bg-[#E7C34D] focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/30">בחירת פעולה <ChevronDown className="h-4 w-4" /></button>{actionOpen && <div className="absolute left-0 top-12 z-40 w-56 rounded-xl border border-[#E5E7EB] bg-white p-2 text-right shadow-xl"><button type="button" disabled={!canCreateBooking} aria-disabled={!canCreateBooking} title={!canCreateBooking ? "אפשר לקבוע פגישה רק היום בשעה עתידית או במועד עתידי." : undefined} onClick={() => { setActionOpen(false); onNewBooking(); }} className={`flex w-full rounded-lg px-3 py-2.5 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${canCreateBooking ? "text-[#1A1A3E] hover:bg-[#FFFBEA]" : "cursor-not-allowed bg-[#F7F8FA] text-slate-400"}`}>קביעת פגישה חדשה</button><p className="px-3 py-2 text-[10px] font-semibold leading-4 text-slate-400">{canCreateBooking ? "המערכת מציגה אזהרות זמינות לפני השמירה, אך מאפשרת למנהלה לבחור שעה עתידית." : "אפשר לקבוע רק להיום בשעה עתידית או למועד עתידי."}</p><button type="button" onClick={() => { setActionOpen(false); onOpenBlock(); }} className="mt-1 flex w-full rounded-lg px-3 py-2.5 text-xs font-extrabold text-[#1A1A3E] transition hover:bg-[#F1F4FA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">סגירת חלון זמן</button><p className="px-3 py-1 text-[10px] font-semibold leading-4 text-slate-400">סגירה חד־פעמית לתאריך ולשעות שתבחרי. תורים קיימים יישארו ללא שינוי.</p></div>}</div>
            <button type="button" disabled title="אפשרויות נוספות יתווספו בהמשך" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#D9DEE5] bg-white px-4 text-xs font-extrabold text-slate-400 opacity-80">אפשרויות נוספות <ChevronDown className="h-4 w-4" /></button>
            <button type="button" onClick={onOpenSettings} title="הגדרות היומן" aria-label="הגדרות היומן" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#D9DEE5] bg-white text-slate-500 transition hover:border-[#F2D162] hover:bg-[#FFFBEA] hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Settings className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="relative rounded-2xl border border-[#E5E7EB] bg-white p-2 shadow-sm sm:p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="crm-calendar-mode">תצוגת יומן</label><select id="crm-calendar-mode" value={mode} onChange={(event) => onModeChange(event.target.value as CalendarMode)} className="h-10 rounded-xl border border-[#D9DEE5] bg-[#FBFCFD] px-3 text-xs font-black text-[#1A1A3E] outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]">{Object.entries(CALENDAR_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <button type="button" onClick={onRefresh} title="רענון היומן" aria-label="רענון היומן" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#D9DEE5] bg-white text-slate-500 transition hover:border-[#F2D162] hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><RefreshCw className="h-4 w-4" /></button>
              <div className="relative"><button type="button" onClick={onToggleServicePicker} aria-expanded={servicePickerOpen} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${servicePickerOpen ? "border-[#1A1A3E] bg-[#1A1A3E] text-white" : "border-[#D9DEE5] bg-white text-[#1A1A3E] hover:border-[#F2D162]"}`}>בחירת שירות <ChevronDown className="h-4 w-4" /></button>{servicePickerOpen && <div className="absolute right-0 top-12 z-40 w-72 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-xl"><p className="mb-2 text-xs font-black text-[#1A1A3E]">שירותים להצגה</p><div className="space-y-1">{serviceItems.map((service) => <button key={service.id} type="button" onClick={() => onToggleService(service.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-xs font-bold text-[#1A1A3E] transition hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${visibleServiceIds.has(service.id) ? "border-[#1A1A3E] bg-[#1A1A3E] text-[#F2D162]" : "border-[#CBD2DB] text-transparent"}`}>✓</span><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: serviceColor(service.id) }} /><span className="min-w-0 flex-1 truncate">{service.label}</span><span className="text-[10px] text-slate-400">{service.duration ? `${service.duration} דק'` : ""}</span></button>)}</div></div>}</div>
            </div>
            <div className="order-first flex w-full items-center justify-center gap-2 sm:order-none sm:w-auto"><button type="button" onClick={onPrevious} aria-label="טווח קודם" className="rounded-lg p-2 text-slate-500 transition hover:bg-[#FFFBEA] hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><ChevronRight className="h-5 w-5" /></button><p className="min-w-[190px] text-center text-sm font-black text-[#1A1A3E]">{rangeLabel(selectedDate, mode)}</p><button type="button" onClick={onNext} aria-label="טווח הבא" className="rounded-lg p-2 text-slate-500 transition hover:bg-[#FFFBEA] hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><ChevronLeft className="h-5 w-5" /></button><button type="button" onClick={onToday} className={`h-9 rounded-lg px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${isTodayView ? "bg-[#1A1A3E] text-white hover:bg-[#2A2A5A]" : "border border-[#D9DEE5] bg-white text-[#1A1A3E] hover:border-[#F2D162] hover:bg-[#FFFBEA]"}`}>היום</button></div>
            <button type="button" onClick={onToggleSidePanel} aria-expanded={sidePanelOpen} title={sidePanelOpen ? "הסתרת פאנל היומן" : "הצגת פאנל היומן"} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D9DEE5] bg-white px-3 text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><PanelRight className="h-4 w-4" />{sidePanelOpen ? "הסתרה" : "פאנל"}</button>
          </div>
        </div>
      </div>
    </div>

    <div dir="rtl" className="crm-calendar-mobile-toolbar">
      <div className="crm-calendar-mobile-heading">
        <h1 className="text-2xl font-black tracking-tight text-[#1A1A3E]">יומן</h1>
        {unsyncedCount > 0 && <p role="status" className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-extrabold leading-4 text-[#5267A8]"><CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{unsyncedCount} תורים חסרי קישור ל-Google Calendar</span></p>}
      </div>

      <div className="crm-calendar-date-strip snap-x snap-mandatory" role="group" aria-label="בחירת יום ביומן" dir="rtl">
        {dateStripDates.map((date) => {
          const selected = isSameDay(date, selectedDate);
          const today = isSameDay(date, new Date());
          const weekdayLabels = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
          return (
            <button
              key={format(date, "yyyy-MM-dd")}
              type="button"
              onClick={() => onSelectDate(date)}
              aria-pressed={selected}
              aria-label={`${format(date, "EEEE, d בMMMM yyyy", { locale: he })}${today ? ", היום" : ""}`}
              className={`crm-calendar-date-button snap-center snap-always flex h-14 flex-col items-center justify-center gap-1 rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${selected ? "border-[#1A1A3E] bg-[#1A1A3E] text-white shadow-sm" : "border-transparent bg-white text-slate-500 hover:border-[#E6E8EC] hover:bg-[#FBFCFD]"}`}
            >
              <span className={`text-[9px] font-extrabold leading-none ${selected ? "text-white/70" : today ? "text-[#80620B]" : "text-slate-400"}`}>{today ? "היום" : weekdayLabels[date.getDay()]}</span>
              <span className="text-sm font-black leading-none">{format(date, "d")}</span>
            </button>
          );
        })}
      </div>

      <div className="crm-calendar-mobile-date-toolbar" aria-label="ניווט לפי תאריך">
        <button type="button" onClick={onPrevious} aria-label="תאריך קודם" className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E1E4E8] bg-white text-[#1A1A3E] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        <p className="crm-calendar-mobile-range text-center text-xs font-black text-[#1A1A3E]" aria-live="polite">{format(selectedDate, "d בMMMM", { locale: he })}</p>
        <button type="button" onClick={onNext} aria-label="תאריך הבא" className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E1E4E8] bg-white text-[#1A1A3E] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" onClick={onToday} className={`h-10 shrink-0 rounded-xl px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${isTodayView ? "bg-[#1A1A3E] text-white" : "border border-[#D9DEE5] bg-white text-[#1A1A3E]"}`}>היום</button>
        <button ref={optionsTriggerRef} type="button" onClick={() => { restoreFocusRef.current = true; setOptionsOpen(true); }} aria-haspopup="dialog" aria-expanded={optionsOpen} aria-controls={optionsId} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#F2D162] px-3 text-xs font-black text-[#1A1A3E] transition hover:bg-[#E7C34D] focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/30"><Settings className="h-3.5 w-3.5" aria-hidden="true" />אפשרויות</button>
      </div>
    </div>

    <AnimatePresence>
      {optionsOpen && (
        <motion.div
          className="crm-calendar-options-overlay fixed inset-0 z-[90] flex items-end justify-center bg-[#1A1A3E]/[0.42] px-3 backdrop-blur-[2px]"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          onClick={(event) => { if (event.target === event.currentTarget) closeOptions(true); }}
        >
          <motion.section
            ref={optionsDialogRef}
            id={optionsId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={optionsTitleId}
            dir="rtl"
            className="crm-calendar-options-sheet w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-[#E3E6EC] bg-[#FFFDF8] px-4 pt-4 shadow-[0_-18px_50px_rgba(26,26,62,0.18)]"
            initial={reduceMotion ? false : { y: 28 }}
            animate={{ y: 0 }}
            exit={reduceMotion ? { y: 0 } : { y: 28 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 34 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#D9DEE5]" aria-hidden="true" />
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black tracking-[0.15em] text-[#5267A8]">שליטה ביומן</p>
                <h2 id={optionsTitleId} className="mt-1 text-xl font-black text-[#1A1A3E]">אפשרויות היומן</h2>
              </div>
              <button ref={optionsCloseRef} type="button" onClick={() => closeOptions(true)} aria-label="סגירת אפשרויות היומן" className="rounded-xl p-2 text-slate-500 transition hover:bg-[#F0F1F5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A3E]/30"><X className="h-5 w-5" aria-hidden="true" /></button>
            </header>

            <section aria-labelledby={`${optionsTitleId}-view`} className="rounded-2xl border border-[#E7E9EE] bg-white p-3">
              <h3 id={`${optionsTitleId}-view`} className="text-xs font-black text-[#1A1A3E]">תצוגה</h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  { value: "day" as const, label: "יום", detail: "סדר היום" },
                  { value: "week" as const, label: "שבוע", detail: "כל השבוע" },
                ]).map((option) => {
                  const selected = mode === option.value;
                  return <button key={option.value} type="button" onClick={() => onModeChange(option.value)} aria-pressed={selected} className={`flex min-h-[58px] items-center gap-2 rounded-xl border px-3 text-right transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${selected ? "border-[#1A1A3E] bg-[#1A1A3E] text-white" : "border-[#E2E5EA] bg-white text-[#1A1A3E] hover:bg-[#FBFCFD]"}`}><CalendarDays className={`h-4 w-4 shrink-0 ${selected ? "text-[#F2D162]" : "text-[#5267A8]"}`} aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-black">{option.label}</span><span className={`mt-0.5 block text-[10px] font-semibold ${selected ? "text-white/75" : "text-slate-500"}`}>{option.detail}</span></span>{selected && <Check className="h-4 w-4 shrink-0 text-[#F2D162]" aria-hidden="true" />}</button>;
                })}
              </div>
            </section>

            <section aria-labelledby={`${optionsTitleId}-services`} className="mt-3 rounded-2xl border border-[#E7E9EE] bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id={`${optionsTitleId}-services`} className="text-xs font-black text-[#1A1A3E]">שירותים שמוצגים</h3>
                  <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">בחרי אילו תורים ואירועים יופיעו ביומן.</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#F3F4FA] px-2 py-1 text-[10px] font-black text-[#5267A8]">{visibleServiceIds.size} פעילים</span>
              </div>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto overscroll-contain">
                {serviceItems.map((service) => {
                  const selected = visibleServiceIds.has(service.id);
                  return <button key={service.id} type="button" onClick={() => onToggleService(service.id)} aria-pressed={selected} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 text-right text-xs font-bold text-[#1A1A3E] transition hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-[#1A1A3E] bg-[#1A1A3E] text-[#F2D162]" : "border-[#CBD2DB] bg-white text-transparent"}`}><Check className="h-3 w-3" aria-hidden="true" /></span><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: serviceColor(service.id) }} /><span className="min-w-0 flex-1 truncate">{service.label}</span>{service.duration > 0 && <span className="shrink-0 text-[10px] font-semibold text-slate-400">{service.duration} דק'</span>}</button>;
                })}
              </div>
            </section>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { closeOptions(false); onRefresh(); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#D9DEE5] bg-white px-3 text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><RefreshCw className="h-4 w-4 text-[#5267A8]" aria-hidden="true" />רענון היומן</button>
              <button type="button" onClick={() => { closeOptions(false); onToggleSidePanel(); }} aria-pressed={sidePanelOpen} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${sidePanelOpen ? "border-[#1A1A3E] bg-[#1A1A3E] text-white" : "border-[#D9DEE5] bg-white text-[#1A1A3E] hover:border-[#F2D162]"}`}><PanelRight className={`h-4 w-4 ${sidePanelOpen ? "text-[#F2D162]" : "text-[#5267A8]"}`} aria-hidden="true" />{sidePanelOpen ? "הסתרת הפאנל" : "הצגת הפאנל"}</button>
            </div>
            <button type="button" onClick={() => { closeOptions(false); onOpenSettings(); }} className="mt-3 inline-flex min-h-11 w-full items-center justify-between rounded-xl border border-[#E2E5EA] bg-white px-3 text-right text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><span className="inline-flex items-center gap-2"><Settings className="h-4 w-4 text-[#5267A8]" aria-hidden="true" />הגדרות היומן</span><ChevronLeft className="h-4 w-4 text-slate-400" aria-hidden="true" /></button>
            <div className="pb-5 pt-3">
              <button type="button" onClick={() => closeOptions(true)} className="min-h-10 w-full rounded-xl px-3 text-xs font-extrabold text-slate-500 transition hover:bg-[#F2F3F6] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">סגירה</button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  </>;
}
