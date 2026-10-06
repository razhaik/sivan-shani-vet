import { createSuperdevClient } from "npm:@superdevhq/client@0.1.56";

const ONESIGNAL_APP_ID = "f6159636-c2ad-4e16-93c8-82845591b906";
const ONESIGNAL_ENDPOINT = "https://api.onesignal.com/notifications";
const SITE_URL = "https://sivanshanivet.com";
const MAX_RECORD_AGE_MS = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;

type NotificationEvent = "new_appointment" | "new_inquiry";
type SourceRecord = Record<string, unknown>;
type NotificationPayload = {
  app_id: string;
  target_channel: "push";
  included_segments: ["Subscribed Users"];
  headings: { en: string; he: string };
  contents: { en: string; he: string };
  web_url: string;
};

const superdev = createSuperdevClient({ appId: Deno.env.get("SUPERDEV_APP_ID") });
const inFlight = new Set<string>();

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 180);
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function displayDate(value: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value, ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text(value, "לא צוין");
}

function createdRecently(record: SourceRecord): boolean {
  const createdAtValue = record.created_at;
  const createdAt = typeof createdAtValue === "string" ? Date.parse(createdAtValue) : Number.NaN;
  if (!Number.isFinite(createdAt)) return false;
  const age = Date.now() - createdAt;
  return age >= -MAX_CLOCK_SKEW_MS && age <= MAX_RECORD_AGE_MS;
}

function appointmentNotification(record: SourceRecord): NotificationPayload {
  const clientName = text(record.client_name, "לקוח חדש");
  const petName = text(record.pet_name, "חיית מחמד");
  const date = displayDate(record.date);
  const time = text(record.start_time, "שעה לא צוינה").slice(0, 5);
  const status = text(record.status, "requested").toLowerCase();
  const requested = status === "requested";
  return {
    app_id: ONESIGNAL_APP_ID,
    target_channel: "push",
    included_segments: ["Subscribed Users"],
    headings: { en: "New clinic appointment", he: "תור חדש במרפאה" },
    contents: {
      en: `${clientName} requested an appointment for ${petName} on ${date} at ${time}.`,
      he: `${clientName} ${requested ? "ביקש/ה" : "קבע/ה"} תור עבור ${petName} בתאריך ${date} בשעה ${time}.`,
    },
    web_url: requested ? `${SITE_URL}/business-crm/inbox` : `${SITE_URL}/business-crm/`,
  };
}

function inquiryNotification(record: SourceRecord): NotificationPayload {
  const name = text(record.name, "פונה חדש/ה");
  return {
    app_id: ONESIGNAL_APP_ID,
    target_channel: "push",
    included_segments: ["Subscribed Users"],
    headings: { en: "New lead message", he: "ליד/הודעה חדשה" },
    contents: {
      en: `A new website inquiry arrived from ${name}. Open the CRM inbox to read it.`,
      he: `התקבלה פנייה חדשה מ־${name}. פתחי את תיבת הדואר כדי לקרוא אותה.`,
    },
    web_url: `${SITE_URL}/business-crm/inbox`,
  };
}

async function sendToOneSignal(payload: NotificationPayload, event: NotificationEvent, recordId: string, apiKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(ONESIGNAL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error(`[OneSignal] ${event} ${recordId} request error:`, safeError(error));
    throw new Error("OneSignal request failed");
  }

  if (!response.ok) {
    console.error(`[OneSignal] ${event} ${recordId} rejected with status ${response.status}`);
    throw new Error("OneSignal rejected the notification");
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Request body is invalid" }, 400);
  }

  const request = body as Record<string, unknown>;
  if (Object.keys(request).some((key) => key !== "event" && key !== "record_id")) {
    return json({ error: "Only event and record_id are accepted" }, 400);
  }

  const event = request.event;
  const recordIdValue = request.record_id;
  if (event !== "new_appointment" && event !== "new_inquiry") {
    return json({ error: "Unsupported notification event" }, 400);
  }
  if (typeof recordIdValue !== "string") {
    return json({ error: "record_id is required" }, 400);
  }

  const recordId = recordIdValue.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/.test(recordId)) {
    return json({ error: "record_id has an invalid format" }, 400);
  }

  const serviceRoleKey = Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    console.error(`[OneSignal] ${event} ${recordId} unavailable: missing service role configuration`);
    return json({ error: "Notification service is unavailable" }, 503);
  }

  const oneSignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  if (!oneSignalApiKey) {
    console.error(`[OneSignal] ${event} ${recordId} unavailable: missing OneSignal configuration`);
    return json({ error: "Notification service is unavailable" }, 503);
  }

  const lockKey = `${event}:${recordId}`;
  if (inFlight.has(lockKey)) return json({ error: "Notification is already being processed" }, 409);
  inFlight.add(lockKey);

  try {
    superdev.auth.setToken(serviceRoleKey);
    const sourceEntity = event === "new_appointment" ? superdev.entities.Appointment : superdev.entities.ContactInquiry;
    let record: SourceRecord | null = null;

    try {
      const loaded = await sourceEntity.get(recordId);
      record = loaded && typeof loaded === "object" ? loaded as SourceRecord : null;
    } catch (error) {
      console.error(`[OneSignal] ${event} ${recordId} source lookup failed:`, safeError(error));
      return json({ error: "Source record was not found" }, 404);
    }

    if (!record) return json({ error: "Source record was not found" }, 404);

    if (event === "new_appointment") {
      const status = text(record.status, "").toLowerCase();
      if (status !== "requested" && status !== "confirmed") {
        return json({ error: "Appointment is not eligible for a new notification" }, 409);
      }
    }

    if (!createdRecently(record)) {
      console.warn(`[OneSignal] ${event} ${recordId} skipped because the record is outside the recent creation window`);
      return json({ error: "Source record is outside the notification window" }, 409);
    }

    if (text(record.browser_push_notified_at, "")) {
      return json({ ok: true, status: "already_sent" });
    }

    const payload = event === "new_appointment" ? appointmentNotification(record) : inquiryNotification(record);
    try {
      await sendToOneSignal(payload, event, recordId, oneSignalApiKey);
    } catch {
      return json({ error: "Browser notification delivery failed" }, 502);
    }

    try {
      await sourceEntity.update(recordId, { browser_push_notified_at: new Date().toISOString() });
    } catch (error) {
      console.error(`[OneSignal] ${event} ${recordId} sent but marker update failed:`, safeError(error));
      return json({ error: "Notification was accepted but could not be recorded" }, 500);
    }

    console.log(`[OneSignal] ${event} ${recordId} accepted and marked`);
    return json({ ok: true, status: "sent" });
  } catch (error) {
    console.error(`[OneSignal] ${event} ${recordId} failed:`, safeError(error));
    return json({ error: "Browser notification delivery failed" }, 500);
  } finally {
    inFlight.delete(lockKey);
  }
});
