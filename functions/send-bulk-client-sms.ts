import { createSuperdevClient } from "npm:@superdevhq/client@0.1.56";

type CrmRecord = Record<string, any>;
type ClientGroup = { records: CrmRecord[] };
type TwilioConfig = { accountSid: string; authToken: string; fromNumber: string };
type ResolvedClient = {
  id: string;
  name: string;
  phone: string;
  email: string;
  petName: string;
  allPhones: string[];
  consentedPhones: string[];
  allEmails: string[];
  smsConsent: boolean;
  futureAppointment: boolean;
};
type SendTarget = { client: ResolvedClient; destination: string };
type RecipientStatusInput = Record<string, unknown>;
type IntegrationOptions = { headers?: Record<string, string> };
type IntegrationSender = (value: Record<string, unknown>, options?: IntegrationOptions) => Promise<unknown>;

const MAX_SELECTED_CUSTOMERS = 100;
const MAX_RECIPIENTS = 100;
const MAX_MESSAGE_LENGTH = 500;
const MAX_EMAIL_SUBJECT_LENGTH = 160;
const SITE_ORIGIN = "https://sivanshanivet.com";
const CLINIC_NAME = "ד״ר סיון שני · מרפאה וטרינרית";
const CLINIC_SENDER_NAME = "ד״ר סיון שני";
const CLINIC_PHONE = "054-4345388";
const GOOGLE_REVIEWS_URL = "https://www.google.com/search?q=%D7%A1%D7%99%D7%95%D7%9F+%D7%A9%D7%A0%D7%99&oq=%D7%A1%D7%99%D7%95%D7%9F+&gs_lcrp=EgZjaHJvbWUqCAgAEEUYJxg7MggIABBFGCcYOzIGCAEQRRg5MgYIAhAjGCcyBwgDEC4YgAQyBggFEEUYPTIGCAYQRRg9MgYIBxBFGD3SAQgxMjc1ajBqNKgCALACAQ&sourceid=chrome&ie=UTF-8#lrd=0x1502b69024c904f3:0xd0cc3abadd287849,3,,,,";

type BroadcastChannel = "sms" | "email";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function safeError(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, " ");
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .slice(0, 180);
}

function normalizePhone(raw: unknown): string | null {
  const trimmed = text(raw);
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return "+972" + digits.slice(1);
  return trimmed;
}

function validPhone(value: string | null): value is string {
  return Boolean(value && /^\+[1-9]\d{7,14}$/.test(value));
}

function normalizeEmail(raw: unknown): string | null {
  const value = text(raw).toLowerCase();
  return value || null;
}

