import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { format } from "date-fns";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, CalendarDays, Check, Clock3, List, PawPrint, Plus, Search, Settings, X, Phone, XCircle } from "lucide-react";
import { createPortal } from "react-dom";
import { ProfileAvatar } from "@/components/business-crm/CrmProfileAvatar";
import { CrmProfileMenu, type CrmProfileUpdate } from "@/components/business-crm/CrmProfileMenu";
import type { CrmRecord, CrmMobileAppointmentDecisionNotice } from "@/components/business-crm/CrmContext";
import type { AppointmentDecisionAction } from "@/lib/crmAppointmentDecision";
import type { DashboardClientSummary } from "@/lib/crmDashboardData";
import {
  AppointmentCard,
  clinicShortDate,
  formatCount,
  isActiveAppointment,
  plural,
  timeMinutes,
  TimeRange,
  WeekStrip,
  appointmentStatus,
  type BentoDockTab,
} from "@/components/business-crm/bento-ui";
import {
  formatDashboardDate,
  getClinicDateKey,
  summarizeDashboardAppointments,
} from "@/lib/crmDashboardData";

export interface DashboardHomeRequestState {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}

export interface DashboardHomeData {
  appointments: CrmRecord[];
  pendingAppointments: CrmRecord[];
  clients: DashboardClientSummary[];
  inquiries: CrmRecord[];
  today: string;
  profile: {
    name: string;
    shortName: string;
    subtitle: string;
    fullName?: string;
    email?: string;
    imageUrl?: string;
  };
}

export interface DashboardHomeActions {
  onNavigate: (tab: BentoDockTab) => void;
  onOpenInbox: () => void;
  onOpenSales: () => void;
  onOpenMore: (trigger?: HTMLButtonElement) => void;
  onProfileUpdated?: (updates: CrmProfileUpdate) => void;
  onOpenSettings?: () => void;
  onOpenAppointment: (record: CrmRecord) => void;
  onMarkNoShow: (record: CrmRecord) => Promise<void>;
  onScheduleDecision: (record: CrmRecord, action: AppointmentDecisionAction) => boolean;
}

interface DashboardPageProps {
  data: DashboardHomeData;
  actions: DashboardHomeActions;
  appointmentState: DashboardHomeRequestState;
  pendingState: DashboardHomeRequestState;
  clientsState: DashboardHomeRequestState;
  inquiriesState: DashboardHomeRequestState;
  notificationCount: number;
  decisionNotice: CrmMobileAppointmentDecisionNotice | null;
}

function clinicNowTime(now: Date): { label: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const getPart = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value || 0);
  const hour = getPart("hour");
  const minute = getPart("minute");
  return { label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, minutes: hour * 60 + minute };
}

function byAppointmentTime(first: CrmRecord, second: CrmRecord): number {
  return `${String(first.date ?? "")} ${String(first.start_time ?? "")}`.localeCompare(`${String(second.date ?? "")} ${String(second.start_time ?? "")}`);
}

function scheduledEndMinutes(record: CrmRecord, startMinutes: number): number {
  const endTime = timeMinutes(record.end_time);
  if (endTime !== null && endTime > startMinutes) return endTime;

  const duration = Number(record.duration_minutes);
  if (Number.isFinite(duration) && duration > 0) {
    const roundedDuration = Math.round(duration);
    if (roundedDuration > 0) return startMinutes + roundedDuration;
  }

  // Match the 20-minute fallback already used by the appointment list card.
  return startMinutes + 20;
}

function isAppointmentInProgress(record: CrmRecord, currentMinutes: number): boolean {
  const startMinutes = timeMinutes(record.start_time);
  return appointmentStatus(record.status).kind === "confirmed"
    && startMinutes !== null
    && startMinutes <= currentMinutes
    && currentMinutes < scheduledEndMinutes(record, startMinutes);
}

