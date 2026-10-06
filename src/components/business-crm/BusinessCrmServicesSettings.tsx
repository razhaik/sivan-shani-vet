import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  CircleCheck,
  Clock3,
  CreditCard,
  Info,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Stethoscope,
  X,
} from "lucide-react";
import { ClinicService, ClinicSettings } from "@/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SettingsGroup, StatusPill } from "@/components/business-crm/SettingsPrimitives";
import ServiceWeeklyAvailabilityEditor, {
  validateServiceAvailabilityDays,
  type ServiceWeeklyAvailabilityDraft,
} from "@/components/business-crm/ServiceWeeklyAvailabilityEditor";
import {
  normalizeServiceWeeklyAvailability,
  normalizeWeeklyAvailability,
  type WeeklyAvailability,
} from "@/lib/clinicAvailability";

const clinicServicesQueryKey = ["business-crm", "clinic-services"] as const;
const clinicSettingsQueryKey = ["business-crm", "clinic-settings"] as const;
const meetingTypes = ["פגישה אישית"] as const;
type MeetingType = (typeof meetingTypes)[number];

type ClinicServiceRecord = {
  id: string;
  name?: unknown;
  duration_minutes?: unknown;
  meeting_type?: unknown;
  description?: unknown;
  is_paid?: unknown;
  payment_notes?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
  weekly_availability?: unknown;
  created_at?: unknown;
};

type ClinicSettingsRecord = {
  weekly_availability?: unknown;
};

type ServiceForm = {
  name: string;
  hours: string;
  minutes: string;
  meetingType: string;
  description: string;
  isPaid: boolean;
  paymentNotes: string;
  isActive: boolean;
};

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBooleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return null;
}

