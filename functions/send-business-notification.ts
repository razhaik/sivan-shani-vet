import { createSuperdevClient } from "npm:@superdevhq/client@0.1.56";

const APP_ID = Deno.env.get("SUPERDEV_APP_ID");
const SITE_URL = "https://sivanshanivet.com";
const LEGACY_CLINIC_EMAIL = "sivanshanivet@gmail.com";
const ONESIGNAL_APP_ID = "f6159636-c2ad-4e16-93c8-82845591b906";
const ONESIGNAL_ENDPOINT = "https://api.onesignal.com/notifications";
const MAX_RECORD_AGE_MS = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
const RECIPIENT_LIMIT = 25;
const INTERNAL_NOTIFICATION_HEADER = "X-Superdev-Internal-Key";

const superdev = createSuperdevClient({ appId: APP_ID });
const integrations = createSuperdevClient({ appId: APP_ID });
const inFlight = new Set<string>();

type NotificationChannel = "email" | "sms" | "push";
export type NotificationEvent = "new_appointment" | "new_inquiry" | "appointment_changed" | "appointment_no_show" | "appointment_reschedule_requested";
type SourceRecord = Record<string, unknown>;
type SettingsRecord = Record<string, unknown>;
type TwilioConfig = { accountSid: string; authToken: string; fromNumber: string };

type EventConfig = {
  source: "Appointment" | "ContactInquiry" | "AppointmentRescheduleRequest";
  marker: string;
  errorMarker?: string;
  enabledField: string;
  channelsField: string;
};

export type BusinessNotificationResult = {
  body: Record<string, unknown>;
  status: number;
};

const EVENT_CONFIG: Record<NotificationEvent, EventConfig> = {
  new_appointment: { source: "Appointment", marker: "owner_new_appointment_notified_at", enabledField: "new_appointment_enabled", channelsField: "new_appointment_channels" },
  new_inquiry: { source: "ContactInquiry", marker: "owner_new_inquiry_notified_at", enabledField: "new_inquiry_enabled", channelsField: "new_inquiry_channels" },
  appointment_changed: { source: "Appointment", marker: "owner_appointment_changed_notified_at", enabledField: "appointment_changed_enabled", channelsField: "appointment_changed_channels" },
  appointment_no_show: { source: "Appointment", marker: "owner_appointment_no_show_notified_at", enabledField: "appointment_no_show_enabled", channelsField: "appointment_no_show_channels" },
  appointment_reschedule_requested: {
    source: "AppointmentRescheduleRequest",
    marker: "manager_notification_sent_at",
    errorMarker: "manager_notification_error",
    enabledField: "appointment_reschedule_requested_enabled",
    channelsField: "appointment_reschedule_requested_channels",
  },
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function result(body: Record<string, unknown>, status = 200): BusinessNotificationResult {
  return { body, status };
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 180);
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function displayDate(value: unknown) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text(value, "לא צוין");
}

function displayTime(value: unknown) {
  const valueText = text(value, "שעה לא צוינה");
  return valueText.slice(0, 5);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] || character));
}

function isRecent(value: unknown) {
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= -MAX_CLOCK_SKEW_MS && age <= MAX_RECORD_AGE_MS;
}

function validEmail(value: unknown): string | null {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizePhone(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const compact = raw.replace(/[\s().-]/g, "");
  if (compact.startsWith("+")) {
    const international = `+${compact.slice(1).replace(/\D/g, "")}`;
    return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
  }
  const digits = compact.replace(/\D/g, "");
  if (digits.startsWith("00972") && digits.length === 14) {
    const international = `+${digits.slice(2)}`;
    return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    const international = `+972${digits.slice(1)}`;
    return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
  }
  return null;
}

function uniqueValidRecipients(value: unknown, normalizer: (item: unknown) => string | null) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizer).filter((item): item is string => Boolean(item)))].slice(0, RECIPIENT_LIMIT);
}

function channels(value: unknown, fallback: NotificationChannel[]) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter((item): item is NotificationChannel => item === "email" || item === "sms" || item === "push"))];
}

function defaultEventEnabled(event: NotificationEvent) {
  return event === "new_appointment" || event === "new_inquiry" || event === "appointment_reschedule_requested";
}

