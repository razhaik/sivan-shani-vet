import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock3,
  Info,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { ClinicNotificationSettings } from "@/entities";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SettingsGroup, StatusPill } from "@/components/business-crm/SettingsPrimitives";

const notificationSettingsQueryKey = ["business-crm", "clinic-notification-settings"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

type NotificationChannel = "email" | "sms" | "push";
type NotificationEventKey = "new_appointment" | "new_inquiry" | "appointment_changed" | "appointment_no_show" | "appointment_reschedule_requested";

type NotificationForm = {
  id?: string;
  email_recipients: string[];
  sms_recipients: string[];
  new_appointment_enabled: boolean;
  new_appointment_channels: NotificationChannel[];
  new_inquiry_enabled: boolean;
  new_inquiry_channels: NotificationChannel[];
  appointment_changed_enabled: boolean;
  appointment_changed_channels: NotificationChannel[];
  appointment_no_show_enabled: boolean;
  appointment_no_show_channels: NotificationChannel[];
  appointment_reschedule_requested_enabled: boolean;
  appointment_reschedule_requested_channels: NotificationChannel[];
};

type NotificationRecord = Partial<NotificationForm> & { id?: string };

type NotificationEnabledField = "new_appointment_enabled" | "new_inquiry_enabled" | "appointment_changed_enabled" | "appointment_no_show_enabled" | "appointment_reschedule_requested_enabled";
type NotificationChannelsField = "new_appointment_channels" | "new_inquiry_channels" | "appointment_changed_channels" | "appointment_no_show_channels" | "appointment_reschedule_requested_channels";

type EventDefinition = {
  key: NotificationEventKey;
  title: string;
  description: string;
  enabled: NotificationEnabledField;
  channels: NotificationChannelsField;
};

const EVENT_DEFINITIONS: EventDefinition[] = [
  {
    key: "new_appointment",
    title: "תור חדש נקבע",
    description: "עדכון מיידי אחרי שתור חדש נשמר באתר או מתוך ה־CRM.",
    enabled: "new_appointment_enabled",
    channels: "new_appointment_channels",
  },
  {
    key: "new_inquiry",
    title: "ליד/הודעה חדשה",
    description: "התראה אחת על פנייה חדשה, שמשמשת גם כליד וגם כהודעה בתיבת הדואר.",
    enabled: "new_inquiry_enabled",
    channels: "new_inquiry_channels",
  },
  {
    key: "appointment_changed",
    title: "תור בוטל או שונה על ידי הלקוח",
    description: "בשלב הזה נשלחת התראה על ביטול לקוח דרך קישור הביטול. שינויי לקוח נוספים יתווספו כשיהיה מסלול שמור מתאים.",
    enabled: "appointment_changed_enabled",
    channels: "appointment_changed_channels",
  },
  {
    key: "appointment_no_show",
    title: "אי־הגעה לתור",
    description: "עדכון אחרי שהצוות מסמן פגישה כ״לא הגיע״ ביומן ה־CRM.",
    enabled: "appointment_no_show_enabled",
    channels: "appointment_no_show_channels",
  },
  {
    key: "appointment_reschedule_requested",
    title: "בקשת שינוי מועד מתור",
    description: "התראה שמופעלת כברירת מחדל כאשר לקוח מגיש בקשה לשינוי מועד תור. אפשר לכבות אותה או לבחור ערוצים אחרים.",
    enabled: "appointment_reschedule_requested_enabled",
    channels: "appointment_reschedule_requested_channels",
  },
];

const CHANNEL_DEFINITIONS: Array<{ id: NotificationChannel; label: string; icon: typeof Mail }> = [
  { id: "email", label: "מייל", icon: Mail },
  { id: "sms", label: "SMS", icon: Smartphone },
  { id: "push", label: "פוש בדפדפן", icon: Bell },
];

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeEmail(value: unknown) {
  const email = textValue(value).toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

function normalizePhone(value: unknown) {
  const raw = textValue(value);
  if (!raw) return null;
  const compact = raw.replace(/[\s().-]/g, "");
  if (compact.startsWith("+")) {
    const international = `+${compact.slice(1).replace(/\D/g, "")}`;
    return E164_PATTERN.test(international) ? international : null;
  }
  const digits = compact.replace(/\D/g, "");
  if (digits.startsWith("00972") && digits.length === 14) {
    const international = `+${digits.slice(2)}`;
    return E164_PATTERN.test(international) ? international : null;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    const international = `+972${digits.slice(1)}`;
    return E164_PATTERN.test(international) ? international : null;
  }
  return null;
}

function normalizeChannels(value: unknown, fallback: NotificationChannel[] = []) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter((item): item is NotificationChannel => item === "email" || item === "sms" || item === "push"))];
}

