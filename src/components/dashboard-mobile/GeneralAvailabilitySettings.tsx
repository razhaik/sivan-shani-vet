import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { SettingsGroup, StatusPill } from "@/components/business-crm/SettingsPrimitives";
import {
  isValidTime,
  minutesToTime,
  normalizeSavedWeeklyAvailability,
  normalizeWeeklyAvailability,
  timeToMinutes,
  WEEKDAY_NAMES_HE,
  type TimePeriod,
  type WeeklyAvailability,
  type WeeklyAvailabilityDay,
} from "@/lib/clinicAvailability";

interface GeneralAvailabilitySettingsProps {
  value?: unknown;
  isLoading?: boolean;
  onSave: (weeklyAvailability: WeeklyAvailability) => Promise<void>;
}

type Feedback = { type: "success" | "error"; message: string } | null;

type DayErrors = Record<number, string>;

const defaultPeriod = (): TimePeriod => ({ start: "09:00", end: "10:00" });

const nextPeriod = (periods: TimePeriod[]): TimePeriod => {
  const sorted = periods
    .filter((period) => isValidTime(period.start) && isValidTime(period.end) && timeToMinutes(period.end) > timeToMinutes(period.start))
    .sort((left, right) => timeToMinutes(left.start) - timeToMinutes(right.start));
  let cursor = 9 * 60;

  for (const period of sorted) {
    const start = timeToMinutes(period.start);
    const end = timeToMinutes(period.end);
    if (cursor + 60 <= start) {
      return { start: minutesToTime(cursor), end: minutesToTime(cursor + 60) };
    }
    cursor = Math.max(cursor, end + 30);
  }

  if (cursor + 60 <= 23 * 60 + 59) {
    return { start: minutesToTime(cursor), end: minutesToTime(cursor + 60) };
  }
  return defaultPeriod();
};

const validateDays = (days: WeeklyAvailabilityDay[]): DayErrors => {
  const errors: DayErrors = {};

  days.forEach((day) => {
    if (!day.enabled) return;
    if (day.periods.length === 0) {
      errors[day.weekday] = "יום פעיל צריך לכלול לפחות טווח שעות אחד.";
      return;
    }

    const parsed = day.periods.map((period, index) => ({
      index,
      start: timeToMinutes(period.start),
      end: timeToMinutes(period.end),
      validStart: isValidTime(period.start),
      validEnd: isValidTime(period.end),
    }));
    const invalid = parsed.find((period) => !period.validStart || !period.validEnd);
    if (invalid) {
      errors[day.weekday] = `יש להשלים שעות תקינות בטווח ${invalid.index + 1}.`;
      return;
    }

    const reversed = parsed.find((period) => period.end <= period.start);
    if (reversed) {
      errors[day.weekday] = `שעת הסיום בטווח ${reversed.index + 1} חייבת להיות מאוחרת משעת ההתחלה.`;
      return;
    }

    const sorted = [...parsed].sort((left, right) => left.start - right.start);
    const overlap = sorted.find((period, index) => index > 0 && period.start < sorted[index - 1].end);
    if (overlap) {
      errors[day.weekday] = "טווחי השעות באותו יום חופפים. יש להפריד ביניהם או להסיר אחד מהם.";
    }
  });

  return errors;
};

