import { createSuperdevClient } from "npm:@superdevhq/client@0.1.56";

const MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY = "marketing-clinic-template" as const;
const CUSTOMER_EMAIL_LOGO_URL = "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/f4527f39-6b5f-4fae-b77d-5735fe1452b8-pasted-image-1789671955012.png";

type CustomerEmailTemplateKey = "current-clinic-template" | "marketing-clinic-template";
type CustomerEmailDetail = { label: string; value: unknown };
type CustomerEmailAction = { label: string; url: string; variant?: "primary" | "secondary" | "danger" };
type CustomerEmailOptions = {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  statusColor?: string;
  body?: string;
  details?: CustomerEmailDetail[];
  actions?: CustomerEmailAction[];
  clinicName?: string;
  clinicTagline?: string;
};

function resolveCustomerEmailTemplateSelection(value: unknown, emailType: string): CustomerEmailTemplateKey {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return source[emailType] === MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY ? MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY : "current-clinic-template";
}

function customerEmailText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function customerEmailEscapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] || character));
}

function customerEmailMultiline(value: unknown): string {
  return customerEmailEscapeHtml(value).replace(/\r?\n/g, "<br />");
}

function customerEmailSafeUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 2048) return "";
  try {
    const parsed = new URL(raw, SITE_URL);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    const hostname = parsed.hostname.toLowerCase();
    const clinic = hostname === "sivanshanivet.com" || hostname.endsWith(".sivanshanivet.com");
    const calendar = hostname === "calendar.google.com" || hostname === "www.google.com";
    return clinic || calendar ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function customerEmailColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallback;
}

function customerEmailDetailsHtml(details: CustomerEmailDetail[]): string {
  const visible = details.filter((detail) => detail && customerEmailText(detail.label));
  if (!visible.length) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:rgba(244,249,250,0.82);border:1px solid #dce9ee;border-radius:16px;overflow:hidden;">${visible.map((detail, index) => `<tr><td style="padding:11px 14px;${index < visible.length - 1 ? "border-bottom:1px solid #dce9ee;" : ""}width:36%;vertical-align:top;color:#718792;font-size:11px;font-weight:800;">${customerEmailEscapeHtml(detail.label)}</td><td style="padding:11px 14px;${index < visible.length - 1 ? "border-bottom:1px solid #dce9ee;" : ""}vertical-align:top;color:#0f2842;font-size:13px;font-weight:800;line-height:1.65;white-space:pre-wrap;word-break:break-word;">${customerEmailMultiline(detail.value)}</td></tr>`).join("")}</table>`;
}

function customerEmailActionsHtml(actions: CustomerEmailAction[]): string {
  const visible = actions.map((action) => ({ ...action, url: customerEmailSafeUrl(action?.url) })).filter((action) => action.url && customerEmailText(action.label)).slice(0, 2);
  if (!visible.length) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:25px;"><tr><td align="center">${visible.map((action) => { const background = action.variant === "danger" ? "#b83b4b" : action.variant === "secondary" ? "#0f2842" : "#1d6472"; return `<a href="${customerEmailEscapeHtml(action.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0 4px 8px;padding:12px 22px;border-radius:12px;background:${background};color:#ffffff;text-decoration:none;font-size:13px;font-weight:900;line-height:1.2;">${customerEmailEscapeHtml(action.label)}</a>`; }).join("")}</td></tr></table>`;
}

