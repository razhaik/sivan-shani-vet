import "../_shared/cors.ts";
import { createSuperdevClient } from "../_shared/superdev-compat.ts";
import { cleanReminderEmail } from "../_shared/clean-email.ts";


const superdev = createSuperdevClient({ appId: (Deno.env.get("SUPERDEV_APP_ID") ?? "sivan-shani-vet") });
const integrations = createSuperdevClient({ appId: (Deno.env.get("SUPERDEV_APP_ID") ?? "sivan-shani-vet") });
const Appointment = superdev.entities.Appointment;
const TIME_ZONE = "Asia/Jerusalem";
const HOUR_MS = 60 * 60 * 1000;
const CATCH_UP_MS = 6 * HOUR_MS;
const MAX_APPOINTMENTS = 250;
const DEFAULT_CLINIC_NAME = "ד״ר סיון שני – מרפאה וטרינרית";
const SITE_URL = "https://sivanshanivet.com";

// The renderer above keeps customer email actions inside the reminder workflow.
function validManagementToken(value: unknown): value is string {
  const token = typeof value === "string" ? value.trim() : "";
  return token.length >= 12 && token.length <= 160 && /^[A-Za-z0-9._~-]+$/.test(token);
}

function appointmentManagementUrl(appointment: AppointmentRecord, settings: Settings): string {
  if (settings.self_service_appointment_management_enabled !== true) return "";
  const token = typeof appointment.cancel_token === "string" ? appointment.cancel_token.trim() : "";
  return validManagementToken(token)
    ? `${SITE_URL}/manage-appointment?token=${encodeURIComponent(token)}`
    : "";
}

type ReminderKind = "day" | "hour";
type Settings = Record<string, unknown>;
type AppointmentRecord = Record<string, any>;
type TwilioConfig = { accountSid: string; authToken: string; fromNumber: string };

type ReminderCopy = {
  marker: string;
  hours: number;
  subject: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusColor: string;
  smsTemplate: string;
};

const israelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function hours(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 && number <= 720 ? number : fallback;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 180);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] || character));
}

function israelParts(instant: Date) {
  const parts: Record<string, string> = {};
  for (const part of israelFormatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

function israelOffsetMs(instant: Date): number {
  const second = Math.floor(instant.getTime() / 1000) * 1000;
  const parts = israelParts(instant);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - second;
}

/** Convert a stored Israel wall-clock date/time to an instant using the IANA timezone rules. */
function localIsraelToInstant(dateValue: unknown, timeValue: unknown): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue ?? "").trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeValue ?? "").trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;
  if (new Date(Date.UTC(year, month, 0)).getUTCDate() < day) return null;

  const wallClockMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const candidates: number[] = [];
  for (const dayOffset of [-3, -2, -1, 0, 1, 2, 3]) {
    const probe = new Date(wallClockMs + dayOffset * 24 * HOUR_MS);
    const candidateMs = wallClockMs - israelOffsetMs(probe);
    const candidate = new Date(candidateMs);
    const parts = israelParts(candidate);
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute) {
      candidates.push(candidateMs);
    }
  }
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

function displayDate(value: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value ?? "-");
}

function normalizePhone(raw: unknown): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return "+972" + digits.slice(1);
  return trimmed;
}

function validPhone(value: string | null): value is string {
  return Boolean(value && /^\+[1-9]\d{7,14}$/.test(value));
}

