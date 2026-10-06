import {
  calendarHttpError,
  createCalendarRuntime,
  removeAppointmentCalendarEvent,
  syncAppointmentCalendar,
} from "./calendar-sync.helper.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function validAppointmentId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200 && !/[\u0000-\u001f]/.test(value);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: Record<string, unknown> | null = null;
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) payload = body as Record<string, unknown>;
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  if (!payload) return json({ error: "Request body is invalid." }, 400);
  const allowedKeys = new Set(["mode", "appointmentId"]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) return json({ error: "Only appointmentId and mode are accepted." }, 400);

  const mode = typeof payload.mode === "string" ? payload.mode : "sync";
  const appointmentId = typeof payload.appointmentId === "string" ? payload.appointmentId.trim() : "";
  if (!validAppointmentId(appointmentId)) return json({ error: "A valid appointmentId is required." }, 400);
  if (!["sync", "create", "update", "cancel"].includes(mode)) return json({ error: "Invalid calendar action." }, 400);

  try {
    const runtime = await createCalendarRuntime(req);
    if (mode === "cancel") {
      const outcome = await removeAppointmentCalendarEvent(runtime, appointmentId);
      return json({ success: true, outcome });
    }

    const result = await syncAppointmentCalendar(runtime, appointmentId);
    return json({ success: true, outcome: result.kind, eventId: result.eventId });
  } catch (error) {
    const failure = calendarHttpError(error);
    return json({ success: false, ...(failure.needsReview ? { status: "needs_review" } : {}), error: failure.message }, failure.status);
  }
});
