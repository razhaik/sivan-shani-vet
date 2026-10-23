import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Globe,
  LayoutGrid,
  Mail,
  Megaphone,
  MessageSquare,
  PawPrint,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { ClinicService } from "@/entities";
import { useCrmContext } from "@/components/business-crm/CrmContext";
import type { CrmSettingsSection } from "@/components/business-crm/CrmContext";
import { ProfileAvatar } from "@/components/business-crm/CrmProfileAvatar";
import { CrmProfileMenu } from "@/components/business-crm/CrmProfileMenu";
import type { ReminderSettingsPatch } from "@/components/business-crm/BusinessCrmRemindersSettings";
import { normalizeWeeklyAvailability } from "@/lib/clinicAvailability";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

const DAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;

function shortTime(value: string) {
  return value.replace(/^0(\d):/, "$1:");
}

/** "א׳–ה׳ 9:00–20:00 · ו׳ 9:00–13:00" — consecutive days with the same hours are grouped. */
export function summarizeWeeklyHours(value: unknown): string {
  const days = normalizeWeeklyAvailability(value);
  const byWeekday = new Map(days.map((day) => [day.weekday, day]));
  const groups: Array<{ from: number; to: number; hours: string }> = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const day = byWeekday.get(weekday);
    if (!day?.enabled || day.periods.length === 0) continue;
    const hours = day.periods.map((period) => `${shortTime(period.start)}–${shortTime(period.end)}`).join(", ");
    const last = groups[groups.length - 1];
    if (last && last.to === weekday - 1 && last.hours === hours) last.to = weekday;
    else groups.push({ from: weekday, to: weekday, hours });
  }
  if (groups.length === 0) return "לא הוגדרו שעות פעילות";
  if (groups.length > 2) {
    // Too many different day patterns for one line: show open days and the overall span instead.
    const open = days.filter((day) => day.enabled && day.periods.length > 0);
    const starts = open.flatMap((day) => day.periods.map((period) => period.start)).sort();
    const ends = open.flatMap((day) => day.periods.map((period) => period.end)).sort();
    return `${open.length} ימים בשבוע · \u2066${shortTime(starts[0])}–${shortTime(ends[ends.length - 1])}\u2069`;
  }
  return groups
    .map((group) => `${group.from === group.to ? DAY_LETTERS[group.from] : `${DAY_LETTERS[group.from]}–${DAY_LETTERS[group.to]}`} ⁦${group.hours}⁩`)
    .join(" · ");
}

function reminderTimingLabel(hours: unknown) {
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0 || value === 24) return "יום לפני התור";
  if (value === 48) return "יומיים לפני התור";
  return `${value} שעות לפני התור`;
}

type SettingRecord = Record<string, unknown> | undefined;

interface CrmMobileSettingsHomeProps {
  setting: SettingRecord;
  isLoading: boolean;
  hasError: boolean;
  onOpenSection: (section: CrmSettingsSection) => void;
  onSaveReminders: (patch: ReminderSettingsPatch) => Promise<void>;
}

