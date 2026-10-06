import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { format, isSameDay } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarDays, Clock3, PawPrint, LockKeyhole } from "lucide-react";
import type { CalendarBusyInterval, GoogleCalendarEvent } from "@/lib/adminAppointmentAvailability";
import type { CrmRecord } from "@/components/business-crm/CrmContext";
import { appointmentDateKey, appointmentEndMinutes, appointmentStartMinutes, appointmentStatusTone, CALENDAR_WEEKDAYS, dateKey, isInMonth, isPastCalendarMoment, isToday, monthGridDates, serviceColor, serviceIdForRecord, statusLabel, text, timeToMinutes, visibleDates, type CalendarMode } from "@/lib/crmCalendar";

const HOUR_HEIGHT = 72;
const VISIBLE_START_HOUR = 7;
const VISIBLE_END_HOUR = 22;
const VISIBLE_HOUR_COUNT = VISIBLE_END_HOUR - VISIBLE_START_HOUR;
const VISIBLE_START_MINUTES = VISIBLE_START_HOUR * 60;
const VISIBLE_END_MINUTES = VISIBLE_END_HOUR * 60;
const ALL_DAY_HEIGHT = 86;
const ALL_DAY_EVENT_HEIGHT = 26;
const ALL_DAY_EVENT_GAP = 3;
const DAY_HEIGHT = ALL_DAY_HEIGHT + HOUR_HEIGHT * VISIBLE_HOUR_COUNT;
const LANE_GAP_PX = 4;
const TIME_GUTTER_WIDTH_PX = 58;
const MULTI_DAY_COLUMN_MIN_WIDTH_PX = 190;
const SINGLE_DAY_COLUMN_MIN_WIDTH_PX = 420;
const GOOGLE_EVENT_COLOR = "#5267A8";
const GOOGLE_EVENT_BACKGROUND = "#EAF0FF";
const GOOGLE_EVENT_LABEL = "אירוע Google Calendar";
const GOOGLE_ALL_DAY_LABEL = "כל היום";

export interface CalendarBlockDisplay {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason?: string;
}

type Service = { id: string; label: string; duration: number };
interface CalendarGridProps {
  mode: CalendarMode;
  selectedDate: Date;
  monthDate: Date;
  appointments: CrmRecord[];
  calendarBusy: CalendarBusyInterval[];
  googleEvents: GoogleCalendarEvent[];
  calendarBlocks: CalendarBlockDisplay[];
  services: Service[];
  now: Date;
  onSelectDate: (date: Date) => void;
  onSelectSlot: (date: Date, time: string) => void;
  onSelectAppointment: (record: CrmRecord) => void;
}
interface PositionedAppointment {
  record: CrmRecord;
  service: Service | undefined;
  start: number;
  end: number;
  lane: number;
  laneCount: number;
  originalIndex: number;
}
interface PositionedGoogleEvent {
  event: GoogleCalendarEvent;
  start: number;
  end: number;
  lane: number;
  laneCount: number;
  originalIndex: number;
}
interface PositionedCalendarBlock {
  block: CalendarBlockDisplay;
  start: number;
  end: number;
}

function recordKey(record: CrmRecord, index: number) {
  return String(record.id || `${record.date}-${record.start_time}-${record.client_name}-${index}`);
}

function googleEventKey(event: GoogleCalendarEvent, index: number) {
  return `${text(event.id) || "google-event"}-${text(event.date)}-${index}`;
}

function statusClass(tone: ReturnType<typeof appointmentStatusTone>) {
  if (tone === "no_show") return "bg-[#FFF1E6] text-[#934D1E]";
  if (tone === "completed") return "bg-[#EEF0F3] text-slate-600";
  if (tone === "requested") return "border border-dashed border-[#B88C15] bg-transparent text-[#80620B]";
  return "bg-white text-slate-500";
}

function appointmentDisplay(record: CrmRecord, service: Service | undefined) {
  const clientName = text(record.client_name) || "לקוח ללא שם";
  const serviceLabel = service?.label || text(record.appointment_type) || "סוג טיפול לא צוין";
  const petName = text(record.pet_name);
  const startTime = text(record.start_time).slice(0, 5);
  const endTime = text(record.end_time).slice(0, 5);
  const timeLabel = endTime && startTime ? `${startTime}–${endTime}` : startTime || endTime || "שעה לא צוינה";
  const accessibilityLabel = `תור של ${clientName}, ${serviceLabel}, בשעה ${timeLabel}${petName ? `, חיית המחמד ${petName}` : ""}`;
  return { clientName, serviceLabel, petName, timeLabel, accessibilityLabel };
}

function appointmentRange(record: CrmRecord, service: Service | undefined) {
  const rawStart = appointmentStartMinutes(record);
  const start = Number.isFinite(rawStart) ? Math.min(1439, Math.max(0, rawStart)) : 0;
  const rawEnd = appointmentEndMinutes(record, service?.duration || 30);
  const fallbackEnd = Math.min(1440, start + 1);
  const boundedEnd = Number.isFinite(rawEnd) ? Math.min(1440, Math.max(0, rawEnd)) : fallbackEnd;
  const end = boundedEnd > start ? boundedEnd : fallbackEnd;
  return { start, end: end > start ? end : start + 1 };
}

function buildAppointmentLayout(records: CrmRecord[], services: Service[]): PositionedAppointment[] {
  const sorted = records
    .map<PositionedAppointment>((record, originalIndex) => {
      const service = services.find((item) => item.id === serviceIdForRecord(record, services));
      const { start, end } = appointmentRange(record, service);
      return { record, service, start, end, lane: 0, laneCount: 1, originalIndex };
    })
    .sort((left, right) => left.start - right.start || left.end - right.end || left.originalIndex - right.originalIndex);
  const positioned: PositionedAppointment[] = [];
  let cluster: PositionedAppointment[] = [];
  let clusterEnd = -Infinity;
  const flushCluster = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    cluster.forEach((item) => {
      const availableLane = laneEnds.findIndex((laneEnd) => laneEnd <= item.start);
      const lane = availableLane === -1 ? laneEnds.length : availableLane;
      laneEnds[lane] = item.end;
      item.lane = lane;
    });
    const laneCount = Math.max(1, laneEnds.length);
    cluster.forEach((item) => {
      item.laneCount = laneCount;
      positioned.push(item);
    });
    cluster = [];
    clusterEnd = -Infinity;
  };
  sorted.forEach((item) => {
    if (cluster.length > 0 && item.start >= clusterEnd) flushCluster();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  });
  flushCluster();
  return positioned.sort((left, right) => left.start - right.start || left.originalIndex - right.originalIndex);
}

