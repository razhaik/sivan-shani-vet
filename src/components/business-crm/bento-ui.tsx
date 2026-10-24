import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import type { CrmRecord, CrmMobileAppointmentDecisionNotice } from "@/components/business-crm/CrmContext";
import { CalendarDays, CalendarPlus, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Clock3, LayoutDashboard, Mail, PawPrint, Plus, Users, X } from "lucide-react";
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

/** The first day of the `count` work days that end right before `end`. */
function workDaysStartBefore(end: string, count = 6): string {
  let cursor = shiftDashboardDate(end, -1);
  let found = 0;
  let start = cursor;
  while (found < count) {
    if (dayNumber(cursor) !== 6) {
      found += 1;
      start = cursor;
    }
    cursor = shiftDashboardDate(cursor, -1);
  }
  return start;
}

const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const STRIP_SWIPE_DISTANCE = 56;

function appointmentCountsByDay(appointments: CrmRecord[]) {
  const counts = new Map<string, number>();
  appointments.forEach((record) => {
    if (!isActiveAppointment(record)) return;
    const key = String(record.date ?? "");
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

/**
 * Six work days. Swipe right for the next six (Hebrew reads right-to-left, so later days sit to the
 * left and come in from that side), swipe left for the previous six.
 */
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
  const reducedMotion = useReducedMotion() ?? false;
  const [windowStart, setWindowStart] = useState(() => {
    if (!value || workDaysFrom(today, 6).includes(value)) return today;
    return dayNumber(value) === 6 ? shiftDashboardDate(value, 1) : value;
  });
  const [direction, setDirection] = useState<1 | -1>(1);
  const counts = useMemo(() => appointmentCountsByDay(appointments), [appointments]);
  const days = workDaysFrom(windowStart, 6);

  // Keep the selected day visible: a day picked elsewhere (e.g. the month sheet) moves the window to it.
  useEffect(() => {
    if (!value) return;
    const visible = workDaysFrom(windowStart, 6);
    if (visible.includes(value)) return;
    setDirection(value > windowStart ? 1 : -1);
    setWindowStart(dayNumber(value) === 6 ? shiftDashboardDate(value, 1) : value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const move = (step: 1 | -1) => {
    setDirection(step);
    setWindowStart((current) => step === 1 ? shiftDashboardDate(workDaysFrom(current, 6)[5], 1) : workDaysStartBefore(current, 6));
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > STRIP_SWIPE_DISTANCE || info.velocity.x > 500) move(1);
    else if (info.offset.x < -STRIP_SWIPE_DISTANCE || info.velocity.x < -500) move(-1);
  };

  const rangeLabel = `${formatDashboardDate(days[0], { day: "numeric", month: "long" })} – ${formatDashboardDate(days[5], { day: "numeric", month: "long" })}`;

  return (
    <div className="week-viewport" role="group" aria-label={`בחירת יום לתצוגת התורים, ${rangeLabel}`}>
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.div
          key={windowStart}
          className="week"
          custom={direction}
          initial={reducedMotion ? false : { x: direction === 1 ? "-100%" : "100%", opacity: 0.4 }}
          animate={{ x: 0, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { x: direction === 1 ? "100%" : "-100%", opacity: 0.4 }}
          transition={{ type: "spring", stiffness: 340, damping: 34 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.35}
          onDragEnd={onDragEnd}
        >
          {days.map((dateKey) => {
            const selected = value === dateKey;
            const count = counts.get(dateKey) ?? 0;
            const weekday = dayNumber(dateKey);
            const dayLabel = dateKey === today ? "היום" : DAY_SHORT[weekday];
            const dateLabel = formatDashboardDate(dateKey, { weekday: "long", day: "numeric", month: "long" });
            return (
              <button
                key={dateKey}
                type="button"
                className={`wd press${selected ? " on" : ""}${dateKey < today ? " past" : ""}`}
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
        </motion.div>
      </AnimatePresence>
      <div className="week-nav">
        <button type="button" className="press" onClick={() => move(-1)} aria-label="6 ימי העבודה הקודמים"><ChevronRight aria-hidden="true" /></button>
        <span aria-live="polite">{rangeLabel}</span>
        <button type="button" className="press" onClick={() => move(1)} aria-label="6 ימי העבודה הבאים"><ChevronLeft aria-hidden="true" /></button>
      </div>
    </div>
  );
}

const MONTH_NAMES = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function monthKeyOf(dateKey: string) {
  return dateKey.slice(0, 7);
}

function shiftMonth(monthKey: string, step: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + step, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthCells(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();
  const length = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: first }, () => null);
  for (let day = 1; day <= length; day += 1) cells.push(`${monthKey}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Button that shows the visible month and opens the month sheet. */
export function MonthPickerButton({ value, onOpen, expanded }: { value: string; onOpen: () => void; expanded: boolean }) {
  return (
    <button type="button" className="month-picker-button press" onClick={onOpen} aria-haspopup="dialog" aria-expanded={expanded} aria-label={`פתיחת לוח חודשי, ${formatDashboardDate(value, { month: "long", year: "numeric" })}`}>
      <CalendarDays aria-hidden="true" />
      <span>{formatDashboardDate(value, { month: "long" })}</span>
      <ChevronDown aria-hidden="true" />
    </button>
  );
}

/** Bottom sheet with a month grid. Tapping a day selects it and closes the sheet. */
export function MonthPickerSheet({
  open,
  value,
  today,
  appointments,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: string;
  today: string;
  appointments: CrmRecord[];
  onSelect: (dateKey: string) => void;
  onClose: () => void;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(value || today));
  const [direction, setDirection] = useState<1 | -1>(1);
  const counts = useMemo(() => appointmentCountsByDay(appointments), [appointments]);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setMonthKey(monthKeyOf(value || today));
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    window.requestAnimationFrame(() => sheetRef.current?.focus({ preventScroll: true }));
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = (step: 1 | -1) => {
    setDirection(step);
    setMonthKey((current) => shiftMonth(current, step));
  };
  const [year, month] = monthKey.split("-").map(Number);
  const cells = monthCells(monthKey);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="bn month-picker-layer" dir="rtl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }}>
          <button type="button" className="mp-scrim" aria-label="סגירת הלוח החודשי" onClick={onClose} tabIndex={-1} />
          <motion.div
            ref={sheetRef}
            className="mp-sheet"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="בחירת יום מלוח חודשי"
            initial={reducedMotion ? false : { y: "100%" }}
            animate={{ y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 600) onClose(); }}
          >
            <div className="mp-grab" aria-hidden="true" />
            <div className="mp-head">
              <h2 aria-live="polite">{MONTH_NAMES[month - 1]} <em>{year}</em></h2>
              {monthKey !== monthKeyOf(today) && <button type="button" className="mp-today press" onClick={() => { setDirection(monthKey > monthKeyOf(today) ? -1 : 1); setMonthKey(monthKeyOf(today)); }}>היום</button>}
              <button type="button" className="mp-nav press" onClick={() => go(-1)} aria-label="החודש הקודם"><ChevronRight aria-hidden="true" /></button>
              <button type="button" className="mp-nav press" onClick={() => go(1)} aria-label="החודש הבא"><ChevronLeft aria-hidden="true" /></button>
            </div>
            <div className="mp-weekdays" aria-hidden="true">{DAY_SHORT.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="mp-grid-viewport">
              <AnimatePresence initial={false} mode="popLayout" custom={direction}>
                <motion.div
                  key={monthKey}
                  className="mp-grid"
                  role="grid"
                  initial={reducedMotion ? false : { x: direction === 1 ? "-100%" : "100%", opacity: 0.3 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { x: direction === 1 ? "100%" : "-100%", opacity: 0.3 }}
                  transition={{ type: "spring", stiffness: 340, damping: 34 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.35}
                  onDragEnd={(_, info) => {
                    if (info.offset.x > 60 || info.velocity.x > 500) go(1);
                    else if (info.offset.x < -60 || info.velocity.x < -500) go(-1);
                  }}
                >
                  {cells.map((dateKey, index) => {
                    if (!dateKey) return <span key={`blank-${index}`} className="mp-blank" aria-hidden="true" />;
                    const count = counts.get(dateKey) ?? 0;
                    const isToday = dateKey === today;
                    const isSelected = dateKey === value;
                    const isPast = dateKey < today;
                    const isSaturday = dayNumber(dateKey) === 6;
                    return (
                      <button
                        key={dateKey}
                        type="button"
                        className={`mp-day${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}${isPast ? " is-past" : ""}${isSaturday ? " is-sat" : ""}`}
                        aria-pressed={isSelected}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={`${formatDashboardDate(dateKey, { weekday: "long", day: "numeric", month: "long" })}, ${count === 0 ? "אין תורים" : plural(count, "תור", "תורים")}`}
                        onClick={() => { onSelect(dateKey); onClose(); }}
                      >
                        {Number(dateKey.slice(8))}
                        {count > 0 && <span className="mp-dots" aria-hidden="true">{Array.from({ length: Math.min(3, Math.ceil(count / 2)) }, (_, dot) => <i key={dot} />)}</span>}
                      </button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
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