function validEmail(value: string | null): value is string {
  return Boolean(value && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function normalizeText(value: unknown): string {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function identityKeys(appointment: CrmRecord): string[] {
  const keys: string[] = [];
  const phone = normalizePhone(appointment.phone);
  const email = normalizeText(appointment.email);
  const name = normalizeText(appointment.client_name);
  if (phone) keys.push(`phone:${phone}`);
  if (email) keys.push(`email:${email}`);
  if (name) keys.push(`name:${name}`);
  if (!keys.length && appointment.id) keys.push(`record:${String(appointment.id)}`);
  return keys;
}

function canonicalKey(records: CrmRecord[]): string {
  const keys = new Set(records.flatMap(identityKeys));
  const pick = (prefix: string) => [...keys].filter((key) => key.startsWith(prefix)).sort()[0];
  return pick("phone:") || pick("email:") || pick("name:") || pick("record:") || "record:unknown";
}

function groupAppointments(appointments: CrmRecord[]): ClientGroup[] {
  const groups: ClientGroup[] = [];
  const identityToGroup = new Map<string, ClientGroup>();
  for (const appointment of appointments) {
    const keys = identityKeys(appointment);
    const matches = Array.from(new Set(keys.map((key) => identityToGroup.get(key)).filter((group): group is ClientGroup => Boolean(group))));
    const group = matches[0] || { records: [] };
    if (!matches.length) groups.push(group);
    for (const other of matches.slice(1)) {
      if (other === group) continue;
      group.records.push(...other.records);
      const index = groups.indexOf(other);
      if (index >= 0) groups.splice(index, 1);
      for (const [identity, owner] of identityToGroup.entries()) if (owner === other) identityToGroup.set(identity, group);
    }
    group.records.push(appointment);
    keys.forEach((key) => identityToGroup.set(key, group));
  }
  return groups;
}

function appointmentTimestamp(record: CrmRecord): number {
  const date = text(record.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  const time = text(record.start_time).slice(0, 5) || "00:00";
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

function appointmentSortKey(record: CrmRecord): string {
  return `${text(record.date)} ${text(record.start_time)} ${text(record.created_at)}`;
}

function sortedAppointments(records: CrmRecord[]): CrmRecord[] {
  return [...records].sort((a, b) => appointmentSortKey(b).localeCompare(appointmentSortKey(a)));
}

function sortedImports(records: CrmRecord[]): CrmRecord[] {
  return [...records].sort((a, b) => text(b.created_at).localeCompare(text(a.created_at)));
}

function firstValue(records: CrmRecord[], field: string): string {
  const record = records.find((item) => text(item[field]));
  return record ? text(record[field]) : "";
}

function importedHasConsent(record: CrmRecord): boolean {
  return record.sms_consent === true && Boolean(text(record.sms_consent_language));
}

function importedPets(records: CrmRecord[]): string[] {
  const names = new Map<string, string>();
  sortedImports(records).forEach((record) => {
    const name = text(record.pet_name);
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  });
  return [...names.values()];
}

function importedMatchesClient(record: CrmRecord, clientKey: string): boolean {
  const link = text(record.linked_client_key);
  return link === clientKey || link === `client:${clientKey}`;
}

function uniqueEmails(records: CrmRecord[]): string[] {
  return Array.from(new Set(records.map((record) => normalizeEmail(record.email)).filter((value): value is string => Boolean(value))));
}

function buildResolvedClients(appointments: CrmRecord[], businessClients: CrmRecord[]): ResolvedClient[] {
  const groups = groupAppointments(appointments);
  const linkedBusinessIds = new Set<string>();
  const appointmentRows = groups.map((group) => {
    const sorted = sortedAppointments(group.records);
    const clientKey = canonicalKey(sorted);
    const imports = businessClients.filter((record) => importedMatchesClient(record, clientKey));
    imports.forEach((record) => linkedBusinessIds.add(text(record.id)));
    const sortedBusiness = sortedImports(imports);
    const name = firstValue(sortedBusiness, "name") || firstValue(sorted, "client_name") || "לקוח ללא שם";
    const phone = firstValue(sortedBusiness, "phone") || firstValue(sorted, "phone");
    const email = normalizeEmail(firstValue(sortedBusiness, "email") || firstValue(sorted, "email")) || "";
    const allPhones = Array.from(new Set([...sorted, ...sortedBusiness].map((record) => normalizePhone(record.phone)).filter((value): value is string => Boolean(value))));
    const consentedPhones = Array.from(new Set([
      ...sorted.filter((record) => record.sms_consent === true && Boolean(text(record.sms_consent_language))).map((record) => normalizePhone(record.phone)),
      ...sortedBusiness.filter(importedHasConsent).map((record) => normalizePhone(record.phone)),
    ].filter(validPhone)));
    const allEmails = uniqueEmails([...sorted, ...sortedBusiness]);
    const smsConsent = sorted.some((record) => record.sms_consent === true && Boolean(text(record.sms_consent_language))) || sortedBusiness.some(importedHasConsent);
    const petName = firstValue(sorted, "pet_name") || importedPets(sortedBusiness)[0] || "";
    const futureAppointment = sorted.some((record) => ["requested", "confirmed"].includes(text(record.status).toLowerCase()) && appointmentTimestamp(record) > Date.now());
    return { id: `client:${clientKey}`, name, phone, email, petName, allPhones, consentedPhones, allEmails, smsConsent, futureAppointment };
  });

  const importedRows = businessClients.filter((record, index) => !linkedBusinessIds.has(text(record.id)) || !text(record.id)).map((record, index) => {
    const name = text(record.name) || "לקוח ללא שם";
    const phone = text(record.phone);
    const normalizedPhone = normalizePhone(phone);
    const email = normalizeEmail(record.email) || "";
    const allEmails = uniqueEmails([record]);
    const hasConsent = importedHasConsent(record);
    return { id: `business-client:${text(record.id) || index}`, name, phone, email, petName: text(record.pet_name), allPhones: normalizedPhone ? [normalizedPhone] : [], consentedPhones: hasConsent && validPhone(normalizedPhone) ? [normalizedPhone] : [], allEmails, smsConsent: hasConsent, futureAppointment: false };
  });

  return [...appointmentRows, ...importedRows];
}

function maskedDestination(value: unknown): string | undefined {
  const normalized = text(value);
  if (!normalized) return undefined;
  if (normalized.includes("*") || normalized.includes("•")) return normalized;
  if (normalized.includes("@")) {
    const atIndex = normalized.lastIndexOf("@");
    const local = normalized.slice(0, atIndex);
    const domain = normalized.slice(atIndex + 1);
    return `${local.slice(0, 1)}***@${domain || "לא זמין"}`;
  }
  const digits = normalized.replace(/\D/g, "");
  if (digits.length >= 4) return `••••${digits.slice(-4)}`;
  return normalized.length > 2 ? `${normalized.slice(0, 1)}•••${normalized.slice(-1)}` : "••••";
}

function readTwilioConfig(): TwilioConfig | null {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");
  return accountSid && authToken && fromNumber ? { accountSid, authToken, fromNumber } : null;
}

async function sendOne(to: string, body: string, config: TwilioConfig): Promise<void> {
  const form = new URLSearchParams({ To: to, From: config.fromNumber, Body: body });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}` },
    body: form.toString(),
  });
  let data: any = null;
  try { data = await response.json(); } catch { /* Twilio normally returns JSON. */ }
  if (!response.ok) throw new Error(`Twilio request failed (${response.status}${data?.code ? `, code ${data.code}` : ""})`);
}

function requestHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const authorization = req.headers.get("Authorization");
  const origin = req.headers.get("Origin");
  if (authorization) headers.Authorization = authorization;
  if (origin) headers.Origin = origin;
  return headers;
}

function integrationFailed(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const payload = result as Record<string, unknown>;
  return Boolean(payload.error) || payload.success === false || payload.status === "error" || payload.status === "failed";
}

async function sendOneEmail(to: string, subject: string, bodyHtml: string, client: any, headers: Record<string, string>): Promise<void> {
  const sendEmail = client.integrations.core.sendEmail as unknown as IntegrationSender;
  const result = await sendEmail({ to, from_name: CLINIC_SENDER_NAME, subject, body_html: bodyHtml }, { headers });
  if (integrationFailed(result)) throw new Error("שירות האימייל לא אישר את השליחה");
}

function absoluteSiteUrl(value: string): string {
  if (!value.startsWith("/")) return value;
  return new URL(value, SITE_ORIGIN).toString();
}

function ctaForDraft(draft: CrmRecord): { label: string; url: string } | null {
  const key = text(draft.cta_key);
  if (key === "book_appointment") return { label: "קביעת תור", url: absoluteSiteUrl("/appointments") };
  if (key === "call_clinic") return { label: "התקשרות למרפאה", url: "tel:054-4345388" };
  if (key === "google_reviews") return { label: "דירוג בגוגל", url: GOOGLE_REVIEWS_URL };
  return null;
}

function firstName(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean)[0] || "";
}

function personalizedMessage(template: string, client: ResolvedClient): string {
  return template.replaceAll("{client_first_name}", firstName(client.name)).replaceAll("{pet_name}", client.petName).trim();
}

function renderSmsMessage(template: string, client: ResolvedClient, cta: { label: string; url: string } | null): string {
  const body = personalizedMessage(template, client);
  return cta ? `${body}\n\n${cta.label}: ${cta.url}` : body;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] || character));
}

function messageHtml(value: string): string {
  const blocks = value.trim().split(/\r?\n\s*\r?\n/).map((block) => block.trim()).filter(Boolean);
  if (!blocks.length) return "<p style=\"margin:0;line-height:1.8;\"></p>";
  return blocks.map((block) => `<p style="margin:0 0 16px;line-height:1.8;">${escapeHtml(block).replace(/\r?\n/g, "<br />")}</p>`).join("");
}

function renderEmailHtml(subject: string, template: string, client: ResolvedClient, cta: { label: string; url: string } | null): string {
  const body = messageHtml(personalizedMessage(template, client));
  const ctaHtml = cta
    ? `<div style="margin:24px 0 4px;text-align:center;"><a href="${escapeHtml(cta.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;border-radius:12px;background:#1a1a3e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;">${escapeHtml(cta.label)}</a></div>`
    : "";
  return `<!doctype html>
<html lang="he" dir="rtl">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;background:#f7f7f7;font-family:Arial,'Segoe UI',sans-serif;direction:rtl;text-align:right;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 10px;background:#f7f7f7;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:22px;overflow:hidden;">
          <tr><td style="padding:26px 24px;background:#1a1a3e;color:#ffffff;">
            <div style="font-size:23px;font-weight:900;line-height:1.35;">${escapeHtml(CLINIC_NAME)}</div>
            <div style="margin-top:8px;color:#f2d162;font-size:13px;line-height:1.6;">הודעה מהמרפאה</div>
          </td></tr>
          <tr><td style="padding:26px 24px;color:#334155;font-size:15px;">
            ${body}
            ${ctaHtml}
          </td></tr>
          <tr><td style="padding:18px 24px;background:#fffdf3;border-top:1px solid #e8e1b8;text-align:center;color:#80630e;font-size:11px;line-height:1.8;">
            זוהי הודעה שיווקית שנשלחה מטעם ${escapeHtml(CLINIC_NAME)}.<br />
            לשינוי העדפות או להפסקת הודעות שיווקיות, צרו קשר עם המרפאה בטלפון ${escapeHtml(CLINIC_PHONE)} או דרך <a href="${escapeHtml(SITE_ORIGIN)}" style="color:#5267a8;text-decoration:underline;">אתר המרפאה</a>.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function audienceLabel(key: string): string {
  if (key === "all_clients") return "כל הלקוחות";
  if (key === "future_appointments") return "לקוחות עם תור עתידי";
  if (key === "selected_clients") return "לקוחות נבחרים";
  if (key === "sms_consent") return "אנשי קשר עם הסכמה ל-SMS";
  return "קהל לא ידוע";
}

function resultMessage(channel: BroadcastChannel, sent: number, skipped: number, failed: number): string {
  const channelLabel = channel === "email" ? "אימיילים" : "הודעות SMS";
  const skipReason = channel === "email" ? "כתובות חסרות, לא תקינות או כפולות" : "הסכמה או פרטי טלפון חסרים";
  if (sent > 0 && skipped === 0 && failed === 0) return `השליחה הסתיימה בהצלחה. נשלחו ${sent} ${channelLabel}.`;
  if (sent > 0) return `השליחה הסתיימה חלקית. נשלחו ${sent}, דולגו ${skipped}, ונכשלו ${failed}.`;
  if (skipped > 0 && failed === 0) return `לא נשלחו ${channelLabel}. דולגו ${skipped} נמענים בגלל ${skipReason}.`;
  return `השליחה לא הושלמה. דולגו ${skipped}, ונכשלו ${failed}.`;
}

function statusForCounts(sent: number, skipped: number, failed: number): "completed" | "partial" | "failed" {
  if (sent > 0 && skipped === 0 && failed === 0) return "completed";
  if (sent > 0) return "partial";
  return "failed";
}

function skipStatus(channel: BroadcastChannel, client: string, destination: unknown, reason: string, sentAt: string): RecipientStatusInput {
  return { recipient_label: client, destination_masked: maskedDestination(destination), channel, status: "skipped", sent_at: sentAt, failure_reason: reason };
}

async function authenticate(req: Request): Promise<{ client: any; user: any } | null> {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const appId = Deno.env.get("SUPERDEV_APP_ID");
  const client = createSuperdevClient({ appId });
  client.auth.setToken(token);
  try {
    const user = await client.auth.me();
    if (!user?.email) return null;
    return { client, user };
  } catch (error) {
    console.error("[Bulk SMS] authentication failed:", safeError(error));
    return null;
  }
}

async function sendLegacy(payload: CrmRecord, client: any): Promise<Response> {
  const rawKeys = payload?.customer_keys;
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";
  if (!Array.isArray(rawKeys) || rawKeys.length === 0 || rawKeys.length > MAX_SELECTED_CUSTOMERS) return json({ error: "יש לבחור מספר לקוחות תקין" }, 400);
  const customerKeys = Array.from(new Set(rawKeys.filter((key: unknown): key is string => typeof key === "string" && key.length > 0 && key.length <= 320)));
  if (customerKeys.length !== rawKeys.length) return json({ error: "בחירת הלקוחות אינה תקינה" }, 400);
  if (!message || message.length > MAX_MESSAGE_LENGTH) return json({ error: "אורך ההודעה אינו תקין" }, 400);

  const appointments = await client.entities.Appointment.list("-created_at", 500) as CrmRecord[];
  const businessClients = await client.entities.BusinessClient.list("-created_at", 500) as CrmRecord[];
  const resolvedClients = buildResolvedClients(
    Array.isArray(appointments) ? appointments : [],
    Array.isArray(businessClients) ? businessClients : [],
  );
  const aliases = new Map<string, ResolvedClient>();
  resolvedClients.forEach((row) => {
    aliases.set(row.id, row);
    if (row.id.startsWith("client:")) aliases.set(row.id.slice("client:".length), row);
  });

  let skipped = 0;
  const eligiblePhones = new Set<string>();
  for (const customerKey of customerKeys) {
    const row = aliases.get(customerKey) || (customerKey.startsWith("client:")
      ? aliases.get(customerKey.slice("client:".length))
      : aliases.get(`client:${customerKey}`));
    if (!row) {
      skipped += 1;
      continue;
    }

    const allPhones = Array.from(new Set(row.allPhones.filter(validPhone)));
    const groupEligible = Array.from(new Set(row.consentedPhones.filter(validPhone)));
    const eligibleSet = new Set(groupEligible);
    if (groupEligible.length === 0) {
      skipped += Math.max(1, allPhones.length);
      continue;
    }

    skipped += allPhones.filter((phone) => !eligibleSet.has(phone)).length;
    groupEligible.forEach((phone) => {
      if (eligiblePhones.has(phone)) {
        skipped += 1;
        return;
      }
      eligiblePhones.add(phone);
    });
  }

  if (eligiblePhones.size > MAX_RECIPIENTS) return json({ error: "נבחרו יותר מדי נמענים. חלקי את השליחה לקבוצות קטנות יותר." }, 400);
  if (eligiblePhones.size === 0) return json({ sent: 0, skipped, failed: 0, message: "לא נמצאו נמענים עם מספר, הסכמה מפורשת ונוסח הסכמה שמור" });

  const twilio = readTwilioConfig();
  if (!twilio) {
    console.error("[Bulk SMS] missing Twilio configuration");
    return json({ error: "שירות ה-SMS אינו מוגדר כרגע" }, 503);
  }

  let sent = 0;
  let failed = 0;
  for (const phone of eligiblePhones) {
    try {
      await sendOne(phone, message, twilio);
      sent++;
    } catch (error) {
      failed++;
      console.error("[Bulk SMS] recipient send failed:", safeError(error));
    }
  }
  console.log(`[Bulk SMS] completed: selected=${customerKeys.length}, sent=${sent}, skipped=${skipped}, failed=${failed}`);
  return json({ sent, skipped, failed, message: "השליחה הסתיימה" });
}

async function sendBroadcast(payload: CrmRecord, client: any, req: Request): Promise<Response> {
  const broadcastId = text(payload?.broadcast_id);
  if (!broadcastId || broadcastId.length > 320) return json({ error: "מזהה הודעה אינו תקין" }, 400);
  const draftRows = await client.entities.MarketingBroadcastDraft.filter({ id: broadcastId }, "-updated_at", 5) as CrmRecord[];
  const draft = Array.isArray(draftRows) ? draftRows[0] : null;
  if (!draft) return json({ error: "הטיוטה לא נמצאה או שאינה שייכת לחשבון המחובר" }, 404);
  if (text(draft.broadcast_type) && text(draft.broadcast_type) !== "broadcast") return json({ error: "סוג ההודעה אינו נתמך" }, 400);
  if (text(draft.status) !== "ready") return json({ error: "רק הודעה במצב מוכנה לאישור יכולה להישלח" }, 400);

  const channel = text(draft.channel) as BroadcastChannel;
  if (channel !== "sms" && channel !== "email") return json({ error: "ערוץ ההודעה אינו נתמך" }, 400);
  if (channel === "sms" && draft.sms_consent_acknowledged !== true) return json({ error: "יש לאשר שהנמענים נתנו הסכמה מתועדת ל-SMS" }, 400);

  const key = text(draft.audience_key);
  if (key === "leads") return json({ error: "קהל לידים הוסר. בחרו לקוחות או קהל נתמך אחר" }, 400);
  if (!["all_clients", "future_appointments", "selected_clients", "sms_consent"].includes(key)) return json({ error: "קהל היעד אינו נתמך" }, 400);
  const selectedIds = Array.isArray(draft.selected_client_ids) ? Array.from(new Set(draft.selected_client_ids.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0 && id.length <= 320).map((id: string) => id.trim()))) : [];
  if (key === "selected_clients" && (selectedIds.length === 0 || selectedIds.length > MAX_SELECTED_CUSTOMERS)) return json({ error: "יש לבחור בין לקוח אחד למאה לקוחות" }, 400);

  const message = text(draft.message_body);
  if (!message) return json({ error: "תוכן ההודעה חסר" }, 400);
  if (message.length > MAX_MESSAGE_LENGTH) return json({ error: "אורך ההודעה חורג מהמגבלה" }, 400);

  const emailSubject = channel === "email" ? text(draft.email_subject) : "";
  if (channel === "email" && !emailSubject) return json({ error: "נושא האימייל חסר" }, 400);
  if (channel === "email" && emailSubject.length > MAX_EMAIL_SUBJECT_LENGTH) return json({ error: "נושא האימייל חורג מהמגבלה" }, 400);

  const appointments = await client.entities.Appointment.list("-created_at", 500) as CrmRecord[];
  const businessClients = await client.entities.BusinessClient.list("-created_at", 500) as CrmRecord[];
  const allClients = buildResolvedClients(Array.isArray(appointments) ? appointments : [], Array.isArray(businessClients) ? businessClients : []);
  let audienceRows: ResolvedClient[] = [];
  let unknownSelectedCount = 0;
  if (key === "selected_clients") {
    const wanted = new Set(selectedIds);
    audienceRows = allClients.filter((row) => wanted.has(row.id));
    unknownSelectedCount = selectedIds.filter((id) => !allClients.some((row) => row.id === id)).length;
  } else if (key === "future_appointments") {
    audienceRows = allClients.filter((row) => row.futureAppointment);
  } else if (key === "sms_consent") {
    audienceRows = allClients.filter((row) => row.smsConsent);
  } else {
    audienceRows = allClients;
  }

  const now = new Date().toISOString();
  const preStatuses: RecipientStatusInput[] = [];
  const targets: SendTarget[] = [];
  for (let index = 0; index < unknownSelectedCount; index++) preStatuses.push(skipStatus(channel, "לקוח שנבחר", undefined, "הלקוח לא נמצא ברשומות ה-CRM", now));

  if (channel === "sms") {
    const seenPhones = new Set<string>();
    for (const row of audienceRows) {
      const allValidPhones = row.allPhones.filter(validPhone);
      const eligiblePhones = row.consentedPhones.filter(validPhone);
      const eligibleSet = new Set(eligiblePhones);
      if (eligiblePhones.length === 0) {
        preStatuses.push(skipStatus("sms", row.name, row.phone || allValidPhones[0], row.smsConsent ? "אין מספר טלפון תקין" : "אין הסכמה מתועדת ל-SMS", now));
      } else {
        allValidPhones.filter((phone) => !eligibleSet.has(phone)).forEach((phone) => preStatuses.push(skipStatus("sms", row.name, phone, "למספר הזה אין הסכמה מתועדת ל-SMS", now)));
      }
      eligiblePhones.forEach((phone) => {
        if (seenPhones.has(phone)) {
          preStatuses.push(skipStatus("sms", row.name, phone, "מספר הטלפון כבר נכלל בשליחה", now));
          return;
        }
        seenPhones.add(phone);
        targets.push({ client: row, destination: phone });
      });
    }
  } else {
    const seenEmails = new Set<string>();
    for (const row of audienceRows) {
      const allEmails = Array.from(new Set(row.allEmails.map(normalizeEmail).filter((value): value is string => Boolean(value))));
      const eligibleEmails = allEmails.filter(validEmail);
      const eligibleSet = new Set(eligibleEmails);
      if (eligibleEmails.length === 0) {
        preStatuses.push(skipStatus("email", row.name, row.email || allEmails[0], allEmails.length ? "כתובת האימייל חסרה או אינה תקינה" : "אין כתובת אימייל ברשומת הלקוח", now));
      } else {
        allEmails.filter((email) => !eligibleSet.has(email)).forEach((email) => preStatuses.push(skipStatus("email", row.name, email, "כתובת האימייל אינה תקינה", now)));
      }
      eligibleEmails.forEach((email) => {
        if (seenEmails.has(email)) {
          preStatuses.push(skipStatus("email", row.name, email, "כתובת האימייל כבר נכללה בשליחה", now));
          return;
        }
        seenEmails.add(email);
        targets.push({ client: row, destination: email });
      });
    }
  }

  if (targets.length > MAX_RECIPIENTS) return json({ error: "נמצאו יותר מדי נמענים. חלקו את השליחה לקבוצות קטנות יותר." }, 400);

  let log: CrmRecord;
  try {
    log = await client.entities.MarketingSendLog.create({
      campaign_name: text(draft.broadcast_name) || "הודעה שיווקית",
      campaign_type: "broadcast",
      source_id: broadcastId,
      channel,
      email_subject: emailSubject,
      message_preview: message.slice(0, MAX_MESSAGE_LENGTH),
      audience_label: audienceLabel(key),
      sent_at: now,
      status: "failed",
      recipient_count: targets.length + preStatuses.length,
      delivered_count: 0,
      failed_count: 0,
      skipped_count: preStatuses.length,
      opened_count: 0,
      clicked_count: 0,
    });
  } catch (error) {
    console.error(`[Broadcast ${channel}] could not create send log:`, safeError(error));
    return json({ error: "לא הצלחנו לשמור את ניסיון השליחה. לא נשלחה הודעה." }, 500);
  }

  const cta = ctaForDraft(draft);
  const statuses: RecipientStatusInput[] = [...preStatuses];
  const twilio = channel === "sms" ? readTwilioConfig() : null;
  const integrationHeaders = requestHeaders(req);
  let sent = 0;
  let failed = 0;
  for (const target of targets) {
    if (channel === "sms") {
      const finalMessage = renderSmsMessage(message, target.client, cta);
      if (finalMessage.length > MAX_MESSAGE_LENGTH) {
        failed++;
        statuses.push({ recipient_label: target.client.name, destination_masked: maskedDestination(target.destination), channel: "sms", status: "failed", sent_at: now, failure_reason: "ההודעה האישית חורגת ממגבלת 500 תווים" });
        continue;
      }
      if (!twilio) {
        failed++;
        statuses.push({ recipient_label: target.client.name, destination_masked: maskedDestination(target.destination), channel: "sms", status: "failed", sent_at: now, failure_reason: "שירות ה-SMS אינו מוגדר כרגע" });
        continue;
      }
      try {
        await sendOne(target.destination, finalMessage, twilio);
        sent++;
        statuses.push({ recipient_label: target.client.name, destination_masked: maskedDestination(target.destination), channel: "sms", status: "sent", sent_at: now });
      } catch (error) {
        failed++;
        console.error("[Broadcast SMS] recipient send failed:", safeError(error));
        statuses.push({ recipient_label: target.client.name, destination_masked: maskedDestination(target.destination), channel: "sms", status: "failed", sent_at: now, failure_reason: safeError(error) });
      }
      continue;
    }

    try {
      await sendOneEmail(target.destination, emailSubject, renderEmailHtml(emailSubject, message, target.client, cta), client, integrationHeaders);
      sent++;
      statuses.push({ recipient_label: target.client.name, destination_masked: maskedDestination(target.destination), channel: "email", status: "sent", sent_at: now });
    } catch (error) {
      failed++;
      console.error("[Broadcast Email] recipient send failed:", safeError(error));
      statuses.push({ recipient_label: target.client.name, destination_masked: maskedDestination(target.destination), channel: "email", status: "failed", sent_at: now, failure_reason: "שירות האימייל לא אישר את השליחה" });
    }
  }

  const skipped = preStatuses.length;
  const status = statusForCounts(sent, skipped, failed);
  try {
    if (statuses.length > 0) await client.entities.MarketingRecipientStatus.bulkCreate(statuses.map((item) => ({ ...item, send_log_id: text(log.id) })));
  } catch (error) {
    console.error(`[Broadcast ${channel}] could not create recipient statuses:`, safeError(error));
  }
  try {
    await client.entities.MarketingSendLog.update(log.id, { status, recipient_count: statuses.length, delivered_count: sent, failed_count: failed, skipped_count: skipped, sent_at: now });
  } catch (error) {
    console.error(`[Broadcast ${channel}] could not update send log:`, safeError(error));
  }
  try {
    await client.entities.MarketingBroadcastDraft.update(broadcastId, { last_sent_at: now, last_send_status: status, last_sent_count: sent, last_skipped_count: skipped, last_failed_count: failed });
  } catch (error) {
    console.error(`[Broadcast ${channel}] could not update draft send metadata:`, safeError(error));
  }

  console.log(`[Broadcast ${channel}] completed: draft=${broadcastId}, audience=${key}, sent=${sent}, skipped=${skipped}, failed=${failed}`);
  return json({ sent, skipped, failed, status, send_log_id: text(log.id), message: resultMessage(channel, sent, skipped, failed) });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let payload: CrmRecord;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "בקשה לא תקינה" }, 400);
  }

  const authenticated = await authenticate(req);
  if (!authenticated) return json({ error: "נדרשת התחברות כדי לשלוח הודעות" }, 401);

  try {
    if (typeof payload?.broadcast_id === "string" && payload.broadcast_id.trim()) return await sendBroadcast(payload, authenticated.client, req);
    return await sendLegacy(payload, authenticated.client);
  } catch (error) {
    console.error("[Bulk SMS] request failed:", safeError(error));
    return json({ error: "לא הצלחנו להכין את השליחה. נסי שוב מאוחר יותר." }, 500);
  }
});