function validEmail(raw: unknown): string | null {
  const email = typeof raw === "string" ? raw.trim() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function reminderCopy(settings: Settings, kind: ReminderKind): ReminderCopy {
  const day = kind === "day";
  return {
    marker: day ? "day_before_reminder_sent_at" : "hour_before_reminder_sent_at",
    hours: hours(settings[day ? "reminder_day_before_hours" : "reminder_hour_before_hours"], day ? 24 : 1),
    subject: text(settings[day ? "reminder_day_before_subject" : "reminder_hour_before_subject"], day ? "תזכורת לתור – ד״ר סיון שני" : "תזכורת לתור בעוד שעה – ד״ר סיון שני"),
    title: text(settings[day ? "reminder_day_before_title" : "reminder_hour_before_title"], day ? "תזכורת לתור שלך" : "התור שלך בעוד שעה"),
    subtitle: text(settings[day ? "reminder_day_before_subtitle" : "reminder_hour_before_subtitle"], day ? "מחכים לראות אתכם במרפאה." : "התור שלך מתקרב, נתראה בקרוב במרפאה."),
    statusLabel: text(settings[day ? "reminder_day_before_status_label" : "reminder_hour_before_status_label"], day ? "תזכורת יום לפני" : "תזכורת שעה לפני"),
    statusColor: day ? "#ea580c" : "#dc2626",
    smsTemplate: text(settings[day ? "reminder_sms_day_before_template" : "reminder_sms_hour_before_template"], day
      ? "שלום {CLIENT_NAME}, תזכורת לתור עבור {PET_NAME} בתאריך {DATE} בשעה {TIME} במרפאת ד״ר סיון שני."
      : "שלום {CLIENT_NAME}, תזכורת לתור עבור {PET_NAME} בעוד שעה, בתאריך {DATE} בשעה {TIME} במרפאת ד״ר סיון שני."),
  };
}


function renderSms(appointment: AppointmentRecord, copy: ReminderCopy): string {
  const values: Record<string, string> = {
    CLIENT_NAME: text(appointment.client_name, "לקוח יקר"), PET_NAME: text(appointment.pet_name, "חיית המחמד"),
    DATE: displayDate(appointment.date), TIME: text(appointment.start_time, "-")
  };
  return ["CLIENT_NAME", "PET_NAME", "DATE", "TIME"].reduce((message, key) => message.replaceAll(`{${key}}`, values[key]), copy.smsTemplate).trim().slice(0, 1600);
}

function readTwilioConfig(): TwilioConfig | null {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");
  const missing = [!accountSid && "TWILIO_ACCOUNT_SID", !authToken && "TWILIO_AUTH_TOKEN", !fromNumber && "TWILIO_FROM_NUMBER"].filter(Boolean);
  if (missing.length) {
    console.error(`[Reminders] SMS unavailable, missing configuration: ${missing.join(", ")}`);
    return null;
  }
  return { accountSid: accountSid!, authToken: authToken!, fromNumber: fromNumber! };
}

async function sendReminderSms(to: string, body: string, config: TwilioConfig): Promise<void> {
  const form = new URLSearchParams({ To: to, From: config.fromNumber, Body: body });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}` }, body: form.toString()
  });
  let data: any = null;
  try { data = await response.json(); } catch { /* Twilio normally returns JSON. */ }
  if (!response.ok) throw new Error(`Twilio request failed (${response.status}${data?.code ? `, code ${data.code}` : ""})`);
}

async function sendReminderEmail(appointment: AppointmentRecord, settings: Settings, copy: ReminderCopy, to: string, kind: ReminderKind): Promise<void> {
  const managementUrl = appointmentManagementUrl(appointment, settings);
  const bodyHtml = cleanReminderEmail(appointment, { label: copy.statusLabel, title: copy.title, subtitle: copy.subtitle }, { managementUrl });
  const result = await integrations.integrations.core.sendEmail({ to, subject: copy.subject, body_html: bodyHtml, from_name: "ד״ר סיון שני" });
  if (result && typeof result === "object" && (("error" in result && result.error) || ("success" in result && result.success === false))) throw new Error("Email service reported an error");
}

async function processReminder(appointment: AppointmentRecord, settings: Settings, kind: ReminderKind, start: Date, now: Date, twilio: TwilioConfig | null): Promise<void> {
  const copy = reminderCopy(settings, kind);
  if (appointment[copy.marker] || now.getTime() < start.getTime() - copy.hours * HOUR_MS || now.getTime() >= start.getTime() || now.getTime() - (start.getTime() - copy.hours * HOUR_MS) > CATCH_UP_MS) return;

  let delivered = false;
  if (settings.enable_email_reminders !== false) {
    const email = validEmail(appointment.email);
    if (email) {
      try { await sendReminderEmail(appointment, settings, copy, email, kind); delivered = true; console.log(`[Reminders] ${kind} email sent for appointment ${appointment.id}`); }
      catch (error) { console.error(`[Reminders] ${kind} email failed for appointment ${appointment.id}:`, safeError(error)); }
    }
  }

  if (settings.enable_sms_reminders === true) {
    const phone = normalizePhone(appointment.phone);
    if (validPhone(phone) && twilio) {
      try { await sendReminderSms(phone, renderSms(appointment, copy), twilio); delivered = true; console.log(`[Reminders] ${kind} SMS sent for appointment ${appointment.id}`); }
      catch (error) { console.error(`[Reminders] ${kind} SMS failed for appointment ${appointment.id}:`, safeError(error)); }
    }
  }

  // There is one marker per reminder, not one per channel. Mark after any successful channel
  // so a successful delivery is not repeated when its other channel fails.
  if (delivered) {
    try { await Appointment.update(appointment.id, { [copy.marker]: now.toISOString() }); }
    catch (error) { console.error(`[Reminders] ${kind} marker update failed for appointment ${appointment.id}:`, safeError(error)); }
  }
}

async function processAppointment(appointment: AppointmentRecord, settings: Settings, now: Date, twilio: TwilioConfig | null): Promise<void> {
  if (!appointment?.id || appointment.status !== "confirmed") return;
  const start = localIsraelToInstant(appointment.date, appointment.start_time);
  if (!start) { console.warn(`[Reminders] skipped malformed appointment ${appointment.id}`); return; }
  if (start.getTime() <= now.getTime()) return;
  for (const kind of ["day", "hour"] as ReminderKind[]) await processReminder(appointment, settings, kind, start, now, twilio);
}

async function runReminderJob(): Promise<void> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) { console.error("[Reminders] Missing SUPERDEV_SERVICE_ROLE_KEY"); return; }
  superdev.auth.setToken(serviceKey);
  integrations.auth.setToken(serviceKey);

  let settings: Settings = {};
  try {
    const records = await superdev.entities.ClinicSettings.list("-created_at", 1);
    settings = (Array.isArray(records) && records[0]) || {};
  } catch (error) { console.error("[Reminders] Could not load clinic settings:", safeError(error)); return; }

  let appointments: AppointmentRecord[];
  try {
    // Only upcoming appointments can need a reminder. Without this filter the oldest 250
    // confirmed appointments (history migrated from Buildy) filled the batch and the
    // upcoming ones were never reached.
    const fromDate = new Date(Date.now() - 24 * HOUR_MS).toISOString().slice(0, 10);
    appointments = await Appointment.query().where("status", "confirmed").gte("date", fromDate).sort("date").limit(MAX_APPOINTMENTS).exec();
  } catch (error) { console.error("[Reminders] Could not load confirmed appointments:", safeError(error)); return; }

  const now = new Date();
  const twilio = settings.enable_sms_reminders === true ? readTwilioConfig() : null;
  let scanned = 0;
  for (const appointment of Array.isArray(appointments) ? appointments : []) {
    try { await processAppointment(appointment, settings, now, twilio); scanned++; }
    catch (error) { console.error(`[Reminders] appointment ${appointment?.id || "unknown"} failed:`, safeError(error)); }
  }
  console.log(`[Reminders] run complete, scanned ${scanned} confirmed appointments`);
}

// Supabase does not run Deno.cron, so a pg_cron job POSTs here every 5 minutes.
// The job is safe to trigger repeatedly: each reminder is marked once it is sent.
let running: Promise<void> | null = null;

Deno.serve(async (req) => {
  if (req.method === "POST") {
    if (!running) running = runReminderJob().catch((error) => console.error("[Reminders] scheduled run failed:", safeError(error))).finally(() => { running = null; });
    await running;
    return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ status: "ok", job: "appointment-reminders" }), { status: 200, headers: { "Content-Type": "application/json" } });
});
