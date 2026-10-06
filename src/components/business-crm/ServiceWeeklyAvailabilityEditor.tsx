import { useMemo } from "react";
import { AlertCircle, CalendarDays, Clock3, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingsGroup, StatusPill } from "@/components/business-crm/SettingsPrimitives";
import {
  isValidTime,
  timeToMinutes,
  WEEKDAY_NAMES_HE,
  type TimePeriod,
  type WeeklyAvailability,
  type WeeklyAvailabilityDay,
} from "@/lib/clinicAvailability";

export type ServiceWeeklyAvailabilityDraft =
  | { mode: "inherit" }
  | { mode: "custom"; schedule: WeeklyAvailability }
  | { mode: "invalid" };

type DayErrors = Record<number, string>;

interface ServiceWeeklyAvailabilityEditorProps {
  draft: ServiceWeeklyAvailabilityDraft;
  clinicSchedule: WeeklyAvailability;
  clinicSettingsLoading?: boolean;
  clinicSettingsError?: boolean;
  disabled?: boolean;
  onChange: (draft: ServiceWeeklyAvailabilityDraft) => void;
}

const blankPeriod = (): TimePeriod => ({ start: "", end: "" });

function cloneSchedule(schedule: WeeklyAvailability): WeeklyAvailability {
  return schedule.map((day) => ({
    weekday: day.weekday,
    enabled: day.enabled,
    periods: day.periods.map((period) => ({ start: period.start, end: period.end })),
  }));
}

export function validateServiceAvailabilityDays(days: WeeklyAvailabilityDay[]): DayErrors {
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
    if (overlap) errors[day.weekday] = "טווחי השעות באותו יום חופפים. יש להפריד ביניהם או להסיר אחד מהם.";
  });

  return errors;
}