function defaultEventChannels(event: NotificationEvent): NotificationChannel[] {
  return defaultEventEnabled(event) ? ["push"] : [];
}

function legacyEmailRecipients(event: NotificationEvent, record: SourceRecord) {
  if (event === "new_inquiry") return [LEGACY_CLINIC_EMAIL];
  if (event === "new_appointment" && text(record.status).toLowerCase() === "requested") return [LEGACY_CLINIC_EMAIL];
  return [];
}

function notificationSettings(record: SettingsRecord | null, event: NotificationEvent, sourceRecord: SourceRecord) {
  const config = EVENT_CONFIG[event];
  if (record) {
    return {
      enabled: booleanValue(record[config.enabledField], defaultEventEnabled(event)),
      channels: channels(record[config.channelsField], defaultEventChannels(event)),
      emailRecipients: uniqueValidRecipients(record.email_recipients, validEmail),
      smsRecipients: uniqueValidRecipients(record.sms_recipients, normalizePhone),
    };
  }

  const fallbackEmailRecipients = legacyEmailRecipients(event, sourceRecord);
  const fallbackChannels: NotificationChannel[] = fallbackEmailRecipients.length
    ? ["email", ...defaultEventChannels(event)]
    : defaultEventChannels(event);
  return {
    enabled: defaultEventEnabled(event),
    channels: [...new Set(fallbackChannels)],
    emailRecipients: fallbackEmailRecipients,
    smsRecipients: [],
  };
}

function appointmentRows(record: SourceRecord) {
  return [
    ["שם הלקוח", text(record.client_name, "לא צוין")],
    ["חיית המחמד", text(record.pet_name, "לא צוין")],
    ["סוג התור", text(record.appointment_type, "תור במרפאה")],
    ["תאריך", displayDate(record.date)],
    ["שעה", displayTime(record.start_time)],
  ];
}

