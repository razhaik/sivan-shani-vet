import { safePublicLink, VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

/**
 * "Clean" appointment-confirmation email (design 5ה).
 *
 * Built for email clients: table layout, inline styles only, no flex/grid,
 * images hosted on the public site (public/email/*). Heebo loads where the
 * client allows web fonts (Apple Mail, iOS); everywhere else Arial is used.
 */

export interface CleanEmailAppointment {
  client_name?: string;
  pet_name?: string;
  appointment_type?: string;
  date: string;
  start_time: string;
  end_time?: string;
}

export interface CleanEmailOptions {
  /** Google Calendar link for the "add to calendar" button. */
  addToCalendarUrl?: string;
  /** Secure self-service link for changing or cancelling. */
  managementUrl?: string;
  /** Show the "add the site to your home screen" section with the two GIFs. */
  showHomeScreenSection?: boolean;
}

export const CLINIC_ADDRESS = "צה״ל 48א, נס ציונה";
export const CLINIC_MAPS_URL = "https://maps.app.goo.gl/RmsYfkK3dss75Nj39";
export const CLINIC_HOURS = "א׳, ד׳ 16:00–19:30 · ב׳, ג׳, ה׳ 9:00–14:30, 16:00–19:30 · ו׳ 8:30–14:30";

const NAVY = "#1A1A3E";
const BLUE = "#1D4ED8";
const SKY = "#60A5FA";
const SKY_SOFT = "#DBEAFE";
const MUTED = "#5A5F7A";
const BODY = "#4A4F6A";
const LINE = "#E1E4E8";
const PAGE = "#F7F8FA";
const FONT = "'Heebo',Arial,'Segoe UI',sans-serif";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function assetUrl(file: string): string {
  return `${VETERINARY_CLINIC_PROFILE.publicOrigin.replace(/\/$/, "")}/email/${file}`;
}

/** "יום חמישי, 20 בנובמבר 2026" from "2026-11-20"; falls back to the raw value. */
export function hebrewLongDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || "";
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(Date.UTC(y, m - 1, d, 12));
  try {
    const weekday = new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: "UTC" }).format(value);
    const rest = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(value);
    return `${weekday}, ${rest}`;
  } catch {
    return date.split("-").reverse().join("/");
  }
}

function wazeUrl(): string {
  return `https://waze.com/ul?q=${encodeURIComponent(CLINIC_ADDRESS.replace(/״/g, '"'))}&navigate=yes`;
}

function mapsUrl(): string {
  return CLINIC_MAPS_URL;
}

function detailRow(label: string, value: string, last = false): string {
  return `<tr>
<td align="right" style="padding:14px 0;${last ? "" : `border-bottom:1px solid ${LINE};`}font-family:${FONT};font-size:15px;color:${MUTED};">${esc(label)}</td>
<td align="left" style="padding:14px 0;${last ? "" : `border-bottom:1px solid ${LINE};`}font-family:${FONT};font-size:15px;font-weight:600;color:${NAVY};">${esc(value)}</td>
</tr>`;
}

function homeScreenSection(): string {
  const col = (label: string, gif: string, alt: string, steps: string) => `<td width="50%" align="center" valign="top" style="padding:0 6px;">
<div style="padding-bottom:12px;height:22px;">${label}</div>
<img src="${gif}" width="200" height="267" alt="${esc(alt)}" style="display:block;width:100%;max-width:200px;height:auto;margin:0 auto;border:1px solid ${LINE};border-radius:12px;" />
<div style="font-family:${FONT};font-size:13px;line-height:1.7;color:${BODY};padding-top:10px;">${steps}</div>
</td>`;
  return `<tr><td style="padding:36px 32px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid ${LINE};">
<tr><td align="center" style="padding-top:32px;font-family:${FONT};font-size:22px;font-weight:700;color:${NAVY};">קביעת תור בלחיצה אחת</td></tr>
<tr><td align="center" style="padding:10px 10px 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${BODY};">הוסיפו את האתר של ${esc(VETERINARY_CLINIC_PROFILE.shortName)} למסך הבית, ובפעם הבאה תקבעו תור ישר מהאייקון.</td></tr>
<tr><td style="padding-top:18px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="table-layout:fixed;"><tr>
${col(`<img src="${assetUrl("label-iphone.png")}" width="94" height="20" alt="iPhone" style="display:inline-block;width:94px;height:20px;border:0;" />`, assetUrl("home-ios.gif"), "הדגמה: הוספת האתר למסך הבית באייפון", "⋯ ← שיתוף ← הוספה למסך הבית ← הוספה")}
${col(`<img src="${assetUrl("label-android.png")}" width="117" height="18" alt="Android" style="display:inline-block;width:117px;height:18px;margin-top:2px;border:0;" />`, assetUrl("home-android.gif"), "הדגמה: הוספת האתר למסך הבית באנדרואיד", "⋮ ← הוספה למסך הבית ← התקנה")}
</tr></table>
</td></tr>
</table>
</td></tr>`;
}

