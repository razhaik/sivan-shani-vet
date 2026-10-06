import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, RefreshCw, Sparkles, X } from "lucide-react";
import { invokeLLM } from "@/integrations/core";
import type { BroadcastChannel } from "./MarketingBroadcastWizard";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

export interface AiBroadcastDraft {
  broadcast_name: string;
  email_subject: string;
  message_body: string;
}

interface Props {
  isOpen: boolean;
  channel: BroadcastChannel;
  onClose: () => void;
  onGenerated: (draft: AiBroadcastDraft) => void;
}

const MAX_PROMPT_LENGTH = 2000;
const MAX_BROADCAST_NAME_LENGTH = 120;
const MAX_EMAIL_SUBJECT_LENGTH = 160;
const MAX_MESSAGE_BODY_LENGTH = 500;

const inputClass =
  "mt-2 min-h-[156px] w-full resize-y rounded-2xl border border-[#D9DFEA] bg-white px-4 py-3 text-sm font-semibold leading-7 text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#5267A8] focus:ring-2 focus:ring-[#F2D162]/70";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textValue(record: Record<string, unknown>, key: string, maxLength: number, allowEmpty = false) {
  const value = record[key];
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!allowEmpty && !normalized) return null;
  if (normalized.length > maxLength || /\u0000/.test(normalized)) return null;
  return normalized;
}

function hasOnlySafePlaceholders(value: string) {
  const withoutSafePlaceholders = value
    .replace(/\{client_first_name\}/g, "")
    .replace(/\{pet_name\}/g, "");
  return !/[{}]/.test(withoutSafePlaceholders);
}

function hasUnsupportedLink(value: string) {
  return /(?:https?:\/\/|www\.|tel:)/i.test(value);
}

function isSingleLine(value: string) {
  return !/[\r\n]/.test(value);
}

function normalizeGeneratedDraft(value: unknown, channel: BroadcastChannel): AiBroadcastDraft | null {
  const record = asRecord(value);
  if (!record) return null;

  const broadcastName = textValue(record, "broadcast_name", MAX_BROADCAST_NAME_LENGTH);
  const emailSubject = textValue(record, "email_subject", MAX_EMAIL_SUBJECT_LENGTH, true);
  const messageBody = textValue(record, "message_body", MAX_MESSAGE_BODY_LENGTH);

  if (!broadcastName || emailSubject === null || !messageBody) return null;
  if (!isSingleLine(broadcastName) || !isSingleLine(emailSubject)) return null;
  if (!hasOnlySafePlaceholders(broadcastName) || !hasOnlySafePlaceholders(emailSubject) || !hasOnlySafePlaceholders(messageBody)) return null;
  if (hasUnsupportedLink(broadcastName) || hasUnsupportedLink(emailSubject) || hasUnsupportedLink(messageBody)) return null;

  if (channel === "email" && !emailSubject) return null;
  if (channel === "sms" && emailSubject !== "") return null;

  return {
    broadcast_name: broadcastName,
    email_subject: channel === "email" ? emailSubject : "",
    message_body: messageBody,
  };
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("429") || message.includes("rate") || message.includes("limit")) {
    return "המערכת עמוסה כרגע. המתינו רגע ונסו שוב.";
  }
  if (message === "invalid_ai_draft") {
    return "ה-AI החזיר טיוטה שלא התאימה למגבלות ההודעה. נסו שוב עם בקשה מעט מפורטת יותר.";
  }
  return "לא הצלחנו ליצור טיוטה כרגע. בדקו את הבקשה ונסו שוב.";
}