export default function ServiceWeeklyAvailabilityEditor({
  draft,
  clinicSchedule,
  clinicSettingsLoading = false,
  clinicSettingsError = false,
  disabled = false,
  onChange,
}: ServiceWeeklyAvailabilityEditorProps) {
  const customSchedule = draft.mode === "custom" ? draft.schedule : null;
  const errors = useMemo(
    () => customSchedule ? validateServiceAvailabilityDays(customSchedule) : {},
    [customSchedule],
  );
  const canCopyClinicSchedule = !disabled && !clinicSettingsLoading && !clinicSettingsError;

  const startCustomSchedule = () => {
    if (!canCopyClinicSchedule) return;
    onChange({ mode: "custom", schedule: cloneSchedule(clinicSchedule) });
  };

  const updateDay = (weekday: number, update: (day: WeeklyAvailabilityDay) => WeeklyAvailabilityDay) => {
    if (!customSchedule || disabled) return;
    onChange({
      mode: "custom",
      schedule: customSchedule.map((day) => day.weekday === weekday ? update(day) : day),
    });
  };

  const toggleDay = (weekday: number, enabled: boolean) => {
    updateDay(weekday, (day) => ({
      ...day,
      enabled,
      periods: enabled ? (day.periods.length ? day.periods : [blankPeriod()]) : [],
    }));
  };

  const updatePeriod = (weekday: number, periodIndex: number, field: keyof TimePeriod, value: string) => {
    updateDay(weekday, (day) => ({
      ...day,
      periods: day.periods.map((period, index) => index === periodIndex ? { ...period, [field]: value } : period),
    }));
  };

  const addPeriod = (weekday: number) => {
    updateDay(weekday, (day) => ({ ...day, periods: [...day.periods, blankPeriod()] }));
  };

  const removePeriod = (weekday: number, periodIndex: number) => {
    updateDay(weekday, (day) => ({ ...day, periods: day.periods.filter((_, index) => index !== periodIndex) }));
  };

  return (
    <section className="space-y-4 border-t border-[#DCE8EC] pt-5" dir="rtl" aria-labelledby="service-weekly-availability-title">
      <header className="rounded-[20px] border border-[#DCE8EC] bg-[#E8F3F5] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#1D6472] shadow-sm" aria-hidden="true">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black tracking-[0.13em] text-[#2F8794]">זמינות לפי שירות</p>
            <h3 id="service-weekly-availability-title" className="mt-1 text-lg font-black text-[#16344D]">שעות פעילות לשירות</h3>
            <p className="mt-1.5 text-xs font-semibold leading-6 text-[#526F7A]">
              לקוחות יראו שעות רק כשהשירות פתוח וגם המרפאה פתוחה. חלונות התורים הקיימים נשארים בתוקף בנוסף ללוחות האלה.
            </p>
          </div>
        </div>

        {draft.mode === "inherit" && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#C9DDE3] bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#2F8794]" aria-hidden="true" />
              <div>
                <p className="text-sm font-black text-[#16344D]">השירות יורש את שעות המרפאה</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-[#617984]">כל שינוי בזמינות הכללית יחול גם על השירות הזה, עד שתוגדר לו מערכת שעות נפרדת.</p>
              </div>
            </div>
            <Button type="button" onClick={startCustomSchedule} disabled={!canCopyClinicSchedule} className="min-h-10 w-full shrink-0 rounded-xl bg-[#16344D] px-4 text-xs font-black text-white hover:bg-[#102E47] focus-visible:ring-2 focus-visible:ring-[#2F90A1] sm:w-auto">
              {clinicSettingsLoading ? "טוענת שעות מרפאה..." : "הגדרת שעות לשירות"}
            </Button>
          </div>
        )}

        {draft.mode === "invalid" && (
          <div role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-1 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <p>השעות השמורות לשירות אינן תקינות, ולכן לא יוצעו ללקוחות שעות לתיאום עד לתיקון. אפשר להגדיר לוח חדש או לחזור לשעות המרפאה.</p>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={startCustomSchedule} disabled={!canCopyClinicSchedule} className="min-h-10 rounded-xl bg-[#16344D] px-4 text-xs font-black text-white hover:bg-[#102E47] disabled:opacity-60">
                {clinicSettingsLoading ? "טוענת שעות מרפאה..." : "החלפת הלוח לשעות המרפאה"}
              </Button>
              <Button type="button" variant="outline" onClick={() => onChange({ mode: "inherit" })} disabled={disabled} className="min-h-10 rounded-xl border-[#C9DDE3] px-4 text-xs font-black text-[#1D6472] hover:bg-white">
                חזרה לירושה
              </Button>
            </div>
          </div>
        )}

        {draft.mode === "custom" && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#BBD6DC] bg-white/85 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#1D6472]" aria-hidden="true" />
              <div>
                <p className="text-sm font-black text-[#16344D]">לשירות יש שעות נפרדות</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-[#617984]">הלקוחות יוכלו לבחור רק מועד שנמצא גם בלוח הזה וגם בשעות הכלליות של המרפאה.</p>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => onChange({ mode: "inherit" })} disabled={disabled} className="min-h-10 w-full shrink-0 rounded-xl border-[#C9DDE3] px-4 text-xs font-black text-[#1D6472] hover:bg-[#F1F7F8] sm:w-auto">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              חזרה לשעות המרפאה
            </Button>
          </div>
        )}

        {clinicSettingsError && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold leading-5 text-amber-950">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            לא הצלחנו לטעון את שעות המרפאה. אפשר להשאיר את השירות בירושה, אך לא ניתן להתחיל לוח אישי עד לטעינה תקינה.
          </p>
        )}
      </header>

      {customSchedule && (
        <>
          <SettingsGroup title="ימי פעילות לשירות" footer="הפעילי ימים שבהם השירות זמין. בכל יום אפשר להגדיר כמה טווחים, בלי חפיפה ביניהם.">
            <div className="grid gap-3 py-3 lg:grid-cols-2">
              {customSchedule.map((day) => {
                const error = errors[day.weekday];
                return (
                  <article key={day.weekday} className={`rounded-[18px] border p-4 transition-colors ${error ? "border-red-200 bg-red-50/30" : day.enabled ? "border-[#C9DDE3] bg-white" : "border-[#DCE8EC] bg-[#F4F8F9]"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${day.enabled ? "bg-[#E8F3F5] text-[#1D6472]" : "bg-white text-[#738790]"}`} aria-hidden="true">
                        <CalendarDays className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-base font-black text-[#16344D]">{WEEKDAY_NAMES_HE[day.weekday]}</h4>
                        <p className={`mt-0.5 text-xs font-bold ${day.enabled ? "text-emerald-700" : "text-[#738790]"}`}>{day.enabled ? "פתוח לשירות הזה" : "השירות לא זמין"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusPill label={day.enabled ? "פעיל" : "כבוי"} tone={day.enabled ? "success" : "neutral"} />
                        <Switch checked={day.enabled} onCheckedChange={(checked) => toggleDay(day.weekday, checked === true)} disabled={disabled} aria-label={`${day.enabled ? "כיבוי" : "הפעלת"} שירות ביום ${WEEKDAY_NAMES_HE[day.weekday]}`} />
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
                              disabled={disabled}
                              aria-label={`שעת התחלה, ${WEEKDAY_NAMES_HE[day.weekday]}, טווח ${periodIndex + 1}`}
                              aria-invalid={Boolean(error)}
                              className="h-10 min-w-0 flex-1 rounded-lg border border-[#C9DDE3] bg-white px-2 text-center text-sm font-black text-[#16344D] outline-none transition focus:border-[#2F90A1] focus:ring-2 focus:ring-[#2F90A1]/20 disabled:cursor-not-allowed disabled:bg-[#F4F8F9]"
                              dir="ltr"
                            />
                            <span className="shrink-0 text-xs font-black text-[#738790]">עד</span>
                            <input
                              type="time"
                              value={period.end}
                              onChange={(event) => updatePeriod(day.weekday, periodIndex, "end", event.target.value)}
                              disabled={disabled}
                              aria-label={`שעת סיום, ${WEEKDAY_NAMES_HE[day.weekday]}, טווח ${periodIndex + 1}`}
                              aria-invalid={Boolean(error)}
                              className="h-10 min-w-0 flex-1 rounded-lg border border-[#C9DDE3] bg-white px-2 text-center text-sm font-black text-[#16344D] outline-none transition focus:border-[#2F90A1] focus:ring-2 focus:ring-[#2F90A1]/20 disabled:cursor-not-allowed disabled:bg-[#F4F8F9]"
                              dir="ltr"
                            />
                            <button
                              type="button"
                              onClick={() => removePeriod(day.weekday, periodIndex)}
                              disabled={disabled}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#738790] transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`הסרת טווח ${periodIndex + 1} ביום ${WEEKDAY_NAMES_HE[day.weekday]}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addPeriod(day.weekday)}
                          disabled={disabled}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-[#9BCAD2] px-3 text-xs font-black text-[#1D6472] transition hover:border-[#2F90A1] hover:bg-[#E8F3F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F90A1] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          הוספת טווח
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-[#C9DDE3] bg-white/70 px-3 py-4 text-center text-xs font-bold text-[#738790]">אין טווחי שעות. הפעלת היום תוסיף טווח לעריכה.</div>
                    )}

                    {error && <p className="mt-3 flex items-start gap-1.5 text-xs font-black leading-relaxed text-red-600" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>}
                  </article>
                );
              })}
            </div>
          </SettingsGroup>

          {Object.keys(errors).length > 0 && (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold leading-5 text-amber-950">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              יש לתקן את הטווחים המסומנים לפני שמירת פרטי השירות.
            </p>
          )}
          {customSchedule.every((day) => !day.enabled) && Object.keys(errors).length === 0 && (
            <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold leading-5 text-amber-950">
              כל הימים סגורים בלוח הזה. השירות לא יוצע להזמנה באתר עד שתפעילי יום אחד לפחות.
            </p>
          )}
        </>
      )}
    </section>
  );
}