function clipAppointmentsToVisibleWindow(items: PositionedAppointment[]): PositionedAppointment[] {
  return items.flatMap((item) => {
    const start = Math.max(item.start, VISIBLE_START_MINUTES);
    const end = Math.min(item.end, VISIBLE_END_MINUTES);
    return end > start ? [{ ...item, start, end }] : [];
  });
}

function calendarBlockRange(block: CalendarBlockDisplay) {
  const rawStart = timeToMinutes(block.start_time);
  const rawEnd = timeToMinutes(block.end_time);
  const start = Number.isFinite(rawStart) ? Math.min(1439, Math.max(0, rawStart)) : 0;
  const boundedEnd = Number.isFinite(rawEnd) ? Math.min(1440, Math.max(0, rawEnd)) : start + 1;
  const end = boundedEnd > start ? boundedEnd : Math.min(1440, start + 1);
  return { start, end: end > start ? end : start + 1 };
}

function calendarBlocksForDate(calendarBlocks: CalendarBlockDisplay[], date: Date) {
  const target = dateKey(date);
  return (Array.isArray(calendarBlocks) ? calendarBlocks : []).filter((block) => block && block.date === target);
}

function clipCalendarBlocksToVisibleWindow(blocks: CalendarBlockDisplay[]): PositionedCalendarBlock[] {
  return blocks.flatMap((block) => {
    const range = calendarBlockRange(block);
    const start = Math.max(range.start, VISIBLE_START_MINUTES);
    const end = Math.min(range.end, VISIBLE_END_MINUTES);
    return end > start ? [{ block, start, end }] : [];
  });
}

function calendarBlockLabel(block: CalendarBlockDisplay) {
  const timeLabel = `${text(block.start_time).slice(0, 5)}–${text(block.end_time).slice(0, 5)}`;
  const reason = text(block.reason);
  return `סגירת חלון זמן, ${timeLabel}${reason ? `, ${reason}` : ""}`;
}

function laneStyle(lane: number, laneCount: number) {
  const safeLaneCount = Math.max(1, laneCount);
  const safeLane = Math.min(Math.max(0, lane), safeLaneCount - 1);
  const leftPercent = ((safeLaneCount - safeLane - 1) / safeLaneCount) * 100;
  const rightPercent = (safeLane / safeLaneCount) * 100;
  return {
    left: `calc(${leftPercent}% + ${LANE_GAP_PX / 2}px)`,
    right: `calc(${rightPercent}% + ${LANE_GAP_PX / 2}px)`,
  };
}

interface GoogleHoverState {
  title: string;
  timeLabel: string;
  left: number;
  top: number;
}

function googleHoverStateAtPoint(container: HTMLElement, clientX: number, clientY: number): GoogleHoverState | null {
  const pointerTarget = document.elementFromPoint(clientX, clientY);
  if (pointerTarget?.closest("[data-calendar-appointment], [data-calendar-block]")) return null;
  const containerRect = container.getBoundingClientRect();
  const isPointInside = (rect: DOMRect) => clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  const isCoveredByBlock = Array.from(container.querySelectorAll<HTMLElement>("[data-calendar-block]"))
    .some((element) => isPointInside(element.getBoundingClientRect()));
  if (isCoveredByBlock) return null;
  const eventElement = [...container.querySelectorAll<HTMLElement>("[data-calendar-google-event]")]
    .reverse()
    .find((element) => isPointInside(element.getBoundingClientRect()));
  const title = eventElement?.dataset.calendarGoogleTitle;
  const timeLabel = eventElement?.dataset.calendarGoogleTime;
  if (!title || !timeLabel) return null;
  const pointerX = clientX - containerRect.left;
  const pointerY = clientY - containerRect.top;
  const tooltipWidth = Math.min(300, Math.max(140, containerRect.width - 16));
  const left = Math.min(Math.max(8, pointerX + 12), Math.max(8, containerRect.width - tooltipWidth - 8));
  const estimatedHeight = 92;
  const top = pointerY > containerRect.height - estimatedHeight - 16
    ? Math.max(8, pointerY - estimatedHeight - 12)
    : Math.min(pointerY + 12, Math.max(8, containerRect.height - estimatedHeight - 8));
  return { title, timeLabel, left, top };
}