function buildContent(event: NotificationEvent, record: SourceRecord, context: SourceRecord = record) {
  if (event === "new_inquiry") {
    const name = text(record.name, "פונה חדש/ה");
    const message = text(record.message, "לא צורפה הודעה");
    return {
      titleHe: "ליד/הודעה חדשה",
      titleEn: "New lead message",
      bodyHe: `התקבלה פנייה חדשה מ־${name}. פתחי את תיבת הדואר כדי לקרוא אותה.`,
      bodyEn: `A new website inquiry arrived from ${name}. Open the CRM inbox to read it.`,
      subject: "פנייה חדשה באתר – ד״ר סיון שני",
      sms: `פנייה חדשה באתר מ־${name}. פתחי את תיבת הדואר ב־${SITE_URL}/business-crm/inbox`,
      url: `${SITE_URL}/business-crm/inbox`,
      rows: [["שם הפונה", name], ["טלפון", text(record.phone, "לא צוין")], ["אימייל", text(record.email, "לא צוין")], ["הודעה", message]],
    };
  }

  if (event === "appointment_reschedule_requested") {
    const clientName = text(context.client_name, "הלקוח");
    const petName = text(context.pet_name, "חיית המחמד");
    const service = text(context.appointment_type, text(record.service_identifier, "תור במרפאה"));
    const oldDate = displayDate(record.old_appointment_date);
    const oldTime = `${displayTime(record.old_start_time)}${record.old_end_time ? ` - ${displayTime(record.old_end_time)}` : ""}`;
    const proposedDate = displayDate(record.proposed_appointment_date);
    const proposedTime = `${displayTime(record.proposed_start_time)}${record.proposed_end_time ? ` - ${displayTime(record.proposed_end_time)}` : ""}`;
    return {
      titleHe: "בקשת שינוי מועד חדשה",
      titleEn: "New appointment reschedule request",
      bodyHe: `${clientName} ביקש/ה לשנות את התור עבור ${petName} מ־${oldDate} בשעה ${oldTime} ל־${proposedDate} בשעה ${proposedTime}.`,
      bodyEn: `${clientName} requested a new appointment time for ${petName}, from ${oldDate} at ${oldTime} to ${proposedDate} at ${proposedTime}.`,
      subject: "בקשת שינוי מועד חדשה – ד״ר סיון שני",
      sms: `בקשת שינוי מועד: ${clientName} עבור ${petName}, מ־${oldDate} ${oldTime} ל־${proposedDate} ${proposedTime}. ${SITE_URL}/business-crm/inbox`,
      url: `${SITE_URL}/business-crm/inbox`,
      rows: [
        ["שם הלקוח", clientName],
        ["חיית המחמד", petName],
        ["סוג הטיפול", service],
        ["המועד המקורי", `${oldDate} בשעה ${oldTime}`],
        ["המועד המוצע", `${proposedDate} בשעה ${proposedTime}`],
      ],
    };
  }

  const clientName = text(record.client_name, "הלקוח");
  const petName = text(record.pet_name, "חיית המחמד");
  const date = displayDate(record.date);
  const time = displayTime(record.start_time);
  const appointmentRowsValue = appointmentRows(record);

  if (event === "appointment_changed") {
    return {
      titleHe: "תור בוטל או שונה",
      titleEn: "Client appointment update",
      bodyHe: `${clientName} ביטל/ה את התור עבור ${petName} בתאריך ${date} בשעה ${time}.`,
      bodyEn: `${clientName} cancelled the appointment for ${petName} on ${date} at ${time}.`,
      subject: "עדכון ביטול תור על ידי לקוח – ד״ר סיון שני",
      sms: `עדכון: ${clientName} ביטל/ה תור עבור ${petName} ב־${date} בשעה ${time}.`,
      url: `${SITE_URL}/business-crm/`,
      rows: appointmentRowsValue,
    };
  }

  if (event === "appointment_no_show") {
    return {
      titleHe: "אי־הגעה לתור",
      titleEn: "Appointment no-show",
      bodyHe: `${clientName} לא הגיע/ה לתור עבור ${petName} בתאריך ${date} בשעה ${time}.`,
      bodyEn: `${clientName} did not attend the appointment for ${petName} on ${date} at ${time}.`,
      subject: "אי־הגעה לתור – ד״ר סיון שני",
      sms: `אי־הגעה: ${clientName} לא הגיע/ה לתור עבור ${petName} ב־${date} בשעה ${time}.`,
      url: `${SITE_URL}/business-crm/`,
      rows: appointmentRowsValue,
    };
  }

  const status = text(record.status, "requested").toLowerCase();
  const verb = status === "requested" ? "ביקש/ה" : "קבע/ה";
  return {
    titleHe: "תור חדש במרפאה",
    titleEn: "New clinic appointment",
    bodyHe: `${clientName} ${verb} תור עבור ${petName} בתאריך ${date} בשעה ${time}.`,
    bodyEn: `${clientName} requested an appointment for ${petName} on ${date} at ${time}.`,
    subject: "תור חדש במרפאה – ד״ר סיון שני",
    sms: `תור חדש: ${clientName} ${verb} תור עבור ${petName} ב־${date} בשעה ${time}.`,
    url: status === "requested" ? `${SITE_URL}/business-crm/inbox` : `${SITE_URL}/business-crm/`,
    rows: appointmentRowsValue,
  };
}

