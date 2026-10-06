import { format } from "date-fns";
import { he } from "date-fns/locale";
import { ArrowRight, CalendarDays, Clock3, FileText, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { aggregateClients } from "@/lib/clientAggregation";
import AdminCustomerPicker from "./AdminCustomerPicker";
import type { AdminAppointmentType } from "./AdminBookingSchedule";
import type { ClientSelectionHandler, ManagerBookingMode, ManagerCustomerDraft } from "./adminAppointmentBookingTypes";

interface AdminAppointmentCustomerStepProps {
  selectedDate: Date;
  selectedType: AdminAppointmentType;
  selectedTime: string;
  clients: ReturnType<typeof aggregateClients>;
  mode: ManagerBookingMode;
  search: string;
  selectedClientKey: string | null;
  draft: ManagerCustomerDraft;
  feedback: string | null;
  notes: string;
  isSubmitting: boolean;
  onModeChange: (mode: ManagerBookingMode) => void;
  onSearchChange: (value: string) => void;
  onSelectClient: ClientSelectionHandler;
  onDraftChange: (field: keyof ManagerCustomerDraft, value: string) => void;
  onNotesChange: (value: string) => void;
  onChangeTime: () => void;
  onSubmit: () => void;
}

export default function AdminAppointmentCustomerStep({
  selectedDate,
  selectedType,
  selectedTime,
  clients,
  mode,
  search,
  selectedClientKey,
  draft,
  feedback,
  notes,
  isSubmitting,
  onModeChange,
  onSearchChange,
  onSelectClient,
  onDraftChange,
  onNotesChange,
  onChangeTime,
  onSubmit,
}: AdminAppointmentCustomerStepProps) {
  return (
    <>
      <section className="rounded-3xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-5" aria-live="polite" aria-labelledby="manager-selected-slot-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p id="manager-selected-slot-title" className="text-xs font-black text-blue-600">המועד שנבחר</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-black text-blue-950">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              {format(selectedDate, "EEEE, d בMMMM", { locale: he })}
              <span className="text-blue-400">•</span>
              <Clock3 className="h-4 w-4 text-blue-600" />
              <span dir="ltr">{selectedTime}</span>
            </p>
            <p className="mt-1 text-xs font-bold text-blue-700">{selectedType.label} · {selectedType.duration} דקות</p>
          </div>
          <Button type="button" variant="outline" onClick={onChangeTime} className="h-10 shrink-0 rounded-xl border-blue-200 bg-white font-black text-blue-700 hover:bg-blue-100">
            <ArrowRight className="ml-2 h-4 w-4" /> שינוי שעה
          </Button>
        </div>
      </section>
      {feedback && <div id="manager-booking-feedback" role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black leading-relaxed text-red-800">{feedback}</div>}
      <AdminCustomerPicker clients={clients} mode={mode} search={search} selectedClientKey={selectedClientKey} draft={draft} onModeChange={onModeChange} onSearchChange={onSearchChange} onSelectClient={onSelectClient} onDraftChange={onDraftChange} />
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="manager-notes-title">
        <div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-orange-600" /><h3 id="manager-notes-title" className="text-sm font-black text-slate-800">הערות לתור <span className="font-medium text-slate-400">(אופציונלי)</span></h3></div>
        <Textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="למשל: סיבה לבדיקה, הכנה לניתוח או מידע שחשוב לצוות" rows={3} className="resize-none rounded-2xl border-slate-200" />
      </section>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
        <Button type="button" variant="outline" onClick={onChangeTime} disabled={isSubmitting} className="h-12 rounded-xl border-slate-200 px-6 font-black text-slate-600">חזרה לשעות הפנויות</Button>
        <Button type="button" onClick={onSubmit} disabled={isSubmitting} className="h-12 rounded-xl bg-orange-600 px-6 font-black text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
          {isSubmitting ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />שומרת את התור...</> : "שמור תור מאושר"}
        </Button>
      </div>
      <p className="text-center text-[11px] font-medium leading-relaxed text-slate-400">קביעת תור זו אינה מוסיפה הסכמה שיווקית ל-SMS. הודעת אישור תישלח רק דרך ערוצי ההתראה הקיימים במערכת.</p>
    </>
  );
}