function normalizeRecipientList(value: unknown, normalizer: (item: unknown) => string | null) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizer).filter((item): item is string => Boolean(item)))];
}

function defaultForm(): NotificationForm {
  return {
    email_recipients: [],
    sms_recipients: [],
    new_appointment_enabled: true,
    new_appointment_channels: ["push"],
    new_inquiry_enabled: true,
    new_inquiry_channels: ["push"],
    appointment_changed_enabled: false,
    appointment_changed_channels: [],
    appointment_no_show_enabled: false,
    appointment_no_show_channels: [],
    appointment_reschedule_requested_enabled: true,
    appointment_reschedule_requested_channels: ["push"],
  };
}

function formFromRecord(record: NotificationRecord | null | undefined): NotificationForm {
  const defaults = defaultForm();
  return {
    id: textValue(record?.id) || undefined,
    email_recipients: normalizeRecipientList(record?.email_recipients, normalizeEmail),
    sms_recipients: normalizeRecipientList(record?.sms_recipients, normalizePhone),
    new_appointment_enabled: booleanValue(record?.new_appointment_enabled, defaults.new_appointment_enabled),
    new_appointment_channels: normalizeChannels(record?.new_appointment_channels, defaults.new_appointment_channels),
    new_inquiry_enabled: booleanValue(record?.new_inquiry_enabled, defaults.new_inquiry_enabled),
    new_inquiry_channels: normalizeChannels(record?.new_inquiry_channels, defaults.new_inquiry_channels),
    appointment_changed_enabled: booleanValue(record?.appointment_changed_enabled, defaults.appointment_changed_enabled),
    appointment_changed_channels: normalizeChannels(record?.appointment_changed_channels, defaults.appointment_changed_channels),
    appointment_no_show_enabled: booleanValue(record?.appointment_no_show_enabled, defaults.appointment_no_show_enabled),
    appointment_no_show_channels: normalizeChannels(record?.appointment_no_show_channels, defaults.appointment_no_show_channels),
    appointment_reschedule_requested_enabled: booleanValue(record?.appointment_reschedule_requested_enabled, defaults.appointment_reschedule_requested_enabled),
    appointment_reschedule_requested_channels: normalizeChannels(record?.appointment_reschedule_requested_channels, defaults.appointment_reschedule_requested_channels),
  };
}

function errorText(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "לא הצלחנו להשלים את הפעולה. בדקי את החיבור ונסי שוב.";
}

interface BusinessCrmNotificationsSettingsProps {
  onOpenReminders?: () => void;
}

