import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  CircleAlert,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { textAgentChat } from "@/integrations/core";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

const ASSISTANT_PANEL_ID = "crm-assistant-panel";
const TEXT_AGENT_ID = "0484500f-40a4-4cb7-bba7-3a2dba35e173";
const TEXT_AGENT_PUBLIC_CHAT_KEY = "2d14da00a6b947707c1196fdf49c492734f4c632e1db24641061f1fc3e16a7a4";
const ASSISTANT_NAME = VETERINARY_CLINIC_PROFILE.assistantDisplayName;
const CONNECTION_ERROR = "לא הצלחתי להתחבר לעוזר המרפאה כרגע. בדקי את החיבור ונסי שוב.";
const RESPONSE_ERROR = "לא הצלחתי לקבל תשובה כרגע. בדקי את החיבור ונסי שוב.";
const FALLBACK_GREETING = "שלום, אני העוזר של המרפאה. אפשר לכתוב לי שאלה.";

const STARTER_PROMPTS = [
  "איך מחליפים תמונת פרופיל?",
  "איך מחפשים לקוח במערכת?",
  "איפה רואים בקשות תור?",
  "איך מנהלים התראות?",
];

type MessageRole = "assistant" | "user";

type AssistantMessage = {
  id: string;
  role: MessageRole;
  content: string;
};

type ConversationInit = {
  conversationId: string;
  greeting: string;
};

interface CrmAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const textAgentRequestOptions = {
  headers: {
    "X-Public-Chat-Key": TEXT_AGENT_PUBLIC_CHAT_KEY,
  },
};

function messageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function responseText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const candidate = value as Record<string, unknown>;
  for (const key of ["response", "text", "content", "output", "message"]) {
    if (typeof candidate[key] === "string") return candidate[key].trim();
  }
  return "";
}

function conversationId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const candidate = value as Record<string, unknown>;
  return typeof candidate.conversation_id === "string" ? candidate.conversation_id.trim() : "";
}

function plainText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/g, "$1")
    .trim();
}

