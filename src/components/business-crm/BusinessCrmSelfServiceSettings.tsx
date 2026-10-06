import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Info, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";
import { SettingsGroup, SettingsRow, StatusPill } from "@/components/business-crm/SettingsPrimitives";

export type SelfServiceSettingsPayload = {
  self_service_appointment_management_enabled: boolean;
  self_service_cancellation_min_hours: number;
  self_service_reschedule_min_hours: number;
  self_service_cancellation_cutoff_message: string;
};

type SelfServiceSettingsRecord = Record<string, unknown> & { id?: string };
type Feedback = { kind: "success" | "error"; message: string };

interface BusinessCrmSelfServiceSettingsProps {
  setting?: SelfServiceSettingsRecord;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void | Promise<unknown>;
  onSave: (payload: SelfServiceSettingsPayload) => Promise<void>;
}

const DEFAULT_MINIMUM_HOURS = 24;
const DEFAULT_CUTOFF_MESSAGE = `לא ניתן עוד לבטל את התור באופן עצמאי, כי נותרו פחות מהזמן שהוגדר לפני מועד התור. לשינוי דחוף, אנא צרו קשר עם המרפאה בטלפון ${VETERINARY_CLINIC_PROFILE.phone}.`;
const CANCELLATION_WINDOWS = [
  { value: "0", label: "ללא הגבלה" },
  { value: "2", label: "2 שעות לפני התור" },
  { value: "6", label: "6 שעות לפני התור" },
  { value: "12", label: "12 שעות לפני התור" },
  { value: "24", label: "24 שעות לפני התור" },
  { value: "48", label: "48 שעות לפני התור" },
] as const;

function parseSavedWindow(value: unknown): number | null {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;

  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 48) return null;
  return CANCELLATION_WINDOWS.some((option) => Number(option.value) === numeric) ? numeric : null;
}

function savedMinimumHours(value: unknown): string {
  return String(parseSavedWindow(value) ?? DEFAULT_MINIMUM_HOURS);
}

function savedRescheduleMinimumHours(rescheduleValue: unknown, cancellationValue: unknown): string {
  return String(parseSavedWindow(rescheduleValue) ?? parseSavedWindow(cancellationValue) ?? DEFAULT_MINIMUM_HOURS);
}

function savedCutoffMessage(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : DEFAULT_CUTOFF_MESSAGE;
}

