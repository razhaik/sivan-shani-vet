import { format, isValid, parse } from "date-fns";
import { he } from "date-fns/locale";
import { Appointment, ClinicSettings } from "@/entities";
import { createCalendarEvent, sendSms } from "@/functions";
import { sendEmail } from "@/integrations/core";
import {
  buildAppointmentEmailHtml,
  buildAppointmentManagementUrl,
  buildCustomerEmailHtml,
  buildCustomerRescheduleRejectionEmailHtml,
  buildRescheduleRejectionEmailHtml,
  MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY,
  resolveCustomerEmailTemplateSelection,
  type AppointmentEmailOptions,
  type RescheduleRejectionEmailDetails,
} from "@/lib/emailTemplates";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

export interface AppointmentActionSnapshot {
  id: string;
  status: string;
  client_name: string;
  phone: string;
  email: string;
  pet_name: string;
  appointment_type: string;
  date: string;
  start_time: string;
  end_time: string;
  notes: string;
  google_event_id: string;
  cancel_token: string;
}

export type AppointmentActionKind = "approve" | "reject" | "cancel" | "update";
export type SideEffectStatus = "success" | "failed" | "skipped";
export interface SideEffectOutcome { status: SideEffectStatus; detail: string; eventId?: string; }
export interface AppointmentActionResult {
  action: AppointmentActionKind;
  isPartial: boolean;
  summary: string;
  calendar: SideEffectOutcome;
  email: SideEffectOutcome;
  sms: SideEffectOutcome;
  googleEventId?: string;
}

const ACTION_TIMEOUT_MS = 15000;
const valueText = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

function runWithTimeout<T>(work: () => Promise<T>, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = Promise.resolve().then(work);
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} לא הסתיים בזמן.`)), ACTION_TIMEOUT_MS);
    operation.then((value) => { if (timer) clearTimeout(timer); resolve(value); }, (error) => { if (timer) clearTimeout(timer); reject(error); });
  });
}

export const runAppointmentActionWithTimeout = runWithTimeout;

function normalizeIsraeliPhone(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const international = `+${trimmed.slice(1).replace(/\D/g, "")}`;
    return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `+972${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? trimmed : null;
}

function isValidEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

function isIsraelDST(year: number, month: number, day: number) {
  if (month < 2 || month > 9) return false;
  if (month > 2 && month < 9) return true;
  if (month === 2) { const lastDay = new Date(year, 3, 0); const lastSunday = lastDay.getDate() - lastDay.getDay(); return day >= lastSunday - 2; }
  const lastDay = new Date(year, 10, 0); const lastSunday = lastDay.getDate() - lastDay.getDay(); return day < lastSunday;
}

function buildGoogleCalendarLink(snapshot: AppointmentActionSnapshot) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date) || !/^\d{1,2}:\d{2}$/.test(snapshot.start_time) || !/^\d{1,2}:\d{2}$/.test(snapshot.end_time)) return "";
  const [year, month, day] = snapshot.date.split("-").map(Number);
  const offset = isIsraelDST(year, month - 1, day) ? "+03:00" : "+02:00";
  const stamp = (local: string) => { const date = new Date(local); if (!isValid(date)) return ""; const pad = (part: number) => String(part).padStart(2, "0"); return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`; };
  const start = stamp(`${snapshot.date}T${snapshot.start_time}:00${offset}`);
  const end = stamp(`${snapshot.date}T${snapshot.end_time}:00${offset}`);
  if (!start || !end) return "";
  const title = `תור וטרינרי - ${snapshot.pet_name || "חיה"}`;
  const description = `לקוח: ${snapshot.client_name}\nחיה: ${snapshot.pet_name}\nסוג: ${snapshot.appointment_type}\nטלפון: ${snapshot.phone || "-"}`;
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}&details=${encodeURIComponent(description)}`;
}

function unwrapFunctionPayload(value: unknown): Record<string, unknown> | null {
  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === "string") {
      try { current = JSON.parse(current); continue; } catch { return null; }
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    const record = current as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, "data")) { current = record.data; continue; }
    if (Object.prototype.hasOwnProperty.call(record, "body")) { current = record.body; continue; }
    return record;
  }
  return null;
}