function ErrorBlock({ state, label }: { state: DashboardHomeRequestState; label: string }) {
  return (
    <div className="request-error" role="alert">
      <span>לא הצלחנו לטעון את {label}.</span>
      <button type="button" onClick={state.onRetry}>נסי שוב</button>
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return <div className="request-loading" role="status" aria-busy="true"><Clock3 aria-hidden="true" />{label}</div>;
}

export function DashboardPage({
  data,
  actions,
  appointmentState,
  pendingState,
  inquiriesState,
  decisionNotice,
}: DashboardPageProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const [now, setNow] = useState(() => new Date());
  const today = getClinicDateKey(now);
  const [selectedDay, setSelectedDay] = useState(data.today);
  const [noShowFeedback, setNoShowFeedback] = useState<{ id: string; tone: "success" | "error"; message: string } | null>(null);
  const [noShowSaving, setNoShowSaving] = useState(false);
  const [noShowConfirmOpen, setNoShowConfirmOpen] = useState(false);
  const noShowLockRef = useRef<string | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const clock = clinicNowTime(now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => setSelectedDay(today), [today]);

  const activeAppointments = useMemo(
    () => data.appointments.filter(isActiveAppointment),
    [data.appointments],
  );
  const todaysAppointments = useMemo(
    () => activeAppointments.filter((record) => String(record.date ?? "") === today).sort(byAppointmentTime),
    [activeAppointments, today],
  );
  const nextAppointment = useMemo(() => {
    const inProgressAppointment = todaysAppointments.find((record) => isAppointmentInProgress(record, clock.minutes));
    if (inProgressAppointment) return inProgressAppointment;

    return todaysAppointments.find((record) => {
      const minutes = timeMinutes(record.start_time);
      return appointmentStatus(record.status).kind === "confirmed" && minutes !== null && minutes > clock.minutes;
    }) || null;
  }, [clock.minutes, todaysAppointments]);
  const nextAppointmentId = String(nextAppointment?.id ?? "");
  const pendingAppointments = useMemo(() => {
    const shouldHideQueued = decisionNotice && ["undo", "committing"].includes(decisionNotice.phase)
      ? decisionNotice.id
      : "";
    return data.pendingAppointments
      .filter((record) => {
        const status = appointmentStatus(record.status).kind;
        const id = String(record.id ?? "");
        return status === "requested"
          && String(record.date ?? "") >= today
          && !String(record.inbox_handled_at ?? "").trim()
          && (!shouldHideQueued || id !== shouldHideQueued);
      })
      .sort(byAppointmentTime);
  }, [data.pendingAppointments, decisionNotice, today]);
  const dayAppointments = useMemo(
    () => activeAppointments.filter((record) => String(record.date ?? "") === selectedDay).sort(byAppointmentTime),
    [activeAppointments, selectedDay],
  );
  const newInquiries = useMemo(
    () => data.inquiries.filter((record) => !String(record.inbox_handled_at ?? "").trim()),
    [data.inquiries],
  );
  const monthSummary = useMemo(
    () => summarizeDashboardAppointments(data.appointments, today),
    [data.appointments, today],
  );
  // Compare like with like: this month so far vs. the same days last month.
  const monthDelta = monthSummary.previousToDateCount > 0
    ? Math.round(((monthSummary.currentToDateCount - monthSummary.previousToDateCount) / monthSummary.previousToDateCount) * 100)
    : null;
  const decisionBusy = Boolean(decisionNotice && ["undo", "committing"].includes(decisionNotice.phase));
  const minutesUntilNext = nextAppointment ? (timeMinutes(nextAppointment.start_time) ?? clock.minutes) - clock.minutes : null;
  const nextAppointmentStartReached = minutesUntilNext !== null && minutesUntilNext <= 0;
  const nextAppointmentInProgress = nextAppointment ? isAppointmentInProgress(nextAppointment, clock.minutes) : false;
  const arrived = Boolean(String(nextAppointment?.arrived_at ?? "").trim());

  useEffect(() => {
    setNoShowConfirmOpen(false);
    setNoShowFeedback((current) => current?.tone === "error" && current.id !== nextAppointmentId ? null : current);
  }, [nextAppointmentId]);

  const handleMarkNoShow = async () => {
    if (!nextAppointment || !nextAppointmentId || !nextAppointmentStartReached || arrived || noShowLockRef.current === nextAppointmentId) return;
    const appointmentId = nextAppointmentId;
    noShowLockRef.current = appointmentId;
    setNoShowSaving(true);
    setNoShowFeedback(null);
    try {
      await actions.onMarkNoShow(nextAppointment);
      setNoShowConfirmOpen(false);
      setNoShowFeedback({ id: appointmentId, tone: "success", message: "התור סומן כ״לא הגיע/ה״ ונשאר ביומן." });
    } catch (error) {
      setNoShowFeedback({
        id: appointmentId,
        tone: "error",
        message: error instanceof Error ? error.message : "לא הצלחנו לשמור את סימון אי-ההגעה. נסי שוב.",
      });
    } finally {
      if (noShowLockRef.current === appointmentId) noShowLockRef.current = null;
      setNoShowSaving(false);
    }
  };

  const emptyNextMessage = todaysAppointments.length === 0
    ? "אין תורים היום"
    : todaysAppointments.some((record) => appointmentStatus(record.status).kind === "requested" && (timeMinutes(record.start_time) ?? -1) >= clock.minutes)
      ? "יש בקשת תור שממתינה לאישור, היא מופיעה בהמשך המסך."
      : todaysAppointments.some((record) => {
        const status = appointmentStatus(record.status).kind;
        return ["confirmed", "unknown"].includes(status) && (timeMinutes(record.start_time) ?? -1) >= clock.minutes;
      })
        ? "אין תור מאושר בהמשך היום"
        : "סיימת את התורים להיום";

  const renderPendingSection = pendingState.isLoading || Boolean(pendingState.error) || pendingAppointments.length > 0;

  return (
    <motion.div
      className="bn bn-home"
      dir="rtl"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <div className="wrap">
        <header className="hero-band">
          <div className="hdr">
            <button
              ref={profileButtonRef}
              type="button"
              className="av press"
              aria-label="האזור האישי שלי"
              aria-haspopup="dialog"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((open) => !open)}
            >
              <ProfileAvatar name={data.profile.fullName || data.profile.name} imageUrl={data.profile.imageUrl} className="h-full w-full" fallbackClassName="text-[14px]" imageWidth={96} />
            </button>
            <div className="t">
              <small>{formatDashboardDate(today, { weekday: "long", day: "numeric", month: "long" })}</small>
              <b>שלום, {data.profile.shortName}</b>
            </div>
            <button
              type="button"
              className="round settings press"
              aria-label="הגדרות"
              onClick={(event) => (actions.onOpenSettings ? actions.onOpenSettings() : actions.onOpenMore(event.currentTarget))}
            >
              <Settings aria-hidden="true" />
            </button>
          </div>

          <div className="hero-stats" aria-label="סיכום המרפאה">
            <button type="button" className="press" onClick={() => actions.onNavigate("calendar")}>
              <b className="ltr" dir="ltr">{appointmentState.isLoading || appointmentState.error ? "—" : formatCount(todaysAppointments.length)}</b>
              <span>תורים היום</span>
            </button>
            <button type="button" className="press" onClick={actions.onOpenSales}>
              <b className="ltr" dir="ltr">{appointmentState.isLoading || appointmentState.error ? "—" : formatCount(monthSummary.currentCount)}</b>
              <span>החודש{monthDelta !== null && <span className="trend" aria-label={`${monthDelta >= 0 ? "עלייה" : "ירידה"} של ${Math.abs(monthDelta)}% מול אותם ימים בחודש הקודם`}> · <em className={`ltr${monthDelta < 0 ? " down" : ""}`} dir="ltr">{monthDelta >= 0 ? "+" : "−"}{Math.abs(monthDelta)}%</em></span>}</span>
            </button>
            <button type="button" className="press" onClick={actions.onOpenInbox}>
              <b className="ltr" dir="ltr">{inquiriesState.isLoading || inquiriesState.error ? "—" : formatCount(newInquiries.length)}</b>
              <span>{newInquiries.length === 1 ? "פנייה חדשה" : "פניות חדשות"}</span>
            </button>
          </div>
        </header>

        {appointmentState.isLoading
          ? <div className="empty" role="status" aria-busy="true"><strong>התור הבא</strong><small>טוענים את לוח התורים...</small></div>
          : appointmentState.error
            ? <ErrorBlock state={appointmentState} label="התורים" />
            : nextAppointment
              ? (
                <section className="next" aria-label={nextAppointmentInProgress ? "התור הנוכחי" : "התור הבא"}>
                  <span className="lbl">{nextAppointmentInProgress ? "התור הנוכחי" : "התור הבא"} · <span className="ltr" dir="ltr">{String(nextAppointment.start_time ?? "").slice(0, 5)}</span></span>
                  <span className="who" dir="auto">{String(nextAppointment.client_name ?? "שם הלקוח לא צוין")}{nextAppointment.pet_name ? ` · ${String(nextAppointment.pet_name)}` : ""}</span>
                  <span className="what">{String(nextAppointment.appointment_type ?? "סוג טיפול לא צוין")}<span className="what-time"> · <TimeRange start={nextAppointment.start_time} end={nextAppointment.end_time} /></span></span>
                  <div className="cd" aria-label={nextAppointmentInProgress ? "התור הנוכחי מתנהל כעת" : minutesUntilNext !== null && minutesUntilNext < 60 ? `עוד ${Math.max(0, minutesUntilNext)} דקות` : `בשעה ${String(nextAppointment.start_time ?? "").slice(0, 5)}`}>
                    {nextAppointmentInProgress
                      ? <span>מתנהל כעת</span>
                      : minutesUntilNext !== null && minutesUntilNext < 60
                        ? <span>בעוד {Math.max(0, minutesUntilNext)} דק׳</span>
                        : <span>היום</span>}
                  </div>
                  <div className="bar">
                    <a href={nextAppointment.phone ? `tel:${String(nextAppointment.phone).trim()}` : undefined} aria-disabled={!nextAppointment.phone} tabIndex={nextAppointment.phone ? 0 : -1}>
                      <Phone aria-hidden="true" />התקשרות
                    </a>
                    {arrived
                      ? <button type="button" className="gold" disabled aria-label="ההגעה כבר סומנה">
                        <Check aria-hidden="true" />הגיע/ה ✓
                      </button>
                      : <button
                        type="button"
                        className="gold"
                        onClick={() => {
                          if (!nextAppointmentStartReached) return;
                          setNoShowConfirmOpen(true);
                          setNoShowFeedback(null);
                        }}
                        disabled={!nextAppointmentStartReached || noShowSaving}
                        aria-label={nextAppointmentStartReached ? (nextAppointmentInProgress ? "פתיחת אישור לסימון אי-הגעה לתור הנוכחי" : "פתיחת אישור לסימון אי-הגעה לתור הבא") : `סימון אי-הגעה יהיה זמין החל משעה ${String(nextAppointment.start_time ?? "").slice(0, 5)}`}
                        aria-describedby={!nextAppointmentStartReached ? "no-show-availability-note" : undefined}
                        style={!nextAppointmentStartReached ? { opacity: 0.52, cursor: "not-allowed" } : undefined}
                      >
                        <XCircle aria-hidden="true" />
                        {noShowSaving ? "שומרת..." : "לא הגיע/ה"}
                      </button>}
                  </div>
                  {!nextAppointmentStartReached && !arrived && <p id="no-show-availability-note" className="col-span-full mt-1 px-1 text-xs font-semibold leading-5 text-[#686B73]" role="status">
                    אפשר לסמן ״לא הגיע/ה״ החל משעה <span className="ltr" dir="ltr">{String(nextAppointment.start_time ?? "").slice(0, 5)}</span>.
                  </p>}
                  {noShowConfirmOpen && !arrived && nextAppointmentStartReached && <div role="group" aria-labelledby="mobile-no-show-confirm-title" className="mt-3 rounded-2xl border border-[#E7B68E] bg-[#FFF8F3] p-3 text-xs font-bold leading-5 text-[#934D1E]">
                    <p id="mobile-no-show-confirm-title">לסמן את התור כ״לא הגיע/ה״? התור יישאר ביומן, ואפשר לתקן את הסימון מפרטי התור.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void handleMarkNoShow()} disabled={noShowSaving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#934D1E] px-3 text-xs font-black text-white transition hover:bg-[#7E3D16] focus:outline-none focus:ring-2 focus:ring-[#934D1E]/30 disabled:cursor-wait disabled:opacity-60">
                        {noShowSaving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <XCircle className="h-4 w-4" />}
                        {noShowSaving ? "שומרת..." : "אישור, לא הגיע/ה"}
                      </button>
                      <button type="button" onClick={() => setNoShowConfirmOpen(false)} disabled={noShowSaving} className="min-h-10 rounded-xl border border-[#E7B68E] bg-white px-3 text-xs font-extrabold text-[#934D1E] transition hover:bg-[#FFF1E6] focus:outline-none focus:ring-2 focus:ring-[#934D1E]/30 disabled:cursor-not-allowed disabled:opacity-60">חזרה</button>
                    </div>
                  </div>}
                </section>
              )
              : <div className="empty"><strong>{emptyNextMessage}</strong></div>}

        {noShowFeedback && <p className={`arrival-feedback ${noShowFeedback.tone}`} role={noShowFeedback.tone === "error" ? "alert" : "status"}>{noShowFeedback.message}</p>}

        {renderPendingSection && (
          <section className="reqs" aria-label="תורים שממתינים לאישור">
            <h3>ממתינים לאישור <em>{pendingState.isLoading || pendingState.error ? "—" : formatCount(pendingAppointments.length)}</em></h3>
            {pendingState.isLoading
              ? <LoadingBlock label="טוענים בקשות שממתינות לאישור" />
              : pendingState.error
                ? <ErrorBlock state={pendingState} label="הבקשות לאישור" />
                : pendingAppointments.length === 0
                  ? <p className="request-loading">אין תורים שממתינים לאישור</p>
                  : <>
                    {pendingAppointments.slice(0, 3).map((record, index) => {
                      const id = String(record.id ?? `${record.date}-${record.start_time}-${index}`);
                      const name = String(record.client_name ?? "").trim() || "שם הלקוח לא צוין";
                      const date = String(record.date ?? "");
                      const time = String(record.start_time ?? "").slice(0, 5);
                      const description = [String(record.pet_name ?? "").trim(), String(record.appointment_type ?? "").trim(), [clinicShortDate(date, today), time].filter(Boolean).join(" · ")].filter(Boolean).join(" · ");
                      return (
                        <div className="rq" key={id}>
                          <div className="b">
                            <div className="n" dir="auto">{name}</div>
                            <div className="m">{description || "בקשת תור ללא פרטים נוספים"}</div>
                          </div>
                          <button type="button" className="no press" aria-label={`דחיית התור של ${name}`} disabled={decisionBusy} onClick={() => actions.onScheduleDecision(record, "reject")}><span className="sr-only">דחייה</span><span aria-hidden="true">×</span></button>
                          <button type="button" className="yes press" disabled={decisionBusy} onClick={() => actions.onScheduleDecision(record, "approve")}>אישור</button>
                        </div>
                      );
                    })}
                    {pendingAppointments.length > 3 && (
                      <button type="button" className="more-requests press" onClick={actions.onOpenInbox}>
                        עוד {formatCount(pendingAppointments.length - 3)} בקשות <ArrowLeft aria-hidden="true" />
                      </button>
                    )}
                  </>}
          </section>
        )}

        <div className="sec">
          <h2>השבוע</h2>
          <button type="button" onClick={() => actions.onNavigate("calendar")}>ליומן <ArrowLeft aria-hidden="true" /></button>
        </div>
        <WeekStrip appointments={activeAppointments} value={selectedDay} today={today} onChange={setSelectedDay} />

        <div className="sec">
          <h2>{formatDashboardDate(selectedDay, { weekday: "long", day: "numeric", month: "long" })}</h2>
          {dayAppointments.length > 0 && <span className="day-count">{plural(dayAppointments.length, "תור", "תורים")}</span>}
        </div>

        {appointmentState.isLoading
          ? <LoadingBlock label="טוענים תורים ליום שנבחר" />
          : appointmentState.error
            ? <ErrorBlock state={appointmentState} label="התורים ליום שנבחר" />
            : dayAppointments.length === 0
              ? <div className="empty">אין תורים ביום הזה</div>
              : <div className="home-list">
                {dayAppointments.map((record, index) => (
                  <AppointmentCard key={String(record.id ?? `${record.date}-${record.start_time}-${index}`)} appointment={record} onOpen={actions.onOpenAppointment} />
                ))}
              </div>}
      </div>

      {profileOpen && typeof document !== "undefined" && createPortal(
        <CrmProfileMenu
          isOpen
          anchorRef={profileButtonRef}
          profile={{ fullName: data.profile.fullName || "", email: data.profile.email || "", imageUrl: data.profile.imageUrl }}
          onClose={(restoreFocus = true) => {
            setProfileOpen(false);
            if (restoreFocus) window.requestAnimationFrame(() => profileButtonRef.current?.focus());
          }}
          onProfileUpdated={(updates) => actions.onProfileUpdated?.(updates)}
        />,
        document.body,
      )}
    </motion.div>
  );
}