export default function BusinessCrmSelfServiceSettings({
  setting,
  isLoading,
  hasError,
  onRetry,
  onSave,
}: BusinessCrmSelfServiceSettingsProps) {
  const [enabled, setEnabled] = useState(setting?.self_service_appointment_management_enabled === true);
  const [minimumHours, setMinimumHours] = useState(savedMinimumHours(setting?.self_service_cancellation_min_hours));
  const [rescheduleMinimumHours, setRescheduleMinimumHours] = useState(
    savedRescheduleMinimumHours(
      setting?.self_service_reschedule_min_hours,
      setting?.self_service_cancellation_min_hours,
    ),
  );
  const [cutoffMessage, setCutoffMessage] = useState(savedCutoffMessage(setting?.self_service_cancellation_cutoff_message));
  const [isSaving, setIsSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    setEnabled(setting?.self_service_appointment_management_enabled === true);
    setMinimumHours(savedMinimumHours(setting?.self_service_cancellation_min_hours));
    setRescheduleMinimumHours(
      savedRescheduleMinimumHours(
        setting?.self_service_reschedule_min_hours,
        setting?.self_service_cancellation_min_hours,
      ),
    );
    setCutoffMessage(savedCutoffMessage(setting?.self_service_cancellation_cutoff_message));
    setShowValidation(false);
    setFeedback(null);
  }, [
    setting?.self_service_appointment_management_enabled,
    setting?.self_service_cancellation_min_hours,
    setting?.self_service_reschedule_min_hours,
    setting?.self_service_cancellation_cutoff_message,
  ]);

  const controlsDisabled = isLoading || hasError || isSaving;
  const messageError = showValidation && !cutoffMessage.trim()
    ? "יש לנסח הודעה שתוצג ללקוח לאחר שחלף הזמן המותר לביטול."
    : cutoffMessage.length > 500
      ? "ההודעה יכולה להכיל עד 500 תווים."
      : null;

  const clearFeedback = () => {
    setFeedback(null);
    setShowValidation(false);
  };

  const handleSave = async () => {
    if (isLoading) {
      setFeedback({ kind: "error", message: "הגדרות המרפאה עדיין נטענות. נסי שוב בעוד רגע." });
      return;
    }
    if (hasError) {
      setFeedback({ kind: "error", message: "לא ניתן לשמור לפני טעינה תקינה של הגדרות המרפאה." });
      return;
    }

    setShowValidation(true);
    const selectedCancellationWindow = CANCELLATION_WINDOWS.find((option) => option.value === minimumHours);
    const selectedRescheduleWindow = CANCELLATION_WINDOWS.find((option) => option.value === rescheduleMinimumHours);
    const nextMessageError = !cutoffMessage.trim()
      ? "יש לנסח הודעה שתוצג ללקוח לאחר שחלף הזמן המותר לביטול."
      : cutoffMessage.length > 500
        ? "ההודעה יכולה להכיל עד 500 תווים."
        : null;
    if (!selectedCancellationWindow || !selectedRescheduleWindow || nextMessageError) {
      setFeedback({
        kind: "error",
        message: nextMessageError || "בחרי חלון זמן תקין לפני השמירה.",
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      await onSave({
        self_service_appointment_management_enabled: enabled,
        self_service_cancellation_min_hours: Number(selectedCancellationWindow.value),
        self_service_reschedule_min_hours: Number(selectedRescheduleWindow.value),
        self_service_cancellation_cutoff_message: cutoffMessage.trim(),
      });
      setFeedback({ kind: "success", message: "הגדרות ניהול התורים העצמאי נשמרו בהצלחה." });
    } catch (error) {
      console.error("Failed to save customer self-service appointment settings:", error);
      setFeedback({
        kind: "error",
        message: error instanceof Error && error.message ? error.message : "לא הצלחנו לשמור את ההגדרות. נסי שוב.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section id="crm-self-service-settings-panel" aria-label="ניהול תורים עצמאי ללקוח" dir="rtl" className="space-y-5">
      <div className="space-y-5">
        {hasError && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <span>לא הצלחנו לטעון את הגדרות ניהול התורים השמורות. אפשר לצפות בברירות המחדל, ושמירה תתאפשר לאחר טעינה תקינה.</span>
            </div>
            <button type="button" onClick={() => void onRetry()} className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />נסי שוב
            </button>
          </div>
        )}

        {isLoading && !hasError && (
          <div role="status" className="flex items-center gap-2 rounded-2xl border border-[#DCE8EC] bg-[#F1F7F8] px-4 py-3 text-sm font-bold text-[#526F7A]">
            <RefreshCw className="h-4 w-4 animate-spin text-[#2F90A1]" aria-hidden="true" />
            טוענים את ההגדרות השמורות. אפשר לערוך אחרי שהטעינה תסתיים.
          </div>
        )}

        <SettingsGroup title="הפעלה" footer="המתג קובע אם קישורים חדשים יאפשרו ללקוח לצפות בפרטי התור ולבטל אותו בעצמו.">
          <SettingsRow icon={ShieldCheck} title="אפשר ללקוחות לנהל תורים באופן עצמאי" description="כשהאפשרות פעילה, מיילים חדשים כוללים קישור אחד ומאובטח שבו הלקוח יכול לצפות בפרטי התור ולבטל אותו בעצמו.">
            <div className="flex items-center gap-2">
              <StatusPill label={enabled ? "פעיל" : "כבוי"} tone={enabled ? "success" : "neutral"} />
              <Switch checked={enabled} onCheckedChange={(checked) => { setEnabled(checked); clearFeedback(); }} disabled={controlsDisabled} aria-label="אפשר ללקוחות לנהל תורים באופן עצמאי" />
            </div>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="מדיניות ביטול ושינוי מועד" footer="החלון נמדד לפי מועד התור המקורי. הדף והמערכת בודקים את ההגדרה לפני ביצוע ביטול.">
          <div className="space-y-3 py-4">
            <div className="rounded-[18px] border border-[#DCE8EC] bg-white p-4">
              <Label htmlFor="self-service-cancellation-window" className="text-sm font-black text-[#16344D]">כמה זמן לפני התור אפשר לבטל?</Label>
              <select
                id="self-service-cancellation-window"
                value={minimumHours}
                onChange={(event) => { setMinimumHours(event.target.value); clearFeedback(); }}
                disabled={controlsDisabled}
                className="mt-3 h-12 w-full rounded-xl border border-[#C9DDE3] bg-white px-3 text-sm font-black text-[#16344D] outline-none transition focus:border-[#2F90A1] focus:ring-2 focus:ring-[#2F90A1]/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {CANCELLATION_WINDOWS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <p className="mt-2 text-xs font-semibold leading-5 text-[#738790]">״ללא הגבלה״ מאפשר ביטול עד שמועד התור מתחיל. שעות הפעילות של המרפאה אינן משנות את החישוב.</p>
            </div>

            <div className="rounded-[18px] border border-[#BBD6DC] bg-[#F1F7F8] p-4">
              <div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#2F8794]" aria-hidden="true" /><div><Label htmlFor="self-service-reschedule-window" className="text-sm font-black text-[#16344D]">זמן מינימלי מראש לבקשת שינוי מועד, הכנה לשלב הבא</Label><p className="mt-1 text-sm font-semibold leading-6 text-[#526F7A]">ההגדרה נשמרת בנפרד מחלון הביטול. כרגע הלקוחות עדיין לא יכולים להגיש בקשת שינוי מועד; לאחר חיבור הזרימה, כל בקשה תמתין לאישור הצוות.</p></div></div>
              <select
                id="self-service-reschedule-window"
                value={rescheduleMinimumHours}
                onChange={(event) => { setRescheduleMinimumHours(event.target.value); clearFeedback(); }}
                disabled={controlsDisabled}
                aria-describedby="self-service-reschedule-window-help"
                className="mt-3 h-12 w-full rounded-xl border border-[#C9DDE3] bg-white px-3 text-sm font-black text-[#16344D] outline-none transition focus:border-[#2F90A1] focus:ring-2 focus:ring-[#2F90A1]/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {CANCELLATION_WINDOWS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <p id="self-service-reschedule-window-help" className="mt-2 text-xs font-semibold leading-5 text-[#526F7A]">״ללא הגבלה״ מסיר את מגבלת השעות מראש, אך מועד שכבר עבר תמיד יישאר לא תקין.</p>
            </div>
          </div>
        </SettingsGroup>

        <SettingsGroup title="הודעה לאחר שחלף הזמן המותר" footer="הלקוח יראה את ההודעה הזו בדף ניהול התור כשהביטול העצמאי כבר אינו אפשרי.">
          <div className="flex items-start gap-3 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F3F5] text-[#2F8794]"><Info className="h-5 w-5" aria-hidden="true" /></div>
            <div className="min-w-0 flex-1">
              <Label htmlFor="self-service-cutoff-message" className="text-sm font-black text-[#16344D]">הודעת הסבר ללקוח</Label>
              <Textarea
                id="self-service-cutoff-message"
                value={cutoffMessage}
                onChange={(event) => { setCutoffMessage(event.target.value); clearFeedback(); }}
                disabled={controlsDisabled}
                maxLength={500}
                aria-invalid={Boolean(messageError)}
                aria-describedby="self-service-cutoff-message-help"
                className={`mt-3 min-h-[132px] resize-y rounded-xl border-[#C9DDE3] bg-white text-sm font-semibold leading-7 focus-visible:ring-[#2F90A1] ${messageError ? "border-red-400 focus-visible:ring-red-300" : ""}`}
              />
              <div className="mt-2 flex items-start justify-between gap-3 text-xs font-semibold leading-5 text-[#738790]">
                <span id="self-service-cutoff-message-help">אפשר לכלול טלפון או הנחיה ליצירת קשר עם המרפאה.</span>
                <span className="shrink-0" aria-live="polite">{cutoffMessage.length}/500</span>
              </div>
              {messageError && <p role="alert" className="mt-2 text-xs font-bold leading-5 text-red-700">{messageError}</p>}
            </div>
          </div>
        </SettingsGroup>

        <div className="flex items-start gap-2 rounded-[20px] border border-[#BBD6DC] bg-[#F1F7F8] p-3 text-xs font-semibold leading-5 text-[#526F7A]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2F8794]" aria-hidden="true" />
          <p>בשלב הזה הקישור מאפשר ללקוח לצפות בפרטי התור ולבטל אותו בלבד. שינוי מועד עדיין מתבצע מול המרפאה, כדי שהצוות יאשר את המועד החדש.</p>
        </div>

        {(feedback || messageError) && (
          <div aria-live="polite">
            {feedback && <div role={feedback.kind === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-bold leading-6 ${feedback.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>
              {feedback.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              {feedback.message}
            </div>}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-[22px] border border-[#DCE8EC] bg-[#F9FCFC] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs font-semibold leading-5 text-[#738790]">השינוי חל על קישורים חדשים במיילים. קישורי ביטול ישנים ממשיכים לפעול במסלול הקיים.</p>
          <Button type="button" onClick={() => void handleSave()} disabled={controlsDisabled} className="min-h-12 w-full rounded-xl bg-[#16344D] px-6 font-black text-white shadow-sm hover:bg-[#102E47] focus-visible:ring-2 focus-visible:ring-[#2F90A1] focus-visible:ring-offset-2 sm:w-auto">
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSaving ? "שומרת..." : "שמירת הגדרות ניהול תורים"}
          </Button>
        </div>
      </div>
    </section>
  );
}