function Toggle({ checked, busy, label, onChange }: { checked: boolean; busy: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={busy}
      className={`ms-toggle${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <i aria-hidden="true" />
    </button>
  );
}

export default function CrmMobileSettingsHome({ setting, isLoading, hasError, onOpenSection, onSaveReminders }: CrmMobileSettingsHomeProps) {
  const { user, updateUserProfile, openView, openAppMarketplace } = useCrmContext();
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [savingToggle, setSavingToggle] = useState<"sms" | "email" | null>(null);
  const [optimistic, setOptimistic] = useState<{ sms?: boolean; email?: boolean }>({});
  const [toggleError, setToggleError] = useState<string | null>(null);

  const servicesQuery = useQuery({
    queryKey: ["business-crm", "clinic-services-summary"],
    queryFn: async () => {
      const result = await ClinicService.list("sort_order", 500);
      return Array.isArray(result) ? (result as Array<Record<string, unknown>>) : [];
    },
  });
  const activeServices = (servicesQuery.data ?? []).filter((service) => service.is_active !== false && service.is_active !== "false");

  const fullName = String(user?.full_name ?? "").trim();
  const email = String(user?.email ?? "").trim();
  const imageUrl = String(user?.profile_image_url ?? "").trim() || undefined;
  const displayName = fullName || VETERINARY_CLINIC_PROFILE.shortName;

  const smsEnabled = optimistic.sms ?? setting?.enable_sms_reminders === true;
  const emailEnabled = optimistic.email ?? setting?.enable_email_reminders !== false;
  const canToggle = !isLoading && !hasError;

  const saveToggle = async (key: "sms" | "email", next: boolean) => {
    if (!canToggle || savingToggle) return;
    setSavingToggle(key);
    setToggleError(null);
    setOptimistic((current) => ({ ...current, [key]: next }));
    try {
      await onSaveReminders(key === "sms" ? { enable_sms_reminders: next } : { enable_email_reminders: next });
      setOptimistic((current) => ({ ...current, [key]: undefined }));
    } catch (error) {
      setOptimistic((current) => ({ ...current, [key]: undefined }));
      setToggleError(error instanceof Error && error.message ? error.message : "לא הצלחנו לשמור את השינוי. נסי שוב.");
    } finally {
      setSavingToggle(null);
    }
  };

  const bookingUrl = `${VETERINARY_CLINIC_PROFILE.publicOrigin.replace(/\/$/, "")}/appointments`;
  const bookingHost = VETERINARY_CLINIC_PROFILE.publicOrigin.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const reminderTiming = reminderTimingLabel(setting?.reminder_day_before_hours);

  return (
    <div className="bn bn-settings" dir="rtl">
      <div className="ms-wrap">
        <header className="ms-top">
          <button type="button" className="ms-back press" aria-label="חזרה למסך הניהול" onClick={() => openView({ kind: "overview" })}>
            <ChevronRight aria-hidden="true" />
          </button>
          <h1>הגדרות</h1>
        </header>

        <section className="ms-profile" aria-label="הפרופיל שלי">
          <button
            ref={profileButtonRef}
            type="button"
            className="ms-avatar press"
            aria-label="עריכת תמונת הפרופיל והשם"
            aria-haspopup="dialog"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen(true)}
          >
            <ProfileAvatar name={displayName} imageUrl={imageUrl} className="h-full w-full" fallbackClassName="text-[22px]" imageWidth={160} />
          </button>
          <div className="ms-profile-text">
            <b dir="auto">{displayName}</b>
            <small>{VETERINARY_CLINIC_PROFILE.categoryLabel || "מרפאה וטרינרית"}</small>
          </div>
          <button type="button" className="ms-edit press" onClick={() => setProfileOpen(true)} aria-haspopup="dialog">
            <Pencil aria-hidden="true" />עריכה
          </button>
        </section>

        <section className="ms-group" aria-labelledby="ms-clinic-title">
          <h2 id="ms-clinic-title">המרפאה</h2>
          <div className="ms-list">
            <button type="button" className="ms-row" onClick={() => onOpenSection("calendar")}>
              <span className="ms-ic" aria-hidden="true"><CalendarClock /></span>
              <span className="ms-tx"><b>שעות פעילות</b><small>{isLoading ? "טוענים..." : summarizeWeeklyHours(setting?.weekly_availability)}</small></span>
              <span className="ms-end" aria-hidden="true"><ChevronLeft /></span>
            </button>
            <button type="button" className="ms-row" onClick={() => onOpenSection("services")}>
              <span className="ms-ic" aria-hidden="true"><PawPrint /></span>
              <span className="ms-tx">
                <b>השירותים שלי</b>
                <small>{servicesQuery.isLoading ? "טוענים..." : activeServices.length > 0 ? activeServices.slice(0, 3).map((service) => String(service.name ?? "").trim()).filter(Boolean).join(", ") : "קטלוג, משך ותשלום"}</small>
              </span>
              <span className="ms-end">{activeServices.length > 0 && <em>{activeServices.length}</em>}<ChevronLeft aria-hidden="true" /></span>
            </button>
            <a className="ms-row" href={bookingUrl} target="_blank" rel="noreferrer">
              <span className="ms-ic" aria-hidden="true"><Globe /></span>
              <span className="ms-tx"><b>עמוד הזימון</b><small dir="ltr">{bookingHost}</small></span>
              <span className="ms-end" aria-hidden="true"><ChevronLeft /></span>
            </a>
          </div>
        </section>

        <section className="ms-group" aria-labelledby="ms-reminders-title">
          <h2 id="ms-reminders-title">תזכורות ללקוחות</h2>
          <div className="ms-list">
            <div className="ms-row">
              <span className="ms-ic" aria-hidden="true"><MessageSquare /></span>
              <span className="ms-tx"><b>תזכורת SMS</b><small>{reminderTiming}</small></span>
              <Toggle checked={smsEnabled} busy={savingToggle === "sms" || !canToggle} label="תזכורת SMS ללקוחות" onChange={(next) => void saveToggle("sms", next)} />
            </div>
            <div className="ms-row">
              <span className="ms-ic" aria-hidden="true"><Mail /></span>
              <span className="ms-tx"><b>תזכורת במייל</b><small>{reminderTiming}</small></span>
              <Toggle checked={emailEnabled} busy={savingToggle === "email" || !canToggle} label="תזכורת במייל ללקוחות" onChange={(next) => void saveToggle("email", next)} />
            </div>
            <button type="button" className="ms-row" onClick={() => onOpenSection("reminders")}>
              <span className="ms-ic" aria-hidden="true"><Bell /></span>
              <span className="ms-tx"><b>תזמון ונוסח ההודעות</b><small>מתי נשלחות ומה כתוב בהן</small></span>
              <span className="ms-end" aria-hidden="true"><ChevronLeft /></span>
            </button>
            <button type="button" className="ms-row" onClick={() => onOpenSection("selfService")}>
              <span className="ms-ic" aria-hidden="true"><ShieldCheck /></span>
              <span className="ms-tx"><b>ניהול תורים עצמאי</b><small>לקוחות משנים או מבטלים תור בעצמם</small></span>
              <span className="ms-end" aria-hidden="true"><ChevronLeft /></span>
            </button>
          </div>
          {toggleError && <p className="ms-error" role="alert">{toggleError}</p>}
        </section>

        <section className="ms-group" aria-labelledby="ms-manage-title">
          <h2 id="ms-manage-title">ניהול</h2>
          <div className="ms-list">
            <button type="button" className="ms-row" onClick={() => openView({ kind: "sales" })}>
              <span className="ms-ic" aria-hidden="true"><BarChart3 /></span>
              <span className="ms-tx"><b>מכירות ונתונים</b></span>
              <span className="ms-end" aria-hidden="true"><ChevronLeft /></span>
            </button>
            <button type="button" className="ms-row" onClick={() => openView({ kind: "marketing", subview: "automatic" })}>
              <span className="ms-ic" aria-hidden="true"><Megaphone /></span>
              <span className="ms-tx"><b>שיווק</b></span>
              <span className="ms-end" aria-hidden="true"><ChevronLeft /></span>
            </button>
            <button type="button" className="ms-row" onClick={(event) => openAppMarketplace(event.currentTarget)}>
              <span className="ms-ic" aria-hidden="true"><LayoutGrid /></span>
              <span className="ms-tx"><b>חנות אפליקציות</b></span>
              <span className="ms-end" aria-hidden="true"><ChevronLeft /></span>
            </button>
            <button type="button" className="ms-row" onClick={() => onOpenSection("notifications")}>
              <span className="ms-ic" aria-hidden="true"><Bell /></span>
              <span className="ms-tx"><b>התראות</b><small>בקשות תור ופניות חדשות</small></span>
              <span className="ms-end" aria-hidden="true"><ChevronLeft /></span>
            </button>
          </div>
        </section>
      </div>

      {profileOpen && typeof document !== "undefined" && createPortal(
        <CrmProfileMenu
          isOpen
          anchorRef={profileButtonRef}
          profile={{ fullName, email, imageUrl }}
          onClose={(restoreFocus = true) => {
            setProfileOpen(false);
            if (restoreFocus) window.requestAnimationFrame(() => profileButtonRef.current?.focus());
          }}
          onProfileUpdated={updateUserProfile}
        />,
        document.body,
      )}
    </div>
  );
}
