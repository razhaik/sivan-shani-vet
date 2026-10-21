import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncClinicAppointments } from "@/functions";
import { useCrmContext } from "@/components/business-crm/CrmContext";
import { runCalendarAppointmentRetry, useCalendarSyncFeedback } from "@/lib/calendarAppointmentSyncRetry";
import {
  CalendarAppointmentSyncPanel,
  CALENDAR_REVIEW_LIST_LIMIT,
  type CalendarBackfillUiState,
  type CalendarReviewItem,
  type CalendarSyncCounts,
  type CalendarSyncFeedback,
} from "@/components/business-crm/BusinessCrmCalendarPanels";

const EMPTY_CALENDAR_SYNC_COUNTS: CalendarSyncCounts = {
  scanned: 0,
  linked_existing: 0,
  created: 0,
  failed: 0,
  needs_review: 0,
  skipped: 0,
};
const MAX_CALENDAR_SYNC_PAGES = 55;
const MAX_CALENDAR_REVIEW_ITEMS = CALENDAR_REVIEW_LIST_LIMIT;
const MAX_CALENDAR_REVIEW_ITEMS_PER_PAGE = 50;

type CalendarSyncPageResult = {
  counts: CalendarSyncCounts;
  reviewItems: CalendarReviewItem[];
  reviewItemsOmitted: number;
  hasMore: boolean;
  nextCursor: string;
  complete: boolean;
  inventoryLimitReached: boolean;
};

interface CalendarAppointmentSyncSectionProps {
  className?: string;
  syncFeedback?: CalendarSyncFeedback | null;
  onRetrySingle?: (appointmentId: string) => void;
  onSyncSettled?: () => void | Promise<void>;
}

function unwrapCalendarSyncPayload(value: unknown): Record<string, unknown> | null {
  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === "string") {
      try { current = JSON.parse(current); continue; } catch { return null; }
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    const record = current as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, "data")) { current = record.data; continue; }
    if (Object.prototype.hasOwnProperty.call(record, "body")) { current = record.body; continue; }
    return record;
  }
  return null;
}

function reviewField(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized.length <= maxLength ? normalized : null;
}

function validReviewDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeCalendarReviewItem(value: unknown): CalendarReviewItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const appointmentId = reviewField(record.appointment_id, 200);
  const date = reviewField(record.date, 10);
  const startTime = reviewField(record.start_time, 5);
  const service = reviewField(record.service, 160);
  const petName = reviewField(record.pet_name, 160);
  const clientName = reviewField(record.client_name, 160);
  if (!appointmentId || !date || !validReviewDate(date) || !startTime || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return null;
  if (service === null || petName === null || clientName === null) return null;
  return { appointmentId, date, startTime, service, petName, clientName };
}

function parseCalendarSyncPage(value: unknown): CalendarSyncPageResult {
  const payload = unwrapCalendarSyncPayload(value);
  if (!payload || payload.success !== true || payload.error) throw new Error("בקשת הסנכרון לא החזירה תוצאה תקינה.");
  if (typeof payload.has_more !== "boolean" || typeof payload.complete !== "boolean" || typeof payload.inventory_limit_reached !== "boolean") {
    throw new Error("תוצאת הסנכרון אינה שלמה.");
  }
  const count = (field: keyof CalendarSyncCounts) => {
    const result = Number(payload[field]);
    if (!Number.isInteger(result) || result < 0) throw new Error("תוצאת הסנכרון אינה כוללת סיכום תקין.");
    return result;
  };
  const counts: CalendarSyncCounts = {
    scanned: count("scanned"),
    linked_existing: count("linked_existing"),
    created: count("created"),
    failed: count("failed"),
    needs_review: count("needs_review"),
    skipped: count("skipped"),
  };
  const nextCursor = typeof payload.next_cursor === "string" ? payload.next_cursor.trim() : "";
  if (payload.has_more && !nextCursor) throw new Error("הסנכרון לא החזיר נקודת המשך תקינה.");

  let reviewItems: CalendarReviewItem[] = [];
  let reviewItemsOmitted = counts.needs_review;
  const rawReviewItems = payload.review_items;
  const hasReportedOmitted = Object.prototype.hasOwnProperty.call(payload, "review_items_omitted");
  const reportedOmitted = payload.review_items_omitted;
  const reportedOmittedIsValid = typeof reportedOmitted === "number" && Number.isInteger(reportedOmitted) && reportedOmitted >= 0;
  const malformedReportedOmitted = hasReportedOmitted && !reportedOmittedIsValid;

  if (Array.isArray(rawReviewItems) && rawReviewItems.length <= MAX_CALENDAR_REVIEW_ITEMS_PER_PAGE && !malformedReportedOmitted) {
    const uniqueItems = new Map<string, CalendarReviewItem>();
    rawReviewItems.forEach((rawItem) => {
      const item = normalizeCalendarReviewItem(rawItem);
      if (item && !uniqueItems.has(item.appointmentId)) uniqueItems.set(item.appointmentId, item);
    });
    const candidates = [...uniqueItems.values()];
    const expectedOmitted = Math.max(0, counts.needs_review - candidates.length);
    const reportExceedsUnlistedItems = reportedOmittedIsValid && Number(reportedOmitted) > expectedOmitted;
    const responseIsInconsistent = rawReviewItems.length > counts.needs_review || reportExceedsUnlistedItems;
    if (responseIsInconsistent) {
      reviewItemsOmitted = counts.needs_review;
    } else {
      reviewItems = candidates;
      reviewItemsOmitted = Math.min(counts.needs_review, Math.max(expectedOmitted, reportedOmittedIsValid ? Number(reportedOmitted) : 0));
    }
  }

  return {
    counts,
    reviewItems,
    reviewItemsOmitted,
    hasMore: payload.has_more,
    nextCursor,
    complete: payload.complete,
    inventoryLimitReached: payload.inventory_limit_reached,
  };
}