function EventBlock({ record, service, start, end, lane, laneCount, onClick }: { record: CrmRecord; service: Service | undefined; start: number; end: number; lane: number; laneCount: number; onClick: () => void }) {
  const color = serviceColor(service?.id || "other");
  const tone = appointmentStatusTone(record.status);
  const noShow = tone === "no_show";
  const requested = tone === "requested";
  const { clientName, serviceLabel, petName, timeLabel, accessibilityLabel } = appointmentDisplay(record, service);
  const appointmentLabel = requested ? `${accessibilityLabel}, ממתין להחלטה` : noShow ? `${accessibilityLabel}, לא הגיע` : accessibilityLabel;
  const blockHeight = Math.max(1, ((end - start) / 60) * HOUR_HEIGHT);
  const singleLine = blockHeight < 28;
  const showDetails = blockHeight >= 46;
  const position = laneStyle(lane, laneCount);
  return <button data-calendar-appointment="true" dir="rtl" type="button" className={`absolute z-10 box-border min-w-0 max-w-full overflow-hidden rounded-lg text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#1A1A3E] ${requested ? "border border-r-4" : "border-r-4"} ${singleLine ? "px-1 py-0" : "px-1.5 py-0.5"} ${noShow ? "border-dashed" : ""}`} style={{ ...position, top: `${ALL_DAY_HEIGHT + ((start - VISIBLE_START_MINUTES) / 60) * HOUR_HEIGHT}px`, height: `${blockHeight}px`, borderColor: requested ? color : noShow ? "#B9652A" : color, backgroundColor: requested ? "transparent" : noShow ? "#FFF1E6" : `${color}20` }} aria-label={appointmentLabel} title={appointmentLabel} onClick={(event) => { event.stopPropagation(); onClick(); }}>
    {singleLine ? <span className="block truncate text-[9px] font-black leading-3 text-[#1A1A3E]">{requested ? "ממתין להחלטה · " : ""}{clientName} · {serviceLabel}</span> : <><span className="block truncate text-[10px] font-black leading-3 text-[#1A1A3E]">{clientName}</span><span className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] font-extrabold leading-3 text-slate-600"><span className="min-w-0 flex-1 truncate">{serviceLabel}</span>{showDetails && petName && <span className="max-w-[42%] shrink-0 truncate text-slate-500">· {petName}</span>}</span>{showDetails && <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] font-bold leading-3 text-slate-500"><span className="flex min-w-0 items-center gap-0.5" dir="ltr"><Clock3 className="h-2.5 w-2.5 shrink-0" aria-hidden="true" /><span className="truncate">{timeLabel}</span></span>{requested && <span className="min-w-0 truncate text-[8px] font-black text-[#80620B]">ממתין להחלטה</span>}{noShow && <span className="min-w-0 truncate text-[8px] font-black text-[#934D1E]">לא הגיע</span>}</span>}</>}
  </button>;
}

function CalendarBlockOverlay({ item }: { item: PositionedCalendarBlock }) {
  const { block, start, end } = item;
  const blockHeight = Math.max(5, ((end - start) / 60) * HOUR_HEIGHT);
  const label = calendarBlockLabel(block);
  const showReason = blockHeight >= 42 && Boolean(text(block.reason));
  return <div data-calendar-block="true" dir="rtl" role="img" aria-label={label} title={label} className="pointer-events-none absolute z-[3] box-border min-w-0 max-w-full overflow-hidden rounded-md border border-dashed border-[#9AA2AE] px-1.5 py-0.5 text-right" style={{ top: `${ALL_DAY_HEIGHT + ((start - VISIBLE_START_MINUTES) / 60) * HOUR_HEIGHT}px`, height: `${blockHeight}px`, backgroundColor: "rgba(148, 163, 184, 0.13)", backgroundImage: "repeating-linear-gradient(135deg, rgba(100, 116, 139, 0.17) 0px, rgba(100, 116, 139, 0.17) 2px, transparent 2px, transparent 8px" }}>
    <span className="block truncate text-[9px] font-black leading-3 text-slate-600">סגור · {text(block.start_time).slice(0, 5)}–{text(block.end_time).slice(0, 5)}</span>
    {showReason && <span className="mt-0.5 block truncate text-[8px] font-bold leading-3 text-slate-500">{text(block.reason)}</span>}
  </div>;
}

function GoogleEventBlock({ item, allDay = false }: { item: PositionedGoogleEvent; allDay?: boolean }) {
  const title = text(item.event.title) || "אירוע ללא כותרת";
  const timeLabel = item.event.allDay ? GOOGLE_ALL_DAY_LABEL : `${text(item.event.start).slice(0, 5)}–${text(item.event.end).slice(0, 5)}`;
  const accessibilityLabel = `${title}, ${timeLabel}, ${GOOGLE_EVENT_LABEL}`;
  const position = laneStyle(item.lane, item.laneCount);
  const isAllDay = allDay || item.event.allDay;
  const blockHeight = isAllDay ? ALL_DAY_EVENT_HEIGHT : Math.max(5, ((item.end - item.start) / 60) * HOUR_HEIGHT);
  const showTime = isAllDay || blockHeight >= 42;
  const top = isAllDay ? 5 + item.lane * (ALL_DAY_EVENT_HEIGHT + ALL_DAY_EVENT_GAP) : ALL_DAY_HEIGHT + ((item.start - VISIBLE_START_MINUTES) / 60) * HOUR_HEIGHT;
  return <div data-calendar-google-event="true" data-calendar-google-title={title} data-calendar-google-time={timeLabel} dir="rtl" role="img" aria-label={accessibilityLabel} title={accessibilityLabel} className="pointer-events-none absolute z-[2] box-border min-w-0 max-w-full overflow-hidden rounded-md border border-[#AAB8DE] border-r-4 px-1.5 py-0.5 text-right shadow-sm" style={{ ...position, top: `${top}px`, height: `${blockHeight}px`, borderRightColor: GOOGLE_EVENT_COLOR, backgroundColor: GOOGLE_EVENT_BACKGROUND }}>
    <span className="block truncate text-[9px] font-black leading-3 text-[#344777]">{title}</span>
    {showTime && <span className="block truncate text-[8px] font-extrabold leading-3 text-[#5267A8]">{timeLabel}</span>}
  </div>;
}