function ownerEmailHtml(content: ReturnType<typeof buildContent>) {
  const rows = content.rows.map(([label, value]) => `<tr><td style="padding:9px 0;color:#64748b;font-size:12px;font-weight:700;width:34%;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:9px 0;color:#0f172a;font-size:14px;font-weight:800;line-height:1.6;">${escapeHtml(value)}</td></tr>`).join("");
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.titleHe)}</title></head><body style="margin:0;background:#f7f7f7;font-family:Arial,'Segoe UI',sans-serif;direction:rtl;text-align:right;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 10px;background:#f7f7f7;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e5e7eb;border-radius:22px;overflow:hidden;"><tr><td style="padding:26px 24px;background:#1a1a3e;color:#fff;"><div style="font-size:24px;font-weight:900;margin-bottom:8px;">${escapeHtml(content.titleHe)}</div><div style="font-size:14px;line-height:1.7;color:#f2d162;">ד״ר סיון שני · מרפאה וטרינרית</div></td></tr><tr><td style="padding:24px;"><p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.8;">${escapeHtml(content.bodyHe)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">${rows}</table><p style="margin:20px 0 0;"><a href="${escapeHtml(content.url)}" style="display:inline-block;background:#1a1a3e;color:#fff;border-radius:10px;padding:11px 16px;font-size:13px;font-weight:800;text-decoration:none;">פתיחת ה־CRM</a></p></td></tr><tr><td style="padding:15px 24px;background:#fffdf3;border-top:1px solid #e8e1b8;text-align:center;color:#80630e;font-size:11px;line-height:1.7;">ההתראה נשלחה לפי הגדרות ההתראות של המרפאה.</td></tr></table></td></tr></table></body></html>`;
}

function readTwilioConfig(): TwilioConfig | null {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!accountSid || !authToken || !fromNumber) {
    console.error("[BusinessNotification] SMS unavailable because provider configuration is incomplete");
    return null;
  }
  return { accountSid, authToken, fromNumber };
}

async function sendEmail(to: string, content: ReturnType<typeof buildContent>, integrationHeaders: Record<string, string>) {
  const result = await integrations.integrations.core.sendEmail({
    to,
    from_name: "ד״ר סיון שני",
    subject: content.subject,
    body_html: ownerEmailHtml(content),
  }, { headers: integrationHeaders });
  if (result && typeof result === "object" && (("error" in result && result.error) || ("success" in result && result.success === false))) throw new Error("Email service reported an error");
}

async function sendSms(to: string, body: string, config: TwilioConfig) {
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}` },
    body: new URLSearchParams({ To: to, From: config.fromNumber, Body: body.slice(0, 1600) }).toString(),
  });
  let data: unknown = null;
  try { data = await response.json(); } catch { /* Twilio normally returns JSON. */ }
  if (!response.ok) throw new Error(`Twilio rejected the request (${response.status}${data && typeof data === "object" && "code" in data ? `, code ${(data as { code?: unknown }).code}` : ""})`);
}

type OneSignalCreateResponse = {
  id?: unknown;
  recipients?: unknown;
  errors?: unknown;
  warnings?: unknown;
};

type OneSignalPushOutcome = {
  notificationId: string;
  recipientCount?: number;
  warning?: string;
};

const SAFE_ONESIGNAL_ISSUE_KEYS = new Set([
  "invalid_aliases",
  "invalid_player_ids",
  "invalid_external_user_ids",
  "invalid_subscription_ids",
  "invalid_onesignal_ids",
]);

