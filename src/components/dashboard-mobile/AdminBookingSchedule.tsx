import { format, getDay, startOfDay } from "date-fns";
import { he } from "date-fns/locale";
import { AlertCircle, Calendar as CalendarIcon, CheckCircle2, Clock, Loader2, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APPOINTMENT_TYPES } from "@/pages/AppointmentBooking";
import { isDateAvailableForType } from "@/lib/adminAppointmentAvailability";
import { DEFAULT_CLINIC_HOURS, type NormalizedClinicHours } from "@/lib/clinicAvailability";

export type AdminAppointmentType = (typeof APPOINTMENT_TYPES)[number];

interface AdminBookingScheduleProps {
  selectedType: AdminAppointmentType | null;
  selectedDate: Date | undefined;
  selectedTime: string | null;
  appointmentWindows: any[];
  clinicHours?: NormalizedClinicHours;
  availableSlots: string[];
  isLoadingAvailability: boolean;
  onTypeChange: (type: AdminAppointmentType) => void;
  onTimeChange: (time: string) => void;
  onChangeDate?: () => void;
}

export default function AdminBookingSchedule({
  selectedType,
  selectedDate,
  selectedTime,
  appointmentWindows,
  clinicHours,
  availableSlots,
  isLoadingAvailability,
  onTypeChange,
  onTimeChange,
  onChangeDate,
}: AdminBookingScheduleProps) {
  const today = startOfDay(new Date());
  const resolvedClinicHours = clinicHours || DEFAULT_CLINIC_HOURS;
  const hasClinicHours = selectedDate ? Boolean(resolvedClinicHours[getDay(selectedDate)]?.length) : false;
  const hasTreatmentHours = selectedDate && selectedType
    ? isDateAvailableForType(selectedDate, selectedType, appointmentWindows, clinicHours)
    : false;
  const isPastDate = selectedDate ? startOfDay(selectedDate) < today : false;

  const renderAvailability = () => {
    if (!selectedDate) {
      return <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-slate-400"><CalendarIcon className="h-9 w-9 opacity-25" /><p className="text-sm font-bold">בחרי יום בלוח כדי להתחיל</p></div>;
    }
    if (!selectedType) {
      return <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-slate-400"><PawPrint className="h-9 w-9 opacity-25" /><p className="text-sm font-bold">בחרי טיפול כדי לראות שעות פנויות</p></div>;
    }
    if (isLoadingAvailability) {
      return <div className="flex min-h-36 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" aria-label="טוען שעות פנויות" /></div>;
    }
    if (isPastDate) {
      return <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-slate-400"><AlertCircle className="h-9 w-9 opacity-25" /><p className="text-sm font-bold leading-relaxed">אי אפשר לקבוע תור ביום שעבר.<br />בחרי יום עתידי בלוח.</p></div>;
    }
    if (!hasClinicHours) {
      return <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-slate-400"><AlertCircle className="h-9 w-9 opacity-25" /><p className="text-sm font-bold leading-relaxed">המרפאה סגורה ביום הזה.<br />בחרי יום פעילות אחר.</p></div>;
    }
    if (!hasTreatmentHours) {
      return <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-slate-400"><AlertCircle className="h-9 w-9 opacity-25" /><p className="text-sm font-bold leading-relaxed">אין מסגרת שעות לטיפול הזה ביום הזה.<br />נסי טיפול אחר או יום אחר.</p></div>;
    }
    if (!availableSlots.length) {
      return <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-slate-400"><AlertCircle className="h-9 w-9 opacity-25" /><p className="text-sm font-bold leading-relaxed">אין שעות פנויות ביום הזה.<br />השעות תפוסות או קרובות מדי להזמנה.</p></div>;
    }
    return <div className="mt-3 grid grid-cols-3 gap-2" role="list" aria-label="שעות פנויות">
      {availableSlots.map((time) => <Button key={time} type="button" variant={selectedTime === time ? "default" : "outline"} onClick={() => onTimeChange(time)} className={selectedTime === time ? "h-11 bg-blue-600 font-black text-white hover:bg-blue-700" : "h-11 border-slate-200 bg-white font-black text-slate-700 hover:border-blue-400 hover:bg-blue-50"} aria-label={`בחירת שעה ${time}`}>
        {time}
      </Button>)}
    </div>;
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="manager-schedule-title">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><CalendarIcon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><h3 id="manager-schedule-title" className="font-black text-slate-900">בחירת טיפול ושעה</h3><p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">היום שבחרת בלוח כבר מסומן. בחרי טיפול כדי לראות רק שעות שמתאימות למשך הטיפול.</p></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-blue-500">היום שנבחר</p><p className="mt-1 text-sm font-black text-blue-950">{selectedDate ? format(selectedDate, "EEEE, d בMMMM", { locale: he }) : "עדיין לא נבחר יום"}</p></div>
        {selectedDate && onChangeDate && <button type="button" onClick={onChangeDate} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 text-xs font-black text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><CalendarIcon className="h-3.5 w-3.5" /> שינוי יום</button>}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {APPOINTMENT_TYPES.map((type) => <button key={type.id} type="button" onClick={() => onTypeChange(type)} aria-pressed={selectedType?.id === type.id} className={`rounded-2xl border p-3 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedType?.id === type.id ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-slate-100 bg-slate-50/70 hover:border-blue-200 hover:bg-blue-50/50"}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-black text-slate-900">{type.label}</span><span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black text-blue-700">{type.duration} דקות</span></div>
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">{type.description}</p>
        </button>)}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-black text-slate-800"><Clock className="h-4 w-4 text-blue-600" />שעות פנויות</div>
        {selectedDate && selectedType && <p className="mt-1 text-xs font-bold text-slate-500">{selectedType.label}, {format(selectedDate, "d בMMMM", { locale: he })}</p>}
        {renderAvailability()}
        {selectedTime && <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-black text-emerald-700"><CheckCircle2 className="h-4 w-4" />נבחרה שעה {selectedTime}</p>}
      </div>
      <p className="mt-3 text-center text-[11px] font-medium text-slate-400">השעות מתחשבות בשעות המרפאה, במשך הטיפול, בתורים קיימים וביומן Google.</p>
    </section>
  );
}
