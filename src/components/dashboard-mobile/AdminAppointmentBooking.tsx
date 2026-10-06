import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Appointment } from "@/entities";
import { contacts } from "@/integrations/core";
import { notifyBrowserPush } from "@/lib/onesignalPush";
import { getCalendarBusy } from "@/functions";
import { APPOINTMENT_TYPES, isPetSpecies, minutesToTime, timeToMinutes } from "@/pages/AppointmentBooking";
import { aggregateClients, normalizeClientPhone, normalizePetSpecies } from "@/lib/clientAggregation";
import { getAvailableManagerSlots } from "@/lib/adminAppointmentAvailability";
import type { NormalizedClinicHours } from "@/lib/clinicAvailability";
import AdminBookingSchedule, { type AdminAppointmentType } from "./AdminBookingSchedule";
import AdminAppointmentCustomerStep from "./AdminAppointmentCustomerStep";
import AdminAppointmentSuccess from "./AdminAppointmentSuccess";
import type { ManagerBookingMode, ManagerBookingSuccess, ManagerCustomerDraft } from "./adminAppointmentBookingTypes";

interface AdminAppointmentBookingProps {
  appointments: any[];
  appointmentWindows: any[];
  minHoursBeforeBooking: number;
  clinicHours?: NormalizedClinicHours;
  selectedDate: Date | undefined;
  onAppointmentCreated?: (appointment: any) => Promise<void> | void;
}

