import type { CrmRecord, CrmMobileAppointmentDecisionNotice } from "@/components/business-crm/CrmContext";
import { CalendarDays, CalendarPlus, Check, CircleCheck, Clock3, LayoutDashboard, Mail, PawPrint, Plus, Users, X } from "lucide-react";
import { formatDashboardDate, getClinicDateKey, shiftDashboardDate } from "@/lib/crmDashboardData";

export type BentoDockTab = "dashboard" | "calendar" | "clients" | "inbox";

export function formatCount(value: number): string {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(Math.max(0, Math.floor(value)));
}

function firstLetter(value: string): string {
  return value.match(/\p{L}/u)?.[0] || "";
}

export function initials(name = ""): string {
  const words = name.trim().split(/\s+/).filter((word) => /\p{L}/u.test(word));
  const filtered = words.filter((word) => !/^(?:I{1,3}|IV|Jr\.?|Sr\.?|Dr\.?|ד["״']?ר'?|פרופ'?)$/i.test(word));
  if (filtered.length === 0) return "?";
  const first = firstLetter(filtered[0]);
  const last = filtered.length > 1 ? firstLetter(filtered[filtered.length - 1]) : "";
  return `${first}${last}`.toLocaleUpperCase("he");
}

export function plural(count: number, singular: string, pluralWord: string, oneText?: string): string {
  return count === 1 ? oneText || `${singular} אחד` : `${formatCount(count)} ${pluralWord}`;
}

export function clinicShortDate(dateKey: string, today = getClinicDateKey()): string {
  if (!dateKey) return "תאריך לא צוין";
  if (dateKey === today) return "היום";
  if (dateKey === shiftDashboardDate(today, 1)) return "מחר";
  if (dateKey === shiftDashboardDate(today, -1)) return "אתמול";
  return formatDashboardDate(dateKey, { day: "numeric", month: "short" });
}

export function timeMinutes(value: unknown): number | null {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function appointmentStatus(value: unknown): {
  kind: "confirmed" | "requested" | "completed" | "no_show" | "cancelled" | "unknown";
  label: string;
  tone: "ok" | "wait" | "done" | "missed" | "unknown";
} {
  const status = String(value ?? "").trim().toLocaleLowerCase("en");
  if (status === "confirmed") return { kind: "confirmed", label: "מאושר", tone: "ok" };
  if (status === "requested") return { kind: "requested", label: "ממתין לאישור", tone: "wait" };
  if (status === "completed") return { kind: "completed", label: "הושלם", tone: "done" };
  if (["no_show", "no-show", "noshow"].includes(status)) return { kind: "no_show", label: "לא הגיע/ה", tone: "missed" };
  if (["cancelled", "canceled"].includes(status)) return { kind: "cancelled", label: "בוטל", tone: "unknown" };
  return { kind: "unknown", label: "סטטוס לא ידוע", tone: "unknown" };
}

export function isActiveAppointment(record: CrmRecord): boolean {
  return appointmentStatus(record.status).kind !== "cancelled";
}

function dayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function workDaysFrom(start: string, count = 6): string[] {
  const days: string[] = [];
  let cursor = start;
  while (days.length < count) {
    if (dayNumber(cursor) !== 6) days.push(cursor);
    cursor = shiftDashboardDate(cursor, 1);
  }
  return days;
}

const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export function WeekStrip({
  appointments,
  value,
  today,
  onChange,
}: {
  appointments: CrmRecord[];
  value: string;
  today: string;
  onChange: (dateKey: string) => void;
}) {
  const days = workDaysFrom(today, 6);
  return (
    <div className="week" role="group" aria-label="בחירת יום לתצוגת התורים">
      {days.map((dateKey) => {
        const selected = value === dateKey;
        const count = appointments.filter((record) => record.date === dateKey && isActiveAppointment(record)).length;
        const weekday = dayNumber(dateKey);
        const dayLabel = dateKey === today ? "היום" : DAY_SHORT[weekday];
        const dateLabel = formatDashboardDate(dateKey, { weekday: "long", day: "numeric", month: "long" });
        return (
          <button
            key={dateKey}
            type="button"
            className={`wd press${selected ? " on" : ""}`}
            aria-pressed={selected}
            aria-label={`${dateLabel}, ${plural(count, "תור", "תורים")}`}
            onClick={() => onChange(dateKey)}
          >
            <small>{dayLabel}</small>
            <b>{formatDashboardDate(dateKey, { day: "numeric" })}</b>
            <span className="dots" aria-hidden="true">
              {Array.from({ length: Math.min(3, Math.ceil(count / 3)) }, (_, index) => <i key={index} />)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TimeRange({ start, end }: { start: unknown; end: unknown }) {
  const startLabel = String(start ?? "").trim().slice(0, 5);
  const endLabel = String(end ?? "").trim().slice(0, 5);
  if (!startLabel) return <span>שעה לא צוינה</span>;
  return <span className="ltr" dir="ltr">{startLabel}{endLabel ? `–${endLabel}` : ""}</span>;
}

export function AppointmentCard({
  appointment,
  onOpen,
}: {
  appointment: CrmRecord;
  onOpen: (record: CrmRecord) => void;
}) {
  const status = appointmentStatus(appointment.status);
  const start = String(appointment.start_time ?? "").trim().slice(0, 5);
  const startMinutes = timeMinutes(start);
  const endMinutes = timeMinutes(appointment.end_time);
  const rawDuration = Number(appointment.duration_minutes);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0
    ? Math.round(rawDuration)
    : startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
      ? endMinutes - startMinutes
      : 20;
  const petName = String(appointment.pet_name ?? "").trim();
  const service = String(appointment.appointment_type ?? "").trim();
  const clientName = String(appointment.client_name ?? "").trim() || "שם הלקוח לא צוין";
  const arrivalMarked = Boolean(String(appointment.arrived_at ?? "").trim());

  return (
    <button
      type="button"
      className={`ap press${status.kind === "requested" ? " wait" : ""}${status.kind === "completed" ? " done" : ""}${status.kind === "no_show" ? " missed" : ""}`}
      onClick={() => onOpen(appointment)}
      aria-label={`פתיחת פרטי התור של ${clientName}, ${start || "שעה לא צוינה"}, ${status.label}`}
    >
      <span className="tm">
        <b className="ltr" dir="ltr">{start || "—"}</b>
        <small>{duration} דק׳</small>
      </span>
      <span className="b">
        <span className="n" dir="auto">{clientName}</span>
        <span className="m"><PawPrint aria-hidden="true" />{[petName, service].filter(Boolean).join(" · ") || "פרטי חיית המחמד או השירות לא צוינו"}</span>
        {arrivalMarked && <span className="arrived-mark"><Check aria-hidden="true" />הגיע/ה</span>}
      </span>
      <span className={`st ${status.tone}`}>{status.label}</span>
    </button>
  );
}

export function BentoDock({
  active,
  onChange,
  onAdd,
  badgeCount = 0,
}: {
  active: BentoDockTab;
  onChange: (tab: BentoDockTab) => void;
  onAdd: () => void;
  badgeCount?: number;
}) {
  return (
    <nav className="dock" dir="rtl" aria-label="ניווט ראשי">
      <button type="button" className={`dk${active === "dashboard" ? " on" : ""}`} aria-current={active === "dashboard" ? "page" : undefined} onClick={() => onChange("dashboard")}>
        <LayoutDashboard aria-hidden="true" />ניהול
      </button>
      <button type="button" className={`dk${active === "calendar" ? " on" : ""}`} aria-current={active === "calendar" ? "page" : undefined} onClick={() => onChange("calendar")}>
        <CalendarDays aria-hidden="true" />יומן
      </button>
      <button type="button" className="fab press" aria-label="פתיחת טופס לתור חדש" onClick={onAdd}>
        <Plus aria-hidden="true" />
      </button>
      <button type="button" className={`dk${active === "clients" ? " on" : ""}`} aria-current={active === "clients" ? "page" : undefined} onClick={() => onChange("clients")}>
        <Users aria-hidden="true" />לקוחות
      </button>
      <button type="button" className={`dk${active === "inbox" ? " on" : ""}`} aria-current={active === "inbox" ? "page" : undefined} onClick={() => onChange("inbox")}>
        <Mail aria-hidden="true" />דואר
        {badgeCount > 0 && <span className="bd" aria-label={`${badgeCount} פריטים פתוחים בתיבה`}>{badgeCount > 99 ? "99+" : formatCount(badgeCount)}</span>}
      </button>
    </nav>
  );
}

export function BentoToastLayer({
  notice,
  onUndo,
}: {
  notice: CrmMobileAppointmentDecisionNotice | null;
  onUndo: () => void;
}) {
  if (!notice) return null;
  const role = notice.phase === "error" ? "alert" : "status";
  const tone = notice.phase === "error" ? "error" : notice.phase === "partial" ? "partial" : "";
  return (
    <div className="bn bn-toast-layer" dir="rtl">
      <div className={`toast on${tone ? ` ${tone}` : ""}`} role={role} aria-live={notice.phase === "error" ? "assertive" : "polite"}>
        {notice.phase === "committing" && <Clock3 aria-hidden="true" />}
        {notice.phase === "success" && <CircleCheck aria-hidden="true" />}
        {notice.phase === "partial" && <Clock3 aria-hidden="true" />}
        {notice.phase === "error" && <X aria-hidden="true" />}
        {notice.phase === "undone" && <Check aria-hidden="true" />}
        <span>{notice.message}</span>
        {notice.phase === "undo" && <button type="button" onClick={onUndo} aria-label="ביטול אישור או דחיית התור">ביטול</button>}
      </div>
    </div>
  );
}

export function Icon({ name }: { name: "calendar" | "calendar-plus" | "check" | "clock" | "mail" | "plus" | "users" | "x" }) {
  const IconComponent = {
    calendar: CalendarDays,
    "calendar-plus": CalendarPlus,
    check: Check,
    clock: Clock3,
    mail: Mail,
    plus: Plus,
    users: Users,
    x: X,
  }[name];
  return <IconComponent aria-hidden="true" />;
}
