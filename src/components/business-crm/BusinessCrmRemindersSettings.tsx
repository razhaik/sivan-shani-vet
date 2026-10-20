import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Info,
  Mail,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_EMAIL_TEMPLATE_OPTIONS,
  CUSTOMER_EMAIL_TYPES,
  CURRENT_CUSTOMER_EMAIL_TEMPLATE_KEY,
  MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY,
  buildCustomerEmailPreviewHtml,
  resolveCustomerEmailTemplate,
  type CustomerEmailTemplateKey,
  type CustomerEmailTemplateSelections,
  type CustomerEmailTypeKey,
} from "@/lib/emailTemplates";
import { getBrowserPushStatus, requestBrowserPushPermission, type BrowserPushStatus } from "@/lib/onesignalPush";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";
import { ChevronValue, SettingsGroup, SettingsRow, StatusPill, type StatusTone } from "@/components/business-crm/SettingsPrimitives";

export type ReminderSettingsPayload = {
  enable_email_reminders: boolean;
  enable_sms_reminders: boolean;
  reminder_day_before_hours: number;
  reminder_hour_before_hours: number;
  reminder_sms_day_before_template: string;
  reminder_sms_hour_before_template: string;
  customer_email_template_selections?: CustomerEmailTemplateSelections;
};

export type ReminderSettingsPatch = Partial<ReminderSettingsPayload>;

type ReminderSettingsRecord = Partial<ReminderSettingsPayload> & {
  id?: string;
};

type TemplateKey = "day" | "hour";
type ToggleKey = "email" | "sms";
type Feedback = { kind: "success" | "error"; message: string };

interface BusinessCrmRemindersSettingsProps {
  setting?: ReminderSettingsRecord;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void | Promise<unknown>;
  onSave: (payload: ReminderSettingsPatch) => Promise<void>;
}

const DEFAULT_DAY_HOURS = 24;
const DEFAULT_HOUR_HOURS = 1;
const LIVE_CRM_SETTINGS_URL = `${VETERINARY_CLINIC_PROFILE.publicOrigin}${VETERINARY_CLINIC_PROFILE.crmBasePath}/settings`;
const DEFAULT_DAY_TEMPLATE = `שלום {CLIENT_NAME}, תזכורת לתור עבור {PET_NAME} בתאריך {DATE} בשעה {TIME} במרפאת ${VETERINARY_CLINIC_PROFILE.shortName}.`;
const DEFAULT_HOUR_TEMPLATE = `שלום {CLIENT_NAME}, תזכורת לתור עבור {PET_NAME} בעוד שעה, בתאריך {DATE} בשעה {TIME} במרפאת ${VETERINARY_CLINIC_PROFILE.shortName}.`;
const SUPPORTED_PLACEHOLDERS = ["{TIME}", "{DATE}", "{PET_NAME}", "{CLIENT_NAME}"] as const;
const PREVIEW_VALUES: Record<(typeof SUPPORTED_PLACEHOLDERS)[number], string> = {
  "{CLIENT_NAME}": "נועה",
  "{PET_NAME}": "לולה",
  "{DATE}": "15/10/2026",
  "{TIME}": "17:30",
};

function savedHours(value: unknown, fallback: number): string {
  return value === undefined || value === null || value === "" ? String(fallback) : String(value);
}