const failed = (detail: string): SideEffectOutcome => ({ status: "failed", detail });
const skipped = (detail: string): SideEffectOutcome => ({ status: "skipped", detail });
const succeeded = (detail: string, eventId?: string): SideEffectOutcome => ({ status: "success", detail, ...(eventId ? { eventId } : {}) });

async function calendarSync(appointmentId: string, action: "approve" | "update") {
  const id = valueText(appointmentId);
  if (!id) return failed("לפגישה חסר מזהה לסנכרון");
  try {
    const result = await runWithTimeout(
      () => createCalendarEvent({ mode: "sync", appointmentId: id }),
      "סנכרון יומן Google",
    );
    const payload = unwrapFunctionPayload(result);
    if (!payload || payload.error || payload.success === false) {
      throw new Error(valueText(payload?.error) || "היומן לא החזיר אישור.");
    }
    const outcome = valueText(payload.outcome).toLowerCase();
    const eventId = valueText(payload.eventId);
    if (outcome === "created") return succeeded("נוסף ליומן Google", eventId || undefined);
    if (outcome === "linked_existing") return succeeded("קושר לאירוע קיים ביומן Google", eventId || undefined);
    if (outcome === "updated") return succeeded("עודכן ביומן Google", eventId || undefined);
    if (outcome === "skipped") return skipped("התור כבר אינו מאושר, ולכן לא שונה ביומן Google");
    throw new Error("היומן החזיר תוצאה לא מוכרת.");
  } catch (error) {
    console.error(`CRM appointment calendar ${action} failed:`, error);
    return failed("לא הצלחנו להשלים את הסנכרון ל-Google Calendar");
  }
}

async function calendarRemoveById(appointmentId: string, previousStatus = "") {
  const id = valueText(appointmentId);
  if (!id) return failed("לפגישה חסר מזהה להסרה מהיומן");
  if (previousStatus.toLowerCase() === "requested") return skipped("הבקשה לא אושרה, ולא נוצר עבורה אירוע Google");
  try {
    const result = await runWithTimeout(
      () => createCalendarEvent({ mode: "cancel", appointmentId: id }),
      "הסרת אירוע מיומן Google",
    );
    const payload = unwrapFunctionPayload(result);
    if (!payload || payload.error || payload.success === false) {
      throw new Error(valueText(payload?.error) || "היומן לא אישר את ההסרה.");
    }
    const outcome = valueText(payload.outcome).toLowerCase();
    if (outcome === "removed") return succeeded("הוסר מיומן Google");
    if (outcome === "already_removed") return succeeded("האירוע כבר הוסר מיומן Google");
    if (outcome === "not_linked") return skipped("לא נמצא אירוע Google שמקושר לתור הזה");
    throw new Error("היומן החזיר תוצאת הסרה לא מוכרת.");
  } catch (error) {
    console.error("CRM appointment calendar removal failed:", error);
    return failed("התור בוטל, אך האירוע לא הוסר מ-Google Calendar");
  }
}

async function calendarRemove(snapshot: AppointmentActionSnapshot) {
  return calendarRemoveById(snapshot.id, snapshot.status);
}

export function syncCalendarOnlyAppointment(appointmentId: string) {
  return calendarSync(appointmentId, "update");
}

export function retryCalendarAppointmentSync(appointmentId: string) {
  return calendarSync(appointmentId, "update");
}

export function retryCalendarAppointmentRemoval(appointmentId: string) {
  return calendarRemoveById(appointmentId, "cancelled");
}

async function loadLatestClinicSettings(): Promise<Record<string, unknown> | null> {
  try {
    const records = await ClinicSettings.list("-created_at", 1);
    return Array.isArray(records) && records[0] && typeof records[0] === "object"
      ? records[0] as Record<string, unknown>
      : null;
  } catch (error) {
    console.error("Could not load clinic settings for customer email template:", error);
    return null;
  }
}

function managementUrlFromSettings(snapshot: AppointmentActionSnapshot, setting: Record<string, unknown> | null): string {
  return snapshot.cancel_token && setting?.self_service_appointment_management_enabled === true
    ? buildAppointmentManagementUrl(snapshot.cancel_token)
    : "";
}

export async function managementUrlFor(snapshot: AppointmentActionSnapshot): Promise<string> {
  if (!snapshot.cancel_token) return "";
  return managementUrlFromSettings(snapshot, await loadLatestClinicSettings());
}