function DayGrid({ date, appointments, calendarBusy, googleEvents, calendarBlocks, services, now, onSelectSlot, onSelectAppointment }: { date: Date; appointments: CrmRecord[]; calendarBusy: CalendarBusyInterval[]; googleEvents: GoogleCalendarEvent[]; calendarBlocks: CalendarBlockDisplay[]; services: Service[]; now: Date; onSelectSlot: (date: Date, time: string) => void; onSelectAppointment: (record: CrmRecord) => void }) {
  const dayAppointments = appointments.filter((record) => appointmentDateKey(record) === dateKey(date));
  const dayGoogleEvents = googleEventsForDate(googleEvents, date);
  const dayBlocks = calendarBlocksForDate(calendarBlocks, date);
  const positionedAppointments = clipAppointmentsToVisibleWindow(buildAppointmentLayout(dayAppointments, services));
  const positionedGoogleEvents = clipGoogleEventsToVisibleWindow(buildGoogleEventLayout(dayGoogleEvents, false));
  const positionedAllDayEvents = buildGoogleEventLayout(dayGoogleEvents, true);
  const positionedBlocks = clipCalendarBlocksToVisibleWindow(dayBlocks);
  const allDayContentHeight = Math.max(ALL_DAY_HEIGHT, 10 + Math.max(1, positionedAllDayEvents.reduce((max, item) => Math.max(max, item.lane + 1), 0)) * (ALL_DAY_EVENT_HEIGHT + ALL_DAY_EVENT_GAP));
  const current = isToday(date, now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const safeBusyCount = Array.isArray(calendarBusy) ? calendarBusy.length : 0;
  const dayGridRef = useRef<HTMLDivElement | null>(null);
  const [googleHover, setGoogleHover] = useState<GoogleHoverState | null>(null);
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const container = dayGridRef.current;
    if (!container) return;
    setGoogleHover(googleHoverStateAtPoint(container, event.clientX, event.clientY));
  };
  return <div ref={dayGridRef} onPointerMove={handlePointerMove} onPointerLeave={() => setGoogleHover(null)} data-calendar-busy-count={safeBusyCount} dir="rtl" className="relative box-border w-full min-w-0 overflow-visible border-r border-[#EEF0F3]" style={{ height: `${DAY_HEIGHT}px` }}><div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[86px] overflow-hidden border-b border-[#E7EBF4] bg-[#FBFCFD]/80"><div className="relative min-h-full" style={{ height: `${allDayContentHeight}px` }}>{positionedAllDayEvents.map((item, index) => <GoogleEventBlock key={googleEventKey(item.event, index)} item={item} allDay />)}</div></div>{Array.from({ length: VISIBLE_HOUR_COUNT }, (_, index) => { const hour = VISIBLE_START_HOUR + index; const time = `${String(hour).padStart(2, "0")}:00`; const past = isPastCalendarMoment(date, time, now); return <button key={hour} type="button" disabled={past} className={`absolute inset-x-0 border-b border-[#EEF0F3] text-transparent ${past ? "cursor-not-allowed bg-[#F7F8FA]" : "bg-white/70 transition hover:bg-[#FFFBEA] focus:bg-[#FFFBEA] focus:outline-none"}`} style={{ top: `${ALL_DAY_HEIGHT + index * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }} onClick={past ? undefined : () => onSelectSlot(date, time)} aria-label={past ? `השעה ${time} כבר עברה, לא ניתן לקבוע פגישה` : `פתיחת אפשרויות: קביעת תור או סגירת חלון זמן בשעה ${time}`} title={past ? "לא ניתן לקבוע פגישה במועד שכבר עבר" : `פתיחת אפשרויות: קביעת תור או סגירת חלון זמן בשעה ${time}`} />; })}{positionedBlocks.map((item) => <CalendarBlockOverlay key={item.block.id} item={item} />)}{positionedGoogleEvents.map((item, index) => <GoogleEventBlock key={googleEventKey(item.event, index)} item={item} />)}{current && currentMinutes >= VISIBLE_START_MINUTES && currentMinutes <= VISIBLE_END_MINUTES && <div className="pointer-events-none absolute inset-x-0 z-[5] border-t-2 border-[#D94C4C]" style={{ top: `${ALL_DAY_HEIGHT + ((currentMinutes - VISIBLE_START_MINUTES) / 60) * HOUR_HEIGHT}px` }}><span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-[#D94C4C]" /></div>}{positionedAppointments.map((item) => <EventBlock key={recordKey(item.record, item.originalIndex)} record={item.record} service={item.service} start={item.start} end={item.end} lane={item.lane} laneCount={item.laneCount} onClick={() => onSelectAppointment(item.record)} />)}{googleHover && <div role="tooltip" dir="rtl" className="pointer-events-none absolute z-[30] rounded-lg border border-[#5267A8] bg-[#1A1A3E] px-3 py-2 text-right text-white shadow-xl" style={{ left: `${googleHover.left}px`, top: `${googleHover.top}px`, width: "max-content", maxWidth: "calc(100% - 16px)" }}><p className="break-words text-[11px] font-black leading-4">{googleHover.title}</p><p className="mt-1 text-[10px] font-bold leading-3 text-[#DCE5FF]">{googleHover.timeLabel} · {GOOGLE_EVENT_LABEL}</p></div>}</div>;
}

function TimeGutter() {
  return <div dir="ltr" className="relative box-border w-full min-w-0 bg-[#FBFCFD]" style={{ height: `${DAY_HEIGHT}px` }}><div className="absolute inset-x-0 top-0 flex h-[86px] items-center justify-center border-b border-[#E7EBF4] text-[9px] font-black text-[#5267A8]">Google</div>{Array.from({ length: VISIBLE_HOUR_COUNT }, (_, index) => { const hour = VISIBLE_START_HOUR + index; return <span key={hour} className={`absolute left-2 text-[10px] font-bold text-slate-400 ${index === 0 ? "" : "-translate-y-1/2"}`} style={{ top: `${ALL_DAY_HEIGHT + index * HOUR_HEIGHT}px` }} dir="ltr">{String(hour).padStart(2, "0")}:00</span>; })}<span className="absolute left-2 -translate-y-full text-[10px] font-bold text-slate-400" style={{ top: `${DAY_HEIGHT}px` }} dir="ltr">{String(VISIBLE_END_HOUR).padStart(2, "0")}:00</span></div>;
}

function DayWeekGrid({ mode, selectedDate, appointments, calendarBusy, googleEvents, calendarBlocks, services, now, onSelectDate, onSelectSlot, onSelectAppointment }: Omit<CalendarGridProps, "monthDate">) {
  const dates = visibleDates(selectedDate, mode);
  const displayDates = [...dates].reverse();
  const isWeek = mode === "week";
  const dayColumnMinWidth = displayDates.length === 1 ? SINGLE_DAY_COLUMN_MIN_WIDTH_PX : MULTI_DAY_COLUMN_MIN_WIDTH_PX;
  const gridTemplateColumns = isWeek ? `repeat(${displayDates.length}, minmax(var(--crm-week-day-min-width, 0px), 1fr)) ${TIME_GUTTER_WIDTH_PX}px` : `repeat(${displayDates.length}, minmax(${dayColumnMinWidth}px, 1fr)) ${TIME_GUTTER_WIDTH_PX}px`;
  const calendarWidthClass = isWeek ? "min-w-[680px] md:min-w-0" : "min-w-[680px]";
  const calendarGridClass = isWeek ? "[--crm-week-day-min-width:190px] md:[--crm-week-day-min-width:0px]" : "";
  const weekScrollRef = useRef<HTMLDivElement | null>(null);
  const visibleRangeKey = dates.map(dateKey).join("|");
  const targetDateKey = dateKey(dates.some((date) => isToday(date, now)) ? now : selectedDate);
  useLayoutEffect(() => {
    if (mode !== "week") return;
    const scrollContainer = weekScrollRef.current;
    if (!scrollContainer) return;
    const target = scrollContainer.querySelector<HTMLElement>(`[data-calendar-date="${targetDateKey}"]`);
    if (!target) return;
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetCenter = targetRect.left - containerRect.left + scrollContainer.scrollLeft + targetRect.width / 2;
    const maxScrollLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
    scrollContainer.scrollLeft = Math.min(maxScrollLeft, Math.max(0, targetCenter - scrollContainer.clientWidth / 2));
  }, [mode, targetDateKey, visibleRangeKey]);
  return <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white" aria-label={`תצוגת ${mode === "day" ? "יום" : mode === "three-days" ? "שלושה ימים" : "שבוע"}`}><div ref={weekScrollRef} className="overflow-x-auto" dir="ltr"><div className={`${calendarWidthClass} ${calendarGridClass}`} dir="ltr"><div className="grid border-b border-[#E5E7EB] bg-[#FBFCFD]" style={{ gridTemplateColumns }}>{displayDates.map((date) => { const dayBlocks = calendarBlocksForDate(calendarBlocks, date); return <button dir="rtl" data-calendar-date={dateKey(date)} key={dateKey(date)} type="button" onClick={() => onSelectDate(date)} className={`relative min-w-0 min-h-[66px] border-r border-[#EEF0F3] px-2 text-center transition hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#F2D162] ${isToday(date, now) ? "bg-[#FFF6CF]" : ""}`}><span className="block text-[11px] font-extrabold text-slate-500">{format(date, "EEEE", { locale: he })}</span><span className={`mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-lg font-black ${isSameDay(date, selectedDate) ? "bg-[#1A1A3E] text-[#F2D162]" : "text-[#1A1A3E]"}`}>{format(date, "d")}</span>{dayBlocks.length > 0 && <span className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1 text-[9px] font-black text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />{dayBlocks.length}</span>}</button>; })}<div dir="ltr" className="flex items-center justify-center border-r border-[#EEF0F3] text-[10px] font-bold text-slate-400">שעה</div></div><div className="grid" style={{ gridTemplateColumns }}>{displayDates.map((date) => <DayGrid key={dateKey(date)} date={date} appointments={appointments} calendarBusy={calendarBusy} googleEvents={googleEvents} calendarBlocks={calendarBlocks} services={services} now={now} onSelectSlot={onSelectSlot} onSelectAppointment={onSelectAppointment} />)}<TimeGutter /></div></div></div></section>;
}

function googleEventRange(event: GoogleCalendarEvent, allDay: boolean) {
  if (allDay) return { start: 0, end: 1440 };
  const rawStart = timeToMinutes(event.start);
  const rawEnd = timeToMinutes(event.end);
  const start = Number.isFinite(rawStart) ? Math.min(1439, Math.max(0, rawStart)) : 0;
  const boundedEnd = Number.isFinite(rawEnd) ? Math.min(1440, Math.max(0, rawEnd)) : start + 1;
  const end = boundedEnd > start ? boundedEnd : Math.min(1440, start + 1);
  return { start, end: end > start ? end : start + 1 };
}

function buildGoogleEventLayout(events: GoogleCalendarEvent[], allDay: boolean): PositionedGoogleEvent[] {
  const sorted = (Array.isArray(events) ? events : [])
    .filter((event) => Boolean(event) && Boolean(event.allDay) === allDay)
    .map<PositionedGoogleEvent>((event, originalIndex) => {
      const { start, end } = googleEventRange(event, allDay);
      return { event, start, end, lane: 0, laneCount: 1, originalIndex };
    })
    .sort((left, right) => left.start - right.start || left.end - right.end || left.originalIndex - right.originalIndex);
  const positioned: PositionedGoogleEvent[] = [];
  let cluster: PositionedGoogleEvent[] = [];
  let clusterEnd = -Infinity;
  const flushCluster = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    cluster.forEach((item) => {
      const availableLane = laneEnds.findIndex((laneEnd) => laneEnd <= item.start);
      const lane = availableLane === -1 ? laneEnds.length : availableLane;
      laneEnds[lane] = item.end;
      item.lane = lane;
    });
    const laneCount = Math.max(1, laneEnds.length);
    cluster.forEach((item) => { item.laneCount = laneCount; positioned.push(item); });
    cluster = [];
    clusterEnd = -Infinity;
  };
  sorted.forEach((item) => {
    if (cluster.length > 0 && item.start >= clusterEnd) flushCluster();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  });
  flushCluster();
  return positioned.sort((left, right) => left.start - right.start || left.originalIndex - right.originalIndex);
}

function clipGoogleEventsToVisibleWindow(items: PositionedGoogleEvent[]): PositionedGoogleEvent[] {
  return items.flatMap((item) => {
    const start = Math.max(item.start, VISIBLE_START_MINUTES);
    const end = Math.min(item.end, VISIBLE_END_MINUTES);
    return end > start ? [{ ...item, start, end }] : [];
  });
}

function googleEventsForDate(events: GoogleCalendarEvent[], date: Date): GoogleCalendarEvent[] {
  const targetDate = dateKey(date);
  return (Array.isArray(events) ? events : []).filter((event) => event && text(event.date) === targetDate);
}

function MonthGoogleChip({ event }: { event: GoogleCalendarEvent }) {
  const title = text(event.title) || "אירוע ללא כותרת";
  const timeLabel = event.allDay ? GOOGLE_ALL_DAY_LABEL : `${text(event.start).slice(0, 5)}–${text(event.end).slice(0, 5)}`;
  const accessibilityLabel = `${title}, ${timeLabel}, ${GOOGLE_EVENT_LABEL}`;
  return <div dir="rtl" role="img" aria-label={accessibilityLabel} title={accessibilityLabel} className="flex min-w-0 items-center gap-1 rounded-md border border-[#C9D5F1] bg-[#F0F4FF] px-1 py-0.5 text-right text-[8px] font-black leading-3 text-[#344777]"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: GOOGLE_EVENT_COLOR }} /><span className="min-w-0 truncate">{event.allDay ? `${title} · ${GOOGLE_ALL_DAY_LABEL}` : `${timeLabel} ${title}`}</span></div>;
}