function booleanValue(value: unknown, fallback = false) {
  return parseBooleanValue(value) ?? fallback;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function sameRecordId(value: unknown, targetId: string) {
  return (typeof value === "string" || typeof value === "number") && String(value) === targetId;
}

function integerValue(value: unknown, fallback: number) {
  const parsed = numberValue(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function sortOrderValue(service: ClinicServiceRecord) {
  const order = integerValue(service.sort_order, Number.MAX_SAFE_INTEGER);
  return order >= 0 ? order : Number.MAX_SAFE_INTEGER;
}

function createdAtValue(service: ClinicServiceRecord) {
  const timestamp = Date.parse(stringValue(service.created_at));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortServices(records: ClinicServiceRecord[]) {
  return [...records].sort((first, second) => {
    const orderDifference = sortOrderValue(first) - sortOrderValue(second);
    if (orderDifference !== 0) return orderDifference;
    const createdDifference = createdAtValue(first) - createdAtValue(second);
    if (createdDifference !== 0) return createdDifference;
    return stringValue(first.name).localeCompare(stringValue(second.name), "he");
  });
}

async function fetchClinicServices(): Promise<ClinicServiceRecord[]> {
  const result = await ClinicService.list("sort_order", 500);
  return Array.isArray(result) ? (result as ClinicServiceRecord[]) : [];
}

function serviceScheduleMatchesReadBack(service: ClinicServiceRecord, requestedSchedule: WeeklyAvailability | null) {
  if (requestedSchedule === null) return service.weekly_availability === undefined || service.weekly_availability === null;
  const savedSchedule = normalizeServiceWeeklyAvailability(service.weekly_availability);
  const expectedSchedule = normalizeServiceWeeklyAvailability(requestedSchedule);
  return Boolean(savedSchedule && expectedSchedule && JSON.stringify(savedSchedule) === JSON.stringify(expectedSchedule));
}

async function readBackClinicService(
  targetId: string | null,
  requestedIsActive: boolean,
  requestedSchedule: WeeklyAvailability | null,
  requestedName?: string,
) {
  let latestServices: ClinicServiceRecord[] = [];
  const retryDelays = [0, 180, 360];
  const findSavedService = (records: ClinicServiceRecord[]) => targetId
    ? records.find((service) => sameRecordId(service.id, targetId))
    : records.find((service) => normalizeName(stringValue(service.name)) === normalizeName(requestedName || ""));

  for (const delay of retryDelays) {
    if (delay > 0) {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delay));
    }
    latestServices = await fetchClinicServices();
    const savedService = findSavedService(latestServices);
    if (
      savedService
      && parseBooleanValue(savedService.is_active) === requestedIsActive
      && serviceScheduleMatchesReadBack(savedService, requestedSchedule)
    ) {
      return { services: latestServices, savedService };
    }
  }

  return { services: latestServices, savedService: findSavedService(latestServices) };
}

function splitDuration(value: unknown) {
  const total = Math.max(0, Math.round(numberValue(value)));
  return {
    hours: String(Math.floor(total / 60)),
    minutes: String(total % 60),
  };
}

function formatDuration(value: unknown) {
  const total = Math.max(0, Math.round(numberValue(value)));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (hours === 0) return total === 1 ? "דקה" : `${total} דקות`;
  if (minutes === 0) return hours === 1 ? "שעה" : `${hours} שעות`;
  if (hours === 1) return `שעה ו-${minutes} דקות`;
  return `${hours} שעות ו-${minutes} דקות`;
}

function emptyServiceForm(): ServiceForm {
  return {
    name: "",
    hours: "0",
    minutes: "30",
    meetingType: meetingTypes[0],
    description: "",
    isPaid: false,
    paymentNotes: "",
    isActive: true,
  };
}

function formFromService(service: ClinicServiceRecord): ServiceForm {
  const duration = splitDuration(service.duration_minutes);
  return {
    name: stringValue(service.name),
    hours: duration.hours,
    minutes: duration.minutes,
    meetingType: stringValue(service.meeting_type),
    description: stringValue(service.description),
    isPaid: booleanValue(service.is_paid),
    paymentNotes: stringValue(service.payment_notes),
    isActive: booleanValue(service.is_active, true),
  };
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "לא הצלחנו להשלים את הפעולה. נסי שוב בעוד רגע.";
}

function serviceStatus(service: ClinicServiceRecord) {
  if (booleanValue(service.is_paid)) return "בתשלום";
  const note = stringValue(service.payment_notes).trim();
  return note || "ללא תשלום מיוחד";
}

export default function BusinessCrmServicesSettings() {
  const queryClient = useQueryClient();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceForm>(() => emptyServiceForm());
  const [availabilityDraft, setAvailabilityDraft] = useState<ServiceWeeklyAvailabilityDraft>({ mode: "inherit" });
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const servicesQuery = useQuery<ClinicServiceRecord[]>({
    queryKey: clinicServicesQueryKey,
    queryFn: fetchClinicServices,
  });
  const clinicSettingsQuery = useQuery<ClinicSettingsRecord[]>({
    queryKey: clinicSettingsQueryKey,
    queryFn: async () => {
      const result = await ClinicSettings.list("-created_at", 1);
      return Array.isArray(result) ? result as ClinicSettingsRecord[] : [];
    },
  });

  const clinicSettings = Array.isArray(clinicSettingsQuery.data) ? clinicSettingsQuery.data[0] : undefined;
  const clinicSchedule = useMemo(
    () => normalizeWeeklyAvailability(clinicSettings?.weekly_availability),
    [clinicSettings?.weekly_availability],
  );
  const services = useMemo(() => sortServices(servicesQuery.data || []), [servicesQuery.data]);
  const editingService = editingId ? services.find((service) => sameRecordId(service.id, editingId)) : undefined;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyServiceForm());
    setAvailabilityDraft({ mode: "inherit" });
    setFormError("");
    setNotice("");
    setIsEditorOpen(true);
  };

  const openEdit = (service: ClinicServiceRecord) => {
    setEditingId(service.id);
    setForm(formFromService(service));
    if (service.weekly_availability === undefined || service.weekly_availability === null) {
      setAvailabilityDraft({ mode: "inherit" });
    } else {
      const savedSchedule = normalizeServiceWeeklyAvailability(service.weekly_availability);
      setAvailabilityDraft(savedSchedule ? { mode: "custom", schedule: savedSchedule } : { mode: "invalid" });
    }
    setFormError("");
    setNotice("");
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    if (isSaving) return;
    setIsEditorOpen(false);
    setFormError("");
  };

  const updateForm = <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError("");
  };

  const updateAvailabilityDraft = (draft: ServiceWeeklyAvailabilityDraft) => {
    setAvailabilityDraft(draft);
    setFormError("");
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const hours = Number(form.hours);
    const minutes = Number(form.minutes);
    const totalMinutes = hours * 60 + minutes;
    const meetingType = form.meetingType.trim();
    const paymentNotes = form.paymentNotes.trim();
    const requestedIsActive = form.isActive === true;

    if (!name) {
      setFormError("יש להזין שם שירות.");
      return;
    }
    if (!Number.isInteger(hours) || hours < 0) {
      setFormError("מספר השעות חייב להיות מספר שלם שאינו שלילי.");
      return;
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
      setFormError("מספר הדקות חייב להיות בין 0 ל-59.");
      return;
    }
    if (totalMinutes <= 0) {
      setFormError("יש להגדיר משך שירות חיובי.");
      return;
    }
    if (!meetingTypes.includes(meetingType as MeetingType)) {
      setFormError("יש לבחור סוג פגישה תקין.");
      return;
    }
    if (form.isPaid && !paymentNotes) {
      setFormError("בשירות בתשלום יש לציין את פרטי התשלום.");
      return;
    }

    if (availabilityDraft.mode === "invalid") {
      setFormError("לוח השעות השמור לשירות אינו תקין. הגדירי לוח חדש או חזרי לשעות המרפאה לפני השמירה.");
      return;
    }
    const scheduleErrors = availabilityDraft.mode === "custom"
      ? validateServiceAvailabilityDays(availabilityDraft.schedule)
      : {};
    if (Object.keys(scheduleErrors).length > 0) {
      setFormError("יש לתקן את טווחי השעות המסומנים לפני שמירת השירות.");
      return;
    }
    const requestedWeeklyAvailability = availabilityDraft.mode === "custom"
      ? normalizeServiceWeeklyAvailability(availabilityDraft.schedule)
      : null;
    if (availabilityDraft.mode === "custom" && !requestedWeeklyAvailability) {
      setFormError("לוח השעות אינו מלא או תקין. בדקי שכל שבעת הימים מוגדרים.");
      return;
    }

    const conflictingService = services.find((service) => {
      if (editingId && sameRecordId(service.id, editingId)) return false;
      return normalizeName(stringValue(service.name)) === normalizeName(name);
    });
    if (conflictingService) {
      setFormError(`כבר קיים שירות בשם „${stringValue(conflictingService.name)}”. יש לבחור שם אחר.`);
      return;
    }

    const currentMaxSortOrder = services.reduce((max, service) => {
      const order = integerValue(service.sort_order, 0);
      return Math.max(max, order);
    }, 0);
    const payload = {
      name,
      duration_minutes: totalMinutes,
      meeting_type: meetingType,
      description: form.description,
      is_paid: form.isPaid,
      payment_notes: paymentNotes,
      sort_order: editingService ? integerValue(editingService.sort_order, currentMaxSortOrder) : currentMaxSortOrder + 1,
      is_active: requestedIsActive,
      ...(editingId
        ? { weekly_availability: requestedWeeklyAvailability }
        : requestedWeeklyAvailability ? { weekly_availability: requestedWeeklyAvailability } : {}),
    };

    setIsSaving(true);
    setFormError("");
    setNotice("");
    try {
      if (editingId) {
        const targetId = editingId;
        await ClinicService.update(targetId, payload);

        // Verify the catalog read-back for both service status and the exact
        // schedule state, including an intentional return to inherited hours.
        const readBack = await readBackClinicService(targetId, requestedIsActive, requestedWeeklyAvailability);
        queryClient.setQueryData(clinicServicesQueryKey, readBack.services);
        const savedService = readBack.savedService;
        const persistedIsActive = savedService ? parseBooleanValue(savedService.is_active) : null;
        const persistedSchedule = savedService
          ? serviceScheduleMatchesReadBack(savedService, requestedWeeklyAvailability)
          : false;

        if (!savedService || persistedIsActive !== requestedIsActive || !persistedSchedule) {
          const savedName = savedService ? stringValue(savedService.name) : name;
          setFormError(`לא הצלחנו לאמת שפרטי השירות ולוח השעות של „${savedName}” נשמרו. חלון העריכה נשאר פתוח. נסי לשמור שוב.`);
          return;
        }

        setNotice("פרטי השירות ולוח השעות נשמרו ואומתו מול הקטלוג.");
      } else {
        const created = await ClinicService.create(payload);
        const createdId = created && typeof created === "object"
          ? stringValue((created as Record<string, unknown>).id).trim()
          : "";
        const readBack = await readBackClinicService(createdId || null, requestedIsActive, requestedWeeklyAvailability, name);
        queryClient.setQueryData(clinicServicesQueryKey, readBack.services);
        const savedService = readBack.savedService;
        if (
          !savedService
          || parseBooleanValue(savedService.is_active) !== requestedIsActive
          || !serviceScheduleMatchesReadBack(savedService, requestedWeeklyAvailability)
        ) {
          setFormError(`לא הצלחנו לאמת שהשירות „${name}” ולוח השעות שלו נשמרו. חלון העריכה נשאר פתוח. נסי לשמור שוב.`);
          return;
        }
        setNotice("השירות ולוח השעות נשמרו ואומתו מול הקטלוג.");
      }
      void queryClient.invalidateQueries({ queryKey: clinicServicesQueryKey });
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section dir="rtl" className="space-y-5" aria-labelledby="crm-services-settings-title">
      <header className="rounded-[24px] border border-[#DCE8EC] bg-[#E8F3F5] px-5 py-5 shadow-[0_10px_30px_rgba(15,40,66,0.05)] sm:px-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#1D6472] shadow-sm">
              <Stethoscope className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-black tracking-[0.12em] text-[#2F8794]">השירותים שלי</p>
              <h2 id="crm-services-settings-title" className="mt-1 text-2xl font-black text-[#16344D]">קטלוג השירותים של המרפאה</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#526F7A]">
                כאן מנהלים את שמות השירותים, משך הפגישה וההנחיות שהצוות והלקוחות רואים. שירות פעיל יופיע אוטומטית במסך קביעת התור ללקוחות. שירות לא פעיל יישאר שמור בקטלוג, אך יוסתר מהלקוחות עד שתפעילי אותו מחדש.
              </p>
            </div>
          </div>
          <Button type="button" onClick={openCreate} className="min-h-11 w-full shrink-0 rounded-xl bg-[#16344D] px-5 font-black text-white shadow-sm hover:bg-[#102E47] focus-visible:ring-2 focus-visible:ring-[#2F90A1] focus-visible:ring-offset-2 sm:w-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            שירות חדש
          </Button>
        </div>
      </header>

      <div className="space-y-5">
        {notice && (
          <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
            <CircleCheck className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            {notice}
          </div>
        )}

        {servicesQuery.isLoading && (
          <div role="status" className="flex min-h-40 items-center justify-center rounded-[22px] border border-[#DCE8EC] bg-[#F9FCFC] px-5 py-10 text-center shadow-[0_8px_24px_rgba(15,40,66,0.04)]">
            <div>
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#2F90A1]" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-[#16344D]">טוענת את רשימת השירותים...</p>
            </div>
          </div>
        )}

        {servicesQuery.error && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold leading-6 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <span>לא הצלחנו לטעון את השירותים השמורים. בדקי את החיבור ונסי שוב.</span>
            </div>
            <button type="button" onClick={() => void servicesQuery.refetch()} className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              נסי שוב
            </button>
          </div>
        )}

        {!servicesQuery.isLoading && !servicesQuery.error && services.length === 0 && (
          <div className="rounded-[22px] border border-dashed border-[#BBD6DC] bg-[#F1F7F8] px-6 py-10 text-center">
            <Stethoscope className="mx-auto h-8 w-8 text-[#2F90A1]" aria-hidden="true" />
            <h3 className="mt-3 text-base font-black text-[#16344D]">עדיין אין שירותים בקטלוג</h3>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#617984]">הוסיפי את השירות הראשון כדי שהצוות יוכל לראות את משך הפגישה, ההנחיות ופרטי התשלום במקום אחד.</p>
            <Button type="button" onClick={openCreate} className="mt-5 rounded-xl bg-[#1D6472] font-black text-white hover:bg-[#15525E] focus-visible:ring-2 focus-visible:ring-[#2F90A1]">
              <Plus className="h-4 w-4" aria-hidden="true" />
              הוסיפי שירות ראשון
            </Button>
          </div>
        )}

        {!servicesQuery.isLoading && !servicesQuery.error && services.length > 0 && (
          <SettingsGroup
            title={`שירותים בקטלוג · ${services.length}`}
            footer="שירותים קיימים נשמרים לפי סדר ההצגה. עריכה משנה את הרשומה עצמה, והפעלה או כיבוי נשמרים יחד עם פרטי השירות."
          >
            <div className="space-y-3 py-3">
              {services.map((service) => {
                const name = stringValue(service.name) || "שירות ללא שם";
                const description = stringValue(service.description);
                const meetingType = stringValue(service.meeting_type) || "סוג פגישה לא צוין";
                const isPaid = booleanValue(service.is_paid);
                const isActive = booleanValue(service.is_active, true);
                const paymentNote = stringValue(service.payment_notes).trim();
                const hasCustomSchedule = service.weekly_availability !== undefined && service.weekly_availability !== null;
                const customScheduleIsValid = hasCustomSchedule && normalizeServiceWeeklyAvailability(service.weekly_availability) !== null;
                const scheduleLabel = !hasCustomSchedule ? "יורש שעות מרפאה" : customScheduleIsValid ? "שעות נפרדות" : "לוח אישי דורש תיקון";
                return (
                  <article key={service.id} className="rounded-[19px] border border-[#DCE8EC] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#9BCAD2] hover:shadow-[0_10px_24px_rgba(15,40,66,0.08)] sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F3F5] text-[#1D6472]" aria-hidden="true">
                        <Stethoscope className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="break-words text-lg font-black leading-7 text-[#16344D]">{name}</h3>
                              <StatusPill label={isActive ? "פעיל" : "לא פעיל"} tone={isActive ? "success" : "neutral"} />
                              <StatusPill label={scheduleLabel} tone={!hasCustomSchedule || customScheduleIsValid ? "neutral" : "warning"} />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F3F5] px-3 py-1.5 text-[#1D6472]"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{formatDuration(service.duration_minutes)}</span>
                              <span className="rounded-full bg-[#F1F7F8] px-3 py-1.5 text-[#526F7A]">{meetingType}</span>
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${isPaid ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}><CreditCard className="h-3.5 w-3.5" aria-hidden="true" />{serviceStatus(service)}</span>
                            </div>
                          </div>
                          <button type="button" onClick={() => openEdit(service)} className="inline-flex min-h-10 w-fit shrink-0 items-center gap-2 rounded-xl border border-[#C9DDE3] bg-white px-3 text-xs font-black text-[#1D6472] transition hover:border-[#2F90A1] hover:bg-[#E8F3F5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F90A1]" aria-label={`עריכת השירות ${name}`}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            עריכה
                          </button>
                        </div>

                        <div className="mt-4 rounded-xl bg-[#F3F8F9] px-4 py-3">
                          <p className="text-[11px] font-black tracking-[0.08em] text-[#6D818A]">תיאור והנחיות</p>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-[#405A67]">{description || "אין תיאור נוסף לשירות זה."}</p>
                        </div>

                        {(isPaid || paymentNote) && (
                          <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#BBD6DC] bg-[#EAF4F6] px-4 py-3 text-xs font-bold leading-6 text-[#526F7A]">
                            <CreditCard className="mt-1 h-3.5 w-3.5 shrink-0 text-[#2F8794]" aria-hidden="true" />
                            <span><span className="font-black text-[#16344D]">פרטי תשלום:</span> {paymentNote || "יש להשלים פרטי תשלום בעריכה."}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </SettingsGroup>
        )}

        <div className="flex items-start gap-2 rounded-2xl border border-[#DCE8EC] bg-[#F1F7F8] px-4 py-3 text-xs font-semibold leading-6 text-[#526F7A]">
          <Info className="mt-1 h-3.5 w-3.5 shrink-0 text-[#2F8794]" aria-hidden="true" />
          <p>השירותים מוצגים לפי סדר ההצגה שנשמר בקטלוג. שירותים קיימים שאינם ברשימה נשארים ללא שינוי, ואין כאן פעולה שמוחקת אותם.</p>
        </div>
      </div>

      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#102E47]/[0.62] p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="clinic-service-editor-title" className="my-2 w-full max-w-2xl overflow-hidden rounded-[26px] border border-[#DCE8EC] bg-[#FBFDFD] shadow-2xl sm:my-8">
            <div className="flex items-start justify-between gap-4 border-b border-[#DCE8EC] bg-[#E8F3F5] px-5 py-5 sm:px-7">
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-[#2F8794]">{editingId ? "עריכת שירות" : "שירות חדש"}</p>
                <h2 id="clinic-service-editor-title" className="mt-1 text-2xl font-black text-[#16344D]">{editingId ? "עדכון פרטי השירות" : "הוספת שירות לקטלוג"}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#526F7A]">פרטי השירות ולוח השעות יישמרו יחד. שירות חדש מתחיל בירושה משעות המרפאה, עד להגדרת שעות נפרדות.</p>
              </div>
              <button type="button" onClick={closeEditor} disabled={isSaving} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#C9DDE3] bg-white text-[#526F7A] transition hover:bg-[#F1F7F8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F90A1] disabled:cursor-not-allowed disabled:opacity-50" aria-label="סגירת חלון העריכה">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); void handleSave(); }} className="space-y-5 px-5 py-5 sm:px-7 sm:py-7">
              {formError && (
                <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-900">
                  <CircleAlert className="mt-1 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label htmlFor="clinic-service-name" className="text-sm font-black text-[#16344D]">שם השירות <span className="text-rose-600">*</span></label>
                <Input id="clinic-service-name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="לדוגמה: בדיקה כללית/לקוח חדש" className="mt-2 h-11 border-[#C9DDE3] bg-white text-right focus-visible:ring-[#2F90A1]" required autoFocus />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="clinic-service-hours" className="text-sm font-black text-[#16344D]">שעות <span className="text-rose-600">*</span></label>
                  <Input id="clinic-service-hours" type="number" min="0" inputMode="numeric" value={form.hours} onChange={(event) => updateForm("hours", event.target.value)} className="mt-2 h-11 border-[#C9DDE3] bg-white text-right focus-visible:ring-[#2F90A1]" required />
                </div>
                <div>
                  <label htmlFor="clinic-service-minutes" className="text-sm font-black text-[#16344D]">דקות <span className="text-rose-600">*</span></label>
                  <Input id="clinic-service-minutes" type="number" min="0" max="59" inputMode="numeric" value={form.minutes} onChange={(event) => updateForm("minutes", event.target.value)} className="mt-2 h-11 border-[#C9DDE3] bg-white text-right focus-visible:ring-[#2F90A1]" required />
                </div>
              </div>
              <p className="-mt-2 text-xs font-semibold text-[#738790]">המשך הכולל יוצג אוטומטית לפי שעות ודקות. לדוגמה, שעה ו-30 דקות נשמרות כ-90 דקות.</p>

              <div>
                <label htmlFor="clinic-service-meeting-type" className="text-sm font-black text-[#16344D]">סוג פגישה <span className="text-rose-600">*</span></label>
                <select id="clinic-service-meeting-type" value={form.meetingType} onChange={(event) => updateForm("meetingType", event.target.value)} className="mt-2 flex h-11 w-full rounded-md border border-[#C9DDE3] bg-white px-3 py-2 text-sm font-semibold text-[#16344D] outline-none focus:ring-2 focus:ring-[#2F90A1]" required>
                  <option value="">בחרי סוג פגישה</option>
                  {meetingTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="clinic-service-description" className="text-sm font-black text-[#16344D]">תיאור והנחיות</label>
                <Textarea id="clinic-service-description" value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="הנחיות שהצוות או הלקוח צריכים לדעת" rows={5} className="mt-2 min-h-32 resize-y border-[#C9DDE3] bg-white text-right leading-7 focus-visible:ring-[#2F90A1]" />
                <p className="mt-1.5 text-xs font-semibold text-[#738790]">הטקסט המלא נשמר ומוצג עם שבירת שורות.</p>
              </div>

              <fieldset>
                <legend className="text-sm font-black text-[#16344D]">תשלום</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${!form.isPaid ? "border-[#2F90A1] bg-[#E8F3F5]" : "border-[#DCE8EC] bg-white hover:bg-[#F1F7F8]"}`}>
                    <input type="radio" name="clinic-service-payment" checked={!form.isPaid} onChange={() => updateForm("isPaid", false)} className="mt-1 h-4 w-4 accent-[#1D6472]" />
                    <span><span className="block text-sm font-black text-[#16344D]">לא בתשלום</span><span className="mt-1 block text-xs font-semibold leading-5 text-[#738790]">אפשר להשאיר הערת תשלום ריקה.</span></span>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${form.isPaid ? "border-[#2F90A1] bg-[#E8F3F5]" : "border-[#DCE8EC] bg-white hover:bg-[#F1F7F8]"}`}>
                    <input type="radio" name="clinic-service-payment" checked={form.isPaid} onChange={() => updateForm("isPaid", true)} className="mt-1 h-4 w-4 accent-[#1D6472]" />
                    <span><span className="block text-sm font-black text-[#16344D]">בתשלום</span><span className="mt-1 block text-xs font-semibold leading-5 text-[#738790]">יש לציין את אמצעי התשלום.</span></span>
                  </label>
                </div>
              </fieldset>

              <div>
                <label htmlFor="clinic-service-payment-notes" className="text-sm font-black text-[#16344D]">פרטי תשלום או הערה</label>
                <Input id="clinic-service-payment-notes" value={form.paymentNotes} onChange={(event) => updateForm("paymentNotes", event.target.value)} placeholder={form.isPaid ? "לדוגמה: אשראי/העברה/ביט/פייבוקס" : "לא צוין תשלום מיוחד"} className="mt-2 h-11 border-[#C9DDE3] bg-white text-right focus-visible:ring-[#2F90A1]" required={form.isPaid} />
              </div>

              <ServiceWeeklyAvailabilityEditor
                draft={availabilityDraft}
                clinicSchedule={clinicSchedule}
                clinicSettingsLoading={clinicSettingsQuery.isLoading}
                clinicSettingsError={Boolean(clinicSettingsQuery.error)}
                disabled={isSaving}
                onChange={updateAvailabilityDraft}
              />

              <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#DCE8EC] bg-[#F1F7F8] px-4 py-3">
                <div>
                  <p className="text-sm font-black text-[#16344D]">שירות פעיל</p>
                  <p className="mt-1 text-xs font-semibold text-[#738790]">שירות לא פעיל נשאר בקטלוג אך מוסתר מהלקוחות.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill label={form.isActive ? "פעיל" : "כבוי"} tone={form.isActive ? "success" : "neutral"} />
                  <Switch checked={form.isActive === true} onCheckedChange={(checked) => updateForm("isActive", checked === true)} aria-label="האם השירות פעיל" />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-[#DCE8EC] pt-5 sm:flex-row sm:justify-start">
                <Button type="button" variant="outline" onClick={closeEditor} disabled={isSaving} className="min-h-11 rounded-xl border-[#C9DDE3] px-5 font-black text-[#1D6472] hover:bg-[#F1F7F8]">ביטול</Button>
                <Button type="submit" disabled={isSaving} className="min-h-11 rounded-xl bg-[#16344D] px-6 font-black text-white hover:bg-[#102E47] focus-visible:ring-2 focus-visible:ring-[#2F90A1]">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  {isSaving ? "שומרת..." : editingId ? "שמור שירות ושעות" : "שמור שירות ושעות"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
