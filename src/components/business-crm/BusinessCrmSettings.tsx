import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Bell, BellRing, CalendarClock, ChevronLeft, Info, RefreshCw, ShieldCheck, Stethoscope } from "lucide-react";
import { ClinicSettings } from "@/entities";
import { SEO } from "@/components/SEO";
import GeneralAvailabilitySettings from "@/components/dashboard-mobile/GeneralAvailabilitySettings";
import BusinessCrmRemindersSettings, { type ReminderSettingsPatch } from "@/components/business-crm/BusinessCrmRemindersSettings";
import BusinessCrmServicesSettings from "@/components/business-crm/BusinessCrmServicesSettings";
import BusinessCrmNotificationsSettings from "@/components/business-crm/BusinessCrmNotificationsSettings";
import BusinessCrmSelfServiceSettings, { type SelfServiceSettingsPayload } from "@/components/business-crm/BusinessCrmSelfServiceSettings";
import CalendarAppointmentSyncSection from "@/components/business-crm/CalendarAppointmentSyncSection";
import { SettingsGroup } from "@/components/business-crm/SettingsPrimitives";
import { type WeeklyAvailability } from "@/lib/clinicAvailability";
import type { CrmSettingsSection } from "@/components/business-crm/CrmContext";
import { VETERINARY_CLINIC_PROFILE, clinicDisplayLabel } from "@/lib/clinicProfile";

const clinicSettingsQueryKey = ["business-crm", "clinic-settings"] as const;
type SettingsSection = CrmSettingsSection;

interface BusinessCrmSettingsProps {
  initialSection?: CrmSettingsSection;
}

const settingsOptions = [
  {
    id: "calendar",
    label: "הגדרות יומן",
    description: "שעות פעילות וזמינות שבועית לקביעת תורים",
    icon: CalendarClock,
  },
  {
    id: "services",
    label: "השירותים שלי",
    description: "קטלוג השירותים, משך הפגישה ואפשרויות התשלום",
    icon: Stethoscope,
  },
  {
    id: "reminders",
    label: "תזכורות SMS ומייל ללקוח",
    description: "ערוצי שליחה, תזמון תזכורות ונוסחי הודעות ללקוחות",
    icon: BellRing,
  },
  {
    id: "notifications",
    label: "הגדרות התראות",
    description: "מי מקבל עדכונים על פעילות חדשה במרפאה ובאילו ערוצים",
    icon: Bell,
  },
  {
    id: "selfService",
    label: "ניהול תורים עצמאי ללקוח",
    description: "קביעת האפשרות והזמן המינימלי מראש שבו לקוח יכול לשנות או לבטל תור בעצמו.",
    icon: ShieldCheck,
  },
] as const;

