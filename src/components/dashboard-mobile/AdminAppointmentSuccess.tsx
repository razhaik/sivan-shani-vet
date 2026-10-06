import { CalendarDays, CheckCircle2, Clock, MailWarning, PawPrint, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ManagerBookingSuccess } from "./adminAppointmentBookingTypes";

interface AdminAppointmentSuccessProps {
  booking: ManagerBookingSuccess;
  onClose: () => void;
}

const speciesLabels: Record<string, string> = { dog: "כלב", cat: "חתול", other: "אחר" };
const displayDate = (value: string) => value.includes("-") ? value.split("-").reverse().join("/") : value;

export default function AdminAppointmentSuccess({ booking, onClose }: AdminAppointmentSuccessProps) {
  return (
    <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6" dir="rtl" aria-labelledby="manager-booking-success" aria-live="polite">
      <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></div><div className="min-w-0 flex-1"><h2 id="manager-booking-success" className="text-xl font-black text-slate-900">התור נקבע ואושר</h2><p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">התור נשמר במערכת כמאושר. אפשר למצוא אותו מיד ברשימות התורים ובלוח.</p></div><button type="button" onClick={onClose} aria-label="סגירת הודעת הצלחה" className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">לקוח</p><p className="mt-1 flex items-center gap-2 text-sm font-black text-slate-800"><User className="h-4 w-4 text-orange-600" />{booking.client_name}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">חיית מחמד</p><p className="mt-1 flex items-center gap-2 text-sm font-black text-slate-800"><PawPrint className="h-4 w-4 text-orange-600" />{booking.pet_name} <span className="font-bold text-slate-500">({speciesLabels[booking.pet_species] || "אחר"})</span></p></div><div className="rounded-2xl bg-blue-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-blue-500">מועד</p><p className="mt-1 flex items-center gap-2 text-sm font-black text-blue-900"><CalendarDays className="h-4 w-4" />{displayDate(booking.date)}</p><p className="mt-1 flex items-center gap-2 text-sm font-black text-blue-900"><Clock className="h-4 w-4" />{booking.start_time}–{booking.end_time}</p></div><div className="rounded-2xl bg-orange-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-orange-500">טיפול</p><p className="mt-1 text-sm font-black leading-relaxed text-orange-900">{booking.appointment_type}</p></div></div>
      {(booking.contactWarning || booking.notificationWarning) && <div className="mt-4 space-y-2">{booking.contactWarning && <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900"><MailWarning className="mt-0.5 h-4 w-4 shrink-0" />התור נשמר. סנכרון הלקוח לאנשי הקשר לא הושלם, אך הדבר לא השפיע על התור.</div>}{booking.notificationWarning && <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900"><MailWarning className="mt-0.5 h-4 w-4 shrink-0" />התור נשמר. לא הצלחנו להשלים את כל פעולות האישור, אפשר לבדוק את הכרטיס ולנסות שוב.</div>}</div>}
      <div className="mt-5 flex justify-end"><Button type="button" onClick={onClose} className="h-11 rounded-xl bg-orange-600 px-5 font-black text-white hover:bg-orange-700">סיום</Button></div>
    </section>
  );
}
