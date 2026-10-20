import {
  CalendarReviewRequired,
  calendarHttpError,
  createCalendarRuntime,
  syncAppointmentCalendar,
} from "./calendar-sync.helper.ts";

const DB_SCAN_LIMIT = 5000;
const PAGE_SIZE = 100;
const PARALLEL_SYNC_LIMIT = 4;
const MAX_REVIEW_ITEMS_PER_PAGE = 50;

type AppointmentRecord = Record<string, any>;
type CalendarReviewItem = {
  appointment_id: string;
  date: string;
  start_time: string;
  service: string;
  pet_name: string;
  client_name: string;
};
type SyncCounts = {
  scanned: number;
  linked_existing: number;
  created: number;
  failed: number;
  needs_review: number;
  skipped: number;
};
type AppointmentOutcome = {
  kind: keyof Omit<SyncCounts, "scanned">;
  reviewItem?: CalendarReviewItem;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function unwrapList(value: unknown): unknown[] {
  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === "string") {
      try { current = JSON.parse(current); continue; } catch { return []; }
    }
    if (Array.isArray(current)) return current;
    if (!current || typeof current !== "object") return [];
    const record = current as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, "data")) { current = record.data; continue; }
    if (Object.prototype.hasOwnProperty.call(record, "body")) { current = record.body; continue; }
    return [];
  }
  return [];
}

function emptyCounts(): SyncCounts {
  return { scanned: 0, linked_existing: 0, created: 0, failed: 0, needs_review: 0, skipped: 0 };
}

function reviewItemForAppointment(appointment: AppointmentRecord): CalendarReviewItem {
  return {
    appointment_id: text(appointment.id).slice(0, 200),
    date: text(appointment.date).slice(0, 10),
    start_time: text(appointment.start_time).slice(0, 5),
    service: text(appointment.appointment_type).slice(0, 160),
    pet_name: text(appointment.pet_name).slice(0, 160),
    client_name: text(appointment.client_name).slice(0, 160),
  };
}

async function processAppointment(runtime: Awaited<ReturnType<typeof createCalendarRuntime>>, appointment: AppointmentRecord): Promise<AppointmentOutcome> {
  const id = text(appointment.id);
  try {
    const result = await syncAppointmentCalendar(runtime, id, { backfill: true });
    if (result.kind === "created") return { kind: "created" };
    if (result.kind === "linked_existing") return { kind: "linked_existing" };
    return { kind: "skipped" };
  } catch (error) {
    if (error instanceof CalendarReviewRequired) {
      return { kind: "needs_review", reviewItem: reviewItemForAppointment(appointment) };
    }
    console.error("A confirmed appointment could not be synced to Google Calendar.");
    return { kind: "failed" };
  }
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await work(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let request: Record<string, unknown>;
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Request body is invalid." }, 400);
    request = body as Record<string, unknown>;
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  if (Object.keys(request).some((key) => key !== "after_id")) return json({ error: "Only after_id is accepted." }, 400);
  const afterId = text(request.after_id);
  if (afterId.length > 200) return json({ error: "Invalid cursor." }, 400);

  let runtime: Awaited<ReturnType<typeof createCalendarRuntime>>;
  try {
    runtime = await createCalendarRuntime(req);
  } catch (error) {
    const failure = calendarHttpError(error);
    return json({ success: false, error: failure.message }, failure.status);
  }

  try {
    const loaded = await runtime.client.entities.Appointment.query()
      .where("status", "confirmed")
      .sort("id")
      .limit(DB_SCAN_LIMIT)
      .exec();
    const records = unwrapList(loaded)
      .filter((item): item is AppointmentRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      .filter((item) => text(item.status).toLowerCase() === "confirmed")
      .sort((left, right) => text(left.id).localeCompare(text(right.id)));
    const missing = records.filter((record) => !text(record.google_event_id) && text(record.id) > afterId);
    const page = missing.slice(0, PAGE_SIZE);
    const outcomes = await mapConcurrent(page, PARALLEL_SYNC_LIMIT, (record) => processAppointment(runtime, record));
    const counts = emptyCounts();
    counts.scanned = page.length;
    outcomes.forEach((outcome) => { counts[outcome.kind] += 1; });
    const reviewItems = outcomes
      .flatMap((outcome) => outcome.kind === "needs_review" && outcome.reviewItem ? [outcome.reviewItem] : [])
      .slice(0, MAX_REVIEW_ITEMS_PER_PAGE);
    const reviewItemsOmitted = Math.max(0, counts.needs_review - reviewItems.length);

    const hasMore = missing.length > page.length;
    const nextCursor = hasMore && page.length > 0 ? text(page[page.length - 1].id) : "";
    const inventoryLimitReached = records.length >= DB_SCAN_LIMIT;
    return json({
      success: true,
      ...counts,
      review_items: reviewItems,
      review_items_omitted: reviewItemsOmitted,
      has_more: hasMore,
      next_cursor: nextCursor,
      inventory_limit_reached: inventoryLimitReached,
      complete: !hasMore && !inventoryLimitReached,
    });
  } catch (error) {
    console.error("Confirmed appointment inventory could not be loaded for calendar sync.");
    const failure = calendarHttpError(error);
    return json({ success: false, error: "The confirmed appointment list could not be loaded." }, failure.status === 500 ? 503 : failure.status);
  }
});