export function MarketingAiBroadcastWizard({ isOpen, channel, onClose, onGenerated }: Props) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const isEmail = channel === "email";
  const channelLabel = isEmail ? "אימייל" : "SMS";

  useEffect(() => {
    setPrompt("");
    setGenerating(false);
    setError("");
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
      setError("כתבו מה תרצו שההודעה תעשה, למי היא מיועדת ומה חשוב לכם לומר.");
      return;
    }

    setGenerating(true);
    setError("");
    try {
      const channelInstructions = isEmail
        ? `ערוץ: אימייל. החזר/י נושא קצר בעברית עד ${MAX_EMAIL_SUBJECT_LENGTH} תווים וגוף הודעה בעברית עד ${MAX_MESSAGE_BODY_LENGTH} תווים.`
        : `ערוץ: SMS. החזר/י email_subject כמחרוזת ריקה וגוף קצר וברור בעברית, עד ${MAX_MESSAGE_BODY_LENGTH} תווים ומתאים לקריאה במסרון.`;

      const response = await invokeLLM({
        mode: "standard",
        prompt: `את/ה יועץ/ת שיווק עבור ${VETERINARY_CLINIC_PROFILE.shortName}, ${VETERINARY_CLINIC_PROFILE.categoryLabel} בישראל. זהו מסר חד-פעמי של המרפאה, שמדברת בעברית בטון מקצועי, חם, ברור ואחראי, עם הזהות "${VETERINARY_CLINIC_PROFILE.tagline}".

צור/י טיוטת תוכן בלבד על בסיס בקשת המשתמש/ת. ${channelInstructions}
שם ההודעה צריך להיות קצר וברור ועד ${MAX_BROADCAST_NAME_LENGTH} תווים.

הטיוטה תיכנס לעורך קיים לבדיקה ועריכה. אין לשלוח, לשמור, לסמן כמוכנה, לתזמן או להפעיל דבר. אין לבחור נמענים, לשנות קהל, להחליף ערוץ, לבחור פעולה או להמציא CTA. אין להמציא שמות של לקוחות או חיות מחמד, קישורים, מספרי טלפון, מחירים, תורים, שעות פעילות, אבחנות, הבטחות רפואיות או נתונים שאינם בבקשת המשתמש/ת. אל תכניס/י קישור לגוף ההודעה. אם המשתמש/ת מבקש/ת קישור או פעולה, נסח/י את ההודעה כך שהפעולה שתיבחר בעורך תוכל להופיע בנפרד.

אפשר להשתמש רק במשתנים {client_first_name} ו-{pet_name}, ורק כאשר הם מועילים. אין להשתמש בשום משתנה או סוגריים מסולסלים אחרים. אין להשתמש בניסוחים מוגזמים או במקף ארוך.

בקשת המשתמש/ת:
"""
${request}
"""`,
        response_json_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            broadcast_name: {
              type: "string",
              maxLength: MAX_BROADCAST_NAME_LENGTH,
              description: "שם קצר וברור להודעה החד-פעמית",
            },
            email_subject: {
              type: "string",
              maxLength: MAX_EMAIL_SUBJECT_LENGTH,
              description: isEmail ? "נושא אימייל קצר בעברית" : "מחרוזת ריקה עבור SMS",
            },
            message_body: {
              type: "string",
              maxLength: MAX_MESSAGE_BODY_LENGTH,
              description: isEmail ? "גוף הודעת אימייל בעברית, עד 500 תווים" : "גוף SMS קצר בעברית, עד 500 תווים",
            },
          },
          required: ["broadcast_name", "email_subject", "message_body"],
        },
      });

      const draft = normalizeGeneratedDraft(response, channel);
      if (!draft) throw new Error("invalid_ai_draft");
      onGenerated(draft);
    } catch (generationError) {
      console.error("Failed to generate a one-time marketing message draft:", generationError);
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
          className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6"
          dir="rtl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="סגירת יצירה עם AI"
            onClick={() => !generating && onClose()}
            className="absolute inset-0 bg-[#1A1A3E]/[0.55] backdrop-blur-[3px]"
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="marketing-ai-broadcast-title"
            aria-describedby="marketing-ai-broadcast-description"
            initial={{ y: 18, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 18, scale: 0.98 }}
            className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]"
          >
            <header className="relative overflow-hidden bg-[#1A1A3E] px-5 py-5 text-white sm:px-7 sm:py-6">
              <div className="pointer-events-none absolute -left-10 -top-20 h-48 w-48 rounded-full bg-[#F2D162]/[0.22] blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 right-16 h-36 w-36 rounded-full bg-[#5267A8]/[0.35] blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F2D162] text-[#1A1A3E] shadow-sm">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-black tracking-wide text-[#F2D162]">יצירה חכמה · {channelLabel}</p>
                    <h2 id="marketing-ai-broadcast-title" className="mt-1 text-xl font-black">
                      תארו את ההודעה שתרצו ליצור
                    </h2>
                    <p id="marketing-ai-broadcast-description" className="mt-1 text-sm font-medium leading-6 text-white/75">
                      ה-AI יכין טיוטה לערוץ שבחרתם, ואתם תבדקו ותערכו אותה בעורך.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={generating}
                  aria-label="סגירה"
                  className="rounded-xl p-2 text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40"
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
                    התוצאה היא טיוטה בלבד. היא תעדכן רק את שם ההודעה, {isEmail ? "נושא האימייל ותוכן ההודעה" : "ותוכן ההודעה"}. הקהל, הערוץ, הפעולה, ההסכמה והמצב יישארו כפי שבחרתם.
                  </p>
                </div>

                <div>
                  <label htmlFor="marketing-ai-broadcast-prompt" className="block text-sm font-black text-[#1A1A3E]">
                    מה תרצו שההודעה תאמר?
                  </label>
                  <textarea
                    id="marketing-ai-broadcast-prompt"
                    dir="rtl"
                    value={prompt}
                    maxLength={MAX_PROMPT_LENGTH}
                    onChange={(event) => {
                      setPrompt(event.target.value);
                      if (error) setError("");
                    }}
                    placeholder="לדוגמה: כתבו הודעה חמה ללקוחות שהגיע הזמן לבדיקה שנתית של חיית המחמד, והזמינו אותם לקבוע תור."
                    className={inputClass}
                    disabled={generating}
                    aria-describedby="marketing-ai-broadcast-example marketing-ai-broadcast-count"
                  />
                  <div className="mt-2 flex items-start justify-between gap-3 text-xs font-semibold text-slate-500">
                    <p id="marketing-ai-broadcast-example" className="leading-5">
                      כתבו בעברית טבעית וציינו מטרה, קהל ומסר מרכזי. אין צורך להוסיף פרטי לקוחות.
                    </p>
                    <span id="marketing-ai-broadcast-count" className="shrink-0 tabular-nums">
                      {prompt.length}/{MAX_PROMPT_LENGTH}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E8EAED] bg-[#FCFCFD] p-4">
                  <p className="text-xs font-black tracking-wide text-[#5267A8]">דוגמה לבקשה טובה</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    "שלחו הודעה ללקוחות שלא ביקרו אצלנו זמן מה, הזכירו בעדינות שאפשר לקבוע בדיקה, ושמרו על טון חם ומרגיע."
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
                    יוצרים טיוטת {channelLabel} לפי הבקשה שלכם...
                  </div>
                )}
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8EAED] bg-[#FCFCFD] px-5 py-4 sm:px-7">
                <p className="max-w-[17rem] text-xs font-semibold leading-5 text-slate-500">
                  הטיוטה תישאר במצב הנוכחי עד שתבחרו לשמור אותה בעורך.
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
