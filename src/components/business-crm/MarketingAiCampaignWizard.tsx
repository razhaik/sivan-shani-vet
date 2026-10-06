import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, RefreshCw, Sparkles, X } from "lucide-react";
import { invokeLLM } from "@/integrations/core";
import {
  TRIGGER_OPTIONS,
  type CampaignDraft,
  type TimingRelation,
  type TimingUnit,
} from "./MarketingAutomationWizard";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (draft: CampaignDraft) => void;
}

const MAX_PROMPT_LENGTH = 2000;

const inputClass =
  "mt-2 min-h-[156px] w-full resize-y rounded-2xl border border-[#D9DFEA] bg-white px-4 py-3 text-sm font-semibold leading-7 text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#5267A8] focus:ring-2 focus:ring-[#F2D162]/70";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textValue(record: Record<string, unknown>, key: string, maxLength: number) {
  const value = record[key];
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function integerValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isTimingRelation(value: unknown): value is TimingRelation {
  return value === "same_day" || value === "before" || value === "after";
}

function isTimingUnit(value: unknown): value is TimingUnit {
  return value === "hours" || value === "days";
}

function hasOnlySafePlaceholders(value: string) {
  const withoutSafePlaceholders = value
    .replace(/\{client_first_name\}/g, "")
    .replace(/\{pet_name\}/g, "");
  return !/[{}]/.test(withoutSafePlaceholders);
}

function normalizeGeneratedDraft(value: unknown): CampaignDraft | null {
  const record = asRecord(value);
  if (!record) return null;

  const campaignName = textValue(record, "campaign_name", 120);
  const emailSubject = textValue(record, "email_subject", 160);
  const messageBody = textValue(record, "message_body", 5000);
  const audienceDescription = textValue(record, "audience_description", 300);
  const triggerType = record.trigger_type;
  const triggerValue = integerValue(record, "trigger_value");
  const timingRelation = record.timing_relation;
  const timingUnit = record.timing_unit;
  const timingValue = integerValue(record, "timing_value");

  if (!campaignName || !emailSubject || !messageBody || !audienceDescription) return null;
  if (!hasOnlySafePlaceholders(emailSubject) || !hasOnlySafePlaceholders(messageBody)) return null;
  if (typeof triggerType !== "string" || !TRIGGER_OPTIONS.some(([key]) => key === triggerType)) return null;
  if (triggerValue === null || triggerValue < 0 || triggerValue > 3650) return null;
  if (triggerType === "inactive_days" && triggerValue < 1) return null;
  if (!isTimingRelation(timingRelation) || !isTimingUnit(timingUnit)) return null;
  if (timingValue === null || timingValue < 0 || timingValue > 3650) return null;
  if (timingRelation !== "same_day" && timingValue < 1) return null;

  return {
    campaign_name: campaignName,
    campaign_type: "automatic",
    status: "draft",
    channel: "email",
    template_key: "ai-generated",
    trigger_type: triggerType,
    trigger_value: triggerType === "inactive_days" ? triggerValue : 0,
    timing_relation: timingRelation,
    timing_unit: timingUnit,
    timing_value: timingRelation === "same_day" ? 0 : timingValue,
    email_subject: emailSubject,
    message_body: messageBody,
    audience_description: audienceDescription,
    sms_consent_acknowledged: false,
    enabled: false,
  };
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("429") || message.includes("rate") || message.includes("limit")) {
    return "המערכת עמוסה כרגע. המתינו רגע ונסו שוב.";
  }
  if (message === "invalid_ai_draft") {
    return "ה-AI החזיר טיוטה שלא התאימה להגדרות הנתמכות. נסו שוב עם בקשה מעט מפורטת יותר.";
  }
  return "לא הצלחנו ליצור טיוטה כרגע. בדקו את הבקשה ונסו שוב.";
}

