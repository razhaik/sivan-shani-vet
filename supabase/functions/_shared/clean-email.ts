/**
 * The clinic's one email design ("clean"), shared by the CRM (browser) and
 * the Supabase Edge Functions. Plain TypeScript with no imports, so both
 * Vite and Deno can load it.
 *
 * Email-client safe: table layout, inline styles, images hosted on the site
 * (public/email/*). Heebo loads where a client allows web fonts; elsewhere Arial.
 *
 * Colour by status: pending request = yellow, confirmed / reminders /
 * updates = blue, cancelled or not approved = red.
 */

export const CLINIC_NAME = 'ד"ר סיון שני';
export const CLINIC_PHONE = "054-4345388";
export const CLINIC_ORIGIN = "https://sivanshanivet.com";
export const CLINIC_ADDRESS = "צה״ל 48א, נס ציונה";
export const CLINIC_MAPS_URL = "https://maps.app.goo.gl/TnEkTdCouEUiFGjy5";
export const CLINIC_BOOKING_URL = `${CLINIC_ORIGIN}/appointments`;

export type CleanTone = "pending" | "confirmed" | "cancelled";

const TONES: Record<CleanTone, { bar: string; label: string; soft: string; button: string }> = {
  pending: { bar: "#F2D162", label: "#8A6A10", soft: "#FFF4CC", button: "#1A1A3E" },
  confirmed: { bar: "#60A5FA", label: "#1D4ED8", soft: "#DBEAFE", button: "#1D4ED8" },
  cancelled: { bar: "#F87171", label: "#B91C1C", soft: "#FEE2E2", button: "#1A1A3E" },
};

const NAVY = "#1A1A3E";
const BLUE = "#1D4ED8";
const SKY_SOFT = "#DBEAFE";
const MUTED = "#5A5F7A";
const BODY = "#4A4F6A";
const LINE = "#E1E4E8";
const PAGE = "#F7F8FA";
const FOOTER_BG = "#EEF0F3";
const FONT = "'Heebo',Arial,'Segoe UI',sans-serif";

export interface CleanAppointment {
  client_name?: unknown;
  pet_name?: unknown;
  appointment_type?: unknown;
  date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
}

export interface CleanLink {
  label: string;
  url: string;
}

export interface CleanEmailParts {
  tone: CleanTone;
  /** Document title (also what a client may show as the subject preview). */
  title: string;
  /** Small coloured line above the heading, e.g. "אישור תור". */
  label: string;
  heading: string;
  intro?: string;
  rows: Array<[string, string]>;
  primary?: CleanLink;
  showNavigate?: boolean;
  manageUrl?: string;
  manageLabel?: string;
  note?: string;
  homeScreen?: boolean;
  preheader?: string;
  /** Free-text message body (paragraphs split on blank lines). */
  body?: string;
  /** Small gray line under the card content, e.g. a marketing opt-out notice. */
  finePrint?: string;
  /** "owner" emails (to the clinic) get a short system footer instead of the map. */
  audience?: "client" | "owner";
}