export default function BusinessCrmNotificationsSettings({ onOpenReminders }: BusinessCrmNotificationsSettingsProps) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery<NotificationRecord | null>({
    queryKey: notificationSettingsQueryKey,
    queryFn: async () => {
      const records = await ClinicNotificationSettings.list("-created_at", 1);
      return Array.isArray(records) && records[0] ? records[0] as NotificationRecord : null;
    },
  });
  const [form, setForm] = useState<NotificationForm>(() => defaultForm());
  const [emailDraft, setEmailDraft] = useState("");
  const [smsDraft, setSmsDraft] = useState("");
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settingsQuery.isLoading) return;
    setForm(formFromRecord(settingsQuery.data));
    setEmailDraft("");
    setSmsDraft("");
    setFormError("");
    setFeedback(null);
  }, [settingsQuery.data, settingsQuery.isLoading]);

  const controlsDisabled = settingsQuery.isLoading || Boolean(settingsQuery.error) || isSaving;
  const selectedEmailEvents = useMemo(() => EVENT_DEFINITIONS.filter((event) => form[event.enabled] === true && (form[event.channels] as NotificationChannel[]).includes("email")).length, [form]);
  const selectedSmsEvents = useMemo(() => EVENT_DEFINITIONS.filter((event) => form[event.enabled] === true && (form[event.channels] as NotificationChannel[]).includes("sms")).length, [form]);

  const clearFeedback = () => {
    setFeedback(null);
    setFormError("");
  };

  const addEmail = () => {
    const normalized = normalizeEmail(emailDraft);
    if (!normalized) {
      setFormError("יש להזין כתובת מייל תקינה, למשל name@example.com.");
      return;
    }
    if (form.email_recipients.some((recipient) => recipient.toLowerCase() === normalized)) {
      setFormError("כתובת המייל הזו כבר נמצאת ברשימת הנמענים.");
      return;
    }
    setForm((current) => ({ ...current, email_recipients: [...current.email_recipients, normalized] }));
    setEmailDraft("");
    clearFeedback();
  };

  const addSms = () => {
    const normalized = normalizePhone(smsDraft);
    if (!normalized) {
      setFormError("יש להזין מספר טלפון תקין, למשל 050-0000000 או +972501234567.");
      return;
    }
    if (form.sms_recipients.includes(normalized)) {
      setFormError("מספר הטלפון הזה כבר נמצא ברשימת הנמענים.");
      return;
    }
    setForm((current) => ({ ...current, sms_recipients: [...current.sms_recipients, normalized] }));
    setSmsDraft("");
    clearFeedback();
  };

  const removeEmail = (recipient: string) => {
    setForm((current) => ({ ...current, email_recipients: current.email_recipients.filter((item) => item !== recipient) }));
    clearFeedback();
  };

  const removeSms = (recipient: string) => {
    setForm((current) => ({ ...current, sms_recipients: current.sms_recipients.filter((item) => item !== recipient) }));
    clearFeedback();
  };

  const toggleEventChannel = (event: EventDefinition, channel: NotificationChannel, checked: boolean) => {
    setForm((current) => {
      const channels = current[event.channels] as NotificationChannel[];
      const nextChannels = checked
        ? [...new Set([...channels, channel])]
        : channels.filter((item) => item !== channel);
      return { ...current, [event.channels]: nextChannels } as NotificationForm;
    });
    clearFeedback();
  };

  const validateForm = () => {
    for (const event of EVENT_DEFINITIONS) {
      const enabled = form[event.enabled] === true;
      const channels = form[event.channels] as NotificationChannel[];
      if (enabled && channels.length === 0) return `בחרי לפחות ערוץ אחד עבור ההתראה „${event.title}”.`;
    }
    if (selectedEmailEvents > 0 && form.email_recipients.length === 0) {
      return "נבחרו התראות במייל, אבל עדיין לא הוספת כתובת מייל לקבלתן.";
    }
    if (selectedSmsEvents > 0 && form.sms_recipients.length === 0) {
      return "נבחרו התראות ב־SMS, אבל עדיין לא הוספת מספר טלפון לקבלתן.";
    }
    return null;
  };

  const handleSave = async () => {
    if (settingsQuery.isLoading) {
      setFeedback({ kind: "error", message: "ההגדרות עדיין נטענות. נסי שוב בעוד רגע." });
      return;
    }
    if (settingsQuery.error) {
      setFeedback({ kind: "error", message: "לא ניתן לשמור לפני טעינה תקינה של ההגדרות." });
      return;
    }
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      setFeedback({ kind: "error", message: "בדקי את הנמענים והערוצים לפני השמירה." });
      return;
    }

    const payload = {
      email_recipients: form.email_recipients,
      sms_recipients: form.sms_recipients,
      new_appointment_enabled: form.new_appointment_enabled,
      new_appointment_channels: form.new_appointment_channels,
      new_inquiry_enabled: form.new_inquiry_enabled,
      new_inquiry_channels: form.new_inquiry_channels,
      appointment_changed_enabled: form.appointment_changed_enabled,
      appointment_changed_channels: form.appointment_changed_channels,
      appointment_no_show_enabled: form.appointment_no_show_enabled,
      appointment_no_show_channels: form.appointment_no_show_channels,
      appointment_reschedule_requested_enabled: form.appointment_reschedule_requested_enabled,
      appointment_reschedule_requested_channels: form.appointment_reschedule_requested_channels,
    };

    setIsSaving(true);
    setFormError("");
    setFeedback(null);
    try {
      if (form.id) await ClinicNotificationSettings.update(form.id, payload);
      else await ClinicNotificationSettings.create(payload);
      await queryClient.invalidateQueries({ queryKey: notificationSettingsQueryKey });
      await queryClient.refetchQueries({ queryKey: notificationSettingsQueryKey });
      setFeedback({ kind: "success", message: "הגדרות ההתראות נשמרו בהצלחה." });
    } catch (error) {
      console.error("Failed to save clinic notification settings:", error);
      setFeedback({ kind: "error", message: errorText(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section id="crm-notifications-settings-panel" aria-label="הגדרות התראות" dir="rtl" className="space-y-5">
      <div className="space-y-5">
        {settingsQuery.error && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold leading-6 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <span>לא הצלחנו לטעון את הגדרות ההתראות השמורות. בדקי את החיבור ונסי שוב לפני שמירה.</span>
            </div>
            <button type="button" onClick={() => void settingsQuery.refetch()} className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />נסי שוב
            </button>
          </div>
        )}

        {settingsQuery.isLoading && !settingsQuery.error && (
          <div role="status" className="flex items-center gap-2 rounded-2xl border border-[#DCE8EC] bg-[#F1F7F8] px-4 py-3 text-sm font-bold text-[#526F7A]">
            <RefreshCw className="h-4 w-4 animate-spin text-[#2F90A1]" aria-hidden="true" />
            טוענים את הגדרות ההתראות השמורות. אפשר לערוך אחרי שהטעינה תסתיים.
          </div>
        )}

        <SettingsGroup title="נמענים" footer="הוספת נמען כאן אינה מפעילה ערוץ בפני עצמו. בחרי את הערוץ בתוך כל אירוע, ואז שמרי את ההגדרות.">
          <div className="grid gap-4 py-4 lg:grid-cols-2">
            <div className="rounded-[18px] border border-[#DCE8EC] bg-white p-4">
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#1D6472]" aria-hidden="true" /><h4 className="font-black text-[#16344D]">כתובות מייל</h4></div>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#738790]">השליחה משתמשת בהגדרת המייל הקיימת של הפרויקט.</p>
              <div className="mt-4 space-y-2">
                {form.email_recipients.length === 0 && <p className="rounded-xl border border-dashed border-[#BBD6DC] bg-[#F9FCFC] px-3 py-3 text-xs font-semibold text-[#738790]">עדיין לא הוספת כתובת מייל להתראות.</p>}
                {form.email_recipients.map((recipient) => (
                  <div key={recipient} className="flex items-center gap-2 rounded-xl border border-[#DCE8EC] bg-[#F9FCFC] p-2.5">
                    <span dir="ltr" className="min-w-0 flex-1 truncate text-sm font-bold text-[#405A67]">{recipient}</span>
                    <button type="button" onClick={() => removeEmail(recipient)} disabled={controlsDisabled} aria-label={`הסרת ${recipient}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#738790] transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Label htmlFor="notification-email-recipient" className="sr-only">כתובת מייל חדשה</Label>
                <Input id="notification-email-recipient" dir="ltr" type="email" value={emailDraft} onChange={(event) => { setEmailDraft(event.target.value); clearFeedback(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addEmail(); } }} placeholder="name@example.com" disabled={controlsDisabled} className="h-11 rounded-xl border-[#C9DDE3] bg-white text-left focus-visible:ring-[#2F90A1]" />
                <Button type="button" variant="outline" onClick={addEmail} disabled={controlsDisabled} className="h-11 shrink-0 rounded-xl border-[#9BCAD2] font-black text-[#1D6472] hover:bg-[#E8F3F5]"><Plus className="h-4 w-4" aria-hidden="true" />הוספה</Button>
              </div>
            </div>

            <div className="rounded-[18px] border border-[#DCE8EC] bg-white p-4">
              <div className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-[#1D6472]" aria-hidden="true" /><h4 className="font-black text-[#16344D]">מספרי טלפון ל־SMS</h4></div>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#738790]">המסירה תלויה בחיבור ה־SMS הקיים של המרפאה ובמספר בפורמט תקין.</p>
              <div className="mt-4 space-y-2">
                {form.sms_recipients.length === 0 && <p className="rounded-xl border border-dashed border-[#BBD6DC] bg-[#F9FCFC] px-3 py-3 text-xs font-semibold text-[#738790]">עדיין לא הוספת מספר טלפון להתראות.</p>}
                {form.sms_recipients.map((recipient) => (
                  <div key={recipient} className="flex items-center gap-2 rounded-xl border border-[#DCE8EC] bg-[#F9FCFC] p-2.5">
                    <span dir="ltr" className="min-w-0 flex-1 truncate text-sm font-bold text-[#405A67]">{recipient}</span>
                    <button type="button" onClick={() => removeSms(recipient)} disabled={controlsDisabled} aria-label={`הסרת ${recipient}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#738790] transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Label htmlFor="notification-sms-recipient" className="sr-only">מספר טלפון חדש</Label>
                <Input id="notification-sms-recipient" dir="ltr" type="tel" value={smsDraft} onChange={(event) => { setSmsDraft(event.target.value); clearFeedback(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSms(); } }} placeholder="050-0000000 או +972501234567" disabled={controlsDisabled} className="h-11 rounded-xl border-[#C9DDE3] bg-white text-left focus-visible:ring-[#2F90A1]" />
                <Button type="button" variant="outline" onClick={addSms} disabled={controlsDisabled} className="h-11 shrink-0 rounded-xl border-[#9BCAD2] font-black text-[#1D6472] hover:bg-[#E8F3F5]"><Plus className="h-4 w-4" aria-hidden="true" />הוספה</Button>
              </div>
            </div>
          </div>
        </SettingsGroup>

        <SettingsGroup title="ערוצי קבלה" footer="הערוץ נבחר בתוך כל סוג התראה בנפרד. פוש משתמש בדפדפני CRM שכבר אישרו קבלת התראות.">
          <div className="py-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[18px] border border-[#DCE8EC] bg-white p-4"><div className="flex items-center gap-2 text-[#1D6472]"><Mail className="h-4 w-4" aria-hidden="true" /><span className="font-black text-[#16344D]">מייל</span></div><p className="mt-2 text-xs font-semibold leading-5 text-[#738790]">נשלח לכל כתובת שהוספת, דרך הגדרת המייל של הפרויקט.</p></div>
              <div className="rounded-[18px] border border-[#DCE8EC] bg-white p-4"><div className="flex items-center gap-2 text-[#1D6472]"><Smartphone className="h-4 w-4" aria-hidden="true" /><span className="font-black text-[#16344D]">SMS</span></div><p className="mt-2 text-xs font-semibold leading-5 text-[#738790]">נשלח לכל מספר תקין, כשהחיבור לספק ה־SMS פעיל.</p></div>
              <div className="rounded-[18px] border border-[#DCE8EC] bg-white p-4"><div className="flex items-center gap-2 text-[#2F8794]"><Bell className="h-4 w-4" aria-hidden="true" /><span className="font-black text-[#16344D]">פוש בדפדפן</span></div><p className="mt-2 text-xs font-semibold leading-5 text-[#738790]">הפעילי הרשאה במסך תזכורות SMS ומייל ללקוח בכל דפדפן CRM שצריך לקבל התראות.</p>{onOpenReminders && <button type="button" onClick={onOpenReminders} className="mt-3 text-xs font-black text-[#1D6472] underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F90A1] focus-visible:ring-offset-2">פתיחת הגדרות הרשאת דפדפן</button>}</div>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#C9DDE3] bg-[#F1F7F8] p-3 text-xs font-semibold leading-5 text-[#526F7A]"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2F8794]" aria-hidden="true" /><p>WhatsApp עדיין לא מחובר למערכת ולכן לא מוצג כערוץ שניתן להפעיל. לא תישלח הודעת WhatsApp מההגדרות האלה.</p></div>
          </div>
        </SettingsGroup>

        <SettingsGroup title="אירועים שמפעילים התראה" footer="כל אירוע נשמר בנפרד. בשלב הראשון כל ההתראות נשלחות מיד אחרי שהאירוע נשמר בהצלחה.">
          <div className="space-y-3 py-3">
            {EVENT_DEFINITIONS.map((event) => {
              const enabled = form[event.enabled] === true;
              const channels = form[event.channels] as NotificationChannel[];
              return (
                <article key={event.key} className={`rounded-[18px] border p-4 transition ${enabled ? "border-[#9BCAD2] bg-white" : "border-[#DCE8EC] bg-[#F4F8F9]"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${enabled ? "bg-[#E8F3F5] text-[#1D6472]" : "bg-white text-[#738790]"}`} aria-hidden="true"><MessageSquare className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0"><h4 className="text-base font-black text-[#16344D]">{event.title}</h4><p className="mt-1 text-xs font-semibold leading-5 text-[#738790]">{event.description}</p></div>
                        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end"><StatusPill label={enabled ? "פעיל" : "כבוי"} tone={enabled ? "success" : "neutral"} /><Switch checked={enabled} onCheckedChange={(checked) => { setForm((current) => ({ ...current, [event.enabled]: checked } as NotificationForm)); clearFeedback(); }} disabled={controlsDisabled} aria-label={`הפעלת ${event.title}`} /></div>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label={`ערוצי ${event.title}`}>
                        {CHANNEL_DEFINITIONS.map((channel) => {
                          const ChannelIcon = channel.icon;
                          const checkboxId = `notification-${event.key}-${channel.id}`;
                          const checked = channels.includes(channel.id);
                          return (
                            <div key={channel.id} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black transition ${enabled ? "border-[#DCE8EC] bg-[#F9FCFC] text-[#405A67]" : "border-[#DCE8EC] bg-slate-100 text-slate-400"}`}>
                              <Checkbox id={checkboxId} checked={checked} onCheckedChange={(value) => toggleEventChannel(event, channel.id, value === true)} disabled={!enabled || controlsDisabled} className="data-[state=checked]:border-[#1D6472] data-[state=checked]:bg-[#1D6472]" />
                              <Label htmlFor={checkboxId} className="flex cursor-pointer items-center gap-2 text-xs font-black"><ChannelIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{channel.label}</span></Label>
                            </div>
                          );
                        })}
                      </div>
                      {enabled && channels.length === 0 && <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-red-700"><XCircle className="h-3.5 w-3.5" aria-hidden="true" />יש לבחור לפחות ערוץ אחד כדי להפעיל את ההתראה.</p>}
                      {enabled && channels.includes("email") && form.email_recipients.length === 0 && <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-800"><AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />הוסיפי כתובת מייל לפני שמירת התראה זו.</p>}
                      {enabled && channels.includes("sms") && form.sms_recipients.length === 0 && <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-800"><AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />הוסיפי מספר טלפון לפני שמירת התראה זו.</p>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </SettingsGroup>

        <section aria-labelledby="notification-future-title" className="rounded-[22px] border border-[#BBD6DC] bg-[#F1F7F8] p-4 sm:p-5">
          <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#2F8794] shadow-sm"><Clock3 className="h-5 w-5" aria-hidden="true" /></div><div><h3 id="notification-future-title" className="text-base font-black text-[#16344D]">יכולות שעדיין אינן פעילות</h3><p className="mt-1 text-sm font-semibold leading-6 text-[#526F7A]">המסך שומר עכשיו רק הגדרות שיש להן מסלול שליחה אמיתי.</p><ul className="mt-3 grid gap-2 text-xs font-bold leading-5 text-[#526F7A] sm:grid-cols-2"><li>• WhatsApp והתראות על תשלום או מכירה</li><li>• סיכום יומי וסיכום שבועי</li><li>• שעות שקט ושליחה מרוכזת בבוקר</li><li>• שיוך התראות לפי תפקיד בצוות</li></ul></div></div>
        </section>

        {(formError || feedback) && <div className="space-y-2" aria-live="polite">{formError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{formError}</div>}{feedback && <div role={feedback.kind === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-bold leading-6 ${feedback.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>{feedback.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}{feedback.message}</div>}</div>}

        <div className="flex flex-col gap-3 rounded-[22px] border border-[#DCE8EC] bg-[#F9FCFC] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-xs font-semibold leading-5 text-[#738790]">השינויים נשמרים לחשבון שלך בלבד. אפשר לחזור לכאן בכל זמן בלי לאבד את הבחירות.</p><Button type="button" onClick={() => void handleSave()} disabled={controlsDisabled} className="min-h-12 w-full rounded-xl bg-[#16344D] px-6 font-black text-white shadow-sm hover:bg-[#102E47] focus-visible:ring-2 focus-visible:ring-[#2F90A1] focus-visible:ring-offset-2 sm:w-auto"><Save className="h-4 w-4" aria-hidden="true" />{isSaving ? "שומרת..." : "שמירת הגדרות התראות"}</Button></div>
      </div>
    </section>
  );
}
