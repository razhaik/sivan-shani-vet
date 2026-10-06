import { createSuperdevClient } from "npm:@superdevhq/client@0.1.56";

type BackendFunctionOptions = { headers?: Record<string, string>; signal?: AbortSignal };
type BackendFunction = (payload: Record<string, unknown>, options?: BackendFunctionOptions) => Promise<unknown>;
type AppointmentRecord = Record<string, any>;

const APP_ID = Deno.env.get("SUPERDEV_APP_ID");
const SERVICE_ROLE_KEY = Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY");
const NOTIFICATION_TIMEOUT_MS = 2500;
const CALENDAR_TIMEOUT_MS = 15000;
const superdev = createSuperdevClient({ appId: APP_ID });
const Appointment = superdev.entities.Appointment;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function unwrap(value: unknown): AppointmentRecord | null {
  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === "string") {
      try { current = JSON.parse(current); continue; } catch { return null; }
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    const record = current as AppointmentRecord;
    if (Object.prototype.hasOwnProperty.call(record, "data")) { current = record.data; continue; }
    if (Object.prototype.hasOwnProperty.call(record, "body")) { current = record.body; continue; }
    return record;
  }
  return null;
}

function appointmentSummary(appointment: AppointmentRecord) {
  return {
    id: text(appointment.id),
    date: text(appointment.date),
    start_time: text(appointment.start_time),
    end_time: text(appointment.end_time),
    status: text(appointment.status),
    client_name: text(appointment.client_name),
    pet_name: text(appointment.pet_name),
    appointment_type: text(appointment.appointment_type),
  };
}

function requestHeaders(req: Request, includeInternalKey = false): Record<string, string> {
  const headers: Record<string, string> = {};
  const authorization = req.headers.get("Authorization");
  const origin = req.headers.get("Origin");
  if (authorization) headers.Authorization = authorization;
  if (origin) headers.Origin = origin;
  if (includeInternalKey && SERVICE_ROLE_KEY) headers["X-Superdev-Internal-Key"] = SERVICE_ROLE_KEY;
  return headers;
}

async function triggerOwnerNotification(req: Request, appointmentId: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);
  try {
    const notify = superdev.functions["send-business-notification"] as unknown as BackendFunction;
    const response = await notify(
      { event: "appointment_changed", record_id: appointmentId },
      { headers: requestHeaders(req), signal: controller.signal },
    );
    const payload = unwrap(response);
    if (payload?.error || payload?.ok === false) console.error("Owner cancellation notification was not accepted.");
  } catch {
    console.error("Owner cancellation notification request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function removeLinkedCalendarEvent(req: Request, appointmentId: string): Promise<"removed" | "already_removed" | "not_linked" | "failed"> {
  if (!SERVICE_ROLE_KEY) return "failed";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALENDAR_TIMEOUT_MS);
  try {
    const remove = superdev.functions["create-calendar-event"] as unknown as BackendFunction;
    const response = await remove(
      { mode: "cancel", appointmentId },
      { headers: requestHeaders(req, true), signal: controller.signal },
    );
    const payload = unwrap(response);
    if (!payload || payload.error || payload.success === false) throw new Error("Calendar event removal was not confirmed.");
    const outcome = text(payload.outcome);
    if (["removed", "already_removed", "not_linked"].includes(outcome)) return outcome as "removed" | "already_removed" | "not_linked";
    throw new Error("Calendar event removal returned an unknown result.");
  } catch (error) {
    console.error("Customer cancellation was saved, but Google Calendar removal failed.", error instanceof Error ? error.message : "");
    return "failed";
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SERVICE_ROLE_KEY) return json({ error: "Service is unavailable." }, 503);

  let token = "";
  try {
    const body = await req.json();
    token = typeof body?.token === "string" ? body.token.trim() : "";
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  if (!/^[A-Za-z0-9._~-]{12,160}$/.test(token)) return json({ error: "A valid cancellation token is required." }, 400);

  try {
    // The cancellation token is checked before the function uses the service role to read appointments.
    superdev.auth.setToken(SERVICE_ROLE_KEY);
    const results = await Appointment.query().where("cancel_token", token).limit(1).exec();
    const appointment = Array.isArray(results)
      ? results.find((item: AppointmentRecord) => text(item?.cancel_token) === token) as AppointmentRecord | undefined
      : undefined;
    if (!appointment) return json({ error: "Appointment not found." }, 404);
    const appointmentId = text(appointment.id);
    if (!appointmentId) return json({ error: "Appointment not found." }, 404);

    if (text(appointment.status).toLowerCase() === "cancelled") {
      const calendarStatus = text(appointment.cancelled_by).toLowerCase() === "client"
        ? await removeLinkedCalendarEvent(req, appointmentId)
        : "already_removed";
      return json({
        status: "already-cancelled",
        message: calendarStatus === "failed"
          ? "התור כבר בוטל, אך לא הצלחנו לאמת את הסרת האירוע מיומן Google. אם האירוע עדיין מופיע ביומן, הביטול תקף. לבירור, פנו למרפאה."
          : "התור הזה כבר בוטל.",
        calendar_status: calendarStatus,
        appointment: appointmentSummary(appointment),
      });
    }

    // A customer token authorizes only cancellation of the matching appointment.
    await Appointment.update(appointmentId, { status: "cancelled", cancelled_by: "client" });
    let refreshed: AppointmentRecord | null = null;
    try {
      refreshed = unwrap(await Appointment.get(appointmentId));
    } catch (error) {
      console.error("Failed to verify the saved customer cancellation.", error instanceof Error ? error.message : "");
    }
    if (!refreshed || text(refreshed.status).toLowerCase() !== "cancelled" || text(refreshed.cancel_token) !== token) {
      return json({ error: "Failed to persist cancellation." }, 500);
    }

    const [calendarStatus] = await Promise.all([
      removeLinkedCalendarEvent(req, appointmentId),
      triggerOwnerNotification(req, appointmentId),
    ]);
    const partial = calendarStatus === "failed";
    return json({
      status: "cancelled",
      message: partial
        ? "התור בוטל, אך לא הצלחנו להסיר את האירוע מיומן Google. אם האירוע עדיין מופיע ביומן, הביטול תקף. לבירור, פנו למרפאה."
        : "התור בוטל בהצלחה.",
      calendar_status: calendarStatus,
      appointment: appointmentSummary(refreshed),
    });
  } catch (error) {
    console.error("Customer appointment cancellation failed.", error instanceof Error ? error.message : "");
    return json({ error: "Internal error." }, 500);
  }
});
