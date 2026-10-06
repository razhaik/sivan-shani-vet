import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, PanelRight, RefreshCw, Settings } from "lucide-react";
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
  onModeChange: (mode: CalendarMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onRefresh: () => void;
  onToggleServicePicker: () => void;
  onToggleService: (id: string) => void;
  onToggleSidePanel: () => void;
  onNewBooking: () => void;
  onOpenBlock: () => void;
  onOpenSettings: () => void;
}

export function BusinessCrmCalendarToolbar({ mode, selectedDate, serviceItems, visibleServiceIds, servicePickerOpen, sidePanelOpen, isTodayView, canCreateBooking, onModeChange, onPrevious, onNext, onToday, onRefresh, onToggleServicePicker, onToggleService, onToggleSidePanel, onNewBooking, onOpenBlock, onOpenSettings }: ToolbarProps) {
  const [actionOpen, setActionOpen] = useState(false);
  return <div dir="rtl" className="space-y-4">
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
  </div>;
}