async function appointmentEmail(snapshot: AppointmentActionSnapshot, action: AppointmentActionKind, calendarUrl: string) {
  if (!isValidEmail(snapshot.email)) return skipped("אין כתובת אימייל תקינה");
  const approved = action === "approve";
  const updated = action === "update";
  const setting = await loadLatestClinicSettings();
  const managementUrl = approved || updated ? managementUrlFromSettings(snapshot, setting) : "";
  const options: AppointmentEmailOptions = approved
    ? { title: "התור שלך אושר!", subtitle: `נשמח לראותכם במרפאת ${VETERINARY_CLINIC_PROFILE.shortName}.`, statusLabel: "תור מאושר", statusColor: "#16a34a", ...(calendarUrl ? { addToCalendarUrl: calendarUrl, addToCalendarLabel: "הוספה ליומן Google" } : {}), ...(managementUrl ? { managementUrl } : {}) }
    : updated
      ? { title: "פרטי התור עודכנו", subtitle: `פרטי התור שלך במרפאת ${VETERINARY_CLINIC_PROFILE.shortName} עודכנו.`, statusLabel: "תור מעודכן", statusColor: "#5267A8", ...(managementUrl ? { managementUrl } : {}) }
      : { title: "עדכון: התור בוטל", subtitle: "הודעה על ביטול התור.", statusLabel: "תור מבוטל", statusColor: "#dc2626" };
  const emailType = approved ? "appointment_approved" : updated ? "appointment_updated" : "appointment_cancelled";
  const templateKey = resolveCustomerEmailTemplateSelection(setting?.customer_email_template_selections, emailType);
  const bodyHtml = templateKey === MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY
    ? buildCustomerEmailHtml(emailType, templateKey, snapshot, options)
    : buildAppointmentEmailHtml(snapshot, options);
  try {
    await runWithTimeout(() => sendEmail({ to: snapshot.email, subject: approved ? `אישור תור – ${VETERINARY_CLINIC_PROFILE.shortName}` : updated ? `עדכון פרטי תור – ${VETERINARY_CLINIC_PROFILE.shortName}` : `ביטול תור – ${VETERINARY_CLINIC_PROFILE.shortName}`, body_html: bodyHtml }), "שליחת אימייל ללקוח");
    return succeeded("נשלח");
  } catch (error) { console.error(`CRM appointment ${action} email failed:`, error); return failed("לא נשלח"); }
}

export async function sendRescheduleRejectionEmail(
  snapshot: AppointmentActionSnapshot,
  request: RescheduleRejectionEmailDetails,
  managementUrl: string,
): Promise<SideEffectOutcome> {
  if (!isValidEmail(snapshot.email)) return skipped("אין כתובת אימייל תקינה");
  if (!managementUrl) return failed("לא נמצא קישור ניהול תור מאובטח");
  const setting = await loadLatestClinicSettings();
  const templateKey = resolveCustomerEmailTemplateSelection(setting?.customer_email_template_selections, "reschedule_rejected");
  const bodyHtml = templateKey === MARKETING_CUSTOMER_EMAIL_TEMPLATE_KEY
    ? buildCustomerRescheduleRejectionEmailHtml(snapshot, request, managementUrl, templateKey)
    : buildRescheduleRejectionEmailHtml(snapshot, request, managementUrl);
  try {
    await runWithTimeout(
      () => sendEmail({
        to: snapshot.email,
        subject: `בקשת שינוי מועד לא אושרה – ${VETERINARY_CLINIC_PROFILE.shortName}`,
        body_html: bodyHtml,
      }),
      "שליחת אימייל דחיית שינוי מועד ללקוח",
    );
    return succeeded("נשלח");
  } catch (error) {
    console.error("CRM reschedule rejection email failed:", error);
    return failed("לא נשלח");
  }
}