function MonthBlockChip({ block }: { block: CalendarBlockDisplay }) {
  const label = calendarBlockLabel(block);
  return <div dir="rtl" role="img" aria-label={label} title={label} className="flex min-w-0 items-center gap-1 rounded-md border border-dashed border-[#AAB2BE] bg-[#F3F5F7] px-1 py-0.5 text-right text-[8px] font-black leading-3 text-slate-600"><LockKeyhole className="h-2.5 w-2.5 shrink-0 text-slate-500" /><span className="min-w-0 truncate">סגור · {text(block.start_time).slice(0, 5)}–{text(block.end_time).slice(0, 5)}</span></div>;
}

function MonthAppointmentChip({ record, service, index, onSelectAppointment }: { record: CrmRecord; service: Service | undefined; index: number; onSelectAppointment: (record: CrmRecord) => void }) {
  const serviceId = serviceIdForRecord(record, [service || { id: "other", label: "" }]);
  const tone = appointmentStatusTone(record.status);
  const requested = tone === "requested";
  const { clientName, serviceLabel, petName, timeLabel, accessibilityLabel } = appointmentDisplay(record, service);
  const appointmentLabel = requested ? `${accessibilityLabel}, ממתין להחלטה` : tone === "no_show" ? `${accessibilityLabel}, לא הגיע` : accessibilityLabel;
  const borderRight = tone === "no_show" ? "3px dashed #B9652A" : `3px solid ${serviceColor(serviceId)}`;
  return <button dir="rtl" key={recordKey(record, index)} type="button" onClick={() => onSelectAppointment(record)} aria-label={appointmentLabel} title={appointmentLabel} className={`flex w-full min-w-0 flex-col gap-0.5 rounded-md px-1 py-0.5 text-right text-[9px] font-bold leading-3 transition hover:bg-[#FFF4C7] focus:outline-none focus:ring-1 focus:ring-[#1A1A3E] ${requested ? "border bg-transparent" : tone === "no_show" ? "bg-[#FFF1E6] text-[#934D1E]" : "text-[#1A1A3E]"}`} style={{ borderRight, ...(requested ? { borderColor: serviceColor(serviceId) } : {}) }}><span className="block min-w-0 truncate font-extrabold">{timeLabel} {clientName}</span><span className="block min-w-0 truncate text-[8px] font-semibold text-slate-500">{requested ? "ממתין להחלטה · " : ""}{serviceLabel}{petName ? ` · ${petName}` : ""}</span></button>;
}

