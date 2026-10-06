import { AlertCircle, CalendarDays, Clock3, Save, X } from "lucide-react";
import { minutesToClock, timeToMinutes, type AppointmentEditDraft } from "@/lib/crmCalendar";
import type { CalendarServiceItem } from "@/components/business-crm/BusinessCrmCalendarToolbar";

export type AppointmentEditorMode = "edit" | "duplicate";

interface AppointmentEditorProps {
  mode: AppointmentEditorMode;
  draft: AppointmentEditDraft;
  services: CalendarServiceItem[];
  feedback?: string | null;
  saving: boolean;
  onChange: (field: keyof AppointmentEditDraft, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const fieldClass = "h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none transition focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]";

export function BusinessCrmCalendarAppointmentEditor({ mode, draft, services, feedback, saving, onChange, onSubmit, onCancel }: AppointmentEditorProps) {
  const selectedService = services.find((service) => service.id === draft.serviceId);
  const startMinutes = timeToMinutes(draft.startTime);
  const endMinutes = Number.isFinite(startMinutes) && selectedService?.duration ? startMinutes + selectedService.duration : Number.NaN;
  const endLabel = Number.isFinite(endMinutes) && endMinutes <= 1440 ? minutesToClock(endMinutes) : "--:--";
  const title = mode === "edit" ? "עריכת פגישה" : "שכפול פגישה";

  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="mt-5 border-t border-[#EEF0F3] pt-5" aria-label={title}>
      <div className="flex items-start gap-3 rounded-2xl bg-[#FFFBEA] p-4">
        <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-[#8B6B00]" />
        <div><h3 className="text-sm font-black text-[#1A1A3E]">{title}</h3><p className="mt-1 text-xs font-semibold leading-5 text-slate-600">בחרי את הפרטים שצריך לעדכן. משך השירות ושעת הסיום מחושבים לפי השירות שנבחר.</p></div>
      </div>
      {feedback && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-xs font-bold leading-5 text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{feedback}</div>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">שירות <b className="text-red-500">*</b></span><select value={draft.serviceId} onChange={(event) => onChange("serviceId", event.target.value)} className={fieldClass}><option value="">בחרי שירות</option>{draft.serviceId === "other" && <option value="other" disabled>השירות הקודם אינו זמין, בחרי שירות חדש</option>}{services.filter((service) => service.id !== "other").map((service) => <option key={service.id} value={service.id}>{service.label} · {service.duration} דקות</option>)}</select></label>
        <label><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">תאריך <b className="text-red-500">*</b></span><input type="date" value={draft.date} onChange={(event) => onChange("date", event.target.value)} className={fieldClass} /></label>
        <label><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">שעת התחלה <b className="text-red-500">*</b></span><input type="time" step="60" value={draft.startTime} onChange={(event) => onChange("startTime", event.target.value)} dir="ltr" className={`${fieldClass} text-right`} /></label>
        <div className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] px-3 py-2.5 text-xs font-bold text-slate-600"><Clock3 className="h-4 w-4 text-[#5267A8]" /><span>משך: {selectedService?.duration ? `${selectedService.duration} דקות` : "לא ניתן לחשב"}</span><span className="text-slate-300">·</span><span dir="ltr">סיום {endLabel}</span></div>
        <label><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">שם הלקוח <b className="text-red-500">*</b></span><input value={draft.clientName} onChange={(event) => onChange("clientName", event.target.value)} autoComplete="name" className={fieldClass} /></label>
        <label><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">טלפון <b className="text-red-500">*</b></span><input value={draft.phone} onChange={(event) => onChange("phone", event.target.value)} dir="ltr" autoComplete="tel" className={fieldClass} /></label>
        <label><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">שם חיית המחמד <b className="text-red-500">*</b></span><input value={draft.petName} onChange={(event) => onChange("petName", event.target.value)} className={fieldClass} /></label>
        <label><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">סוג חיית מחמד <b className="text-red-500">*</b></span><select value={draft.petSpecies} onChange={(event) => onChange("petSpecies", event.target.value)} className={fieldClass}><option value="">בחרי סוג</option><option value="dog">כלב</option><option value="cat">חתול</option><option value="other">אחר</option></select></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">אימייל <span className="font-semibold text-slate-400">(אופציונלי)</span></span><input value={draft.email} onChange={(event) => onChange("email", event.target.value)} dir="ltr" autoComplete="email" className={fieldClass} /></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">הערות פומביות <span className="font-semibold text-slate-400">(אופציונלי)</span></span><textarea value={draft.notes} onChange={(event) => onChange("notes", event.target.value)} rows={3} placeholder="מידע שמופיע כחלק מפרטי התור" className="w-full resize-none rounded-xl border border-[#D9DEE5] px-3 py-2.5 text-sm font-medium text-[#1A1A3E] outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]" /></label>
      </div>
      <p className="mt-4 rounded-xl bg-[#FBFCFD] px-3 py-2.5 text-[11px] font-semibold leading-5 text-slate-500">{mode === "edit" ? "שינוי תאריך או שעה ינקה את סימוני התזכורות הקודמים כדי לאפשר תזמון מחדש. שינוי פרטי קשר או הערות בלבד ישמור אותם." : "השכפול ייצור פגישה מאושרת חדשה ללא העתקת הסכמה ל-SMS או סימוני תזכורות. השמירה תתבצע רק לאחר אישור מפורש."}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-start"><button type="button" onClick={onCancel} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D9DEE5] px-5 text-sm font-extrabold text-slate-600 transition hover:bg-[#FBFCFD] disabled:opacity-50"><X className="h-4 w-4" />ביטול</button><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] disabled:cursor-not-allowed disabled:opacity-60">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-4 w-4" />}{saving ? "שומרת..." : mode === "edit" ? "שמירת שינויים" : "יצירת פגישה משוכפלת"}</button></div>
    </form>
  );
}