export default function CrmAssistantPanel({ isOpen, onClose }: CrmAssistantPanelProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const reducedMotion = useReducedMotion() ?? false;
  const headingId = useId();
  const descriptionId = `${headingId}-description`;
  const statusId = `${headingId}-status`;
  const panelRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const conversationRequestRef = useRef<Promise<ConversationInit> | null>(null);

  const ensureConversation = useCallback(() => {
    if (conversationIdRef.current) {
      return Promise.resolve({ conversationId: conversationIdRef.current, greeting: "" });
    }
    if (conversationRequestRef.current) return conversationRequestRef.current;

    const request = textAgentChat(
      { agent_id: TEXT_AGENT_ID, mode: "init" },
      textAgentRequestOptions,
    )
      .then((result: unknown) => {
        const nextConversationId = conversationId(result);
        if (!nextConversationId) throw new Error("missing_conversation_id");
        conversationIdRef.current = nextConversationId;
        setIsConnected(true);
        return {
          conversationId: nextConversationId,
          greeting: plainText(responseText(result)) || FALLBACK_GREETING,
        };
      })
      .finally(() => {
        conversationRequestRef.current = null;
      });

    conversationRequestRef.current = request;
    return request;
  }, []);

  const connectToAssistant = useCallback(() => {
    if (isPending || conversationIdRef.current) return;
    setIsPending(true);
    setError(null);
    ensureConversation()
      .then(({ greeting }) => {
        setMessages((current) => current.length > 0 ? current : [{ id: messageId("assistant"), role: "assistant", content: greeting }]);
      })
      .catch(() => {
        setIsConnected(false);
        setError(CONNECTION_ERROR);
      })
      .finally(() => setIsPending(false));
  }, [ensureConversation, isPending]);

  useEffect(() => {
    if (!isOpen || isConnected || conversationIdRef.current || error) return;
    connectToAssistant();
  }, [connectToAssistant, error, isConnected, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      if (composerRef.current && !composerRef.current.disabled) {
        composerRef.current.focus();
        return;
      }
      panelRef.current?.querySelector<HTMLElement>("button:not([disabled]), textarea:not([disabled])")?.focus();
    }, reducedMotion ? 0 : 180);
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    const trapFocus = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("keydown", trapFocus);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose, reducedMotion]);

  useEffect(() => {
    if (isOpen) return;
    const previousFocus = previousFocusRef.current;
    if (!previousFocus?.isConnected) return;
    window.requestAnimationFrame(() => previousFocus.focus());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" });
  }, [isOpen, messages, isPending, reducedMotion]);

  const sendMessage = useCallback(async (rawQuestion: string, appendUserMessage = true) => {
    const question = rawQuestion.trim();
    const activeConversationId = conversationIdRef.current;
    if (!question || isPending || !isConnected || !activeConversationId) return;

    if (appendUserMessage) {
      setMessages((current) => [...current, { id: messageId("user"), role: "user", content: question }]);
    }
    setDraft("");
    setError(null);
    setLastFailedQuestion(null);
    setIsPending(true);

    try {
      const result = await textAgentChat(
        {
          agent_id: TEXT_AGENT_ID,
          mode: "message",
          message: question,
          conversation_id: activeConversationId,
        },
        textAgentRequestOptions,
      );
      const answer = plainText(responseText(result));
      if (!answer) throw new Error("empty_agent_response");
      setMessages((current) => [...current, { id: messageId("assistant"), role: "assistant", content: answer }]);
    } catch {
      setError(RESPONSE_ERROR);
      setLastFailedQuestion(question);
    } finally {
      setIsPending(false);
    }
  }, [isConnected, isPending]);

  const handleRetry = () => {
    if (lastFailedQuestion) {
      void sendMessage(lastFailedQuestion, false);
      return;
    }
    connectToAssistant();
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void sendMessage(draft);
  };

  const headerStatus = isPending
    ? isConnected ? "העוזר מכין תשובה" : "מתחבר לעוזר המרפאה"
    : error
      ? "נדרשת בדיקת חיבור"
      : isConnected
        ? "מחובר לעוזר של המרפאה"
        : "ממתין לחיבור";
  const controlsDisabled = isPending || !isConnected;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            type="button"
            aria-label="סגירת עוזר המרפאה"
            tabIndex={-1}
            onClick={onClose}
            className="fixed inset-0 z-[29] cursor-default bg-[#1A1A3E]/20 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
          />
          <motion.section
            ref={panelRef}
            id={ASSISTANT_PANEL_ID}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            aria-describedby={descriptionId}
            aria-busy={isPending}
            dir="rtl"
            className="fixed inset-x-3 bottom-3 top-[80px] z-[70] flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-[#E1E4E8] bg-[#FBFCFD] shadow-[0_24px_70px_rgba(26,26,62,0.28)] sm:bottom-5 sm:left-4 sm:right-auto sm:top-[88px] sm:w-[min(440px,calc(100vw-2rem))]"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -26 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
            transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="relative shrink-0 overflow-hidden border-b border-[#E8EAF0] bg-white px-5 pb-4 pt-5">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#6D5ACF] via-[#8A78E4] to-[#F2D162]" aria-hidden="true" />
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EEEAFE] text-[#6D5ACF] shadow-sm">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black tracking-[0.12em] text-[#6D5ACF]">עוזר הצ׳אט של המרפאה</p>
                    <h2 id={headingId} className="mt-1 text-xl font-black tracking-tight text-[#1A1A3E]">{ASSISTANT_NAME}</h2>
                    <p id={descriptionId} className="mt-1 max-w-[290px] text-xs font-medium leading-5 text-slate-500">אפשר לשאול על השימוש במערכת ולקבל הכוונה מהעוזר של המרפאה.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="סגירת עוזר המרפאה"
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-[#F3F4F7] hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#6D5ACF]/30"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#EEEAFE] bg-[#FAF9FF] px-3 py-2.5 text-[11px] font-bold leading-5 text-[#5D5592]">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#6D5ACF]" aria-hidden="true" />
                <span>מידע והכוונה בלבד. אין שינוי נתונים ואין שליחת הודעות.</span>
              </div>
              <p id={statusId} role="status" aria-live="polite" className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                <span className={`h-1.5 w-1.5 rounded-full ${error ? "bg-[#D94C4C]" : isPending ? "animate-pulse bg-[#F2D162]" : isConnected ? "bg-[#69A879]" : "bg-slate-300"}`} aria-hidden="true" />
                {headerStatus}
              </p>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5" aria-live="polite" aria-relevant="additions">
              <div className="flex flex-col gap-3">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.18 }}
                    className={`flex max-w-[91%] flex-col gap-1.5 ${message.role === "user" ? "self-end" : "self-start"}`}
                  >
                    <div className={`flex items-center gap-1.5 px-1 text-[10px] font-black ${message.role === "user" ? "justify-end text-[#706D84]" : "text-[#6D5ACF]"}`}>
                      {message.role === "assistant" && <Bot className="h-3.5 w-3.5" aria-hidden="true" />}
                      <span>{message.role === "user" ? "את/ה" : ASSISTANT_NAME}</span>
                    </div>
                    <div className={`rounded-2xl px-4 py-3 text-sm font-medium leading-6 ${message.role === "user" ? "rounded-bl-md bg-[#1A1A3E] text-white shadow-[0_8px_20px_rgba(26,26,62,0.14)]" : "rounded-br-md border border-[#E7E8EF] bg-white text-[#30314B] shadow-sm"}`}>
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  </motion.div>
                ))}

                {isPending && (
                  <div className="flex max-w-[91%] self-start flex-col gap-1.5" role="status" aria-label={isConnected ? "העוזר מכין תשובה" : "מתחבר לעוזר המרפאה"}>
                    <div className="flex items-center gap-1.5 px-1 text-[10px] font-black text-[#6D5ACF]"><Bot className="h-3.5 w-3.5" aria-hidden="true" /><span>{ASSISTANT_NAME}</span></div>
                    <div className="flex items-center gap-2 rounded-2xl rounded-br-md border border-[#E7E8EF] bg-white px-4 py-3 text-xs font-semibold text-slate-500 shadow-sm"><Loader2 className="h-4 w-4 animate-spin text-[#6D5ACF]" aria-hidden="true" />{isConnected ? "מכין תשובה..." : "מתחבר לעוזר המרפאה..."}</div>
                  </div>
                )}

                {messages.length === 1 && isConnected && !isPending && !error && (
                  <div className="mt-2 rounded-2xl border border-dashed border-[#DCD9F6] bg-[#FAF9FF] p-3.5">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-black text-[#5D5592]"><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />אפשר להתחיל משאלה קצרה</div>
                    <div className="grid gap-2">
                      {STARTER_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          disabled={controlsDisabled}
                          onClick={() => void sendMessage(prompt)}
                          className="group flex items-center justify-between gap-3 rounded-xl border border-[#E6E3FA] bg-white px-3 py-2.5 text-right text-xs font-bold leading-5 text-[#484467] transition hover:border-[#B9B0F0] hover:bg-[#F7F5FF] focus:outline-none focus:ring-2 focus:ring-[#6D5ACF]/25 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span>{prompt}</span><span className="text-[#9B91D9] transition group-hover:-translate-x-0.5" aria-hidden="true">←</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} aria-hidden="true" />
              </div>
            </div>

            <footer className="shrink-0 border-t border-[#E8EAF0] bg-white p-4 sm:p-5">
              {error && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[#F2D1D1] bg-[#FFF6F6] px-3 py-2.5 text-xs font-semibold leading-5 text-[#9F3838]" role="alert">
                  <div className="flex min-w-0 items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span></div>
                  <button type="button" onClick={handleRetry} disabled={isPending} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-black text-[#9F3838] transition hover:bg-[#FCE7E7] focus:outline-none focus:ring-2 focus:ring-[#D94C4C]/25 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />נסי שוב</button>
                </div>
              )}
              <div className="flex items-end gap-2 rounded-2xl border border-[#DDE0E8] bg-[#FBFCFD] p-2 transition focus-within:border-[#8F83DB] focus-within:ring-2 focus-within:ring-[#6D5ACF]/10">
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  disabled={controlsDisabled}
                  rows={1}
                  placeholder={isConnected ? "כתבו שאלה לעוזר המרפאה..." : "ממתינים לחיבור לעוזר..."}
                  aria-label="שאלה לעוזר המרפאה"
                  className="max-h-28 min-h-[42px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm font-semibold leading-6 text-[#1A1A3E] outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage(draft)}
                  disabled={!draft.trim() || controlsDisabled}
                  aria-label="שליחת שאלה"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6D5ACF] text-white shadow-sm transition hover:bg-[#5E4DBA] focus:outline-none focus:ring-2 focus:ring-[#6D5ACF]/35 disabled:cursor-not-allowed disabled:bg-[#D7D4E8] disabled:text-white"
                >
                  <Send className="h-4 w-4 -rotate-180" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] font-semibold text-slate-400">Enter לשליחה · Shift+Enter לשורה חדשה</p>
            </footer>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
