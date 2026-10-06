export interface TimePeriod {
  start: string;
  end: string;
}

export type ClinicTimePeriod = TimePeriod;

export interface WeeklyAvailabilityDay {
  weekday: number;
  enabled: boolean;
  periods: TimePeriod[];
}

export type WeeklyAvailability = WeeklyAvailabilityDay[];
export type NormalizedClinicHours = Record<number, TimePeriod[]>;

export const WEEKDAY_NAMES_HE = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
] as const;

/**
 * The clinic-wide fallback used until a weekly schedule is saved.
 * Weekday indexes follow JavaScript's convention: Sunday = 0, Saturday = 6.
 */
export const DEFAULT_WEEKLY_AVAILABILITY: WeeklyAvailability = [
  { weekday: 0, enabled: true, periods: [{ start: "16:00", end: "17:30" }] },
  {
    weekday: 1,
    enabled: true,
    periods: [
      { start: "09:30", end: "13:30" },
      { start: "16:00", end: "19:30" },
    ],
  },
  {
    weekday: 2,
    enabled: true,
    periods: [
      { start: "09:30", end: "10:20" },
      { start: "13:00", end: "14:00" },
      { start: "16:00", end: "17:30" },
    ],
  },
  { weekday: 3, enabled: true, periods: [{ start: "16:30", end: "19:30" }] },
  {
    weekday: 4,
    enabled: true,
    periods: [
      { start: "09:30", end: "13:30" },
      { start: "16:00", end: "19:30" },
    ],
  },
  { weekday: 5, enabled: true, periods: [{ start: "09:30", end: "15:00" }] },
  { weekday: 6, enabled: false, periods: [] },
];

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const clonePeriods = (periods: TimePeriod[]): TimePeriod[] =>
  periods.map((period) => ({ start: period.start, end: period.end }));

const cloneWeeklyAvailability = (days: WeeklyAvailability): WeeklyAvailability =>
  days.map((day) => ({
    weekday: day.weekday,
    enabled: day.enabled,
    periods: clonePeriods(day.periods),
  }));

export const isValidTime = (value: unknown): value is string =>
  typeof value === "string" && TIME_PATTERN.test(value);