function MonthGrid({ selectedDate, monthDate, appointments, calendarBusy, googleEvents, calendarBlocks, services, onSelectDate, onSelectAppointment }: Omit<CalendarGridProps, "mode" | "now" | "onSelectSlot">) {
  const dates = monthGridDates(monthDate);
  const displayDates = Array.from({ length: Math.ceil(dates.length / 7) }, (_, index) => dates.slice(index * 7, index * 7 + 7).reverse()).flat();
  const displayWeekdays = [...CALENDAR_WEEKDAYS].reverse();
  const safeBusyCount = Array.isArray(calendarBusy) ? calendarBusy.length : 0;
  return <section data-calendar-busy-count={safeBusyCount} className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white" aria-label="תצוגת חודש"><div className="grid grid-cols-7 border-b border-[#E5E7EB] bg-[#FBFCFD]" dir="ltr">{displayWeekdays.map((day) => <span dir="rtl" key={day} className="px-2 py-3 text-center text-[10px] font-black text-slate-500">{day}</span>)}</div><div className="grid grid-cols-7" dir="ltr">{displayDates.map((date, index) => { const items = appointments.filter((record) => appointmentDateKey(record) === dateKey(date)); const dayGoogleEvents = googleEventsForDate(googleEvents, date); const dayBlocks = calendarBlocksForDate(calendarBlocks, date); const combined = [...dayBlocks.map((block, itemIndex) => ({ kind: "block" as const, block, index: itemIndex, start: timeToMinutes(block.start_time) || 0 })), ...dayGoogleEvents.map((event, itemIndex) => ({ kind: "google" as const, event, index: itemIndex, start: event.allDay ? 0 : (timeToMinutes(event.start) || 0) })), ...items.map((record, itemIndex) => ({ kind: "appointment" as const, record, index: itemIndex, start: appointmentStartMinutes(record) }))].sort((left, right) => left.start - right.start || (left.kind === "block" ? -1 : left.kind === "google" ? -1 : 1)); const visible = combined.slice(0, 4); const hiddenCount = Math.max(0, combined.length - visible.length); return <div dir="rtl" key={`${dateKey(date)}-${index}`} className={`min-h-[112px] border-b border-l border-[#EEF0F3] p-1.5 sm:min-h-[138px] ${!isInMonth(date, monthDate) ? "bg-[#FBFCFD] text-slate-300" : "bg-white"} ${isToday(date) ? "ring-2 ring-inset ring-[#F2D162]" : ""}`}><button dir="rtl" type="button" onClick={() => onSelectDate(date)} className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition hover:bg-[#FFF4C7] focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${isSameDay(date, selectedDate) ? "bg-[#1A1A3E] text-[#F2D162]" : "text-[#1A1A3E]"}`}>{format(date, "d")}</button><div className="mt-1 space-y-1">{visible.map((item) => item.kind === "block" ? <MonthBlockChip key={`${item.block.id}-${item.index}`} block={item.block} /> : item.kind === "google" ? <MonthGoogleChip key={googleEventKey(item.event, item.index)} event={item.event} /> : (() => { const serviceId = serviceIdForRecord(item.record, services); const service = services.find((candidate) => candidate.id === serviceId); return <MonthAppointmentChip key={recordKey(item.record, item.index)} record={item.record} service={service} index={item.index} onSelectAppointment={onSelectAppointment} />; })())}{hiddenCount > 0 && <p className="px-1 text-[9px] font-bold text-slate-400">+{hiddenCount} נוספות</p>}</div></div>; })}</div></section>;
}

interface AgendaGroup {
  records: CrmRecord[];
  googleEvents: GoogleCalendarEvent[];
  blocks: CalendarBlockDisplay[];
}

type AgendaRow =
  | { kind: "google"; event: GoogleCalendarEvent; index: number; start: number }
  | { kind: "appointment"; record: CrmRecord; service: Service | undefined; index: number; start: number }
  | { kind: "block"; block: CalendarBlockDisplay; index: number; start: number };

function AgendaGoogleRow({ event }: { event: GoogleCalendarEvent }) {
  const title = text(event.title) || "אירוע ללא כותרת";
  const timeLabel = event.allDay ? GOOGLE_ALL_DAY_LABEL : `${text(event.start).slice(0, 5)}–${text(event.end).slice(0, 5)}`;
  const accessibilityLabel = `${title}, ${timeLabel}, ${GOOGLE_EVENT_LABEL}`;
  return <div role="img" aria-label={accessibilityLabel} title={accessibilityLabel} className="pointer-events-none flex items-center gap-3 rounded-xl border border-[#C9D5F1] bg-[#F5F7FF] p-3 text-right"><span className="w-16 shrink-0 text-xs font-black text-[#5267A8]" dir="ltr">{timeLabel}</span><span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: GOOGLE_EVENT_COLOR }} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-[#344777]">{title}</span><span className="mt-1 block truncate text-xs font-semibold text-[#5267A8]">אירוע Google Calendar</span></span><span className="shrink-0 rounded-full border border-[#C9D5F1] bg-white/80 px-2 py-1 text-[10px] font-black text-[#5267A8]">Google Calendar</span></div>;
}