export default function BusinessCrmSettings({ initialSection }: BusinessCrmSettingsProps) {
  const queryClient = useQueryClient();
  const overviewListFirstButtonRef = useRef<HTMLButtonElement>(null);
  const detailBackButtonRef = useRef<HTMLButtonElement>(null);
  const previousSectionRef = useRef<SettingsSection | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(() => initialSection ?? null);
  const [visitedSections, setVisitedSections] = useState<Record<SettingsSection, boolean>>(() => ({
    calendar: initialSection === "calendar",
    services: initialSection === "services",
    reminders: initialSection === "reminders",
    notifications: initialSection === "notifications",
    selfService: initialSection === "selfService",
  }));
  const settingsQuery = useQuery({
    queryKey: clinicSettingsQueryKey,
    queryFn: () => ClinicSettings.list("-created_at", 1),
  });
  const setting = Array.isArray(settingsQuery.data) ? settingsQuery.data[0] : undefined;

  useEffect(() => {
    if (previousSectionRef.current === settingsSection) return;
    previousSectionRef.current = settingsSection;

    if (settingsSection === null) {
      overviewListFirstButtonRef.current?.focus();
    } else {
      detailBackButtonRef.current?.focus();
    }
  }, [settingsSection]);

  const selectedSetting = settingsSection === null
    ? undefined
    : settingsOptions.find((option) => option.id === settingsSection);
  const activeSettingsTitle = selectedSetting?.label || "הגדרות המרפאה";

  useEffect(() => {
    if (typeof document !== "undefined") document.title = `${activeSettingsTitle} | ${VETERINARY_CLINIC_PROFILE.shortName}`;
  }, [activeSettingsTitle]);

  const handleSave = async (weeklyAvailability: WeeklyAvailability) => {
    if (settingsQuery.isLoading) {
      throw new Error("הגדרות המרפאה עדיין נטענות.");
    }
    if (settingsQuery.error) {
      throw new Error("לא ניתן לשמור לפני טעינה תקינה של הגדרות המרפאה.");
    }

    if (setting?.id) {
      await ClinicSettings.update(setting.id, { weekly_availability: weeklyAvailability });
    } else {
      await ClinicSettings.create({ weekly_availability: weeklyAvailability });
    }

    const refreshKeys = [
      clinicSettingsQueryKey,
      ["settings"],
      ["clinic-settings"],
    ] as const;

    await Promise.all(refreshKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    await Promise.all(refreshKeys.map((queryKey) => queryClient.refetchQueries({ queryKey })));
  };

  const handleSaveReminders = async (reminderSettings: ReminderSettingsPatch) => {
    if (settingsQuery.isLoading) {
      throw new Error("הגדרות המרפאה עדיין נטענות. נסי שוב לאחר שהטעינה תסתיים.");
    }
    if (settingsQuery.error) {
      throw new Error("לא ניתן לשמור לפני טעינה תקינה של הגדרות המרפאה.");
    }

    if (setting?.id) {
      await ClinicSettings.update(setting.id, reminderSettings);
    } else {
      await ClinicSettings.create(reminderSettings);
    }

    const refreshKeys = [
      clinicSettingsQueryKey,
      ["settings"],
      ["clinic-settings"],
    ] as const;

    await Promise.all(refreshKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    await Promise.all(refreshKeys.map((queryKey) => queryClient.refetchQueries({ queryKey })));
  };

  const handleSaveSelfService = async (selfServiceSettings: SelfServiceSettingsPayload) => {
    if (settingsQuery.isLoading) {
      throw new Error("הגדרות המרפאה עדיין נטענות.");
    }
    if (settingsQuery.error) {
      throw new Error("לא ניתן לשמור לפני טעינה תקינה של הגדרות המרפאה.");
    }

    if (setting?.id) {
      await ClinicSettings.update(setting.id, selfServiceSettings);
    } else {
      await ClinicSettings.create(selfServiceSettings);
    }

    const refreshKeys = [
      clinicSettingsQueryKey,
      ["settings"],
      ["clinic-settings"],
    ] as const;

    await Promise.all(refreshKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    await Promise.all(refreshKeys.map((queryKey) => queryClient.refetchQueries({ queryKey })));
  };

  const selectSettingsSection = (section: SettingsSection) => {
    setSettingsSection(section);
    setVisitedSections((current) => (current[section] ? current : { ...current, [section]: true }));
  };

  const showSettingsOverview = () => setSettingsSection(null);

  return (
    <>
      <SEO title={`הגדרות | ${VETERINARY_CLINIC_PROFILE.shortName}`} description={`הגדרות יומן, שירותים, תזכורות ללקוחות והתראות לבעלת העסק במרפאה הווטרינרית של ${VETERINARY_CLINIC_PROFILE.shortName}.`} url={`${VETERINARY_CLINIC_PROFILE.publicOrigin}${VETERINARY_CLINIC_PROFILE.crmBasePath}/settings`} noindex siteName={VETERINARY_CLINIC_PROFILE.businessName} />
      <div dir="rtl" className={settingsSection === null ? "space-y-5" : "space-y-6"}>
        <div className="max-w-3xl">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8F3F5] text-[#1D6472]" aria-hidden="true">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-extrabold tracking-[0.1em] text-[#2F8794]">{clinicDisplayLabel(VETERINARY_CLINIC_PROFILE)}</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-[#16344D] sm:text-4xl">הגדרות המרפאה</h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#738790]">כל מה שצריך כדי לנהל את שעות הפעילות, השירותים, התזכורות והעדכונים במקום אחד.</p>
            </div>
          </div>
        </div>

        <section hidden={settingsSection !== null} className="w-full" aria-label="בחירת הגדרה">
          <SettingsGroup
            title="תחומי ההגדרה"
            footer="בחרי תחום כדי לפתוח את ההגדרה המלאה. העריכות נשמרות לפי ההתנהגות של כל מסך."
          >
            <nav aria-label="בחירת הגדרה">
              <ul className="-mx-4 divide-y divide-[#E2EBEE]">
                {settingsOptions.map((option) => {
                  const isActive = settingsSection === option.id;
                  const SettingIcon = option.icon;
                  const panelId = option.id === "calendar"
                    ? "crm-calendar-settings-panel"
                    : option.id === "services"
                      ? "crm-services-settings-panel"
                      : option.id === "reminders"
                        ? "crm-reminders-settings-panel"
                        : option.id === "notifications"
                          ? "crm-notifications-settings-panel"
                          : "crm-self-service-settings-panel";
                  return (
                    <li key={option.id}>
                      <button
                        ref={option.id === "calendar" ? overviewListFirstButtonRef : undefined}
                        type="button"
                        aria-current={isActive ? "page" : undefined}
                        aria-controls={panelId}
                        onClick={() => selectSettingsSection(option.id)}
                        className={`group flex min-h-[82px] w-full items-center gap-3 px-4 py-3 text-right transition duration-200 focus:outline-none focus-visible:bg-[#F2F8F9] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2F90A1] sm:min-h-[78px] ${isActive ? "bg-[#E8F3F5]" : "hover:bg-[#F2F8F9]"}`}
                      >
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition ${isActive ? "bg-[#2F90A1] text-white" : "bg-[#E8F3F5] text-[#1D6472] group-hover:bg-[#DDEFF2]"}`} aria-hidden="true">
                          <SettingIcon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-black text-[#16344D] sm:text-[17px]">{option.label}</span>
                          <span className="mt-0.5 block max-w-2xl text-sm font-semibold leading-5 text-[#738790]">{option.description}</span>
                        </span>
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${isActive ? "border-[#2F90A1] bg-white text-[#2F90A1]" : "border-[#DCE8EC] bg-white text-[#88A0A8] group-hover:border-[#2F90A1] group-hover:text-[#2F90A1]"}`}>
                          <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </SettingsGroup>
        </section>

        <section
          hidden={settingsSection === null}
          className="w-full min-w-0 space-y-4"
          aria-label={selectedSetting ? `פרטי ${selectedSetting.label}` : "פרטי הגדרה"}
        >
          <div className="rounded-[22px] border border-[#DCE8EC] bg-[#F9FCFC] px-4 py-3.5 shadow-[0_8px_24px_rgba(15,40,66,0.05)] sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                ref={detailBackButtonRef}
                type="button"
                onClick={showSettingsOverview}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[#C9DDE3] bg-white px-4 text-sm font-extrabold text-[#1D6472] transition hover:border-[#2F90A1] hover:bg-[#E8F3F5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F90A1] focus-visible:ring-offset-2"
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                <span>חזרה לכל ההגדרות</span>
              </button>
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#738790]" aria-live="polite" aria-label={selectedSetting ? `הגדרות / ${selectedSetting.label}` : "הגדרות"}>
                <span>הגדרות</span>
                <ChevronLeft className="h-4 w-4 text-[#2F90A1]" aria-hidden="true" />
                <span className="text-[#16344D]">{selectedSetting?.label}</span>
              </div>
            </div>
          </div>

          {visitedSections.calendar && (
            <div hidden={settingsSection !== "calendar"} className="space-y-4">
              {settingsQuery.error && (
                <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                    <span>לא הצלחנו לטעון את הגדרת היומן השמורה. מוצגת ברירת המחדל, ושמירה תתאפשר לאחר טעינה תקינה.</span>
                  </div>
                  <button type="button" onClick={() => void settingsQuery.refetch()} className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />נסי שוב
                  </button>
                </div>
              )}

              <section id="crm-calendar-settings-panel" aria-label="הגדרות יומן" className="overflow-hidden rounded-[24px] border border-[#DCE8EC] bg-[#F9FCFC] shadow-[0_10px_30px_rgba(15,40,66,0.06)]">
                <div className="p-4 sm:p-7">
                  <GeneralAvailabilitySettings value={setting?.weekly_availability} isLoading={settingsQuery.isLoading} onSave={handleSave} />
                </div>
              </section>

              <div className="crm-calendar-sync-settings-mobile">
                <CalendarAppointmentSyncSection />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-[20px] border border-[#DCE8EC] bg-[#F9FCFC] p-5 shadow-[0_8px_24px_rgba(15,40,66,0.04)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F3F5] text-[#1D6472]">
                      <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[#16344D]">מקור אחד לשעות הכלליות</h3>
                      <p className="mt-1.5 text-xs font-semibold leading-6 text-[#738790]">אותו לוח שבועי מנחה את כל מסכי הזמינות. כשאין הגדרה שמורה, המערכת משתמשת בשעות המאושרות כברירת המחדל עד לשמירה מפורשת.</p>
                    </div>
                  </div>
                </article>
                <article className="rounded-[20px] border border-[#DCE8EC] bg-[#F9FCFC] p-5 shadow-[0_8px_24px_rgba(15,40,66,0.04)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F3F5] text-[#2F8794]">
                      <Info className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[#16344D]">חלונות תורים נשארים נפרדים</h3>
                      <p className="mt-1.5 text-xs font-semibold leading-6 text-[#738790]">ההגבלות לפי סוג טיפול ממשיכות לפעול בנוסף לשעות האלה. שינוי הזמינות הכללית לא מוחק ולא מחליף אותן.</p>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          )}

          {visitedSections.services && (
            <div hidden={settingsSection !== "services"} id="crm-services-settings-panel">
              <BusinessCrmServicesSettings />
            </div>
          )}

          {visitedSections.reminders && (
            <div hidden={settingsSection !== "reminders"}>
              <BusinessCrmRemindersSettings
                setting={setting}
                isLoading={settingsQuery.isLoading}
                hasError={Boolean(settingsQuery.error)}
                onRetry={() => settingsQuery.refetch()}
                onSave={handleSaveReminders}
              />
            </div>
          )}

          {visitedSections.notifications && (
            <div hidden={settingsSection !== "notifications"}>
              <BusinessCrmNotificationsSettings onOpenReminders={() => selectSettingsSection("reminders")} />
            </div>
          )}

          {visitedSections.selfService && (
            <div hidden={settingsSection !== "selfService"}>
              <BusinessCrmSelfServiceSettings
                setting={setting as (Record<string, unknown> & { id?: string }) | undefined}
                isLoading={settingsQuery.isLoading}
                hasError={Boolean(settingsQuery.error)}
                onRetry={() => settingsQuery.refetch()}
                onSave={handleSaveSelfService}
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