// 96px per hour: a 20-minute visit is 32px tall, so back-to-back visits sit in one column.
const CALENDAR_HOUR_HEIGHT = 96;
const CALENDAR_EVENT_MIN_HEIGHT = 44;

function calendarClockLabel(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function appointmentDurationMinutes(record: CrmRecord): number {
  const startMinutes = timeMinutes(record.start_time);
  const endMinutes = timeMinutes(record.end_time);
  if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) return endMinutes - startMinutes;
  const storedDuration = Number(record.duration_minutes);
  if (Number.isFinite(storedDuration) && storedDuration > 0) return Math.round(storedDuration);
  return startMinutes === null ? 0 : 20;
}

interface CalendarTimelineEvent {
  record: CrmRecord;
  startMinutes: number;
  endMinutes: number;
  visualEndMinutes: number;
  lane: number;
  lanes: number;
}

function arrangeCalendarTimeline(records: CrmRecord[]): CalendarTimelineEvent[] {
  const minimumVisualMinutes = Math.ceil((CALENDAR_EVENT_MIN_HEIGHT / CALENDAR_HOUR_HEIGHT) * 60);
  const events = records.flatMap((record): CalendarTimelineEvent[] => {
    const startMinutes = timeMinutes(record.start_time);
    if (startMinutes === null) return [];
    const endMinutes = Math.max(startMinutes + 1, Math.min(1440, scheduledEndMinutes(record, startMinutes)));
    const visualEndMinutes = Math.min(1440, startMinutes + Math.max(endMinutes - startMinutes, minimumVisualMinutes));
    return [{ record, startMinutes, endMinutes, visualEndMinutes, lane: 0, lanes: 1 }];
  }).sort((first, second) => first.startMinutes - second.startMinutes || byAppointmentTime(first.record, second.record));

  const clusters: Array<{ events: CalendarTimelineEvent[]; endMinutes: number }> = [];
  events.forEach((event) => {
    const cluster = clusters[clusters.length - 1];
    if (!cluster || event.startMinutes >= cluster.endMinutes) {
      clusters.push({ events: [event], endMinutes: event.visualEndMinutes });
      return;
    }
    cluster.events.push(event);
    cluster.endMinutes = Math.max(cluster.endMinutes, event.visualEndMinutes);
  });

  clusters.forEach((cluster) => {
    const laneEndMinutes: number[] = [];
    cluster.events.forEach((event) => {
      let lane = laneEndMinutes.findIndex((endMinutes) => endMinutes <= event.startMinutes);
      if (lane < 0) {
        lane = laneEndMinutes.length;
        laneEndMinutes.push(event.visualEndMinutes);
      } else {
        laneEndMinutes[lane] = event.visualEndMinutes;
      }
      event.lane = lane;
    });
    cluster.events.forEach((event) => { event.lanes = laneEndMinutes.length; });
  });

  return events;
}