function str(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(value: unknown): string {
  const raw = str(value);
  if (!raw || raw.length > 4096) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function assetUrl(file: string): string {
  return `${CLINIC_ORIGIN}/email/${file}`;
}

/** "יום חמישי, 20 בנובמבר 2026" from "2026-11-20"; falls back to the raw value. */
export function hebrewLongDate(date: unknown): string {
  const value = str(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [y, m, d] = value.split("-").map(Number);
  const when = new Date(Date.UTC(y, m - 1, d, 12));
  try {
    const weekday = new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: "UTC" }).format(when);
    const rest = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(when);
    return `${weekday}, ${rest}`;
  } catch {
    return value.split("-").reverse().join("/");
  }
}

function wazeUrl(): string {
  return `https://waze.com/ul?q=${encodeURIComponent(CLINIC_ADDRESS.replace(/״/g, '"'))}&navigate=yes`;
}

function linkStyle(): string {
  return `color:${NAVY};font-weight:500;text-decoration:underline;`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
<td align="right" style="padding:14px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:15px;color:${MUTED};">${esc(label)}</td>
<td align="left" style="padding:14px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:15px;font-weight:600;color:${NAVY};">${esc(value)}</td>
</tr>`;
}

function stepRows(steps: string[]): string {
  return steps.map((step, index) => `<tr>
<td valign="top" style="padding:0 0 6px 8px;"><span style="display:inline-block;width:18px;height:18px;line-height:18px;border-radius:9px;background:${SKY_SOFT};color:${BLUE};font-family:${FONT};font-size:11px;font-weight:700;text-align:center;">${index + 1}</span></td>
<td align="right" valign="top" style="padding:0 0 6px;font-family:${FONT};font-size:13px;line-height:18px;color:${BODY};">${step}</td>
</tr>`).join("");
}

function homeScreenSection(): string {
  const col = (label: string, gif: string, alt: string, steps: string[]) => `<td class="hs-col" width="50%" align="center" valign="top" style="padding:0 6px;">
<div style="padding-bottom:12px;height:22px;">${label}</div>
<img src="${gif}" width="140" height="187" alt="${esc(alt)}" style="display:block;width:100%;max-width:200px;height:auto;margin:0 auto;border:1px solid ${LINE};border-radius:12px;" />
<table role="presentation" cellspacing="0" cellpadding="0" border="0" dir="rtl" align="center" style="margin:12px auto 0;">${stepRows(steps)}</table>
</td>`;
  return `<tr><td class="px" style="padding:36px 32px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid ${LINE};">
<tr><td align="center" style="padding-top:32px;font-family:${FONT};font-size:22px;font-weight:700;color:${NAVY};">קביעת תור בלחיצה אחת</td></tr>
<tr><td align="center" style="padding:10px 10px 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${BODY};">הוסיפו את האתר של ${esc(CLINIC_NAME)} למסך הבית, ובפעם הבאה תקבעו תור ישר מהאייקון.</td></tr>
<tr><td style="padding-top:18px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="table-layout:fixed;"><tr>
${col(`<img src="${assetUrl("label-iphone.png")}" width="93" height="20" alt="iPhone" style="display:inline-block;width:93px;height:20px;border:0;" />`, assetUrl("home-ios.gif"), "הדגמה: הוספת האתר למסך הבית באייפון", ["לוחצים על ⋯", "שיתוף", "הוספה למסך הבית", "הוספה"])}
${col(`<img src="${assetUrl("label-android.png")}" width="117" height="18" alt="Android" style="display:inline-block;width:117px;height:18px;margin-top:2px;border:0;" />`, assetUrl("home-android.gif"), "הדגמה: הוספת האתר למסך הבית באנדרואיד", ["לוחצים על ⋮", "הוספה למסך הבית", "התקנה"])}
</tr></table>
</td></tr>
</table>
</td></tr>`;
}

function ownerFooter(): string {
  return `<tr><td height="36" style="height:36px;line-height:36px;font-size:0;">&nbsp;</td></tr>
<tr><td class="px" align="center" bgcolor="${FOOTER_BG}" style="padding:18px 32px;background:${FOOTER_BG};border-top:1px solid ${LINE};font-family:${FONT};font-size:12px;line-height:1.7;color:${MUTED};">
התראה ממערכת הניהול של ${esc(CLINIC_NAME)} · נשלחה לפי הגדרות ההתראות
</td></tr>`;
}

function footer(): string {
  return `<tr><td height="36" style="height:36px;line-height:36px;font-size:0;">&nbsp;</td></tr>
<tr><td class="px" align="center" bgcolor="${FOOTER_BG}" style="padding:28px 32px 28px;background:${FOOTER_BG};border-top:1px solid ${LINE};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td align="center">
<a href="${esc(CLINIC_MAPS_URL)}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">
<img src="${assetUrl("map.png")}" width="100%" alt="${esc(`מפה: ${CLINIC_ADDRESS} – לחצו לפתיחה במפות`)}" style="display:block;width:100%;max-width:456px;height:auto;margin:0 auto;border:1px solid ${LINE};border-radius:10px;" />
</a>
<a href="${esc(CLINIC_MAPS_URL)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding-top:8px;font-family:${FONT};font-size:13px;color:${BLUE};text-decoration:none;">פתיחה במפות ←</a>
</td></tr>
<tr>
<td align="center" style="padding-top:18px;font-family:${FONT};font-size:13px;line-height:1.8;color:${MUTED};">
${esc(CLINIC_NAME)} · מרפאה וטרינרית לכלבים ולחתולים<br>
${esc(CLINIC_ADDRESS)} · <span style="white-space:nowrap;">${esc(CLINIC_PHONE)}</span><br>
<a href="${esc(CLINIC_ORIGIN)}" style="color:${MUTED};">${esc(CLINIC_ORIGIN.replace(/^https?:\/\//, ""))}</a>
</td></tr></table>
</td></tr>`;
}

/** Render any clinic email from its parts. */
export function renderCleanEmail(parts: CleanEmailParts): string {
  const tone = TONES[parts.tone];
  const primaryUrl = parts.primary ? safeUrl(parts.primary.url) : "";
  const manageUrl = safeUrl(parts.manageUrl);

  const links = [
    parts.showNavigate ? `<a href="${esc(wazeUrl())}" target="_blank" rel="noopener noreferrer" style="${linkStyle()}">ניווט למרפאה</a>` : "",
    manageUrl ? `<a href="${esc(manageUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyle()}">${esc(parts.manageLabel || "שינוי או ביטול תור")}</a>` : "",
  ].filter(Boolean).join(`<span style="color:#C3C7D2;padding:0 12px;">|</span>`);

  const primary = parts.primary && primaryUrl
    ? `<tr><td class="px" style="padding:32px 32px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="${tone.button}" style="border-radius:8px;">
<a href="${esc(primaryUrl)}" target="_blank" rel="noopener noreferrer" style="display:block;padding:15px 0;font-family:${FONT};font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">${esc(parts.primary.label)}</a>
</td></tr></table></td></tr>`
    : "";

  const rows = parts.rows.filter(([, value]) => value);

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${esc(parts.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>
body,table,td,div,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;}
img{max-width:100%;height:auto;}
@media only screen and (max-width:480px){
  .px{padding-left:20px !important;padding-right:20px !important;}
  .shell{padding:16px 8px !important;}
  .hs-col{display:block !important;width:100% !important;padding:0 0 28px !important;}
  .h1{font-size:24px !important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};direction:rtl;-webkit-text-size-adjust:100%;text-size-adjust:100%;">
${parts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(parts.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};">
<tr><td class="shell" align="center" style="padding:40px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="max-width:520px;background:#FFFFFF;border:1px solid ${LINE};border-radius:12px;overflow:hidden;word-break:break-word;overflow-wrap:anywhere;">
<tr><td height="6" bgcolor="${tone.bar}" style="height:6px;line-height:6px;font-size:0;background:${tone.bar};">&nbsp;</td></tr>

<tr><td class="px" align="center" style="padding:40px 32px 0;">
<img src="${assetUrl("logo-navy.png")}" width="49" height="76" alt="לוגו ${esc(CLINIC_NAME)}" style="display:block;width:49px;height:76px;border:0;" />
<div style="padding-top:10px;font-family:${FONT};font-size:20px;font-weight:700;color:${NAVY};">${esc(CLINIC_NAME)}</div>
<div style="font-family:${FONT};font-size:13px;color:${MUTED};">מרפאה וטרינרית · נס ציונה</div>
</td></tr>

<tr><td class="px" align="right" style="padding:28px 32px 0;">
${parts.label && parts.label !== parts.heading ? `<div style="font-family:${FONT};font-size:14px;font-weight:600;color:${tone.label};">${esc(parts.label)}</div>` : ""}
<h1 class="h1" style="margin:10px 0 0;font-family:${FONT};font-size:28px;line-height:1.3;font-weight:700;color:${NAVY};">${esc(parts.heading)}</h1>
${parts.intro ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:16px;line-height:1.7;color:${BODY};">${esc(parts.intro).replace(/\n/g, "<br>")}</p>` : ""}
</td></tr>

${parts.body ? `<tr><td class="px" align="right" style="padding:20px 32px 0;">
${parts.body.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean).map((block) => `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.8;color:${BODY};">${esc(block).replace(/\n/g, "<br>")}</p>`).join("\n")}
</td></tr>` : ""}

${rows.length ? `<tr><td class="px" style="padding:24px 32px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="border-top:1px solid ${LINE};">
${rows.map(([label, value]) => detailRow(label, value)).join("\n")}
</table>
</td></tr>` : ""}

${primary}

${links ? `<tr><td class="px" align="center" style="padding:16px 32px 0;font-family:${FONT};font-size:15px;">${links}</td></tr>` : ""}

${parts.note ? `<tr><td class="px" style="padding:36px 32px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td align="center" bgcolor="${tone.soft}" style="padding:18px 20px;border-radius:8px;text-align:center;font-family:${FONT};font-size:14px;line-height:1.7;color:${BODY};">${esc(parts.note).replace(/\n/g, "<br>")}</td>
</tr></table>
</td></tr>` : ""}

${(parts.homeScreen ?? parts.audience !== "owner") ? homeScreenSection() : ""}

${parts.finePrint ? `<tr><td class="px" align="center" style="padding:24px 32px 0;font-family:${FONT};font-size:12px;line-height:1.7;color:${MUTED};">${esc(parts.finePrint).replace(/\n/g, "<br>")}</td></tr>` : ""}

${parts.audience === "owner" ? ownerFooter() : footer()}

</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ---------- Per-email content ---------- */

interface Who {
  client: string;
  pet: string;
  service: string;
}

function who(appointment: CleanAppointment): Who {
  return { client: str(appointment.client_name), pet: str(appointment.pet_name), service: str(appointment.appointment_type) };
}

function greet(client: string, rest: string): string {
  return client ? `שלום ${client}, ${rest}` : rest;
}

function petPhrase(pet: string, withPet: string, withoutPet: string): string {
  return pet ? withPet.replace("{pet}", pet) : withoutPet;
}

function appointmentRows(appointment: CleanAppointment, dateLabel = "תאריך", timeLabel = "שעה"): Array<[string, string]> {
  const { pet, service } = who(appointment);
  return [
    [dateLabel, hebrewLongDate(appointment.date)],
    [timeLabel, str(appointment.start_time)],
    ["סוג ביקור", service],
    ["מטופל", pet],
    ["כתובת", CLINIC_ADDRESS],
  ];
}

function preheader(appointment: CleanAppointment, prefix = ""): string {
  const { pet } = who(appointment);
  return `${prefix}${hebrewLongDate(appointment.date)} בשעה ${str(appointment.start_time)}${pet ? ` · ${pet}` : ""}`;
}

export interface CleanLinksOptions {
  calendarUrl?: string;
  managementUrl?: string;
}

/** Sent right after a client asks for an appointment on the site. Yellow. */
export function cleanBookingRequestEmail(appointment: CleanAppointment, options: CleanLinksOptions = {}): string {
  const { client, pet } = who(appointment);
  return renderCleanEmail({
    tone: "pending",
    title: `קיבלנו את בקשתך לתור – ${CLINIC_NAME}`,
    label: "בקשת תור התקבלה",
    heading: greet(client, petPhrase(pet, "קיבלנו את הבקשה לתור של {pet}", "קיבלנו את בקשתך לתור")),
    intro: "הבקשה ממתינה לאישור. נשלח לך מייל ברגע שהתור יאושר.",
    rows: appointmentRows(appointment, "תאריך מבוקש", "שעה מבוקשת"),
    manageUrl: options.managementUrl,
    manageLabel: "שינוי או ביטול הבקשה",
    note: `התור עדיין לא סופי עד שנאשר אותו.\nלשאלות: ${CLINIC_PHONE}`,
    preheader: preheader(appointment, "ממתין לאישור · "),
  });
}

/** Sent when the clinic approves the appointment. Blue. */
export function cleanApprovedEmail(appointment: CleanAppointment, options: CleanLinksOptions = {}): string {
  const { client, pet } = who(appointment);
  return renderCleanEmail({
    tone: "confirmed",
    title: `אישור תור – ${CLINIC_NAME}`,
    label: "אישור תור",
    heading: greet(client, petPhrase(pet, "התור של {pet} אושר", "התור שלך אושר")),
    rows: appointmentRows(appointment),
    primary: options.calendarUrl ? { label: "הוספה ליומן", url: options.calendarUrl } : undefined,
    showNavigate: true,
    manageUrl: options.managementUrl,
    note: options.managementUrl
      ? "מומלץ להגיע כ-5 דקות לפני התור.\nצריכים לשנות? לחצו על \"שינוי או ביטול תור\"."
      : `מומלץ להגיע כ-5 דקות לפני התור.\nלשינוי או ביטול אפשר להתקשר: ${CLINIC_PHONE}.`,
    homeScreen: true,
    preheader: preheader(appointment),
  });
}

/** Sent when appointment details change (also when a reschedule is approved). Blue. */
export function cleanUpdatedEmail(appointment: CleanAppointment, options: CleanLinksOptions = {}): string {
  const { client, pet } = who(appointment);
  return renderCleanEmail({
    tone: "confirmed",
    title: `עדכון פרטי תור – ${CLINIC_NAME}`,
    label: "עדכון תור",
    heading: greet(client, petPhrase(pet, "התור של {pet} עודכן", "התור שלך עודכן")),
    intro: "אלה הפרטים המעודכנים:",
    rows: appointmentRows(appointment),
    primary: options.calendarUrl ? { label: "עדכון ביומן", url: options.calendarUrl } : undefined,
    showNavigate: true,
    manageUrl: options.managementUrl,
    note: "אם הוספתם את התור ליומן, כדאי לעדכן גם שם את המועד.",
    preheader: preheader(appointment, "מועד מעודכן · "),
  });
}

/** Sent when the clinic cancels an appointment. Red. */
export function cleanCancelledEmail(appointment: CleanAppointment): string {
  const { client, pet } = who(appointment);
  return renderCleanEmail({
    tone: "cancelled",
    title: `ביטול תור – ${CLINIC_NAME}`,
    label: "ביטול תור",
    heading: greet(client, petPhrase(pet, "התור של {pet} בוטל", "התור שלך בוטל")),
    intro: "אלה פרטי התור שבוטל:",
    rows: appointmentRows(appointment),
    primary: { label: "קביעת תור חדש", url: CLINIC_BOOKING_URL },
    note: `לשאלות אפשר להתקשר למרפאה: ${CLINIC_PHONE}.`,
    preheader: preheader(appointment, "בוטל · "),
  });
}

/** Sent when the clinic does not approve a booking request. Red. */
export function cleanRejectedEmail(appointment: CleanAppointment): string {
  const { client, pet } = who(appointment);
  return renderCleanEmail({
    tone: "cancelled",
    title: `בקשת התור לא אושרה – ${CLINIC_NAME}`,
    label: "בקשת תור לא אושרה",
    heading: greet(client, petPhrase(pet, "לא נוכל לקבל את {pet} במועד הזה", "לא נוכל לקבל אותך במועד הזה")),
    intro: "בקשת התור לא אושרה. אפשר לבחור מועד אחר באתר.",
    rows: appointmentRows(appointment, "תאריך מבוקש", "שעה מבוקשת"),
    primary: { label: "בחירת מועד אחר", url: CLINIC_BOOKING_URL },
    note: `לשאלות אפשר להתקשר למרפאה: ${CLINIC_PHONE}.`,
    preheader: preheader(appointment, "לא אושר · "),
  });
}

/** Sent after the client cancels from the secure manage link. Red. */
export function cleanClientCancellationEmail(appointment: CleanAppointment): string {
  const { client, pet } = who(appointment);
  return renderCleanEmail({
    tone: "cancelled",
    title: `אישור ביטול תור – ${CLINIC_NAME}`,
    label: "ביטול תור",
    heading: greet(client, petPhrase(pet, "ביטלת את התור של {pet}", "ביטלת את התור")),
    intro: "הביטול נקלט. אלה פרטי התור שבוטל:",
    rows: appointmentRows(appointment),
    primary: { label: "קביעת תור חדש", url: CLINIC_BOOKING_URL },
    note: "מקווים לראות אתכם בקרוב.",
    preheader: preheader(appointment, "בוטל · "),
  });
}

export interface RescheduleRequestDetails {
  requested_date?: unknown;
  requested_start_time?: unknown;
  requested_end_time?: unknown;
}

/** Sent when the clinic does not approve a reschedule request. Red. */
export function cleanRescheduleRejectedEmail(appointment: CleanAppointment, request: RescheduleRequestDetails, managementUrl?: string): string {
  const { client } = who(appointment);
  const requested = [hebrewLongDate(request.requested_date), str(request.requested_start_time)].filter(Boolean).join(" בשעה ");
  return renderCleanEmail({
    tone: "cancelled",
    title: `בקשת שינוי מועד לא אושרה – ${CLINIC_NAME}`,
    label: "שינוי מועד לא אושר",
    heading: greet(client, "בקשת שינוי המועד לא אושרה"),
    intro: "התור המקורי שלך נשאר בתוקף:",
    rows: [...appointmentRows(appointment), ["המועד שביקשת", requested]],
    showNavigate: true,
    manageUrl: managementUrl,
    manageLabel: "בקשת מועד אחר",
    note: `אפשר לבקש מועד אחר דרך הקישור, או להתקשר: ${CLINIC_PHONE}.`,
    preheader: preheader(appointment, "התור המקורי בתוקף · "),
  });
}

export interface ReminderCopyInput {
  label: string;
  title: string;
  subtitle?: string;
}

/** Reminder before the appointment (text comes from the reminder settings). Blue. */
export function cleanReminderEmail(appointment: CleanAppointment, copy: ReminderCopyInput, options: CleanLinksOptions = {}): string {
  const { client } = who(appointment);
  return renderCleanEmail({
    tone: "confirmed",
    title: `${copy.title} – ${CLINIC_NAME}`,
    label: copy.label,
    heading: greet(client, copy.title),
    intro: copy.subtitle,
    rows: appointmentRows(appointment),
    primary: options.calendarUrl ? { label: "הוספה ליומן", url: options.calendarUrl } : undefined,
    showNavigate: true,
    manageUrl: options.managementUrl,
    note: "מומלץ להגיע כ-5 דקות לפני התור.",
    preheader: preheader(appointment, "תזכורת · "),
  });
}


/** Sent to the client right after they ask to move an appointment. Yellow. */
export function cleanRescheduleRequestedEmail(appointment: CleanAppointment, request: RescheduleRequestDetails, managementUrl?: string): string {
  const { client, pet, service } = who(appointment);
  const requested = [hebrewLongDate(request.requested_date), str(request.requested_start_time)].filter(Boolean).join(" בשעה ");
  const current = [hebrewLongDate(appointment.date), str(appointment.start_time)].filter(Boolean).join(" בשעה ");
  return renderCleanEmail({
    tone: "pending",
    title: `קיבלנו את בקשת שינוי המועד – ${CLINIC_NAME}`,
    label: "בקשת שינוי מועד התקבלה",
    heading: greet(client, "קיבלנו את בקשת שינוי המועד"),
    intro: "הבקשה ממתינה לאישור המרפאה. עד שתאושר, התור הנוכחי נשאר בתוקף.",
    rows: [["המועד הנוכחי", current], ["המועד המבוקש", requested], ["סוג ביקור", service], ["מטופל", pet], ["כתובת", CLINIC_ADDRESS]],
    manageUrl: managementUrl,
    manageLabel: "צפייה בתור",
    note: "נשלח לך מייל ברגע שהבקשה תטופל.",
    preheader: `ממתין לאישור · ${requested}`,
  });
}

export interface OwnerNotificationInput {
  tone: CleanTone;
  label: string;
  heading: string;
  intro?: string;
  rows: Array<[string, string]>;
  url: string;
  buttonLabel?: string;
}

/** Notification emails to the clinic (new appointment, cancellation, ...). */
export function cleanOwnerNotificationEmail(input: OwnerNotificationInput): string {
  return renderCleanEmail({
    tone: input.tone,
    audience: "owner",
    title: input.label,
    label: input.label,
    heading: input.heading,
    intro: input.intro,
    rows: input.rows,
    primary: { label: input.buttonLabel || "פתיחה במערכת הניהול", url: input.url },
    preheader: input.intro,
  });
}


export interface CleanMessageInput {
  subject: string;
  /** Recipient's name for the greeting; omitted → no greeting line. */
  name?: string;
  body: string;
  cta?: CleanLink | null;
  /** Marketing broadcasts get an opt-out line. */
  marketing?: boolean;
  label?: string;
  /** Overrides the "שלום {name}," greeting line. */
  intro?: string;
}

/** Free-text message from the clinic (single client, bulk, inbox reply, marketing). Blue. */
export function cleanMessageEmail(input: CleanMessageInput): string {
  const name = str(input.name);
  return renderCleanEmail({
    tone: "confirmed",
    title: str(input.subject) || `הודעה מ${CLINIC_NAME}`,
    label: input.label || (input.marketing ? "חדשות מהמרפאה" : "הודעה מהמרפאה"),
    heading: str(input.subject) || "הודעה מהמרפאה",
    intro: str(input.intro) || (name ? `שלום ${name},` : undefined),
    body: input.body,
    rows: [],
    primary: input.cta && input.cta.url ? input.cta : { label: "קביעת תור", url: CLINIC_BOOKING_URL },
    homeScreen: true,
    preheader: str(input.body).replace(/\s+/g, " ").slice(0, 110),
    finePrint: input.marketing
      ? `זוהי הודעה שיווקית מטעם ${CLINIC_NAME}. להפסקת קבלת הודעות שיווקיות אפשר להשיב למייל זה או להתקשר ${CLINIC_PHONE}.`
      : undefined,
  });
}