function savedTemplate(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function validateHours(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "יש להזין מספר שעות.";
  if (!/^\d+$/.test(trimmed)) return "יש להזין מספר שלם וחיובי בלבד.";
  const parsed = Number(trimmed);
  if (parsed < 1 || parsed > 720) return "אפשר לבחור בין שעה אחת ל־720 שעות לפני התור.";
  return null;
}

function previewTemplate(template: string): string {
  return SUPPORTED_PLACEHOLDERS.reduce(
    (message, placeholder) => message.split(placeholder).join(PREVIEW_VALUES[placeholder]),
    template,
  ).trim();
}

function shortTemplate(template: string): string {
  return template.replace(/\s+/g, " ").trim() || "אין נוסח שמור";
}

function hoursLabel(value: string): string {
  return value === "1" ? "שעה אחת לפני" : `${value} שעות לפני`;
}

function readEmailSelections(value: unknown): CustomerEmailTemplateSelections {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return CUSTOMER_EMAIL_TYPES.reduce<CustomerEmailTemplateSelections>((selections, emailType) => {
    selections[emailType.key] = resolveCustomerEmailTemplate(source[emailType.key]);
    return selections;
  }, {});
}

function selectedEmailTemplate(value: unknown): CustomerEmailTemplateKey {
  return resolveCustomerEmailTemplate(value);
}

function emailTemplateLabel(value: unknown): string {
  return resolveCustomerEmailTemplate(value) === MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY
    ? "תבנית שיווקית"
    : "התבנית הקיימת";
}

export default function BusinessCrmRemindersSettings({
  setting,
  isLoading,
  hasError,
  onRetry,
  onSave,
}: BusinessCrmRemindersSettingsProps) {
  const [emailEnabled, setEmailEnabled] = useState(setting?.enable_email_reminders !== false);
  const [smsEnabled, setSmsEnabled] = useState(setting?.enable_sms_reminders === true);
  const [dayBeforeHours, setDayBeforeHours] = useState(savedHours(setting?.reminder_day_before_hours, DEFAULT_DAY_HOURS));
  const [hourBeforeHours, setHourBeforeHours] = useState(savedHours(setting?.reminder_hour_before_hours, DEFAULT_HOUR_HOURS));
  const [dayTemplate, setDayTemplate] = useState(savedTemplate(setting?.reminder_sms_day_before_template, DEFAULT_DAY_TEMPLATE));
  const [hourTemplate, setHourTemplate] = useState(savedTemplate(setting?.reminder_sms_hour_before_template, DEFAULT_HOUR_TEMPLATE));
  const [emailSelections, setEmailSelections] = useState<CustomerEmailTemplateSelections>(() => readEmailSelections(setting?.customer_email_template_selections));
  const [savingToggle, setSavingToggle] = useState<ToggleKey | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [browserPushStatus, setBrowserPushStatus] = useState<BrowserPushStatus>("loading");
  const [isRequestingBrowserPush, setIsRequestingBrowserPush] = useState(false);
  const [timingEditor, setTimingEditor] = useState<TemplateKey | null>(null);
  const [timingDraft, setTimingDraft] = useState("");
  const [timingError, setTimingError] = useState<string | null>(null);
  const [smsEditor, setSmsEditor] = useState<TemplateKey | null>(null);
  const [smsDraft, setSmsDraft] = useState("");
  const [emailEditor, setEmailEditor] = useState<CustomerEmailTypeKey | null>(null);
  const [emailDraftSelection, setEmailDraftSelection] = useState<CustomerEmailTemplateKey>(CURRENT_CUSTOMER_EMAIL_TEMPLATE_KEY);
  const [savingSheet, setSavingSheet] = useState(false);
  const dayTemplateRef = useRef<HTMLTextAreaElement>(null);
  const hourTemplateRef = useRef<HTMLTextAreaElement>(null);
  const smsDraftRef = smsEditor === "day" ? dayTemplateRef : hourTemplateRef;

  useEffect(() => {
    setEmailEnabled(setting?.enable_email_reminders !== false);
    setSmsEnabled(setting?.enable_sms_reminders === true);
    setDayBeforeHours(savedHours(setting?.reminder_day_before_hours, DEFAULT_DAY_HOURS));
    setHourBeforeHours(savedHours(setting?.reminder_hour_before_hours, DEFAULT_HOUR_HOURS));
    setDayTemplate(savedTemplate(setting?.reminder_sms_day_before_template, DEFAULT_DAY_TEMPLATE));
    setHourTemplate(savedTemplate(setting?.reminder_sms_hour_before_template, DEFAULT_HOUR_TEMPLATE));
    setEmailSelections(readEmailSelections(setting?.customer_email_template_selections));
    setFeedback(null);
  }, [
    setting?.enable_email_reminders,
    setting?.enable_sms_reminders,
    setting?.reminder_day_before_hours,
    setting?.reminder_hour_before_hours,
    setting?.reminder_sms_day_before_template,
    setting?.reminder_sms_hour_before_template,
    setting?.customer_email_template_selections,
  ]);

  useEffect(() => {
    let active = true;
    setBrowserPushStatus("loading");
    void getBrowserPushStatus().then((status) => {
      if (active) setBrowserPushStatus(status);
    });
    return () => {
      active = false;
    };
  }, []);

  const canPersist = !isLoading && !hasError;
  const browserPushStatusLabel: Record<BrowserPushStatus, string> = {
    loading: "בודקות זמינות",
    ready: "מוכן להפעלה",
    subscribed: "פעיל בדפדפן הזה",
    unsupported: "לא זמין בדפדפן הזה",
    denied: "ההרשאה חסומה",
    unconfigured: "חסרה הגדרת אפליקציה",
    "origin-mismatch": "נדרש האתר החי",
    error: "החיבור לא הושלם",
  };
  const browserPushStatusTone: Record<BrowserPushStatus, StatusTone> = {
    loading: "neutral",
    ready: "info",
    subscribed: "success",
    unsupported: "neutral",
    denied: "danger",
    unconfigured: "warning",
    "origin-mismatch": "warning",
    error: "warning",
  };
  const browserPushStatusMessage: Record<BrowserPushStatus, string> = {
    loading: "טוענות את שירות ההתראות. בקשת הרשאה תופיע רק אחרי לחיצה שלך על מתג ההפעלה.",
    ready: "שירות ההתראות מוכן. הפעילי את המתג כדי לבקש הרשאה מהדפדפן; הבדיקה עצמה לא מציגה בקשת הרשאה.",
    subscribed: "OneSignal מזהה הרשמה פעילה בדפדפן הזה, והרשאת הדפדפן מאושרת. תורים ופניות חדשות יוכלו להופיע גם כשהאתר סגור.",
    unsupported: "הדפדפן או מצב הגלישה הנוכחי אינם תומכים בהתראות Web Push.",
    denied: "הרשאת ההתראות חסומה בדפדפן. שני אותה בהגדרות האתר ואז לחצי על „בדקי שוב”.",
    unconfigured: "לא נמצא מזהה אפליקציית OneSignal בהגדרת האתר. צריך להוסיף אותו לפני שאפשר לבדוק או להפעיל התראות.",
    "origin-mismatch": "התראות הצוות מוגדרות לאתר המרפאה הפעיל. פתחי את מערכת הניהול באתר החי כדי לבדוק או להפעיל אותן שם.",
    error: "שירות ההתראות לא נטען או לא אותחל. אפשר לבדוק שוב; בקשת הרשאה לא תופיע בזמן הבדיקה.",
  };
  const canUseBrowserPushToggle = browserPushStatus === "ready" || browserPushStatus === "subscribed";

  const clearFeedback = () => setFeedback(null);

  const saveToggle = async (toggle: ToggleKey, nextValue: boolean) => {
    if (savingToggle) return;
    if (!canPersist) {
      setFeedback({ kind: "error", message: "לא ניתן לשמור לפני טעינה תקינה של הגדרות המרפאה." });
      return;
    }

    const previousValue = toggle === "email" ? emailEnabled : smsEnabled;
    if (toggle === "email") setEmailEnabled(nextValue);
    else setSmsEnabled(nextValue);
    setSavingToggle(toggle);
    clearFeedback();

    const patch: ReminderSettingsPatch = toggle === "email"
      ? { enable_email_reminders: nextValue }
      : { enable_sms_reminders: nextValue };

    try {
      await onSave(patch);
      setFeedback({ kind: "success", message: "השינוי נשמר מיד." });
    } catch (error) {
      if (toggle === "email") setEmailEnabled(previousValue);
      else setSmsEnabled(previousValue);
      const message = error instanceof Error && error.message ? error.message : "לא הצלחנו לשמור את השינוי. נסי שוב.";
      setFeedback({ kind: "error", message });
    } finally {
      setSavingToggle(null);
    }
  };

  const handleBrowserPushStatusRetry = async () => {
    if (isRequestingBrowserPush || browserPushStatus === "loading" || browserPushStatus === "subscribed" || browserPushStatus === "unsupported" || browserPushStatus === "unconfigured" || browserPushStatus === "origin-mismatch") return;

    setIsRequestingBrowserPush(true);
    setBrowserPushStatus("loading");
    clearFeedback();
    try {
      const nextStatus = await getBrowserPushStatus();
      setBrowserPushStatus(nextStatus);
      if (nextStatus === "ready") {
        setFeedback({ kind: "success", message: "שירות ההתראות זמין. המתג יבקש הרשאה רק כשתבחרי להפעיל אותו." });
      } else if (nextStatus === "denied") {
        setFeedback({ kind: "error", message: "ההרשאה עדיין חסומה. שני אותה בהגדרות האתר ואז לחצי על „בדקי שוב”." });
      } else if (nextStatus === "error") {
        setFeedback({ kind: "error", message: "שירות ההתראות עדיין לא התחבר. בדקי את החיבור ונסי שוב." });
      } else {
        setFeedback(null);
      }
    } catch (error) {
      console.error("Could not retry browser notification status for CRM staff:", error);
      setBrowserPushStatus("error");
      setFeedback({ kind: "error", message: "לא הצלחנו לבדוק את שירות ההתראות. נסי שוב." });
    } finally {
      setIsRequestingBrowserPush(false);
    }
  };

  const handleBrowserPushRequest = async () => {
    if (isRequestingBrowserPush || browserPushStatus !== "ready") return;

    setIsRequestingBrowserPush(true);
    setBrowserPushStatus("loading");
    clearFeedback();
    try {
      const nextStatus = await requestBrowserPushPermission();
      setBrowserPushStatus(nextStatus);
      if (nextStatus === "subscribed") {
        setFeedback({ kind: "success", message: "התראות הצוות הופעלו בדפדפן הזה." });
      } else if (nextStatus === "denied") {
        setFeedback({ kind: "error", message: "ההרשאה נחסמה בדפדפן. אפשר לשנות אותה בהגדרות האתר." });
      } else if (nextStatus === "ready") {
        setFeedback({ kind: "error", message: "ההרשאה לא הופעלה. אפשר לנסות שוב דרך המתג." });
      } else if (nextStatus === "error") {
        setFeedback({ kind: "error", message: "לא הצלחנו לחבר את ההתראות. נסי שוב." });
      } else {
        setFeedback(null);
      }
    } catch (error) {
      console.error("Could not enable browser notifications for CRM staff:", error);
      setBrowserPushStatus("error");
      setFeedback({ kind: "error", message: "לא הצלחנו לחבר את ההתראות. נסי שוב." });
    } finally {
      setIsRequestingBrowserPush(false);
    }
  };

  const handleBrowserPushToggle = (checked: boolean) => {
    if (checked) {
      if (browserPushStatus !== "ready") return;
      void handleBrowserPushRequest();
      return;
    }
    setFeedback({ kind: "error", message: "כדי לכבות את ההתראות, משנים את הרשאת האתר בהגדרות הדפדפן." });
  };

  const openTimingEditor = (key: TemplateKey) => {
    setTimingEditor(key);
    setTimingDraft(key === "day" ? dayBeforeHours : hourBeforeHours);
    setTimingError(null);
    clearFeedback();
  };

  const saveTiming = async () => {
    if (!timingEditor) return;
    const error = validateHours(timingDraft);
    setTimingError(error);
    if (error) return;
    if (!canPersist) {
      setTimingError("לא ניתן לשמור לפני טעינה תקינה של הגדרות המרפאה.");
      return;
    }

    const normalizedHours = String(Number(timingDraft));
    setSavingSheet(true);
    try {
      if (timingEditor === "day") {
        await onSave({ reminder_day_before_hours: Number(normalizedHours) });
        setDayBeforeHours(normalizedHours);
      } else {
        await onSave({ reminder_hour_before_hours: Number(normalizedHours) });
        setHourBeforeHours(normalizedHours);
      }
      setTimingEditor(null);
      setFeedback({ kind: "success", message: "תזמון התזכורת נשמר." });
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "לא הצלחנו לשמור את התזמון. נסי שוב.";
      setTimingError(message);
    } finally {
      setSavingSheet(false);
    }
  };

  const openSmsEditor = (key: TemplateKey) => {
    setSmsEditor(key);
    setSmsDraft(key === "day" ? dayTemplate : hourTemplate);
    clearFeedback();
  };

  const insertPlaceholder = (placeholder: (typeof SUPPORTED_PLACEHOLDERS)[number]) => {
    const textarea = smsDraftRef.current;
    const start = textarea?.selectionStart ?? smsDraft.length;
    const end = textarea?.selectionEnd ?? smsDraft.length;
    const nextValue = `${smsDraft.slice(0, start)}${placeholder}${smsDraft.slice(end)}`;
    setSmsDraft(nextValue);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const nextTextarea = smsEditor === "day" ? dayTemplateRef.current : hourTemplateRef.current;
        nextTextarea?.focus();
        nextTextarea?.setSelectionRange(start + placeholder.length, start + placeholder.length);
      });
    }
  };

  const saveSms = async () => {
    if (!smsEditor) return;
    if (!canPersist) {
      setFeedback({ kind: "error", message: "לא ניתן לשמור לפני טעינה תקינה של הגדרות המרפאה." });
      return;
    }

    setSavingSheet(true);
    try {
      if (smsEditor === "day") {
        await onSave({ reminder_sms_day_before_template: smsDraft });
        setDayTemplate(smsDraft);
      } else {
        await onSave({ reminder_sms_hour_before_template: smsDraft });
        setHourTemplate(smsDraft);
      }
      setSmsEditor(null);
      setFeedback({ kind: "success", message: "נוסח ה־SMS נשמר." });
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "לא הצלחנו לשמור את נוסח ה־SMS. נסי שוב.";
      setFeedback({ kind: "error", message });
    } finally {
      setSavingSheet(false);
    }
  };

  const openEmailEditor = (key: CustomerEmailTypeKey) => {
    setEmailEditor(key);
    setEmailDraftSelection(selectedEmailTemplate(emailSelections[key]));
    clearFeedback();
  };

  const saveEmailSelection = async () => {
    if (!emailEditor) return;
    if (!canPersist) {
      setFeedback({ kind: "error", message: "לא ניתן לשמור לפני טעינה תקינה של הגדרות המרפאה." });
      return;
    }

    const nextSelections: CustomerEmailTemplateSelections = {
      ...emailSelections,
      [emailEditor]: emailDraftSelection,
    };
    setSavingSheet(true);
    try {
      await onSave({ customer_email_template_selections: nextSelections });
      setEmailSelections(nextSelections);
      setEmailEditor(null);
      setFeedback({ kind: "success", message: "בחירת תצוגת המייל נשמרה." });
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "לא הצלחנו לשמור את בחירת תצוגת המייל. נסי שוב.";
      setFeedback({ kind: "error", message });
    } finally {
      setSavingSheet(false);
    }
  };

  const activeEmailType = emailEditor ? CUSTOMER_EMAIL_TYPES.find((item) => item.key === emailEditor) : undefined;
  const emailPreviewHtml = emailEditor ? buildCustomerEmailPreviewHtml(emailEditor, emailDraftSelection) : "";

  return (
    <motion.section
      id="crm-reminders-settings-panel"
      aria-label="תזכורות SMS ומייל ללקוח"
      dir="rtl"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="mx-auto w-full max-w-4xl"
    >
      <div className="space-y-6 pb-2">
        {hasError && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <span>לא הצלחנו לטעון את הגדרות התזכורות השמורות. מוצגות ברירות המחדל, ושמירה תתאפשר לאחר טעינה תקינה.</span>
            </div>
            <button type="button" onClick={() => void onRetry()} className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />נסי שוב
            </button>
          </div>
        )}

        {isLoading && !hasError && (
          <div role="status" className="flex items-center gap-2 rounded-2xl border border-[#DCE8EC] bg-[#F4F9FA] px-4 py-3 text-sm font-bold text-[#5E7680]">
            <RefreshCw className="h-4 w-4 animate-spin text-[#2F90A1]" aria-hidden="true" />
            טוענים את ההגדרות השמורות. אפשר לצפות בברירות המחדל, ועריכה תתאפשר לאחר שהטעינה תסתיים.
          </div>
        )}

        {feedback && (
          <div role={feedback.kind === "error" ? "alert" : "status"} aria-live="polite" className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${feedback.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {feedback.kind === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>{feedback.message}</span>
          </div>
        )}

        <SettingsGroup
          title="הפעלה כללית"
          id="reminder-channels"
          footer="כל מתג נשמר מיד, בלי כפתור שמירה כללי."
        >
          <SettingsRow
            icon={MessageSquare}
            title="תזכורות SMS"
            description="נשלחות לפי תזמון התזכורות ונוסחי ההודעות שהוגדרו כאן."
          >
            <Switch
              checked={smsEnabled}
              onCheckedChange={(checked) => void saveToggle("sms", checked)}
              disabled={isLoading || hasError || savingToggle !== null}
              aria-label="הפעלת תזכורות SMS"
            />
          </SettingsRow>
          <SettingsRow
            icon={Mail}
            title="תזכורות במייל"
            description="משתמשות בתבנית המייל הקיימת של המרפאה."
          >
            <Switch
              checked={emailEnabled}
              onCheckedChange={(checked) => void saveToggle("email", checked)}
              disabled={isLoading || hasError || savingToggle !== null}
              aria-label="הפעלת תזכורות במייל"
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="התראות צוות" id="browser-notifications">
          <SettingsRow
            icon={ShieldCheck}
            title="התראות צוות בדפדפן"
            description="עדכונים על תורים ופניות חדשות גם כשהלשונית סגורה."
          >
            <div className="flex items-center gap-2">
              <StatusPill tone={browserPushStatusTone[browserPushStatus]} label={browserPushStatusLabel[browserPushStatus]} />
              <Switch
                checked={browserPushStatus === "subscribed"}
                onCheckedChange={handleBrowserPushToggle}
                disabled={isRequestingBrowserPush || !canUseBrowserPushToggle}
                aria-label="הפעלת התראות צוות בדפדפן"
              />
            </div>
          </SettingsRow>
          <div className="border-b border-[#E2EBEE] py-3">
            <div className="flex items-start gap-2 rounded-xl bg-[#F1F7F8] px-3 py-2.5 text-xs font-semibold leading-5 text-[#526F7A]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2F8794]" aria-hidden="true" />
              <p role="status" aria-live="polite">{browserPushStatusMessage[browserPushStatus]}</p>
            </div>
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-[#C9DDE3] bg-white px-3 py-2.5 text-xs font-semibold leading-5 text-[#526F7A]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2F8794]" aria-hidden="true" />
              <p>באייפון ובאייפד יש להוסיף את האתר למסך הבית דרך Safari, ב־iOS או iPadOS 16.4 ומעלה, ואז להפעיל כאן את ההתראות.</p>
            </div>
          </div>
          <div className="flex min-h-[58px] flex-col gap-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-xs font-semibold leading-5 text-[#738790]">
              <BellRing className="h-4 w-4 shrink-0 text-[#2F8794]" aria-hidden="true" />
              <span>ההרשאה נשמרת בדפדפן הזה בלבד.</span>
            </div>
            {browserPushStatus === "origin-mismatch" ? (
              <a
                href={LIVE_CRM_SETTINGS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 w-fit shrink-0 items-center gap-2 rounded-xl border border-[#C9DDE3] bg-white px-3 text-xs font-extrabold text-[#1D6472] transition hover:bg-[#EAF6F7] hover:text-[#102E47] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F90A1] focus-visible:ring-offset-2"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                פתחי את ה־CRM באתר המרפאה
              </a>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleBrowserPushStatusRetry()}
                disabled={isRequestingBrowserPush || browserPushStatus === "loading" || browserPushStatus === "subscribed" || browserPushStatus === "unsupported" || browserPushStatus === "unconfigured"}
                className="min-h-9 shrink-0 rounded-xl border-[#C9DDE3] bg-white px-3 text-xs font-extrabold text-[#1D6472] hover:bg-[#EAF6F7] hover:text-[#102E47]"
              >
                {browserPushStatus === "loading" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                {browserPushStatus === "subscribed" ? "התראות פעילות" : browserPushStatus === "unsupported" ? "לא נתמך" : browserPushStatus === "unconfigured" ? "חסרה הגדרה" : browserPushStatus === "ready" ? "בדיקת מצב" : browserPushStatus === "denied" ? "בדקי שוב" : browserPushStatus === "loading" ? "בודקות..." : "נסי שוב"}
              </Button>
            )}
          </div>
        </SettingsGroup>

        <SettingsGroup
          title="תזמון תזכורות"
          id="reminder-timing"
          footer={<><span className="font-extrabold text-[#526F7A]">מכסת SMS:</span> עד 720 הודעות בחודש.</>}
        >
          <SettingsRow
            icon={Clock3}
            title="תזכורת ראשונה"
            description="מועד השליחה הראשון לפני התור."
            onClick={() => openTimingEditor("day")}
            disabled={isLoading || hasError}
          >
            <ChevronValue value={hoursLabel(dayBeforeHours)} />
          </SettingsRow>
          <SettingsRow
            icon={Clock3}
            title="תזכורת שנייה"
            description="מועד השליחה השני לפני התור."
            onClick={() => openTimingEditor("hour")}
            disabled={isLoading || hasError}
          >
            <ChevronValue value={hoursLabel(hourBeforeHours)} />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="נוסחי SMS"
          id="sms-templates"
          footer="השדות הדינמיים מתמלאים בפרטי התור בזמן השליחה."
        >
          <SettingsRow
            icon={MessageSquare}
            title="נוסח לתזכורת ראשונה"
            description={shortTemplate(dayTemplate)}
            onClick={() => openSmsEditor("day")}
            disabled={isLoading || hasError}
          >
            <ChevronValue value="עריכה" />
          </SettingsRow>
          <SettingsRow
            icon={MessageSquare}
            title="נוסח לתזכורת שנייה"
            description={shortTemplate(hourTemplate)}
            onClick={() => openSmsEditor("hour")}
            disabled={isLoading || hasError}
          >
            <ChevronValue value="עריכה" />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="תצוגות מייל ללקוח"
          id="customer-email-views"
          footer="הודעות שיווקיות מנוהלות במסך השיווק. הרשימה הזו כוללת את הודעות התורים שנשלחות ללקוחות."
        >
          {CUSTOMER_EMAIL_TYPES.map((emailType) => (
            <SettingsRow
              key={emailType.key}
              icon={Mail}
              title={emailType.label}
              description={emailType.description}
              onClick={() => openEmailEditor(emailType.key)}
              disabled={isLoading || hasError}
            >
              <ChevronValue value={emailTemplateLabel(emailSelections[emailType.key])} />
            </SettingsRow>
          ))}
        </SettingsGroup>
      </div>

      <Sheet open={timingEditor !== null} onOpenChange={(open) => { if (!open && !savingSheet) setTimingEditor(null); }}>
        <SheetContent side="bottom" dir="rtl" className="z-[100] max-h-[92vh] overflow-y-auto rounded-t-[28px] border-[#DCE8EC] bg-[#FBFDFD] p-0">
          <SheetHeader className="border-b border-[#E2EBEE] px-5 pb-4 pt-6 text-right sm:px-7">
            <p className="text-xs font-extrabold tracking-[0.1em] text-[#2F8794]">תזמון תזכורות</p>
            <SheetTitle className="pr-8 text-right text-xl font-black text-[#102E47]">{timingEditor === "day" ? "תזכורת ראשונה" : "תזכורת שנייה"}</SheetTitle>
            <SheetDescription className="max-w-xl text-right text-sm font-semibold leading-6 text-[#6B818A]">בחרי כמה שעות לפני התור תישלח התזכורת. הערך נשמר רק אחרי לחיצה על שמירה.</SheetDescription>
          </SheetHeader>
          <div className="mx-auto w-full max-w-xl space-y-4 px-5 py-5 sm:px-7">
            <div>
              <Label htmlFor="reminder-hours-sheet" className="text-sm font-extrabold text-[#16344D]">מספר שעות לפני התור</Label>
              <div className="relative mt-2">
                <Input
                  id="reminder-hours-sheet"
                  type="number"
                  min={1}
                  max={720}
                  step={1}
                  inputMode="numeric"
                  value={timingDraft}
                  onChange={(event) => { setTimingDraft(event.target.value); setTimingError(null); }}
                  aria-invalid={Boolean(timingError)}
                  aria-describedby={timingError ? "reminder-hours-sheet-error" : "reminder-hours-sheet-help"}
                  className={`h-12 rounded-xl border-[#D5E3E7] bg-white pl-16 text-base font-extrabold text-[#16344D] focus-visible:ring-[#2F90A1] ${timingError ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                />
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#7C9199]">שעות לפני</span>
              </div>
              <p id="reminder-hours-sheet-help" className="mt-2 text-xs font-semibold leading-5 text-[#748891]">אפשר לבחור מספר שלם בין שעה אחת ל־720 שעות לפני התור.</p>
              {timingError && <p id="reminder-hours-sheet-error" role="alert" className="mt-2 text-xs font-bold leading-5 text-red-700">{timingError}</p>}
            </div>
          </div>
          <SheetFooter className="mx-auto flex w-full max-w-xl flex-row justify-start gap-2 border-t border-[#E2EBEE] bg-white px-5 py-4 sm:px-7">
            <Button type="button" variant="outline" onClick={() => setTimingEditor(null)} disabled={savingSheet} className="min-h-11 rounded-xl border-[#C9DDE3] px-5 font-extrabold text-[#526F7A]">ביטול</Button>
            <Button type="button" onClick={() => void saveTiming()} disabled={savingSheet} className="min-h-11 rounded-xl bg-[#1D6472] px-5 font-extrabold text-white hover:bg-[#15525E]">{savingSheet ? "שומרת..." : "שמור ערך"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={smsEditor !== null} onOpenChange={(open) => { if (!open && !savingSheet) setSmsEditor(null); }}>
        <SheetContent side="bottom" dir="rtl" className="z-[100] max-h-[94vh] overflow-y-auto rounded-t-[28px] border-[#DCE8EC] bg-[#FBFDFD] p-0">
          <SheetHeader className="border-b border-[#E2EBEE] px-5 pb-4 pt-6 text-right sm:px-7">
            <p className="text-xs font-extrabold tracking-[0.1em] text-[#2F8794]">נוסחי SMS</p>
            <SheetTitle className="pr-8 text-right text-xl font-black text-[#102E47]">{smsEditor === "day" ? "נוסח לתזכורת ראשונה" : "נוסח לתזכורת שנייה"}</SheetTitle>
            <SheetDescription className="max-w-2xl text-right text-sm font-semibold leading-6 text-[#6B818A]">ערכי את הנוסח המלא. אפשר להוסיף שדות דינמיים במקום שבו נמצא הסמן, והמערכת תמלא אותם בזמן השליחה.</SheetDescription>
          </SheetHeader>
          <div className="mx-auto w-full max-w-2xl space-y-4 px-5 py-5 sm:px-7">
            <div className="rounded-2xl border border-[#C9DDE3] bg-[#F1F7F8] p-4">
              <p className="text-xs font-extrabold text-[#1D6472]">שדות דינמיים להוספה</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUPPORTED_PLACEHOLDERS.map((placeholder) => (
                  <button
                    key={placeholder}
                    type="button"
                    onClick={() => insertPlaceholder(placeholder)}
                    className="rounded-lg border border-[#BBD6DC] bg-white px-2.5 py-1.5 font-mono text-[11px] font-bold text-[#1D6472] transition hover:border-[#2F90A1] hover:bg-[#E5F4F5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F90A1] focus-visible:ring-offset-2"
                    aria-label={`הוספת השדה ${placeholder} לנוסח`}
                  >
                    {placeholder}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs font-semibold leading-5 text-[#526F7A]">{`{TIME}`} ממלא את שעת התור, {`{DATE}`} את התאריך, {`{PET_NAME}`} את שם חיית המחמד ו־{`{CLIENT_NAME}`} את שם הלקוח.</p>
            </div>
            <div>
              <Label htmlFor="sms-template-sheet" className="text-sm font-extrabold text-[#16344D]">נוסח ההודעה</Label>
              <Textarea
                ref={smsDraftRef}
                id="sms-template-sheet"
                dir="rtl"
                value={smsDraft}
                onChange={(event) => setSmsDraft(event.target.value)}
                className="mt-2 min-h-[170px] resize-y rounded-2xl border-[#D5E3E7] bg-white text-sm font-semibold leading-7 text-[#16344D] focus-visible:ring-[#2F90A1]"
              />
            </div>
            <div className="rounded-2xl border border-[#DCE8EC] bg-white p-4">
              <p className="text-[11px] font-extrabold text-[#6D818A]">תצוגה מקדימה</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold leading-7 text-[#405A67]">{previewTemplate(smsDraft)}</p>
            </div>
          </div>
          <SheetFooter className="mx-auto flex w-full max-w-2xl flex-row justify-start gap-2 border-t border-[#E2EBEE] bg-white px-5 py-4 sm:px-7">
            <Button type="button" variant="outline" onClick={() => setSmsEditor(null)} disabled={savingSheet} className="min-h-11 rounded-xl border-[#C9DDE3] px-5 font-extrabold text-[#526F7A]">ביטול</Button>
            <Button type="button" onClick={() => void saveSms()} disabled={savingSheet} className="min-h-11 rounded-xl bg-[#1D6472] px-5 font-extrabold text-white hover:bg-[#15525E]">{savingSheet ? "שומרת..." : "שמור נוסח"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={emailEditor !== null} onOpenChange={(open) => { if (!open && !savingSheet) setEmailEditor(null); }}>
        <SheetContent side="bottom" dir="rtl" className="z-[100] max-h-[94vh] overflow-y-auto rounded-t-[28px] border-[#DCE8EC] bg-[#FBFDFD] p-0">
          <SheetHeader className="border-b border-[#E2EBEE] px-5 pb-4 pt-6 text-right sm:px-7">
            <p className="text-xs font-extrabold tracking-[0.1em] text-[#2F8794]">תצוגות מייל ללקוח</p>
            <SheetTitle className="pr-8 text-right text-xl font-black text-[#102E47]">{activeEmailType?.label || "בחירת תצוגת מייל"}</SheetTitle>
            <SheetDescription className="max-w-2xl text-right text-sm font-semibold leading-6 text-[#6B818A]">בחרי את התבנית שתשמש את ההודעה הזו. הבחירה נשמרת בנפרד לכל סוג מייל.</SheetDescription>
          </SheetHeader>
          <div className="mx-auto w-full max-w-2xl space-y-4 px-5 py-5 sm:px-7">
            <div className="grid gap-3 md:grid-cols-2">
              {CUSTOMER_EMAIL_TEMPLATE_OPTIONS.map((option) => {
                const selected = emailDraftSelection === option.key;
                return (
                  <article
                    key={option.key}
                    className={`overflow-hidden rounded-2xl border transition ${selected ? "border-[#2F90A1] bg-[#F1F7F8] shadow-[0_8px_24px_rgba(47,144,161,0.14)]" : "border-[#DCE8EC] bg-white"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setEmailDraftSelection(option.key)}
                      className="w-full p-4 text-right transition hover:bg-[#F8FCFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2F90A1]"
                      aria-pressed={selected}
                      aria-label={`בחירת ${option.label}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-[#D6EEF0] text-[#1D6472]" : "bg-[#EEF5F6] text-[#5D7B84]"}`} aria-hidden="true">
                          <Mail className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-[#16344D]">{option.title}</span>
                            {selected && <span className="rounded-full bg-[#D6EEF0] px-2 py-1 text-[10px] font-extrabold text-[#1D6472]">נבחרה</span>}
                          </span>
                          <span className="mt-1 block text-xs font-semibold leading-5 text-[#6D818A]">{option.description}</span>
                        </span>
                        <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-[#2F90A1] bg-[#2F90A1]" : "border-[#B8CDD3]"}`} aria-hidden="true">
                          {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                        </span>
                      </div>
                    </button>
                    <div className="border-t border-[#DCE8EC] px-3 pb-3 pt-3">
                      <p className="text-[10px] font-extrabold tracking-[0.08em] text-[#6D818A]">תצוגה אמיתית של התבנית</p>
                      <div className="mt-2 overflow-hidden rounded-xl border border-[#DCE8EC] bg-[#EAF4F6] p-1">
                        <iframe
                          title={`תצוגה מקדימה של ${option.label}`}
                          srcDoc={buildCustomerEmailPreviewHtml(emailEditor ?? "booking_request", option.key)}
                          sandbox=""
                          referrerPolicy="no-referrer"
                          className="block h-[300px] w-full border-0 bg-white"
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="rounded-2xl border border-[#C9DDE3] bg-white p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id="customer-email-template-preview-title" className="text-[10px] font-extrabold tracking-[0.08em] text-[#6D818A]">תצוגה לפי הבחירה הנוכחית</p>
                  <p className="mt-1 text-sm font-black text-[#16344D]">{emailTemplateLabel(emailDraftSelection)}</p>
                  <p className="mt-1 text-[11px] font-semibold leading-5 text-[#748891]">נתוני הדוגמה נועדו לתצוגה בלבד. הבחירה עדיין לא נשמרה.</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-bold text-[#2F8794]"><span className="h-1.5 w-1.5 rounded-full bg-[#2F90A1]" aria-hidden="true" /> מתעדכנת מיד</span>
              </div>
              <div className="mt-3 overflow-hidden rounded-xl border border-[#DCE8EC] bg-[#EAF4F6] p-1.5 sm:p-2">
                <iframe
                  key={`${emailEditor || "customer-email-preview"}-${emailDraftSelection}`}
                  title={`תצוגה מקדימה של ${activeEmailType?.label || "המייל"}, ${emailTemplateLabel(emailDraftSelection)}`}
                  aria-labelledby="customer-email-template-preview-title"
                  srcDoc={emailPreviewHtml}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  className="block h-[580px] w-full border-0 bg-white sm:h-[620px]"
                />
              </div>
              <p className="mt-2 text-[11px] font-semibold leading-5 text-[#617984]">שתי התבניות שומרות על תוכן ההודעה, פרטי התור והקישורים הרלוונטיים. התבנית השיווקית מוסיפה את סימן המים של לוגו המרפאה ומבנה שיווקי נקי יותר.</p>
            </div>

            <div className="flex items-start gap-2 rounded-2xl border border-[#C9DDE3] bg-[#F1F7F8] px-4 py-3 text-xs font-semibold leading-5 text-[#526F7A]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2F8794]" aria-hidden="true" />
              <p>קיימות שתי תבניות זמינות. הבחירה נשמרת רק אחרי לחיצה על ״אישור ושמירה״, ורק עבור סוג המייל שפתחת עכשיו.</p>
            </div>
          </div>
          <SheetFooter className="mx-auto flex w-full max-w-2xl flex-row justify-start gap-2 border-t border-[#E2EBEE] bg-white px-5 py-4 sm:px-7">
            <Button type="button" variant="outline" onClick={() => setEmailEditor(null)} disabled={savingSheet} className="min-h-11 rounded-xl border-[#C9DDE3] px-5 font-extrabold text-[#526F7A]">ביטול</Button>
            <Button type="button" onClick={() => void saveEmailSelection()} disabled={savingSheet} className="min-h-11 rounded-xl bg-[#1D6472] px-5 font-extrabold text-white hover:bg-[#15525E]">{savingSheet ? "שומרת..." : "אישור ושמירה"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </motion.section>
  );
}