/** Returns minutes after midnight, or NaN for an invalid time value. */
export const timeToMinutes = (time: string): number => {
  if (typeof time !== "string") return Number.NaN;
  const match = /^(?:[01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(time.trim());
  if (!match) return Number.NaN;
  const [hours, minutes] = time.trim().split(":").map(Number);
  return hours * 60 + minutes;
};

/** Converts minutes after midnight to the HH:mm format used by the editor. */
export const minutesToTime = (minutes: number): string => {
  if (!Number.isFinite(minutes)) return "";
  const normalized = Math.max(0, Math.min(1439, Math.trunc(minutes)));
  const hours = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  return `${hours.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizePeriods = (value: unknown): TimePeriod[] | null => {
  if (!Array.isArray(value)) return null;

  const validPeriods = value
    .filter(isRecord)
    .map((period) => ({
      start: period.start,
      end: period.end,
    }))
    .filter((period): period is { start: string; end: string } =>
      isValidTime(period.start) && isValidTime(period.end) && timeToMinutes(period.end) > timeToMinutes(period.start),
    )
    .sort((left, right) => {
      const startDifference = timeToMinutes(left.start) - timeToMinutes(right.start);
      return startDifference || timeToMinutes(left.end) - timeToMinutes(right.end);
    });

  const nonOverlapping: TimePeriod[] = [];
  for (const period of validPeriods) {
    const previous = nonOverlapping[nonOverlapping.length - 1];
    if (previous && timeToMinutes(period.start) < timeToMinutes(previous.end)) continue;
    nonOverlapping.push({ start: period.start, end: period.end });
  }
  return nonOverlapping;
};

/**
 * Normalizes a saved schedule only when it has the complete seven-day shape.
 * Invalid time rows are discarded, while a valid all-disabled schedule remains valid.
 * Returning null lets callers distinguish a missing/malformed field from an intentional schedule.
 */
export const normalizeSavedWeeklyAvailability = (value: unknown): WeeklyAvailability | null => {
  if (!Array.isArray(value) || value.length !== 7) return null;

  const byWeekday = new Map<number, WeeklyAvailabilityDay>();
  for (const rawDay of value) {
    if (!isRecord(rawDay)) return null;
    const weekday = rawDay.weekday;
    const enabled = rawDay.enabled;
    if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 || typeof enabled !== "boolean") {
      return null;
    }
    if (byWeekday.has(weekday)) return null;

    const periods = enabled
      ? normalizePeriods(rawDay.periods)
      : [];
    if (enabled && (!periods || periods.length === 0)) return null;

    byWeekday.set(weekday, {
      weekday,
      enabled,
      periods: periods || [],
    });
  }

  if (byWeekday.size !== 7) return null;
  return Array.from({ length: 7 }, (_, weekday) => byWeekday.get(weekday)!);
};

/**
 * Returns a safe, complete seven-day schedule. Missing or malformed saved fields use
 * the approved clinic schedule, while valid saved fields, including closed days, win.
 */
export const normalizeWeeklyAvailability = (value: unknown): WeeklyAvailability =>
  normalizeSavedWeeklyAvailability(value) || cloneWeeklyAvailability(DEFAULT_WEEKLY_AVAILABILITY);

export const hasValidWeeklyAvailability = (value: unknown): boolean =>
  normalizeSavedWeeklyAvailability(value) !== null;

export type ServiceWeeklyAvailabilityStatus = "inherit" | "custom" | "invalid";

export interface ResolvedServiceWeeklyAvailability {
  status: ServiceWeeklyAvailabilityStatus;
  schedule: WeeklyAvailability | null;
  hours: NormalizedClinicHours;
}

/**
 * Validates a service-owned schedule without the forgiving cleanup used by the
 * clinic-wide fallback. A malformed custom schedule must close availability,
 * not silently become an inherited schedule.
 */
export const normalizeServiceWeeklyAvailability = (value: unknown): WeeklyAvailability | null => {
  if (!Array.isArray(value) || value.length !== 7) return null;

  const byWeekday = new Map<number, WeeklyAvailabilityDay>();
  for (const rawDay of value) {
    if (!isRecord(rawDay)) return null;
    const weekday = rawDay.weekday;
    const enabled = rawDay.enabled;
    if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 || typeof enabled !== "boolean") {
      return null;
    }
    if (byWeekday.has(weekday) || !Array.isArray(rawDay.periods)) return null;

    const rawPeriods = rawDay.periods;
    if (!enabled && rawPeriods.length > 0) return null;
    if (enabled && rawPeriods.length === 0) return null;

    const periods: TimePeriod[] = [];
    for (const rawPeriod of rawPeriods) {
      if (!isRecord(rawPeriod) || !isValidTime(rawPeriod.start) || !isValidTime(rawPeriod.end)) return null;
      if (timeToMinutes(rawPeriod.end) <= timeToMinutes(rawPeriod.start)) return null;
      periods.push({ start: rawPeriod.start, end: rawPeriod.end });
    }

    periods.sort((left, right) => timeToMinutes(left.start) - timeToMinutes(right.start));
    for (let index = 1; index < periods.length; index += 1) {
      if (timeToMinutes(periods[index].start) < timeToMinutes(periods[index - 1].end)) return null;
    }

    byWeekday.set(weekday, { weekday, enabled, periods: enabled ? periods : [] });
  }

  if (byWeekday.size !== 7) return null;
  return Array.from({ length: 7 }, (_, weekday) => byWeekday.get(weekday)!);
};

const cloneNormalizedHours = (hours: NormalizedClinicHours): NormalizedClinicHours =>
  Array.from({ length: 7 }, (_, weekday) => {
    const periods = hours?.[weekday];
    return [weekday, Array.isArray(periods) ? clonePeriods(periods) : []];
  }).reduce<NormalizedClinicHours>((result, [weekday, periods]) => {
    result[weekday as number] = periods as TimePeriod[];
    return result;
  }, { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

const closedWeeklyHours = (): NormalizedClinicHours => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

const hoursFromServiceSchedule = (schedule: WeeklyAvailability): NormalizedClinicHours =>
  schedule.reduce<NormalizedClinicHours>((hours, day) => {
    hours[day.weekday] = day.enabled ? clonePeriods(day.periods) : [];
    return hours;
  }, closedWeeklyHours());

export const resolveServiceWeeklyAvailability = (
  value: unknown,
  clinicHours: NormalizedClinicHours = DEFAULT_CLINIC_HOURS,
): ResolvedServiceWeeklyAvailability => {
  if (value === undefined || value === null) {
    return { status: "inherit", schedule: null, hours: cloneNormalizedHours(clinicHours) };
  }

  const schedule = normalizeServiceWeeklyAvailability(value);
  if (!schedule) return { status: "invalid", schedule: null, hours: closedWeeklyHours() };
  return { status: "custom", schedule, hours: hoursFromServiceSchedule(schedule) };
};

export const getClinicHours = (weeklyAvailability: unknown): NormalizedClinicHours => {
  const normalized = normalizeWeeklyAvailability(weeklyAvailability);
  return normalized.reduce<NormalizedClinicHours>((hours, day) => {
    hours[day.weekday] = day.enabled ? clonePeriods(day.periods) : [];
    return hours;
  }, { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });
};

export const getDayAvailability = (weeklyAvailability: unknown, weekday: number): WeeklyAvailabilityDay => {
  const normalized = normalizeWeeklyAvailability(weeklyAvailability);
  return normalized.find((day) => day.weekday === weekday) || { weekday, enabled: false, periods: [] };
};

export const DEFAULT_CLINIC_HOURS: NormalizedClinicHours = getClinicHours(DEFAULT_WEEKLY_AVAILABILITY);