const emptyDraft: ManagerCustomerDraft = { name: "", phone: "", email: "", petName: "", petSpecies: "" };
const cancelToken = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function AdminAppointmentBooking({ appointments, appointmentWindows, minHoursBeforeBooking, clinicHours, selectedDate, onAppointmentCreated }: AdminAppointmentBookingProps) {
  const [mode, setMode] = useState<ManagerBookingMode>("existing");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<ManagerCustomerDraft>(emptyDraft);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<ManagerBookingSuccess | null>(null);

  const clients = useMemo(() => aggregateClients(appointments), [appointments]);
  const selectedType = useMemo<AdminAppointmentType | null>(() => APPOINTMENT_TYPES.find((type) => type.id === selectedTypeId) || null, [selectedTypeId]);
  const dateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const { data: calendarBusy = [], isLoading: isLoadingCalendarBusy } = useQuery({
    queryKey: ["dashboard-calendar-busy", dateKey],
    enabled: Boolean(dateKey && selectedTypeId),
    queryFn: async () => {
      try {
        const result = await getCalendarBusy({ date: dateKey });
        return Array.isArray(result?.busy) ? result.busy : [];
      } catch (error) {
        console.warn("Could not load calendar busy times for manager booking:", error);
        return [];
      }
    },
  });
  const availableSlots = useMemo(() => selectedDate && selectedType ? getAvailableManagerSlots({ date: selectedDate, type: selectedType, appointments, windows: appointmentWindows, calendarBusy, minHoursBeforeBooking, clinicHours }) : [], [appointments, appointmentWindows, calendarBusy, clinicHours, minHoursBeforeBooking, selectedDate, selectedType]);

  useEffect(() => {
    setSelectedTime(null);
    setFeedback(null);
    setSuccess(null);
  }, [dateKey]);

  const updateDraft = (field: keyof ManagerCustomerDraft, value: string) => { setDraft((previous) => ({ ...previous, [field]: value })); setFeedback(null); };
  const handleModeChange = (nextMode: ManagerBookingMode) => {
    setMode(nextMode); setFeedback(null);
    if (nextMode === "new") { setSelectedClientKey(null); setClientSearch(""); setDraft(emptyDraft); }
  };
  const handleSelectClient = (client: ReturnType<typeof aggregateClients>[number]) => {
    const latest = client.appointments.find((appointment) => appointment.status !== "cancelled") || client.appointments[0] || {};
    setMode("existing"); setSelectedClientKey(client.key); setClientSearch(client.name);
    setDraft({ name: String(latest.client_name || client.name || ""), phone: String(latest.phone || client.phone || ""), email: String(latest.email || client.email || ""), petName: String(latest.pet_name || client.pets[0]?.name || ""), petSpecies: isPetSpecies(latest.pet_species) ? latest.pet_species : normalizePetSpecies(client.pets[0]?.species) });
    setFeedback(null);
  };
  const showError = (message: string) => { setFeedback(message); window.requestAnimationFrame(() => document.getElementById("manager-booking-feedback")?.scrollIntoView({ behavior: "smooth", block: "center" })); };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const name = draft.name.trim(), phone = draft.phone.trim(), email = draft.email.trim(), petName = draft.petName.trim();
    const petSpecies = isPetSpecies(draft.petSpecies) ? draft.petSpecies : "";
    if (mode === "existing" && !selectedClientKey) return showError("בחרי לקוח קיים מהרשימה, או עברי לאפשרות ״לקוח חדש״.");
    if (!name) return showError("נא למלא את שם הלקוח.");
    if (phone.replace(/\D/g, "").length < 7) return showError("נא למלא מספר טלפון תקין.");
    if (email && !email.includes("@")) return showError("כתובת האימייל אינה תקינה.");
    if (!petName) return showError("נא למלא את שם חיית המחמד.");
    if (!petSpecies) return showError("נא לבחור סוג חיית מחמד: כלב, חתול או אחר.");
    if (!selectedType) return showError("נא לבחור סוג טיפול.");
    if (!selectedDate) return showError("נא לבחור יום בלוח.");
    if (!selectedTime) return showError("נא לבחור שעה פנויה.");
    if (isLoadingCalendarBusy) return showError("בדיקת היומן עדיין מתבצעת. נסי שוב בעוד רגע.");

    setIsSubmitting(true); setFeedback(null);
    const normalizedPhone = normalizeClientPhone(phone), requestedTime = selectedTime, requestedDate = selectedDate;
    let latestAppointments: any[];
    try {
      const freshRecords = await Appointment.query().where("date", dateKey).exec();
      latestAppointments = Array.isArray(freshRecords) ? freshRecords : [];
    } catch (error) {
      console.error("Failed to verify manager appointment availability:", error);
      showError("לא הצלחנו לבדוק את הזמינות העדכנית. התור לא נשמר, נסי שוב."); setIsSubmitting(false); return;
    }

    const verifiedSlots = getAvailableManagerSlots({ date: requestedDate, type: selectedType, appointments: latestAppointments, windows: appointmentWindows, calendarBusy, minHoursBeforeBooking, clinicHours });
    if (!verifiedSlots.includes(requestedTime)) { showError("השעה שבחרת כבר אינה פנויה. הרשימה עודכנה, בחרי שעה אחרת."); setIsSubmitting(false); return; }
    const endTime = minutesToTime(timeToMinutes(requestedTime) + selectedType.duration);
    const appointmentPayload = { appointment_type: selectedType.label, duration_minutes: selectedType.duration, date: dateKey, start_time: requestedTime, end_time: endTime, client_name: name, phone, email, pet_name: petName, pet_species: petSpecies, notes: notes.trim(), status: "confirmed", cancel_token: cancelToken(), sms_consent: false, sms_consent_language: "" };

    try {
      const savedRecord = await Appointment.create(appointmentPayload);
      const savedAppointment = { ...appointmentPayload, ...(savedRecord && typeof savedRecord === "object" ? savedRecord : {}) };
      void notifyBrowserPush("new_appointment", String(savedAppointment.id || ""));
      let contactWarning = false, notificationWarning = false;
      if (mode === "new") {
        try { await contacts({ first_name: name, phone: normalizedPhone || phone, contact_stage: "customer", source: "dashboard_manager_booking", ...(email ? { email } : {}) }); }
        catch (error) { contactWarning = true; console.error("Manager appointment saved, but contact sync failed:", error); }
      }
      try { await onAppointmentCreated?.(savedAppointment); }
      catch (error) { notificationWarning = true; console.error("Manager appointment saved, but confirmation workflow failed:", error); }
      setSuccess({ id: savedAppointment.id, client_name: name, phone, email, pet_name: petName, pet_species: petSpecies, appointment_type: selectedType.label, date: dateKey, start_time: requestedTime, end_time: endTime, notes: notes.trim(), contactWarning, notificationWarning });
    } catch (error) {
      console.error("Failed to create manager appointment:", error);
      showError("לא הצלחנו לשמור את התור. בדקי את הפרטים ונסי שוב.");
    } finally { setIsSubmitting(false); }
  };

  const handleFinish = () => { setSuccess(null); setSelectedTime(null); setMode("existing"); setSelectedClientKey(null); setClientSearch(""); setDraft(emptyDraft); setNotes(""); setFeedback(null); };
  if (success) return <AdminAppointmentSuccess booking={success} onClose={handleFinish} />;
  const hasSelectedSlot = Boolean(selectedDate && selectedType && selectedTime);

  return (
    <section className="space-y-4" dir="rtl" aria-labelledby="manager-booking-title">
      <h2 id="manager-booking-title" className="sr-only">קביעת תור מתוך הלוח</h2>
      {!hasSelectedSlot ? <AdminBookingSchedule selectedType={selectedType} selectedDate={selectedDate} selectedTime={selectedTime} appointmentWindows={appointmentWindows} clinicHours={clinicHours} availableSlots={availableSlots} isLoadingAvailability={isLoadingCalendarBusy} onTypeChange={(type) => { setSelectedTypeId(type.id); setSelectedTime(null); setFeedback(null); }} onTimeChange={(time) => { setSelectedTime(time); setFeedback(null); }} onChangeDate={() => document.getElementById("dashboard-schedule-calendar")?.scrollIntoView({ behavior: "smooth", block: "start" })} /> : <AdminAppointmentCustomerStep selectedDate={selectedDate!} selectedType={selectedType!} selectedTime={selectedTime!} clients={clients} mode={mode} search={clientSearch} selectedClientKey={selectedClientKey} draft={draft} feedback={feedback} notes={notes} isSubmitting={isSubmitting} onModeChange={handleModeChange} onSearchChange={(value) => { setClientSearch(value); setFeedback(null); }} onSelectClient={handleSelectClient} onDraftChange={updateDraft} onNotesChange={(value) => { setNotes(value); setFeedback(null); }} onChangeTime={() => { setSelectedTime(null); setFeedback(null); }} onSubmit={handleSubmit} />}
    </section>
  );
}