function buildMarketingAppointmentEmailHtml(appointment: AppointmentRecord, options: CustomerEmailOptions): string {
  const clientName = customerEmailText(appointment.client_name, "לקוח יקר");
  const details: CustomerEmailDetail[] = [
    { label: "שם הלקוח", value: clientName },
    { label: "חיית המחמד", value: customerEmailText(appointment.pet_name, "-") },
    { label: "סוג הטיפול", value: customerEmailText(appointment.appointment_type, "-") },
    { label: "תאריך", value: customerEmailText(appointment.date, "לא צוין").includes("-") ? customerEmailText(appointment.date, "לא צוין").split("-").reverse().join("/") : customerEmailText(appointment.date, "לא צוין") },
    { label: "שעה", value: `${customerEmailText(appointment.start_time, "-")}${customerEmailText(appointment.end_time) ? ` - ${customerEmailText(appointment.end_time)}` : ""}` },
  ];
  if (customerEmailText(appointment.phone)) details.push({ label: "טלפון", value: customerEmailText(appointment.phone) });
  if (customerEmailText(appointment.email)) details.push({ label: "דוא״ל", value: customerEmailText(appointment.email) });
  if (customerEmailText(appointment.notes)) details.push({ label: "הערות נוספות", value: customerEmailText(appointment.notes) });
  const title = customerEmailText(options.title, "עדכון מהמרפאה");
  const subtitle = customerEmailText(options.subtitle);
  const body = customerEmailText(options.body, `שלום ${clientName},\n\n${subtitle || "אלה פרטי התור שלך במרפאה."}`);
  const statusLabel = customerEmailText(options.statusLabel);
  const statusColor = customerEmailColor(options.statusColor, "#2f90a1");
  const clinicName = customerEmailText(options.clinicName, "ד״ר סיון שני");
  const clinicTagline = customerEmailText(options.clinicTagline, "מרפאה וטרינרית · טיפול אישי ומקצועי");
  const detailsHtml = customerEmailDetailsHtml(details);
  const actionsHtml = customerEmailActionsHtml(Array.isArray(options.actions) ? options.actions : []);
  return `<!doctype html><html lang="he" dir="rtl"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${customerEmailEscapeHtml(title)}</title></head><body style="margin:0;padding:0;background:#ecf5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;direction:rtl;text-align:right;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ecf5f7;padding:22px 10px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d5e2e7;border-radius:24px;overflow:hidden;"><tr><td background="${customerEmailEscapeHtml(CUSTOMER_EMAIL_LOGO_URL)}" bgcolor="#ffffff" style="padding:0;background-color:#ffffff;background-image:url('${customerEmailEscapeHtml(CUSTOMER_EMAIL_LOGO_URL)}');background-position:center 52%;background-repeat:no-repeat;background-size:88% auto;overflow:hidden;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="position:relative;z-index:1;background:transparent;"><tr><td style="padding:28px 30px 22px;background:rgba(244,249,250,0.82);border-bottom:1px solid #dce9ee;"><div style="font-size:18px;line-height:1.35;font-weight:900;letter-spacing:-0.02em;color:#0f2842;">${customerEmailEscapeHtml(clinicName)}</div><div style="margin-top:5px;font-size:12px;line-height:1.6;font-weight:700;color:#52717d;">${customerEmailEscapeHtml(clinicTagline)}</div><div style="margin-top:18px;width:58px;height:4px;border-radius:99px;background:#2f90a1;"></div></td></tr><tr><td style="padding:30px;background:rgba(255,255,255,0.72);"><div style="font-size:10px;line-height:1.4;font-weight:900;letter-spacing:0.16em;color:#2f90a1;">נושא ההודעה</div><div style="margin-top:11px;font-size:25px;line-height:1.35;font-weight:900;letter-spacing:-0.03em;color:#0f2842;">${customerEmailEscapeHtml(title)}</div>${subtitle ? `<div style="margin-top:10px;font-size:13px;line-height:1.75;font-weight:700;color:#52717d;">${customerEmailMultiline(subtitle)}</div>` : ""}${statusLabel ? `<div style="margin-top:18px;display:inline-block;padding:6px 11px;border:1px solid #c9dde3;border-radius:999px;background:#eaf6f7;color:${statusColor};font-size:11px;line-height:1.2;font-weight:900;">${customerEmailEscapeHtml(statusLabel)}</div>` : ""}<div style="margin-top:22px;border-top:1px solid #dce9ee;padding-top:22px;color:#405a67;font-size:14px;line-height:1.9;font-weight:600;">${customerEmailMultiline(body)}</div><div style="margin-top:22px;">${detailsHtml}</div>${actionsHtml}</td></tr><tr><td style="padding:18px 30px 22px;background:rgba(248,251,252,0.86);border-top:1px solid #dce9ee;text-align:center;"><div style="font-size:11px;line-height:1.6;font-weight:900;color:#0f2842;">בברכה, ${customerEmailEscapeHtml(clinicName)}</div><div style="margin-top:4px;font-size:10px;line-height:1.6;font-weight:600;color:#718792;">כאן עבורכם ועבור חיות המחמד שלכם</div><div style="margin-top:9px;font-size:10px;line-height:1.5;color:#8aa0a8;">sivanshanivet.com · כל הזכויות שמורות © 2026</div></td></tr></table></td></tr></table><div style="height:26px;"></div></td></tr></table></body></html>`;
}

const superdev = createSuperdevClient({ appId: Deno.env.get("SUPERDEV_APP_ID") });
const integrations = createSuperdevClient({ appId: Deno.env.get("SUPERDEV_APP_ID") });
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
    subtitle: text(settings[day ? "reminder_day_before_subtitle" : "reminder_hour_before_subtitle"], day ? "נזכיר לך יום לפני התור במרפאה." : "התור שלך מתקרב, נתראה בקרוב במרפאה."),
    statusLabel: text(settings[day ? "reminder_day_before_status_label" : "reminder_hour_before_status_label"], day ? "תזכורת יום לפני" : "תזכורת שעה לפני"),
    statusColor: day ? "#ea580c" : "#dc2626",
    smsTemplate: text(settings[day ? "reminder_sms_day_before_template" : "reminder_sms_hour_before_template"], day
      ? "שלום {CLIENT_NAME}, תזכורת לתור עבור {PET_NAME} בתאריך {DATE} בשעה {TIME} במרפאת ד״ר סיון שני."
      : "שלום {CLIENT_NAME}, תזכורת לתור עבור {PET_NAME} בעוד שעה, בתאריך {DATE} בשעה {TIME} במרפאת ד״ר סיון שני."),
  };
}