export default function GeneralAvailabilitySettings({ value, isLoading = false, onSave }: GeneralAvailabilitySettingsProps) {
  const normalizedValue = useMemo(() => normalizeWeeklyAvailability(value), [value]);
  const hasSavedSchedule = useMemo(() => normalizeSavedWeeklyAvailability(value) !== null, [value]);
  const [draft, setDraft] = useState<WeeklyAvailability>(() => normalizedValue);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    setDraft(normalizedValue);
    setFeedback(null);
  }, [normalizedValue]);

  const errors = useMemo(() => validateDays(draft), [draft]);
  const hasDraftChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(normalizedValue), [draft, normalizedValue]);
  const isDirty = useMemo(() => !hasSavedSchedule || hasDraftChanges, [hasDraftChanges, hasSavedSchedule]);

  const updateDay = (weekday: number, update: (day: WeeklyAvailabilityDay) => WeeklyAvailabilityDay) => {
    setFeedback(null);
    setDraft((current) => current.map((day) => (day.weekday === weekday ? update(day) : day)));
  };

  const toggleDay = (weekday: number, enabled: boolean) => {
    updateDay(weekday, (day) => ({
      ...day,
      enabled,
      periods: enabled ? (day.periods.length ? day.periods : [defaultPeriod()]) : [],
    }));
  };

  const updatePeriod = (weekday: number, periodIndex: number, field: keyof TimePeriod, value: string) => {
    updateDay(weekday, (day) => ({
      ...day,
      periods: day.periods.map((period, index) => index === periodIndex ? { ...period, [field]: value } : period),
    }));
  };

  const addPeriod = (weekday: number) => {
    updateDay(weekday, (day) => ({ ...day, periods: [...day.periods, nextPeriod(day.periods)] }));
  };

  const removePeriod = (weekday: number, periodIndex: number) => {
    updateDay(weekday, (day) => ({ ...day, periods: day.periods.filter((_, index) => index !== periodIndex) }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (Object.keys(errors).length > 0) {
      setFeedback({ type: "error", message: "יש לתקן את שעות הפעילות המסומנות לפני השמירה." });
      return;
    }

    const payload = draft.map((day) => ({
      weekday: day.weekday,
      enabled: day.enabled,
      periods: day.enabled ? day.periods.map((period) => ({ start: period.start, end: period.end })) : [],
    }));

    setIsSaving(true);
    setFeedback(null);
    try {
      await onSave(payload);
      setFeedback({ type: "success", message: "הזמינות הכללית נשמרה. שעות אלה משמשות כבסיס לכל אפשרויות קביעת התורים." });
    } catch (error) {
      console.error("Failed to save general clinic availability:", error);
      setFeedback({ type: "error", message: "לא הצלחנו לשמור את הזמינות. בדקי את החיבור ונסי שוב." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-5" dir="rtl" aria-labelledby="general-availability-title">
      <div className="rounded-[22px] border border-[#DCE8EC] bg-[#E8F3F5] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#1D6472] shadow-sm">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black tracking-[0.16em] text-[#2F8794]">הגדרות יומן</p>
            <h3 id="general-availability-title" className="mt-1 text-xl font-black text-[#16344D]">זמינות כללית</h3>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-[#526F7A]">קבעי את שעות הפעילות השבועיות של המרפאה. הן משמשות בסיס להזמנה באתר, להזמנה מתוך הדשבורד וליומן ה־CRM.</p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#C9DDE3] bg-white/75 p-3 text-xs font-bold leading-relaxed text-[#526F7A]">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#2F8794]" />
          <span>הגבלות ספציפיות לסוג טיפול שנמצאות ב״חלונות תורים״ נשארות פעילות בנוסף לשעות הכלליות.</span>
        </div>
      </div>

      <SettingsGroup title="ימי פעילות" footer="מתג היום קובע אם ניתן לקבוע בו תורים. לכל יום פעיל אפשר להוסיף כמה טווחי שעות, בלי חפיפה ביניהם.">
        <div className="grid gap-3 py-3 lg:grid-cols-2">
          {draft.map((day) => {
            const error = errors[day.weekday];
            return (
              <article key={day.weekday} className={cn("rounded-[18px] border p-4 transition-colors", error ? "border-red-200 bg-red-50/30" : day.enabled ? "border-[#C9DDE3] bg-white" : "border-[#DCE8EC] bg-[#F4F8F9]")}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${day.enabled ? "bg-[#E8F3F5] text-[#1D6472]" : "bg-white text-[#738790]"}`} aria-hidden="true"><CalendarDays className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-base font-black text-[#16344D]">{WEEKDAY_NAMES_HE[day.weekday]}</h4>
                    <p className={cn("mt-0.5 text-xs font-bold", day.enabled ? "text-emerald-700" : "text-[#738790]")}>{day.enabled ? "פתוח לקביעת תורים" : "לא זמין"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill label={day.enabled ? "פעיל" : "כבוי"} tone={day.enabled ? "success" : "neutral"} />
                    <Switch checked={day.enabled} onCheckedChange={(checked) => toggleDay(day.weekday, checked)} aria-label={`${day.enabled ? "כיבוי" : "הפעלת"} יום ${WEEKDAY_NAMES_HE[day.weekday]}`} />
                  </div>
                </div>

                {day.enabled ? (
                  <div className="mt-4 space-y-2.5">
                    {day.periods.map((period, periodIndex) => (
                      <div key={`${day.weekday}-${periodIndex}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-[#DCE8EC] bg-[#F4F8F9] p-2.5">
                        <span className="shrink-0 text-xs font-black text-[#738790]">{periodIndex + 1}</span>
                        <input
                          type="time"
                          value={period.start}
                          onChange={(event) => updatePeriod(day.weekday, periodIndex, "start", event.target.value)}
                          aria-label={`שעת התחלה, ${WEEKDAY_NAMES_HE[day.weekday]}, טווח ${periodIndex + 1}`}
                          aria-invalid={Boolean(error)}
                          className="h-10 min-w-0 flex-1 rounded-lg border border-[#C9DDE3] bg-white px-2 text-center text-sm font-black text-[#16344D] outline-none transition focus:border-[#2F90A1] focus:ring-2 focus:ring-[#2F90A1]/20"
                          dir="ltr"
                        />
                        <span className="shrink-0 text-xs font-black text-[#738790]">עד</span>
                        <input
                          type="time"
                          value={period.end}
                          onChange={(event) => updatePeriod(day.weekday, periodIndex, "end", event.target.value)}
                          aria-label={`שעת סיום, ${WEEKDAY_NAMES_HE[day.weekday]}, טווח ${periodIndex + 1}`}
                          aria-invalid={Boolean(error)}
                          className="h-10 min-w-0 flex-1 rounded-lg border border-[#C9DDE3] bg-white px-2 text-center text-sm font-black text-[#16344D] outline-none transition focus:border-[#2F90A1] focus:ring-2 focus:ring-[#2F90A1]/20"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => removePeriod(day.weekday, periodIndex)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#738790] transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                          aria-label={`הסרת טווח ${periodIndex + 1} ביום ${WEEKDAY_NAMES_HE[day.weekday]}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addPeriod(day.weekday)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-[#9BCAD2] px-3 text-xs font-black text-[#1D6472] transition hover:border-[#2F90A1] hover:bg-[#E8F3F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F90A1]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      הוספת מועד
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-[#C9DDE3] bg-white/70 px-3 py-4 text-center text-xs font-bold text-[#738790]">אין טווחי שעות. הפעלת היום תוסיף טווח לעריכה.</div>
                )}

                {error && <p className="mt-3 flex items-start gap-1.5 text-xs font-black leading-relaxed text-red-600" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
              </article>
            );
          })}
        </div>
      </SettingsGroup>

      <div className="rounded-[22px] border border-[#DCE8EC] bg-[#F9FCFC] p-4 shadow-[0_8px_24px_rgba(15,40,66,0.04)] sm:p-5">
        {feedback && <div role={feedback.type === "error" ? "alert" : "status"} className={cn("mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm font-black leading-relaxed", feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700")}>{feedback.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}{feedback.message}</div>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={cn("text-xs font-bold", isLoading ? "text-[#1D6472]" : isDirty ? "text-amber-700" : "text-[#738790]")}>{isLoading ? "טוענת את הגדרות המרפאה..." : hasDraftChanges ? "יש שינויים שטרם נשמרו" : !hasSavedSchedule ? "ברירת המחדל פעילה. לחצי על שמירה כדי לשמור את הזמינות בהגדרות המרפאה." : "השעות המוצגות נשמרו במערכת"}</p>
          <Button type="button" onClick={handleSave} disabled={isLoading || isSaving || Object.keys(errors).length > 0} className="h-12 w-full rounded-xl bg-[#16344D] font-black text-white shadow-sm hover:bg-[#102E47] focus-visible:ring-2 focus-visible:ring-[#2F90A1] focus-visible:ring-offset-2 sm:w-auto sm:min-w-52">
            {isLoading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />טוענת...</> : isSaving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />שומרת...</> : <><Save className="h-4 w-4" />שמור זמינות כללית</>}
          </Button>
        </div>
      </div>
    </section>
  );
}