export interface CalendarPageData {
  appointments: CrmRecord[];
  allAppointments: CrmRecord[];
  selectedDate: Date;
  now: Date;
  search: string;
  visibleServiceCount: number;
  visibleServiceIds: Set<string>;
}

export interface CalendarPageActions {
  onNewAppointment: () => void;
  onOpenAppointment: (record: CrmRecord) => void;
  onSelectDate: (date: Date) => void;
  onOpenAgenda: () => void;
  onOpenDay: () => void;
  onOpenBlock: () => void;
  onSearchChange: (value: string) => void;
}

export function CalendarPage({
  data,
  actions,
  agendaMode,
  agendaContent,
  statusNotice,
  statusContent,
}: {
  data: CalendarPageData;
  actions: CalendarPageActions;
  agendaMode: boolean;
  agendaContent?: ReactNode;
  statusNotice?: ReactNode;
  statusContent?: ReactNode;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const today = getClinicDateKey(data.now);
  const selectedDay = format(data.selectedDate, "yyyy-MM-dd");
  const selectedDateLabel = formatDashboardDate(selectedDay, { weekday: "long", day: "numeric", month: "long" });
  const clock = clinicNowTime(data.now);
  const isSelectedDayToday = selectedDay === today;
  const isFiltered = Boolean(data.search.trim()) || data.visibleServiceIds.size < data.visibleServiceCount;

  const dayAppointments = useMemo(
    () => data.appointments
      .filter((record) => String(record.date ?? "") === selectedDay && isActiveAppointment(record))
      .sort(byAppointmentTime),
    [data.appointments, selectedDay],
  );
  const allDayAppointments = useMemo(
    () => data.allAppointments.filter((record) => String(record.date ?? "") === selectedDay && isActiveAppointment(record)),
    [data.allAppointments, selectedDay],
  );
  const timedAppointments = useMemo(
    () => arrangeCalendarTimeline(dayAppointments),
    [dayAppointments],
  );
  const appointmentsWithoutTime = useMemo(
    () => dayAppointments.filter((record) => timeMinutes(record.start_time) === null),
    [dayAppointments],
  );
  const totalMinutes = dayAppointments.reduce((total, record) => total + appointmentDurationMinutes(record), 0);
  const pendingCount = dayAppointments.filter((record) => appointmentStatus(record.status).kind === "requested").length;
  const durationHours = Math.floor(totalMinutes / 60);
  const durationRemainder = totalMinutes % 60;
  const durationLabel = durationHours > 0
    ? `${durationHours}:${String(durationRemainder).padStart(2, "0")} שע׳`
    : `${formatCount(durationRemainder)} דק׳`;

  // The timeline hugs the day's appointments: one hour of air before the first and after the last,
  // never less than four hours tall. "Now" is drawn only when it falls inside that window.
  const timelineBounds = useMemo(() => {
    if (timedAppointments.length === 0) return { startHour: 8, endHour: 20 };
    const firstMinute = Math.min(...timedAppointments.map((event) => event.startMinutes));
    const lastMinute = Math.max(...timedAppointments.map((event) => event.visualEndMinutes));
    let startHour = Math.max(0, Math.floor(firstMinute / 60) - 1);
    let endHour = Math.min(24, Math.ceil(lastMinute / 60) + 1);
    if (endHour - startHour < 4) {
      endHour = Math.min(24, startHour + 4);
      startHour = Math.max(0, endHour - 4);
    }
    return { startHour, endHour };
  }, [timedAppointments]);

  const hourCount = timelineBounds.endHour - timelineBounds.startHour;
  const timelineHeight = hourCount * CALENDAR_HOUR_HEIGHT;
  const hours = Array.from({ length: hourCount + 1 }, (_, index) => timelineBounds.startHour + index);
  const nowOffset = (clock.minutes - timelineBounds.startHour * 60) * (CALENDAR_HOUR_HEIGHT / 60);
  const showNowLine = isSelectedDayToday && nowOffset >= 0 && nowOffset <= timelineHeight;
  const noVisibleAppointments = dayAppointments.length === 0;
  const hasUnfilteredAppointments = allDayAppointments.length > 0;

  const statusToneClass = (record: CrmRecord) => {
    const status = appointmentStatus(record.status);
    const kindClass = status.kind === "no_show" ? "no-show" : status.kind;
    return { status, kindClass };
  };

  return (
    <motion.div
      className="bn bn-calendar"
      dir="rtl"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <div className="wrap">
        <header className="calendar-header">
          <div className="calendar-heading">
            <span className="calendar-heading-icon"><CalendarDays aria-hidden="true" /></span>
            <div>
              <small>ניהול המרפאה</small>
              <h1>יומן</h1>
            </div>
          </div>
          <div className="calendar-header-actions">
            <button type="button" className="calendar-action secondary" onClick={actions.onOpenBlock} aria-label="סגירת חלון זמן ביומן">
              <CalendarDays aria-hidden="true" /><span>סגירת זמן</span>
            </button>
            <button
              type="button"
              className="calendar-action primary"
              onClick={agendaMode ? actions.onOpenDay : actions.onOpenAgenda}
              aria-label={agendaMode ? "חזרה לתצוגת היום" : "פתיחת רשימת היומן המלאה"}
            >
              {agendaMode ? <CalendarDays aria-hidden="true" /> : <List aria-hidden="true" />}
              <span>{agendaMode ? "לוח יום" : "לרשימה"}</span>
              <ArrowLeft aria-hidden="true" />
            </button>
          </div>
        </header>

        {statusNotice && <div className="calendar-status-notice">{statusNotice}</div>}

        {statusContent ? (
          <div className="calendar-state-content">{statusContent}</div>
        ) : (
          <>
            <section className="calendar-timeline-view" hidden={agendaMode} aria-label="תצוגת לוח יום">
              <div className="calendar-day-strip-label">
                <span>בחירת יום</span>
                <span className="calendar-strip-hint">6 ימי עבודה</span>
              </div>
              <WeekStrip appointments={data.appointments} value={selectedDay} today={today} onChange={(dateKey) => {
                const date = new Date(`${dateKey}T12:00:00`);
                actions.onSelectDate(date);
              }} />

              <section className="daysum" aria-label={`סיכום התורים ל${selectedDateLabel}`}>
                <div className="daysum-heading">
                  <span>סיכום יום</span>
                  <h2>{selectedDateLabel}</h2>
                </div>
                <div className="daysum-metrics">
                  <div className="daysum-metric">
                    <b>{formatCount(dayAppointments.length)}</b>
                    <span>{dayAppointments.length === 1 ? "תור" : "תורים"}</span>
                  </div>
                  <div className="daysum-metric">
                    <b>{durationLabel}</b>
                    <span>זמן מתוכנן</span>
                  </div>
                  <div className="daysum-metric pending">
                    <b>{formatCount(pendingCount)}</b>
                    <span>ממתינים</span>
                  </div>
                </div>
              </section>

              {isFiltered && (
                <div className="calendar-filter-note" role="status">
                  <span>{data.search.trim() ? `חיפוש פעיל: ${data.search.trim()}` : "השירותים ביומן מסוננים"}</span>
                  <button type="button" onClick={actions.onOpenAgenda}>ניהול סינון <ArrowLeft aria-hidden="true" /></button>
                </div>
              )}

              <section className="calendar-timeline-card" aria-label={`לוח שעות ליום ${selectedDateLabel}`}>
                <div className="calendar-timeline-heading">
                  <div>
                    <h2>לוח התורים</h2>
                    <p>{dayAppointments.length === 0 ? "יום שקט ביומן" : `${formatCount(dayAppointments.length)} ${dayAppointments.length === 1 ? "תור מתוכנן" : "תורים מתוכננים"}`}</p>
                  </div>
                  <span className="timeline-legend"><i aria-hidden="true" />טווח שעות</span>
                </div>

                {noVisibleAppointments && !hasUnfilteredAppointments ? (
                  <div className="calendar-empty-state">
                    <span className="calendar-empty-icon"><CalendarDays aria-hidden="true" /></span>
                    <strong>אין תורים מתוכננים ליום הזה</strong>
                    <p>אפשר לעבור ליום אחר, לפתוח את הרשימה המלאה או לקבוע תור חדש.</p>
                    <button type="button" onClick={actions.onNewAppointment}><Plus aria-hidden="true" />קביעת תור</button>
                  </div>
                ) : noVisibleAppointments ? (
                  <div className="calendar-empty-state filtered">
                    <span className="calendar-empty-icon"><Search aria-hidden="true" /></span>
                    <strong>אין תורים לפי הסינון הפעיל</strong>
                    <p>התורים עדיין ביומן. אפשר לעדכן את החיפוש והשירותים בתצוגת הרשימה.</p>
                    <button type="button" onClick={actions.onOpenAgenda}><List aria-hidden="true" />פתיחת הרשימה</button>
                  </div>
                ) : (
                  <>
                    <div className="calendar-timeline-scroll" aria-label="ציר שעות היום">
                      <div className="calendar-timeline-layout" style={{ "--calendar-hour-height": `${CALENDAR_HOUR_HEIGHT}px` } as CSSProperties}>
                        <div className="calendar-time-rail" aria-hidden="true" style={{ height: `${timelineHeight}px` }}>
                          {hours.map((hour, index) => <span className="hour-label ltr" dir="ltr" key={hour} style={{ top: `${index * CALENDAR_HOUR_HEIGHT}px` }}>{String(hour).padStart(2, "0")}:00</span>)}
                          {showNowLine && <time className="now-label ltr" dir="ltr" style={{ top: `${nowOffset}px` }}>{clock.label}</time>}
                        </div>
                        <div className="tl" style={{ height: `${timelineHeight}px` }} role="list" aria-label="תורים לפי שעה">
                          {hours.map((hour, index) => <div className="hr" key={hour} style={{ top: `${index * CALENDAR_HOUR_HEIGHT}px` }} aria-hidden="true" />)}
                          {timedAppointments.map((event) => {
                            const { status, kindClass } = statusToneClass(event.record);
                            const clientName = String(event.record.client_name ?? "").trim() || "שם הלקוח לא צוין";
                            const details = [String(event.record.pet_name ?? "").trim(), String(event.record.appointment_type ?? "").trim()].filter(Boolean).join(" · ") || "פרטים לא צוינו";
                            const top = Math.max(0, (event.startMinutes - timelineBounds.startHour * 60) * (CALENDAR_HOUR_HEIGHT / 60));
                            const height = Math.max(CALENDAR_EVENT_MIN_HEIGHT, (event.endMinutes - event.startMinutes) * (CALENDAR_HOUR_HEIGHT / 60));
                            const laneWidth = 100 / event.lanes;
                            const endLabel = calendarClockLabel(event.endMinutes);
                            return (
                              <button
                                type="button"
                                role="listitem"
                                key={String(event.record.id ?? `${event.record.date}-${event.record.start_time}-${clientName}`)}
                                className={`ev ${kindClass}${height < 64 ? " is-compact" : ""}`}
                                style={{
                                  top: `${top}px`,
                                  height: `${height}px`,
                                  width: `calc(${laneWidth}% - 4px)`,
                                  insetInlineStart: `calc(${event.lane * laneWidth}% + 2px)`,
                                }}
                                onClick={() => actions.onOpenAppointment(event.record)}
                                aria-label={`פתיחת פרטי התור של ${clientName}, ${String(event.record.pet_name ?? "").trim()}, ${event.record.start_time ? `${String(event.record.start_time).slice(0, 5)} עד ${endLabel}` : "שעה לא צוינה"}, ${status.label}`}
                              >
                                <span className="ev-top">
                                  <span className="ev-time"><TimeRange start={event.record.start_time} end={endLabel} /></span>
                                  <span className={`ev-status ${status.tone}`}>{status.label}</span>
                                </span>
                                <b className="ev-client" dir="auto">{clientName}</b>
                                <span className="ev-details"><PawPrint aria-hidden="true" />{details}</span>
                              </button>
                            );
                          })}
                          {showNowLine && (
                            <div className="now" style={{ top: `${nowOffset}px` }} role="note" aria-label={`השעה עכשיו ${clock.label}`} />
                          )}
                        </div>
                      </div>
                    </div>
                    {appointmentsWithoutTime.length > 0 && (
                      <div className="calendar-unplaced-list" aria-label="תורים ללא שעת התחלה">
                        <h3>תורים ללא שעה מצוינת</h3>
                        {appointmentsWithoutTime.map((record, index) => {
                          const { status, kindClass } = statusToneClass(record);
                          const clientName = String(record.client_name ?? "").trim() || "שם הלקוח לא צוין";
                          const details = [String(record.pet_name ?? "").trim(), String(record.appointment_type ?? "").trim()].filter(Boolean).join(" · ") || "פרטים לא צוינו";
                          return <button type="button" className={`calendar-unplaced ${kindClass}`} key={String(record.id ?? `${selectedDay}-untimed-${index}`)} onClick={() => actions.onOpenAppointment(record)}><span className="unplaced-time">שעה לא צוינה</span><span className="unplaced-info"><b dir="auto">{clientName}</b><small>{details}</small></span><span className={`ev-status ${status.tone}`}>{status.label}</span></button>;
                        })}
                      </div>
                    )}
                  </>
                )}
              </section>
            </section>

            <section className="calendar-agenda-view" hidden={!agendaMode} aria-label="רשימת היומן המלאה">
              <label className="calendar-agenda-search">
                <Search aria-hidden="true" />
                <span className="sr-only">חיפוש תורים, לקוחות וחיות מחמד</span>
                <input type="search" value={data.search} onChange={(event) => actions.onSearchChange(event.target.value)} placeholder="חיפוש לקוח, חיית מחמד או שירות" dir="rtl" />
                {data.search && <button type="button" onClick={() => actions.onSearchChange("")} aria-label="ניקוי החיפוש"><X aria-hidden="true" /></button>}
              </label>
              <p className="calendar-agenda-hint">הרשימה כוללת תורים, אירועי Google וסגירות זמן.</p>
              <div className="calendar-agenda-content">{agendaContent}</div>
            </section>
          </>
        )}
      </div>

    </motion.div>
  );
}
