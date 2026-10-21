import { useSyncExternalStore } from "react";
import type { CalendarSyncFeedback } from "@/components/business-crm/BusinessCrmCalendarPanels";
import {
  retryCalendarAppointmentRemoval,
  retryCalendarAppointmentSync,
  type SideEffectOutcome,
} from "@/lib/crmAppointmentActions";

type CalendarRetryAction = "sync" | "remove";
type CalendarSyncFeedbackUpdate =
  | CalendarSyncFeedback
  | null
  | ((current: CalendarSyncFeedback | null) => CalendarSyncFeedback | null);

const listeners = new Set<() => void>();
let feedbackSnapshot: CalendarSyncFeedback | null = null;
let retryInProgress = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return feedbackSnapshot;
}

function getServerSnapshot() {
  return null;
}

export function setCalendarSyncFeedback(update: CalendarSyncFeedbackUpdate) {
  const next = typeof update === "function" ? update(feedbackSnapshot) : update;
  if (Object.is(next, feedbackSnapshot)) return;
  feedbackSnapshot = next;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error("Could not update calendar retry feedback:", error);
    }
  });
}

export function useCalendarSyncFeedback() {
  const feedback = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [feedback, setCalendarSyncFeedback] as const;
}

export function calendarOutcomeFeedback(
  appointmentId: string,
  outcome: SideEffectOutcome,
  action: CalendarRetryAction,
): CalendarSyncFeedback {
  const id = appointmentId.trim();
  if (outcome.status === "failed") {
    const retryText = id ? "אפשר לנסות שוב." : "לא נמצא מזהה שמאפשר ניסיון חוזר מהיומן.";
    const message = action === "remove"
      ? `התור בוטל ב-Buildy, אך לא הצלחנו להסיר את האירוע מ-Google Calendar. ${retryText}`
      : `הפגישה נשמרה ב-Buildy, אך לא הצלחנו לסנכרן אותה ל-Google Calendar. ${retryText}`;
    return { tone: "warning", message, ...(id ? { retryAppointmentId: id, retryAction: action } : {}) };
  }
  if (outcome.status === "skipped") {
    return {
      tone: "info",
      message: action === "remove"
        ? "התור בוטל ב-Buildy. לא נמצא אירוע Google שמקושר אליו, ולכן לא הוסר אירוע."
        : `לא בוצע שינוי ביומן Google. ${outcome.detail}.`,
    };
  }
  return {
    tone: "success",
    message: action === "remove"
      ? `התור בוטל ב-Buildy. ${outcome.detail}.`
      : `הפגישה נשמרה ב-Buildy. ${outcome.detail}.`,
  };
}

export interface CalendarAppointmentRetryResult {
  appointmentId: string;
  action: CalendarRetryAction;
  outcome: SideEffectOutcome;
}

export async function runCalendarAppointmentRetry(
  appointmentId: string,
  actionOverride?: CalendarRetryAction,
): Promise<CalendarAppointmentRetryResult | null> {
  const id = appointmentId.trim();
  if (!id || retryInProgress) return null;

  const action = actionOverride || (
    feedbackSnapshot?.retryAppointmentId === id
      ? feedbackSnapshot.retryAction || "sync"
      : "sync"
  );
  retryInProgress = true;
  setCalendarSyncFeedback((current) => current?.retryAppointmentId === id
    ? { ...current, retryAction: action, busyAppointmentId: id }
    : {
        tone: "info",
        message: action === "remove"
          ? "בודקת אם נשאר אירוע שמקושר לתור שבוטל..."
          : "מנסה לסנכרן את הפגישה עם Google Calendar...",
        retryAppointmentId: id,
        retryAction: action,
        busyAppointmentId: id,
      });

  try {
    let outcome: SideEffectOutcome;
    try {
      outcome = action === "remove"
        ? await retryCalendarAppointmentRemoval(id)
        : await retryCalendarAppointmentSync(id);
    } catch (error) {
      console.error("Google Calendar retry failed:", error);
      outcome = { status: "failed", detail: "לא הצלחנו להשלים את ניסיון הסנכרון ל-Google Calendar." };
    }

    setCalendarSyncFeedback(calendarOutcomeFeedback(id, outcome, action));
    return { appointmentId: id, action, outcome };
  } finally {
    retryInProgress = false;
  }
}