function hasOneSignalIssues(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function oneSignalIssueCategories(...values: unknown[]): string[] {
  const categories: string[] = [];
  for (const value of values) {
    if (!hasOneSignalIssues(value)) continue;
    if (Array.isArray(value)) {
      categories.push("provider_messages");
      continue;
    }
    if (value && typeof value === "object") {
      const keys = Object.keys(value as Record<string, unknown>);
      if (keys.length === 0) continue;
      for (const key of keys.slice(0, 4)) {
        categories.push(SAFE_ONESIGNAL_ISSUE_KEYS.has(key) ? key : "provider_details_redacted");
      }
      continue;
    }
    categories.push("provider_details_redacted");
  }
  return [...new Set(categories)].slice(0, 4);
}

function oneSignalRecipientCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function logOneSignalOutcome({
  event,
  sourceId,
  httpStatus,
  outcome,
  notificationId,
  recipientCount,
  issueCategories,
}: {
  event: NotificationEvent;
  sourceId: string;
  httpStatus: number | null;
  outcome: string;
  notificationId: string | null;
  recipientCount?: number;
  issueCategories?: string[];
}) {
  console.info("[BusinessNotification] OneSignal push result", {
    event,
    source_id: sourceId,
    http_status: httpStatus,
    outcome,
    notification_id: notificationId,
    ...(recipientCount !== undefined ? { recipient_count: recipientCount } : {}),
    ...(issueCategories?.length ? { issue_categories: issueCategories.slice(0, 4) } : {}),
  });
}

async function sendPush(
  content: ReturnType<typeof buildContent>,
  apiKey: string,
  event: NotificationEvent,
  sourceId: string,
): Promise<OneSignalPushOutcome> {
  let response: Response;
  try {
    response = await fetch(ONESIGNAL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        target_channel: "push",
        included_segments: ["Subscribed Users"],
        headings: { en: content.titleEn, he: content.titleHe },
        contents: { en: content.bodyEn, he: content.bodyHe },
        web_url: content.url,
      }),
    });
  } catch {
    logOneSignalOutcome({ event, sourceId, httpStatus: null, outcome: "request_failed", notificationId: null, issueCategories: ["network_error"] });
    throw new Error("OneSignal request failed.");
  }

  let rawBody: unknown = null;
  try { rawBody = await response.json(); } catch { /* Provider responses must be parsed before acceptance. */ }
  const payload = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
    ? rawBody as OneSignalCreateResponse
    : null;
  const recipientCount = oneSignalRecipientCount(payload?.recipients);
  const issueCategories = oneSignalIssueCategories(payload?.errors, payload?.warnings);

  if (!response.ok) {
    logOneSignalOutcome({
      event,
      sourceId,
      httpStatus: response.status,
      outcome: "rejected",
      notificationId: null,
      recipientCount,
      issueCategories: issueCategories.length ? issueCategories : ["provider_rejected"],
    });
    throw new Error(`OneSignal rejected the request (${response.status}).`);
  }

  if (!payload) {
    logOneSignalOutcome({ event, sourceId, httpStatus: response.status, outcome: "invalid_response", notificationId: null, issueCategories: ["malformed_response"] });
    throw new Error(`OneSignal returned an invalid response (${response.status}).`);
  }

  const notificationId = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!notificationId || notificationId.length > 128) {
    logOneSignalOutcome({
      event,
      sourceId,
      httpStatus: response.status,
      outcome: "no_notification_id",
      notificationId: null,
      recipientCount,
      issueCategories: issueCategories.length ? issueCategories : ["no_notification_id"],
    });
    throw new Error(`OneSignal returned HTTP ${response.status} without a notification ID.`);
  }

  const warning = issueCategories.length
    ? "OneSignal created the notification and reported partial recipient warnings."
    : undefined;
  logOneSignalOutcome({
    event,
    sourceId,
    httpStatus: response.status,
    outcome: warning ? "created_with_warning" : "created",
    notificationId,
    recipientCount,
    issueCategories,
  });
  return { notificationId, ...(recipientCount !== undefined ? { recipientCount } : {}), ...(warning ? { warning } : {}) };
}

async function loadSettings(): Promise<SettingsRecord | null> {
  const records = await superdev.entities.ClinicNotificationSettings.list("-created_at", 1);
  return Array.isArray(records) && records[0] && typeof records[0] === "object" ? records[0] as SettingsRecord : null;
}

function sourceEntity(event: NotificationEvent) {
  const source = EVENT_CONFIG[event].source;
  if (source === "Appointment") return superdev.entities.Appointment;
  if (source === "ContactInquiry") return superdev.entities.ContactInquiry;
  return superdev.entities.AppointmentRescheduleRequest;
}

async function loadSource(event: NotificationEvent, recordId: string): Promise<SourceRecord | null> {
  try {
    const record = await sourceEntity(event).get(recordId);
    return record && typeof record === "object" ? record as SourceRecord : null;
  } catch (error) {
    console.error(`[BusinessNotification] ${event} source lookup failed:`, safeError(error));
    return null;
  }
}

async function loadParentAppointment(record: SourceRecord): Promise<SourceRecord | null> {
  const appointmentId = text(record.appointment_id);
  if (!appointmentId || appointmentId.length > 128 || /[\s/]/.test(appointmentId)) return null;
  try {
    const appointment = await superdev.entities.Appointment.get(appointmentId);
    return appointment && typeof appointment === "object" ? appointment as SourceRecord : null;
  } catch (error) {
    console.error("[BusinessNotification] reschedule parent appointment lookup failed:", safeError(error));
    return null;
  }
}

async function updateSource(event: NotificationEvent, recordId: string, payload: Record<string, unknown>) {
  await sourceEntity(event).update(recordId, payload);
}