function buildReminderEmailHtml(appointment: AppointmentRecord, settings: Settings, copy: ReminderCopy): string {
  const client = text(appointment.client_name, "לקוח יקר");
  const pet = text(appointment.pet_name, "חיית המחמד");
  const type = text(appointment.appointment_type, "תור במרפאה");
  const date = displayDate(appointment.date);
  const time = `${text(appointment.start_time, "-")}${appointment.end_time ? ` - ${appointment.end_time}` : ""}`;
  const clinicName = text(settings.clinic_name, DEFAULT_CLINIC_NAME);
  const clinicDetails = [clinicName, text(settings.clinic_address, ""), text(settings.clinic_phone, ""), "sivanshanivet.com"].filter(Boolean).map(escapeHtml).join(" · ");
  const managementUrl = appointmentManagementUrl(appointment, settings);
  const managementSection = managementUrl ? `<div style="margin-top:24px;padding-top:18px;border-top:1px dashed #e2e8f0;text-align:center;"><div style="font-size:11px;color:#64748b;margin-bottom:12px;font-weight:600;">לפרטים נוספים או לביטול התור, אפשר לנהל אותו מהקישור המאובטח:</div><a href="${escapeHtml(managementUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 26px;background-color:#1a1a3e;color:#ffffff;text-decoration:none;border-radius:12px;font-size:13px;font-weight:900;">ניהול התור שלי</a></div>` : "";
  const rows = [["שם הלקוח", client], ["חיית המחמד", pet], ["סוג התור", type], ["תאריך", date], ["שעה", time]]
    .map(([label, value]) => `<tr><td style="padding:8px 0;color:#94a3b8;font-size:11px;font-weight:700;width:34%;">${escapeHtml(label)}</td><td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:800;">${escapeHtml(value)}</td></tr>`).join("");
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title></head><body style="margin:0;background:#fff7ed;font-family:Arial,'Segoe UI',sans-serif;direction:rtl;text-align:right;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:22px 10px;background:#fff7ed;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #fed7aa;border-radius:22px;overflow:hidden;"><tr><td style="padding:26px 24px;background:${copy.statusColor};color:#fff;"><div style="font-size:24px;font-weight:900;margin-bottom:8px;">${escapeHtml(copy.title)}</div><div style="font-size:14px;line-height:1.6;opacity:.95;">${escapeHtml(copy.subtitle)}</div></td></tr><tr><td style="padding:24px;"><div style="display:inline-block;padding:7px 12px;border-radius:999px;background:#fff1e6;color:${copy.statusColor};font-size:12px;font-weight:900;margin-bottom:16px;">${escapeHtml(copy.statusLabel)}</div><p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.8;">שלום ${escapeHtml(client)},<br>אלה פרטי התור הקרוב שלך:</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #ffedd5;border-bottom:1px solid #ffedd5;">${rows}</table><p style="margin:20px 0 0;color:#475569;font-size:13px;line-height:1.7;">נשמח לראות אתכם במרפאה. אם הפרטים השתנו, אפשר ליצור איתנו קשר לפני מועד התור.</p>${managementSection}</td></tr><tr><td style="padding:16px 24px;background:#fffaf5;border-top:1px solid #ffedd5;text-align:center;color:#64748b;font-size:11px;line-height:1.7;">${clinicDetails}<br><a href="https://sivanshanivet.com" style="color:#c2410c;text-decoration:none;">sivanshanivet.com</a></td></tr></table></td></tr></table></body></html>`;
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
  const emailType = kind === "day" ? "appointment_reminder_day" : "appointment_reminder_hour";
  const templateKey = resolveCustomerEmailTemplateSelection(settings.customer_email_template_selections, emailType);
  const managementUrl = appointmentManagementUrl(appointment, settings);
  const bodyHtml = templateKey === MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY
    ? buildMarketingAppointmentEmailHtml(appointment, {
      title: copy.title,
      subtitle: copy.subtitle,
      statusLabel: copy.statusLabel,
      statusColor: kind === "day" ? "#2F90A1" : "#1D6472",
      body: `שלום ${text(appointment.client_name, "לקוח יקר")},\n\nאלה פרטי התור הקרוב שלך.\n\n${copy.subtitle}`,
      clinicName: text(settings.clinic_name, DEFAULT_CLINIC_NAME),
      actions: managementUrl ? [{ label: "ניהול התור שלי", url: managementUrl, variant: "secondary" }] : [],
    })
    : buildReminderEmailHtml(appointment, settings, copy);
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
  const serviceKey = Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY");
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
    appointments = await Appointment.query().where("status", "confirmed").sort("date").limit(MAX_APPOINTMENTS).exec();
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

Deno.cron("appointment-reminders", "*/5 * * * *", async () => {
  try { await runReminderJob(); }
  catch (error) { console.error("[Reminders] scheduled run failed:", safeError(error)); }
});

Deno.serve((req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response(JSON.stringify({ error: "Health endpoint only" }), { status: 405, headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ status: "ok", job: "appointment-reminders" }), { status: 200, headers: { "Content-Type": "application/json" } });
});
