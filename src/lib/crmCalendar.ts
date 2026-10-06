import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { he } from "date-fns/locale";

export type CalendarMode = "day" | "three-days" | "week" | "month" | "agenda";
export type AppointmentStatusTone = "confirmed" | "requested" | "completed" | "no_show" | "cancelled" | "unknown";

export const CALENDAR_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const CALENDAR_MODE_LABELS: Record<CalendarMode, string> = { day: "יום", "three-days": "3 ימים", week: "שבוע", month: "חודש", agenda: "לו\"ז" };
export const GOOGLE_CALENDAR_SERVICE_ID = "google-calendar";

export interface AppointmentEditDraft { serviceId: string; date: string; startTime: string; clientName: string; phone: string; email: string; petName: string; petSpecies: string; notes: string; }
export function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
export function dateKey(date: Date): string { return format(date, "yyyy-MM-dd"); }
export function dateFromKey(value: string): Date | null { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const parsed = parse(value, "yyyy-MM-dd", new Date()); return isValid(parsed) ? parsed : null; }
export function timeToMinutes(value: unknown): number { const match = text(value).match(/^(\d{1,2}):(\d{2})/); if (!match) return Number.NaN; const hours = Number(match[1]); const minutes = Number(match[2]); return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : Number.NaN; }
export function isPastCalendarMoment(date: Date, startTime: unknown, now = new Date()): boolean { if (!(date instanceof Date) || !isValid(date) || !(now instanceof Date) || !isValid(now)) return false; const rawTime = text(startTime); if (!/^\d{1,2}:\d{2}$/.test(rawTime)) return false; const startMinutes = timeToMinutes(rawTime); if (!Number.isFinite(startMinutes)) return false; const localMoment = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(startMinutes / 60), startMinutes % 60, 0, 0); return localMoment.getTime() <= now.getTime(); }
export function minutesToClock(value: number): string { const safe = Math.max(0, Math.min(1439, Math.round(value))); return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`; }
export function appointmentDateKey(record: Record<string, any>): string { const value = text(record.date); return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""; }
export function appointmentStartMinutes(record: Record<string, any>): number { const value = timeToMinutes(record.start_time); return Number.isFinite(value) ? value : 0; }
export function appointmentEndMinutes(record: Record<string, any>, duration = 30): number { const explicit = timeToMinutes(record.end_time); if (Number.isFinite(explicit) && explicit > appointmentStartMinutes(record)) return explicit; const savedDuration = Number(record.duration_minutes); return Math.min(1440, appointmentStartMinutes(record) + (Number.isFinite(savedDuration) && savedDuration > 0 ? savedDuration : duration)); }
export function appointmentDateTime(record: Record<string, any>): Date | null { const key = appointmentDateKey(record); if (!key) return null; const parsed = parse(`${key} ${text(record.start_time).slice(0, 5) || "00:00"}`, "yyyy-MM-dd HH:mm", new Date()); return isValid(parsed) ? parsed : null; }
export function visibleDates(selectedDate: Date, mode: CalendarMode): Date[] { if (mode === "day") return [selectedDate]; if (mode === "three-days") return [selectedDate, addDays(selectedDate, 1), addDays(selectedDate, 2)]; const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 }); if (mode === "week" || mode === "agenda") return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)); return [selectedDate]; }
export function monthGridDates(monthDate: Date): Date[] { const first = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 }); const chronological = Array.from({ length: 42 }, (_, index) => addDays(first, index)); const weeks: Date[][] = []; for (let index = 0; index < chronological.length; index += 7) weeks.push(chronological.slice(index, index + 7)); return weeks.flat(); }
export function rangeLabel(selectedDate: Date, mode: CalendarMode): string { if (mode === "month") return format(selectedDate, "LLLL yyyy", { locale: he }); if (mode === "day") return format(selectedDate, "d בMMMM yyyy", { locale: he }); const dates = visibleDates(selectedDate, mode).sort((a, b) => a.getTime() - b.getTime()); const first = dates[0]; const last = dates[dates.length - 1]; if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) return `${format(first, "dd")} - ${format(last, "dd")} ב${format(first, "MMMM", { locale: he })}, ${format(first, "yyyy")}`; return `${format(first, "dd בMMMM", { locale: he })} - ${format(last, "dd בMMMM", { locale: he })}, ${format(last, "yyyy")}`; }
export function serviceIdForRecord(record: Record<string, any>, services: Array<{ id: string; label: string }>): string { const direct = text(record.service_id) || text(record.appointment_type_id); if (direct && services.some((service) => service.id === direct)) return direct; const label = text(record.appointment_type).toLocaleLowerCase("he"); const match = services.find((service) => { const serviceLabel = service.label.toLocaleLowerCase("he"); return label === serviceLabel || label.includes(serviceLabel) || serviceLabel.includes(label); }); return match?.id || "other"; }
const CALENDAR_SERVICE_COLORS: Record<string, string> = { vaccine: "#D39B28", general: "#6D28D9", surgery: "#D85B62", dental: "#32977E", [GOOGLE_CALENDAR_SERVICE_ID]: "#5267A8", other: "#8B75B5" };
export function serviceColor(serviceId: string): string { return CALENDAR_SERVICE_COLORS[serviceId] || CALENDAR_SERVICE_COLORS.other; }
export function appointmentStatusTone(value: unknown): AppointmentStatusTone { const status = text(value).toLowerCase(); if (status === "confirmed") return "confirmed"; if (status === "requested") return "requested"; if (status === "completed") return "completed"; if (["no_show", "no-show", "noshow"].includes(status)) return "no_show"; if (status === "cancelled" || status === "canceled") return "cancelled"; return "unknown"; }
export function isRequestedAppointment(record: Record<string, any>): boolean { return appointmentStatusTone(record.status) === "requested"; }
export function statusLabel(value: unknown): string { const tone = appointmentStatusTone(value); if (tone === "confirmed") return "מאושר"; if (tone === "requested") return "ממתין להחלטה"; if (tone === "cancelled") return "בוטל"; if (tone === "no_show") return "לא הגיע"; if (tone === "completed") return "הסתיים"; return text(value) || "סטטוס לא צוין"; }
export function recordStatusLabel(record: Record<string, any>): string { if (appointmentStatusTone(record.status) === "cancelled" && text(record.cancelled_by).toLowerCase() === "admin") return "סורב"; return statusLabel(record.status); }
export function createAppointmentEditDraft(record: Record<string, any>, services: Array<{ id: string; label: string }>): AppointmentEditDraft { return { serviceId: serviceIdForRecord(record, services), date: appointmentDateKey(record), startTime: text(record.start_time).slice(0, 5), clientName: text(record.client_name), phone: text(record.phone), email: text(record.email), petName: text(record.pet_name), petSpecies: text(record.pet_species), notes: text(record.notes) }; }
export function appointmentDateLabel(value: string): string { const date = dateFromKey(value); return date ? format(date, "EEEE, d בMMMM yyyy", { locale: he }) : "תאריך לא צוין"; }
export function isActiveAppointment(record: Record<string, any>, excludedId?: string): boolean { const tone = appointmentStatusTone(record.status); return tone !== "cancelled" && (!excludedId || text(record.id) !== excludedId); }
export function recordSearchText(record: Record<string, any>): string { return [record.client_name, record.pet_name, record.appointment_type, record.phone, record.email, record.notes].map(text).join(" ").toLocaleLowerCase("he"); }
export function isToday(date: Date, now = new Date()): boolean { return isSameDay(date, now); }
export function isInMonth(date: Date, monthDate: Date): boolean { return isSameMonth(date, monthDate); }
export function hasRemoteSupport(record: Record<string, any>): boolean { const explicit = ["remote", "is_remote", "zoom", "zoom_url", "meeting_url", "video_url", "online_url"]; if (explicit.some((key) => record[key] === true || Boolean(text(record[key])))) return true; return ["location_type", "service_location", "meeting_type"].some((key) => /remote|online|zoom|וידאו|מקוון/i.test(text(record[key]))); }
export function reminderState(record: Record<string, any>, field: string, now = new Date()): string { const saved = text(record[field]); if (saved) { const parsed = new Date(saved); return isValid(parsed) ? `נשלחה ב-${format(parsed, "d בMMM, HH:mm", { locale: he })}` : "נרשמה במערכת"; } const date = appointmentDateTime(record); if (text(record.status) === "confirmed" && date && date.getTime() > now.getTime()) return "מתוזמנת, טרם נרשמה שליחה"; return "לא מתוזמנת עבור הרשומה הזו"; }
export function navigationDate(selectedDate: Date, mode: CalendarMode, direction: -1 | 1): Date { if (mode === "month") return addMonths(selectedDate, direction); if (mode === "week" || mode === "agenda") return addDays(selectedDate, direction * 7); if (mode === "three-days") return addDays(selectedDate, direction * 3); return addDays(selectedDate, direction); }