async function markNotificationError(event: NotificationEvent, recordId: string, detail: string) {
  const errorMarker = EVENT_CONFIG[event].errorMarker;
  if (!errorMarker) return;
  const safeDetail = detail.replace(/[\r\n]+/g, " ").slice(0, 500);
  try {
    await updateSource(event, recordId, {
      [errorMarker]: safeDetail,
      last_error: safeDetail,
      last_error_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[BusinessNotification] ${event} error marker update failed:`, safeError(error));
  }
}

function sourceIsEligible(event: NotificationEvent, record: SourceRecord) {
  if (event === "appointment_reschedule_requested") {
    return text(record.status).toLowerCase() === "pending";
  }
  if (event === "new_appointment") {
    const status = text(record.status).toLowerCase();
    return (status === "requested" || status === "confirmed") && isRecent(record.created_at);
  }
  if (event === "new_inquiry") return isRecent(record.created_at);
  if (event === "appointment_changed") {
    return text(record.status).toLowerCase() === "cancelled" && text(record.cancelled_by).toLowerCase() === "client" && isRecent(record.updated_at);
  }
  return text(record.status).toLowerCase() === "no_show" && isRecent(record.updated_at);
}

export function integrationHeadersFromRequest(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const authorization = req.headers.get("Authorization");
  const origin = req.headers.get("Origin");
  if (authorization) headers.Authorization = authorization;
  if (origin) headers.Origin = origin;
  return headers;
}

export async function dispatchBusinessNotification({
  event,
  recordId,
  integrationHeaders = {},
}: {
  event: NotificationEvent;
  recordId: string;
  integrationHeaders?: Record<string, string>;
}): Promise<BusinessNotificationResult> {
  if (!EVENT_CONFIG[event]) return result({ error: "Unsupported notification event" }, 400);
  if (typeof recordId !== "string" || !recordId.trim() || recordId.length > 128 || /[\s/]/.test(recordId)) {
    return result({ error: "record_id has an invalid format" }, 400);
  }

  const serviceRoleKey = Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    console.error(`[BusinessNotification] ${event} unavailable because service configuration is incomplete`);
    return result({ error: "Notification service is unavailable" }, 503);
  }

  const normalizedRecordId = recordId.trim();
  const lockKey = `${event}:${normalizedRecordId}`;
  if (inFlight.has(lockKey)) return result({ ok: true, status: "in_progress" }, 202);
  inFlight.add(lockKey);

  try {
    superdev.auth.setToken(serviceRoleKey);
    const record = await loadSource(event, normalizedRecordId);
    if (!record) return result({ error: "Source record was not found" }, 404);
    if (!sourceIsEligible(event, record)) return result({ ok: true, status: "not_eligible" }, 409);

    const config = EVENT_CONFIG[event];
    if (text(record[config.marker])) return result({ ok: true, status: "already_sent" });

    let parentAppointment: SourceRecord | null = null;
    if (event === "appointment_reschedule_requested") {
      parentAppointment = await loadParentAppointment(record);
      if (!parentAppointment) {
        const detail = "בקשת שינוי המועד אינה מקושרת לתור קיים.";
        await markNotificationError(event, normalizedRecordId, detail);
        return result({ ok: false, status: "parent_not_found" }, 409);
      }
    }

    let savedSettings: SettingsRecord | null = null;
    try { savedSettings = await loadSettings(); }
    catch (error) {
      console.error(`[BusinessNotification] ${event} settings lookup failed:`, safeError(error));
      await markNotificationError(event, normalizedRecordId, "לא ניתן היה לטעון את הגדרות ההתראות.");
      return result({ error: "Notification settings could not be loaded" }, 503);
    }

    const routing = notificationSettings(savedSettings, event, record);
    if (!routing.enabled) return result({ ok: true, status: "disabled" });
    if (routing.channels.length === 0) return result({ ok: true, status: "no_channels" });

    const content = buildContent(event, record, parentAppointment || record);
    const oneSignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    const twilio = routing.channels.includes("sms") ? readTwilioConfig() : null;
    let accepted = 0;
    let attempted = 0;
    const failures: string[] = [];
    const warnings: string[] = [];

    if (routing.channels.includes("email")) {
      for (const recipient of routing.emailRecipients) {
        attempted++;
        try { await sendEmail(recipient, content, integrationHeaders); accepted++; }
        catch (error) {
          const detail = `email: ${safeError(error)}`;
          failures.push(detail);
          console.error(`[BusinessNotification] ${event} ${detail}`);
        }
      }
    }

    if (routing.channels.includes("sms") && twilio) {
      for (const recipient of routing.smsRecipients) {
        attempted++;
        try { await sendSms(recipient, content.sms, twilio); accepted++; }
        catch (error) {
          const detail = `sms: ${safeError(error)}`;
          failures.push(detail);
          console.error(`[BusinessNotification] ${event} ${detail}`);
        }
      }
    }

    if (routing.channels.includes("push")) {
      if (!oneSignalApiKey) {
        const detail = "push: OneSignal configuration is incomplete";
        failures.push(detail);
        console.error(`[BusinessNotification] ${event} ${detail}`);
      } else {
        attempted++;
        try {
          const pushOutcome = await sendPush(content, oneSignalApiKey, event, normalizedRecordId);
          accepted++;
          if (pushOutcome.warning) warnings.push(`push: ${pushOutcome.warning}`);
        } catch (error) {
          const detail = `push: ${safeError(error)}`;
          failures.push(detail);
          console.error(`[BusinessNotification] ${event} ${detail}`);
        }
      }
    }

    if (accepted === 0) {
      const status = attempted > 0 ? "delivery_failed" : "no_recipients";
      if (event === "appointment_reschedule_requested") {
        await markNotificationError(event, normalizedRecordId, failures.join("; ") || "לא נמצאו נמענים תקינים לערוצי ההתראה.");
      }
      return result({ ok: false, status }, attempted > 0 ? 502 : 200);
    }

    const sentAt = new Date().toISOString();
    try {
      await updateSource(event, normalizedRecordId, {
        [config.marker]: sentAt,
        ...(config.errorMarker ? { [config.errorMarker]: attempted > accepted ? `נשלחה התראה חלקית. ${failures.join("; ")}` : "" } : {}),
        ...(config.errorMarker && attempted > accepted ? { last_error: failures.join("; ").slice(0, 500), last_error_at: sentAt } : {}),
      });
    } catch (error) {
      console.error(`[BusinessNotification] ${event} marker update failed:`, safeError(error));
      return result({ ok: false, status: "delivered_marker_failed" }, 500);
    }

    console.log(`[BusinessNotification] ${event} accepted through ${accepted} ${accepted === 1 ? "delivery" : "deliveries"}${attempted > accepted ? `, ${attempted - accepted} failed` : ""}`);
    return result({
      ok: true,
      status: "sent",
      ...(attempted > accepted ? { partial: true } : {}),
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (error) {
    console.error(`[BusinessNotification] ${event} failed:`, safeError(error));
    if (event === "appointment_reschedule_requested") await markNotificationError(event, normalizedRecordId, safeError(error));
    return result({ error: "Notification delivery failed" }, 500);
  } finally {
    inFlight.delete(lockKey);
  }
}

function isInternalRescheduleRequest(req: Request) {
  const serviceRoleKey = Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY");
  const provided = req.headers.get(INTERNAL_NOTIFICATION_HEADER);
  return Boolean(serviceRoleKey && provided && provided === serviceRoleKey);
}

async function handleRequest(req: Request) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Request body is invalid" }, 400);

  const request = body as Record<string, unknown>;
  if (Object.keys(request).some((key) => key !== "event" && key !== "record_id")) return json({ error: "Only event and record_id are accepted" }, 400);
  const event = request.event;
  const recordIdValue = request.record_id;
  if (event !== "new_appointment" && event !== "new_inquiry" && event !== "appointment_changed" && event !== "appointment_no_show" && event !== "appointment_reschedule_requested") return json({ error: "Unsupported notification event" }, 400);
  if (event === "appointment_reschedule_requested" && !isInternalRescheduleRequest(req)) return json({ error: "This notification source is internal only" }, 403);
  if (typeof recordIdValue !== "string") return json({ error: "record_id is required" }, 400);
  const recordId = recordIdValue.trim();
  if (!recordId || recordId.length > 128 || /[\s/]/.test(recordId)) return json({ error: "record_id has an invalid format" }, 400);

  const dispatched = await dispatchBusinessNotification({
    event,
    recordId,
    integrationHeaders: integrationHeadersFromRequest(req),
  });
  return json(dispatched.body, dispatched.status);
}

Deno.serve(handleRequest);