export function MarketingAiCampaignWizard({ isOpen, onClose, onGenerated }: Props) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setGenerating(false);
      setError("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !generating) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [generating, isOpen, onClose]);

  async function generateDraft() {
    const request = prompt.trim();
    if (!request) {
      setError("כתבו מה תרצו שהקמפיין יעשה, למשל למי ומתי לשלוח.");
      return;
    }

    setGenerating(true);
    setError("");
    try {
      const supportedTriggers = TRIGGER_OPTIONS.map(([key, label]) => `${key}: ${label}`).join(", ");
      const response = await invokeLLM({
        mode: "standard",
        prompt: `את/ה יועץ/ת שיווק עבור ${VETERINARY_CLINIC_PROFILE.shortName}, ${VETERINARY_CLINIC_PROFILE.categoryLabel} בישראל. המרפאה מדברת בעברית, בסגנון מקצועי, חם וברור, עם הסיסמה "${VETERINARY_CLINIC_PROFILE.tagline}".

צור/י טיוטה לקמפיין אוטומטי בערוץ אימייל בלבד, על בסיס בקשת המשתמש/ת. הקמפיין נשמר כטיוטה לבדיקה בלבד. אין לשלוח הודעה, להפעיל קמפיין, ליצור אנשי קשר, להחזיר תוצאות או להמציא טריגרים.

החזר/י אובייקט JSON בלבד לפי הסכמה. השתמש/י רק בטריגרים הנתמכים הבאים: ${supportedTriggers}.
השתמש/י רק ביחסי תזמון same_day, before או after, ורק ביחידות hours או days.
trigger_value הוא מספר הימים רק עבור inactive_days. עבור טריגרים אחרים החזר/י 0.
כאשר timing_relation הוא same_day, החזר/י timing_value של 0. כאשר היחס הוא before או after, החזר/י מספר חיובי.

כתוב/י תוכן אימייל טבעי בעברית. אפשר להשתמש רק במשתנים {client_first_name} ו-{pet_name}, ורק כאשר הם מתאימים. אל תשתמש/י בשום משתנה, קישור או נתון אישי אחר. הימנע/י ממקף ארוך ומניסוחים מוגזמים.

בקשת המשתמש/ת:
"""
${request}
"""`,
        response_json_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            campaign_name: {
              type: "string",
              description: "שם קצר וברור לקמפיין האוטומטי",
            },
            email_subject: {
              type: "string",
              description: "נושא האימייל בעברית",
            },
            message_body: {
              type: "string",
              description: "גוף אימייל בעברית, עם ירידות שורה לפי הצורך",
            },
            audience_description: {
              type: "string",
              description: "תיאור קצר של קהל היעד",
            },
            trigger_type: {
              type: "string",
              enum: TRIGGER_OPTIONS.map(([key]) => key),
              description: "אחד מהטריגרים הנתמכים בלבד",
            },
            trigger_value: {
              type: "integer",
              minimum: 0,
              maximum: 3650,
              description: "מספר הימים עבור inactive_days, או 0 עבור כל טריגר אחר",
            },
            timing_relation: {
              type: "string",
              enum: ["same_day", "before", "after"],
              description: "יחס התזמון לטריגר",
            },
            timing_unit: {
              type: "string",
              enum: ["hours", "days"],
              description: "יחידת התזמון",
            },
            timing_value: {
              type: "integer",
              minimum: 0,
              maximum: 3650,
              description: "ערך התזמון, או 0 עבור same_day",
            },
          },
          required: [
            "campaign_name",
            "email_subject",
            "message_body",
            "audience_description",
            "trigger_type",
            "trigger_value",
            "timing_relation",
            "timing_unit",
            "timing_value",
          ],
        },
      });

      const draft = normalizeGeneratedDraft(response);
      if (!draft) throw new Error("invalid_ai_draft");
      onGenerated(draft);
    } catch (generationError) {
      console.error("Failed to generate an automatic email campaign draft:", generationError);
      setError(errorMessage(generationError));
    } finally {
      setGenerating(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void generateDraft();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6"
          dir="rtl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="סגירת יצירה עם AI"
            onClick={() => !generating && onClose()}
            className="absolute inset-0 bg-[#1A1A3E]/[0.48] backdrop-blur-[3px]"
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="marketing-ai-title"
            initial={{ y: 18, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 18, scale: 0.98 }}
            className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]"
          >
            <header className="relative overflow-hidden border-b border-[#E8EAED] bg-[#F5F7FF] px-5 py-5 sm:px-7 sm:py-6">
              <div className="pointer-events-none absolute -left-8 -top-16 h-40 w-40 rounded-full bg-[#F2D162]/[0.35] blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1A1A3E] text-[#F2D162] shadow-sm">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-black tracking-wide text-[#5267A8]">יצירת קמפיין חכמה</p>
                    <h2 id="marketing-ai-title" className="mt-1 text-xl font-black text-[#1A1A3E]">
                      תארו מה תרצו לשלוח
                    </h2>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                      ה-AI יבנה טיוטת אימייל אוטומטי שתוכלו לבדוק ולערוך.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={generating}
                  aria-label="סגירה"
                  className="rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
                <div className="flex items-start gap-3 rounded-2xl border border-[#D9E2F8] bg-[#F7F9FF] px-4 py-3 text-sm font-semibold leading-6 text-[#344777]">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>
                    התוצאה היא טיוטה בלבד. שום דבר לא נשלח או מופעל, והיא תיפתח לעריכה לפני שמירה.
                  </p>
                </div>

                <div>
                  <label htmlFor="marketing-ai-prompt" className="block text-sm font-black text-[#1A1A3E]">
                    מה תרצו שהקמפיין יעשה?
                  </label>
                  <textarea
                    id="marketing-ai-prompt"
                    value={prompt}
                    maxLength={MAX_PROMPT_LENGTH}
                    onChange={(event) => {
                      setPrompt(event.target.value);
                      if (error) setError("");
                    }}
                    placeholder="לדוגמה: שלחו מייל עדין ללקוחות שלא ביקרו כבר 90 יום, הזמינו אותם לבדיקה והזכירו שאנחנו כאן בשבילם."
                    className={inputClass}
                    disabled={generating}
                    aria-describedby="marketing-ai-example marketing-ai-count"
                  />
                  <div className="mt-2 flex items-start justify-between gap-3 text-xs font-semibold text-slate-500">
                    <p id="marketing-ai-example" className="leading-5">
                      אפשר לכתוב בעברית טבעית ולציין קהל, מטרה ותזמון, בלי שמות או פרטים אישיים.
                    </p>
                    <span id="marketing-ai-count" className="shrink-0 tabular-nums">
                      {prompt.length}/{MAX_PROMPT_LENGTH}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E8EAED] bg-[#FCFCFD] p-4">
                  <p className="text-xs font-black tracking-wide text-[#5267A8]">דוגמה לבקשה טובה</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    "ברכו לקוחות ביום ההולדת של חיית המחמד, כתבו בטון חם והציעו לקבוע ביקורת אם הגיע הזמן."
                  </p>
                </div>

                {error && (
                  <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-[#B33A3A]">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p>{error}</p>
                      {!generating && (
                        <button
                          type="button"
                          onClick={() => void generateDraft()}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-black text-[#8E2B2B] underline decoration-[#DFA4A4] underline-offset-2 transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-[#F2D162]"
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          נסו שוב
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {generating && (
                  <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-[#D9E2F8] bg-[#F7F9FF] px-4 py-3 text-sm font-bold text-[#344777]">
                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#BFCBEA] border-t-[#5267A8]" />
                    בונה טיוטת אימייל לפי הבקשה שלכם...
                  </div>
                )}
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8EAED] bg-[#FCFCFD] px-5 py-4 sm:px-7">
                <p className="max-w-[17rem] text-xs font-semibold leading-5 text-slate-500">
                  תוצאת ה-AI משתמשת רק בשדות ובטריגרים שהמערכת תומכת בהם.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={generating}
                    className="min-h-11 rounded-xl border border-[#E1E4E8] bg-white px-4 text-sm font-extrabold text-[#1A1A3E] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={generating}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Sparkles className="h-4 w-4 text-[#F2D162]" aria-hidden="true" />}
                    {generating ? "יוצרים טיוטה..." : "יצירת טיוטה"}
                  </button>
                </div>
              </footer>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