async function appointmentSms(snapshot: AppointmentActionSnapshot, action: AppointmentActionKind, calendarUrl: string) {
  const to = normalizeIsraeliPhone(snapshot.phone);
  if (!to) return skipped("אין מספר טלפון תקין");
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(snapshot.date) ? parse(`${snapshot.date} 12:00`, "yyyy-MM-dd HH:mm", new Date()) : null;
  const weekday = parsedDate && isValid(parsedDate) ? format(parsedDate, "EEEE", { locale: he }) : "שנקבע";
  const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(snapshot.date) ? snapshot.date.split("-").reverse().join("/") : snapshot.date || "המועד";
  const client = snapshot.client_name || "לקוח יקר";
  const body = action === "approve"
    ? `שלום ${client}, תורך ${weekday} ה${dateLabel} בשעה ${snapshot.start_time} אושר. נתראה!`
    : action === "update"
      ? `שלום ${client}, פרטי התור עודכנו ליום ${weekday} ה${dateLabel} בשעה ${snapshot.start_time}. נתראה!`
      : action === "reject"
        ? `שלום ${client}, בקשת התור ליום ${weekday} ה${dateLabel} בשעה ${snapshot.start_time} לא אושרה. ניתן לפנות למרפאה לתיאום מועד אחר.`
        : `שלום ${client}, התור ליום ${weekday} ה${dateLabel} בשעה ${snapshot.start_time} בוטל. לפרטים נוספים ניתן לפנות למרפאה.`;
  try {
    const result = await runWithTimeout(() => sendSms({ to, body, ...(calendarUrl ? { calendar_url: calendarUrl } : {}) }), "שליחת SMS ללקוח");
    const payload = result as { error?: unknown; success?: boolean } | null;
    if (!payload || payload.error || payload.success === false) throw new Error(valueText(payload?.error) || "שירות ה-SMS לא החזיר אישור.");
    return succeeded("נשלח");
  } catch (error) { console.error(`CRM appointment ${action} SMS failed:`, error); return failed("לא נשלח"); }
}

function outcomeLine(label: string, outcome: SideEffectOutcome) { return outcome.status === "success" ? `${label}: ✓ ${outcome.detail}` : outcome.status === "skipped" ? `${label}: ${outcome.detail}` : `${label}: ✗ ${outcome.detail}`; }

export function appointmentSnapshotFromRecord(record: Record<string, any>): AppointmentActionSnapshot {
  return { id: valueText(record.id), status: valueText(record.status), client_name: valueText(record.client_name), phone: valueText(record.phone), email: valueText(record.email), pet_name: valueText(record.pet_name), appointment_type: valueText(record.appointment_type), date: valueText(record.date), start_time: valueText(record.start_time), end_time: valueText(record.end_time), notes: valueText(record.notes), google_event_id: valueText(record.google_event_id), cancel_token: valueText(record.cancel_token) };
}

export async function runAppointmentSideEffects(snapshot: AppointmentActionSnapshot, action: AppointmentActionKind): Promise<AppointmentActionResult> {
  const calendar = action === "approve" || action === "update" ? await calendarSync(snapshot.id, action) : await calendarRemove(snapshot);
  const calendarUrl = action === "approve" ? buildGoogleCalendarLink(snapshot) : "";
  const [email, sms] = await Promise.all([appointmentEmail(snapshot, action, calendarUrl), appointmentSms(snapshot, action, calendarUrl)]);
  const hasNonSuccess = [calendar, email, sms].some((item) => item.status !== "success");
  const firstLine = action === "approve" ? "הבקשה אושרה." : action === "reject" ? "הבקשה סורבה." : action === "cancel" ? "התור בוטל." : "השינויים בפגישה נשמרו.";
  return { action, isPartial: hasNonSuccess, summary: [firstLine, outcomeLine("📅 יומן Google", calendar), outcomeLine("📧 אימייל ללקוח", email), outcomeLine("📱 SMS ללקוח", sms)].join(" "), calendar, email, sms, ...(calendar.eventId ? { googleEventId: calendar.eventId } : {}) };
}

export function syncUpdatedAppointment(snapshot: AppointmentActionSnapshot) { return runAppointmentSideEffects(snapshot, "update"); }

export async function cancelConfirmedAppointment(snapshot: AppointmentActionSnapshot) {
  if (!snapshot.id) throw new Error("לפגישה הזו חסר מזהה שמאפשר לשמור את הביטול.");
  if (snapshot.status && snapshot.status !== "confirmed") throw new Error("אפשר לבטל מהיומן רק פגישה מאושרת.");
  try { await runWithTimeout(() => Promise.resolve(Appointment.update(snapshot.id, { status: "cancelled", cancelled_by: "admin" })), "שמירת ביטול הפגישה"); } catch (error) { console.error("CRM confirmed appointment cancellation failed:", error); throw new Error("לא הצלחנו לשמור את ביטול הפגישה. נסי שוב."); }
  return runAppointmentSideEffects(snapshot, "cancel");
}