function addCalendarSyncCounts(total: CalendarSyncCounts, page: CalendarSyncCounts): CalendarSyncCounts {
  return {
    scanned: total.scanned + page.scanned,
    linked_existing: total.linked_existing + page.linked_existing,
    created: total.created + page.created,
    failed: total.failed + page.failed,
    needs_review: total.needs_review + page.needs_review,
    skipped: total.skipped + page.skipped,
  };
}

export default function CalendarAppointmentSyncSection({
  className,
  syncFeedback = null,
  onRetrySingle,
  onSyncSettled,
}: CalendarAppointmentSyncSectionProps) {
  const { user, refreshData } = useCrmContext();
  const queryClient = useQueryClient();
  const [sharedSyncFeedback] = useCalendarSyncFeedback();
  const effectiveSyncFeedback = syncFeedback ?? sharedSyncFeedback;
  const canManage = ["administrator", "user"].includes(String(user?.role || "").toLowerCase());
  const [state, setState] = useState<CalendarBackfillUiState>({
    phase: "idle",
    counts: EMPTY_CALENDAR_SYNC_COUNTS,
    reviewItems: [],
    reviewItemsOmitted: 0,
    page: 0,
    complete: false,
    inventoryLimitReached: false,
    retryable: false,
    tone: "info",
    message: "",
  });
  const cursorRef = useRef("");
  const reviewIdsRef = useRef<Set<string>>(new Set());
  const runLockRef = useRef(false);
  const outcomesMayBeUnknownRef = useRef(false);

  const refreshAfterSync = () => {
    try {
      const result = onSyncSettled ? onSyncSettled() : refreshData();
      void Promise.resolve(result).catch((error) => console.error("Calendar sync completed, but refreshing the CRM failed:", error));
    } catch (error) {
      console.error("Calendar sync completed, but refreshing the CRM failed:", error);
    }

    if (!onSyncSettled) {
      ([
        ["business-crm", "calendar-events"],
        ["business-crm", "calendar-busy"],
      ] as const).forEach((queryKey) => {
        void queryClient.invalidateQueries({ queryKey, refetchType: "all" }).catch((error) => console.error("Calendar sync completed, but refreshing Google Calendar data failed:", error));
      });
    }
  };

  const retrySingleAppointment = async (appointmentId: string) => {
    if (!canManage) return;
    const retry = await runCalendarAppointmentRetry(appointmentId);
    if (retry) refreshAfterSync();
  };

  const runBackfill = async () => {
    if (!canManage || runLockRef.current) return;
    runLockRef.current = true;
    const resumeInterruptedRun = state.phase === "interrupted" && state.retryable;
    let cursor = resumeInterruptedRun ? cursorRef.current : "";
    let counts: CalendarSyncCounts = resumeInterruptedRun ? { ...state.counts } : { ...EMPTY_CALENDAR_SYNC_COUNTS };
    let reviewItems: CalendarReviewItem[] = resumeInterruptedRun ? [...state.reviewItems] : [];
    let reviewItemsOmitted = resumeInterruptedRun ? state.reviewItemsOmitted : 0;
    let page = resumeInterruptedRun ? state.page : 0;
    let inventoryLimitReached = resumeInterruptedRun && state.inventoryLimitReached;
    let completed = false;
    if (!resumeInterruptedRun) {
      cursorRef.current = "";
      reviewIdsRef.current = new Set();
    } else if (reviewIdsRef.current.size === 0) {
      reviewIdsRef.current = new Set(reviewItems.map((item) => item.appointmentId).filter(Boolean));
    }
    setState({ phase: "running", counts, reviewItems, reviewItemsOmitted, page, complete: false, inventoryLimitReached, retryable: false, tone: "info", message: "בודקת תורים מאושרים חסרי קישור ל-Google Calendar..." });

    try {
      while (page < MAX_CALENDAR_SYNC_PAGES) {
        const response = await syncClinicAppointments({ after_id: cursor });
        const result = parseCalendarSyncPage(response);
        counts = addCalendarSyncCounts(counts, result.counts);
        const nextReviewItems = [...reviewItems];
        let nextReviewItemsOmitted = reviewItemsOmitted + result.reviewItemsOmitted;
        result.reviewItems.forEach((item) => {
          const appointmentId = item.appointmentId.trim();
          if (!appointmentId || reviewIdsRef.current.has(appointmentId)) return;
          reviewIdsRef.current.add(appointmentId);
          if (nextReviewItems.length < MAX_CALENDAR_REVIEW_ITEMS) nextReviewItems.push(item);
          else nextReviewItemsOmitted += 1;
        });
        reviewItems = nextReviewItems;
        reviewItemsOmitted = nextReviewItemsOmitted;
        page += 1;
        inventoryLimitReached = inventoryLimitReached || result.inventoryLimitReached;

        if (result.hasMore) {
          if (cursor && result.nextCursor.localeCompare(cursor) <= 0) throw new Error("נקודת ההמשך לא התקדמה.");
          cursor = result.nextCursor;
          cursorRef.current = cursor;
          setState({ phase: "running", counts, reviewItems, reviewItemsOmitted, page, complete: false, inventoryLimitReached, retryable: false, tone: "info", message: `נבדקו ${counts.scanned} תורים ללא קישור. הסנכרון ממשיך לעמוד הבא.` });
          continue;
        }

        const isComplete = result.complete && !inventoryLimitReached;
        const hasReviewItems = counts.failed > 0 || counts.needs_review > 0;
        const tone = inventoryLimitReached || !isComplete || hasReviewItems ? "warning" : "success";
        const uncertaintyNote = outcomesMayBeUnknownRef.current
          ? " ניתוק קודם עלול לגרום לכך שחלק מהפעולות שהושלמו לא ייכללו במספרים."
          : "";
        const message = inventoryLimitReached
          ? "הסריקה הגיעה למגבלת הרשומות ואינה מכסה את כל התורים. לא בוצעו שינויים מחוץ לטווח שנבדק."
          : !isComplete
            ? "הסריקה הסתיימה בלי אישור שכל הרשומות נבדקו. אפשר להריץ שוב בבטחה."
            : counts.scanned === 0
              ? "לא נמצאו תורים מאושרים נוספים ללא קישור ל-Google Calendar."
              : hasReviewItems
                ? "הסריקה הסתיימה. אירועים מתאימים קושרו, ומקרים שנכשלו או נמצאו עמומים נשארו לבדיקה."
                : "הסריקה הושלמה. תורים מאושרים חוברו ליומן בלי להעתיק בקשות ממתינות, ביטולים או הערות צוות.";
        setState({
          phase: isComplete ? "complete" : "interrupted",
          counts,
          reviewItems,
          reviewItemsOmitted,
          page,
          complete: isComplete,
          inventoryLimitReached,
          retryable: !inventoryLimitReached && (!isComplete || counts.failed > 0),
          tone,
          message: `${message}${uncertaintyNote}`,
        });
        completed = true;
        break;
      }

      if (!completed) {
        setState({ phase: "interrupted", counts, reviewItems, reviewItemsOmitted, page, complete: false, inventoryLimitReached, retryable: true, tone: "warning", message: "הסריקה נעצרה לפני השלמת כל העמודים. אפשר להריץ שוב, והפעולה ממשיכה מנקודת ההמשך האחרונה." });
      }
    } catch (error) {
      console.error("Clinic appointment Google Calendar backfill was interrupted:", error);
      outcomesMayBeUnknownRef.current = true;
      setState({
        phase: "interrupted",
        counts,
        reviewItems,
        reviewItemsOmitted,
        page,
        complete: false,
        inventoryLimitReached,
        retryable: true,
        tone: "error",
        message: "החיבור נקטע לפני שהתקבלו כל התוצאות. ייתכן שחלק מהפעולות הושלמו בלי להיספר; אפשר לנסות שוב, והסנכרון מונע יצירת כפילויות.",
      });
    } finally {
      runLockRef.current = false;
      refreshAfterSync();
    }
  };

  return (
    <div className={className}>
      <CalendarAppointmentSyncPanel
        canManage={canManage}
        state={state}
        syncFeedback={effectiveSyncFeedback}
        onRunBackfill={() => void runBackfill()}
        onRetrySingle={(appointmentId) => {
          if (onRetrySingle) onRetrySingle(appointmentId);
          else void retrySingleAppointment(appointmentId);
        }}
      />
    </div>
  );
}