function AgendaBlockRow({ block }: { block: CalendarBlockDisplay }) {
  const label = calendarBlockLabel(block);
  return <div role="img" aria-label={label} title={label} className="pointer-events-none flex items-center gap-3 rounded-xl border border-dashed border-[#AAB2BE] bg-[#F3F5F7] p-3 text-right" style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(100, 116, 139, 0.13) 0px, rgba(100, 116, 139, 0.13) 2px, transparent 2px, transparent 8px" }}><span className="w-16 shrink-0 text-xs font-black text-slate-600" dir="ltr">{text(block.start_time).slice(0, 5)}–{text(block.end_time).slice(0, 5)}</span><LockKeyhole className="h-4 w-4 shrink-0 text-slate-500" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-slate-700">סגירת חלון זמן</span><span className="mt-1 block truncate text-xs font-semibold text-slate-500">{text(block.reason) || "זמן סגור לבחירת לקוחות"}</span></span><span className="shrink-0 rounded-full border border-[#CBD2DB] bg-white/80 px-2 py-1 text-[10px] font-black text-slate-600">סגור</span></div>;
}

function Agenda({ selectedDate, appointments, calendarBusy, googleEvents, calendarBlocks, services, onSelectDate, onSelectAppointment }: Omit<CalendarGridProps, "mode" | "monthDate" | "now" | "onSelectSlot">) {
  const visibleWeekKeys = new Set(visibleDates(selectedDate, "week").map(dateKey));
  const groups = new Map<string, AgendaGroup>();
  const ensureGroup = (key: string) => {
    const current = groups.get(key);
    if (current) return current;
    const next: AgendaGroup = { records: [], googleEvents: [], blocks: [] };
    groups.set(key, next);
    return next;
  };

  appointments
    .filter((record) => visibleWeekKeys.has(appointmentDateKey(record)))
    .sort((a, b) => `${appointmentDateKey(a)} ${text(a.start_time)}`.localeCompare(`${appointmentDateKey(b)} ${text(b.start_time)}`))
    .forEach((record) => ensureGroup(appointmentDateKey(record)).records.push(record));

  (Array.isArray(googleEvents) ? googleEvents : [])
    .filter((event) => visibleWeekKeys.has(text(event.date)))
    .sort((a, b) => `${text(a.date)} ${text(a.start)}`.localeCompare(`${text(b.date)} ${text(b.start)}`))
    .forEach((event) => ensureGroup(text(event.date)).googleEvents.push(event));

  (Array.isArray(calendarBlocks) ? calendarBlocks : [])
    .filter((block) => visibleWeekKeys.has(block.date))
    .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`))
    .forEach((block) => ensureGroup(block.date).blocks.push(block));

  const sortedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  const safeBusyCount = Array.isArray(calendarBusy) ? calendarBusy.length : 0;
  return <section data-calendar-busy-count={safeBusyCount} className="rounded-2xl border border-[#E5E7EB] bg-white p-4" aria-label="תצוגת סדר יום"><div className="mb-4 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-[#5267A8]" /><div><h2 className="text-base font-black text-[#1A1A3E]">סדר היום</h2><p className="text-xs font-semibold text-slate-500">רשימת הפגישות, סגירות הזמן ואירועי Google Calendar בטווח התצוגה.</p></div></div>{sortedGroups.length === 0 ? <div className="rounded-2xl border border-dashed border-[#D9DEE5] bg-[#FBFCFD] px-5 py-14 text-center"><PawPrint className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-extrabold text-[#1A1A3E]">אין פגישות, סגירות או אירועי Google Calendar להצגה</p><p className="mt-1 text-xs font-semibold text-slate-500">כאן מופיעים תורים שנשמרו, חלונות זמן סגורים ואירועים מיומן Google.</p></div> : <div className="space-y-5">{sortedGroups.map(([key, group]) => { const date = new Date(`${key}T12:00:00`); const rows: AgendaRow[] = [...group.blocks.map((block, index) => ({ kind: "block" as const, block, index, start: timeToMinutes(block.start_time) || 0 })), ...group.googleEvents.map((event, index) => ({ kind: "google" as const, event, index, start: event.allDay ? 0 : (timeToMinutes(event.start) || 0) })), ...group.records.map((record, index) => { const serviceId = serviceIdForRecord(record, services); const service = services.find((item) => item.id === serviceId); return { kind: "appointment" as const, record, service, index, start: appointmentStartMinutes(record) }; })].sort((left, right) => left.start - right.start || (left.kind === "block" ? -1 : left.kind === "google" ? -1 : 1)); const appointmentCountLabel = group.records.length ? `${group.records.length} ${group.records.length === 1 ? "פגישה" : "פגישות"}` : ""; const googleCountLabel = group.googleEvents.length ? `${group.googleEvents.length} ${group.googleEvents.length === 1 ? "אירוע Google" : "אירועי Google"}` : ""; const blockCountLabel = group.blocks.length ? `${group.blocks.length} ${group.blocks.length === 1 ? "סגירה" : "סגירות"}` : ""; const countLabel = [appointmentCountLabel, blockCountLabel, googleCountLabel].filter(Boolean).join(" · "); return <div key={key}><button type="button" onClick={() => onSelectDate(date)} className="mb-2 flex items-center gap-2 text-right focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF4C7] text-sm font-black text-[#69550C]">{format(date, "d")}</span><span><span className="block text-sm font-black text-[#1A1A3E]">{format(date, "EEEE, d בMMMM", { locale: he })}</span><span className="block text-[10px] font-bold text-slate-400">{countLabel}</span></span></button><div className="space-y-2">{rows.map((row) => row.kind === "block" ? <AgendaBlockRow key={`${row.block.id}-${row.index}`} block={row.block} /> : row.kind === "google" ? <AgendaGoogleRow key={googleEventKey(row.event, row.index)} event={row.event} /> : (() => { const { record, service } = row; const serviceId = serviceIdForRecord(record, services); const tone = appointmentStatusTone(record.status); const requested = tone === "requested"; const { accessibilityLabel } = appointmentDisplay(record, service); const appointmentLabel = requested ? `${accessibilityLabel}, ממתין להחלטה` : tone === "no_show" ? `${accessibilityLabel}, לא הגיע` : accessibilityLabel; return <button key={recordKey(record, row.index)} type="button" onClick={() => onSelectAppointment(record)} aria-label={appointmentLabel} title={appointmentLabel} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-right transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${requested ? "bg-transparent hover:bg-[#FFFDF2]" : tone === "no_show" ? "border-[#E7B68E] bg-[#FFF8F3] hover:bg-[#FFF1E6]" : "border-[#EEF0F3] bg-[#FBFCFD] hover:border-[#F2D162] hover:bg-[#FFFDF2]"}`} style={requested ? { borderColor: serviceColor(serviceId) } : undefined}><span className="w-16 shrink-0 text-xs font-black text-[#1A1A3E]" dir="ltr">{text(record.start_time).slice(0, 5)}</span><span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: tone === "no_show" ? "#B9652A" : serviceColor(serviceId) }} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-[#1A1A3E]">{text(record.client_name) || "לקוח ללא שם"}</span><span className="mt-1 block truncate text-xs font-semibold text-slate-500">{requested ? "ממתין להחלטה · " : ""}{service?.label || text(record.appointment_type) || "שירות לא צוין"}{text(record.pet_name) ? ` · ${text(record.pet_name)}` : ""}</span></span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusClass(tone)}`}>{statusLabel(record.status)}</span></button>; })())}</div></div>; })}</div>}</section>;
}

export function BusinessCrmCalendarGrid({ mode, selectedDate, monthDate, appointments, calendarBusy, googleEvents, calendarBlocks, services, now, onSelectDate, onSelectSlot, onSelectAppointment }: CalendarGridProps) {
  if (mode === "month") return <MonthGrid selectedDate={selectedDate} monthDate={monthDate} appointments={appointments} calendarBusy={calendarBusy} googleEvents={googleEvents} calendarBlocks={calendarBlocks} services={services} onSelectDate={onSelectDate} onSelectAppointment={onSelectAppointment} />;
  if (mode === "agenda") return <Agenda selectedDate={selectedDate} appointments={appointments} calendarBusy={calendarBusy} googleEvents={googleEvents} calendarBlocks={calendarBlocks} services={services} onSelectDate={onSelectDate} onSelectAppointment={onSelectAppointment} />;
  return <DayWeekGrid mode={mode} selectedDate={selectedDate} appointments={appointments} calendarBusy={calendarBusy} googleEvents={googleEvents} calendarBlocks={calendarBlocks} services={services} now={now} onSelectDate={onSelectDate} onSelectSlot={onSelectSlot} onSelectAppointment={onSelectAppointment} />;
}