/** Appointment-approved email in the clean design. */
export function buildCleanApprovedEmailHtml(appointment: CleanEmailAppointment, options: CleanEmailOptions = {}): string {
  const client = (appointment.client_name || "").trim();
  const pet = (appointment.pet_name || "").trim();
  const service = (appointment.appointment_type || "").trim();
  const calendarUrl = safePublicLink(options.addToCalendarUrl);
  const managementUrl = safePublicLink(options.managementUrl);
  const showHome = options.showHomeScreenSection !== false;
  const clinic = VETERINARY_CLINIC_PROFILE.shortName;

  const heading = client
    ? `שלום ${client}, ${pet ? `התור של ${pet} אושר` : "התור שלך אושר"}`
    : pet ? `התור של ${pet} אושר` : "התור שלך אושר";

  const rows: Array<[string, string]> = [
    ["תאריך", hebrewLongDate(appointment.date)],
    ["שעה", appointment.start_time || ""],
  ];
  if (service) rows.push(["סוג ביקור", service]);
  if (pet) rows.push(["מטופל", pet]);
  rows.push(["כתובת", CLINIC_ADDRESS]);

  const secondaryLinks = [
    `<a href="${esc(wazeUrl())}" target="_blank" rel="noopener noreferrer" style="color:${NAVY};font-weight:500;text-decoration:underline;">ניווט למרפאה</a>`,
    managementUrl ? `<a href="${esc(managementUrl)}" target="_blank" rel="noopener noreferrer" style="color:${NAVY};font-weight:500;text-decoration:underline;">שינוי או ביטול תור</a>` : "",
  ].filter(Boolean).join(`<span style="color:#C3C7D2;padding:0 12px;">|</span>`);

  const primaryButton = calendarUrl
    ? `<tr><td style="padding:32px 32px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="${BLUE}" style="border-radius:8px;">
<a href="${esc(calendarUrl)}" target="_blank" rel="noopener noreferrer" style="display:block;padding:15px 0;font-family:${FONT};font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">הוספה ליומן</a>
</td></tr></table></td></tr>`
    : "";

  const noteText = managementUrl
    ? "מומלץ להגיע כ-5 דקות לפני התור. צריכים לשנות? אפשר דרך הקישור \"שינוי או ביטול תור\"."
    : `מומלץ להגיע כ-5 דקות לפני התור. לשינוי או ביטול אפשר להתקשר: ${VETERINARY_CLINIC_PROFILE.phone}.`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${esc(`אישור תור – ${clinic}`)}</title>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${PAGE};direction:rtl;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(`${hebrewLongDate(appointment.date)} בשעה ${appointment.start_time}${pet ? ` · ${pet}` : ""}`)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};">
<tr><td align="center" style="padding:40px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="max-width:520px;background:#FFFFFF;border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
<tr><td height="6" bgcolor="${SKY}" style="height:6px;line-height:6px;font-size:0;background:${SKY};">&nbsp;</td></tr>

<tr><td align="center" style="padding:40px 32px 0;">
<img src="${assetUrl("logo-navy.png")}" width="49" height="76" alt="לוגו ${esc(clinic)}" style="display:block;width:49px;height:76px;border:0;" />
<div style="padding-top:10px;font-family:${FONT};font-size:20px;font-weight:700;color:${NAVY};">${esc(clinic)}</div>
<div style="font-family:${FONT};font-size:13px;color:${MUTED};">מרפאה וטרינרית · נס ציונה</div>
</td></tr>

<tr><td align="right" style="padding:28px 32px 0;">
<div style="font-family:${FONT};font-size:14px;font-weight:600;color:${BLUE};">אישור תור</div>
<h1 style="margin:10px 0 0;font-family:${FONT};font-size:28px;line-height:1.3;font-weight:700;color:${NAVY};">${esc(heading)}</h1>
<p style="margin:10px 0 0;font-family:${FONT};font-size:16px;line-height:1.7;color:${BODY};">שמחים לאשר את התור. הנה כל הפרטים:</p>
</td></tr>

<tr><td style="padding:24px 32px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="border-top:1px solid ${LINE};">
${rows.map(([label, value]) => detailRow(label, value)).join("\n")}
</table>
</td></tr>

${primaryButton}

<tr><td align="center" style="padding:16px 32px 0;font-family:${FONT};font-size:15px;">${secondaryLinks}</td></tr>

<tr><td style="padding:36px 32px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td bgcolor="${SKY_SOFT}" style="padding:18px 20px;border-radius:8px;font-family:${FONT};font-size:14px;line-height:1.7;color:${BODY};">${esc(noteText)}</td>
</tr></table>
</td></tr>

${showHome ? homeScreenSection() : ""}

<tr><td align="center" style="padding:36px 32px 28px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid ${LINE};">
<tr><td align="center" style="padding-top:28px;">
<a href="${esc(mapsUrl())}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">
<img src="${assetUrl("map.png")}" width="456" alt="${esc(`מפה: ${CLINIC_ADDRESS} – לחצו לפתיחה במפות`)}" style="display:block;width:100%;max-width:456px;height:auto;margin:0 auto;border:1px solid ${LINE};border-radius:10px;" />
</a>
<a href="${esc(mapsUrl())}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding-top:8px;font-family:${FONT};font-size:13px;color:${BLUE};text-decoration:none;">פתיחה במפות ←</a>
</td></tr>
<tr>
<td align="center" style="padding-top:18px;font-family:${FONT};font-size:13px;line-height:1.8;color:${MUTED};">
${esc(clinic)} · מרפאה וטרינרית לכלבים ולחתולים<br>
${esc(CLINIC_ADDRESS)} · <a href="tel:${esc(VETERINARY_CLINIC_PROFILE.phone.replace(/[^0-9+]/g, ""))}" style="color:${MUTED};text-decoration:none;">${esc(VETERINARY_CLINIC_PROFILE.phone)}</a><br>
<a href="${esc(VETERINARY_CLINIC_PROFILE.publicOrigin)}" style="color:${MUTED};">${esc(VETERINARY_CLINIC_PROFILE.publicOrigin.replace(/^https?:\/\//, ""))}</a>
</td></tr></table>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
