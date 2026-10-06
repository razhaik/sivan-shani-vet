import { useEffect, useMemo, useState } from "react";
import { format, isAfter, isValid, parse } from "date-fns";
import { he } from "date-fns/locale";
import { Check, LayoutGrid, Loader2, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import { DashboardLayoutPreference } from "@/entities";
import { useCrmContext, type CrmRecord } from "@/components/business-crm/CrmContext";
import { aggregateClients } from "@/lib/clientAggregation";
import { SEO } from "@/components/SEO";
import { CrmDashboardCards, type CrmClientSummary, type CrmUpcomingSummary } from "@/components/business-crm/CrmDashboardCards";
import {
  createDefaultCrmWidgetLayout,
  DEFAULT_CRM_WIDGET_ORDER,
  normalizeCrmDashboardLayout,
  normalizeWidgetLayout,
  type CrmWidgetId,
  type CrmWidgetLayout,
} from "@/lib/crmDashboardLayout";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";
type LayoutFeedback = { kind: "success" | "error" | "info"; text: string };

function localAppointmentDate(dateValue?: unknown, timeValue?: unknown) {
  const date = String(dateValue ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = String(timeValue ?? "00:00").slice(0, 5) || "00:00";
  const parsed = parse(`${date} ${time}`, "yyyy-MM-dd HH:mm", new Date());
  return isValid(parsed) ? parsed : null;
}

function activityLabel(dateValue?: string) {
  const date = localAppointmentDate(dateValue, "12:00");
  return date ? `פעילות אחרונה ${format(date, "d בMMMM", { locale: he })}` : "אין תאריך פעילות";
}

function firstLayoutRecord(value: unknown): CrmRecord | null {
  if (!Array.isArray(value)) return null;
  const record = value.find((entry) => entry && typeof entry === "object");
  return record ? record as CrmRecord : null;
}

function ContentLoading() {
  return <div dir="rtl" className="flex min-h-[260px] items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white px-6 text-center"><div><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5267A8]" /><p className="mt-4 text-sm font-extrabold text-[#1A1A3E]">טוען את נתוני מסך הניהול...</p><p className="mt-1 text-xs font-medium text-slate-500">המסך יישאר זמין בזמן טעינת הרשומות.</p></div></div>;
}

function LayoutLoading() {
  return <div dir="rtl" role="status" aria-live="polite" className="flex min-h-[220px] items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white px-6 text-center"><div><Loader2 aria-hidden="true" className="mx-auto h-7 w-7 animate-spin text-[#5267A8]" /><p className="mt-3 text-sm font-extrabold text-[#1A1A3E]">טוען את סידור הכרטיסים...</p><p className="mt-1 text-xs font-medium text-slate-500">הכרטיסים יופיעו מיד לאחר טעינת הסידור השמור.</p></div></div>;
}

function ContentError({ onRetry }: { onRetry: () => void }) {
  return <div dir="rtl" className="flex min-h-[260px] items-center justify-center rounded-2xl border border-red-100 bg-white px-5 text-center"><div className="max-w-md"><ShieldAlert className="mx-auto h-9 w-9 text-red-500" /><h1 className="mt-4 text-lg font-extrabold text-[#1A1A3E]">לא הצלחנו לטעון את נתוני המרפאה</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">אפשר לנסות שוב. אם הבעיה נמשכת, חזרי למערכת התורים הקיימת.</p><button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><RefreshCw className="h-4 w-4" />נסי שוב</button></div></div>;
}

function LayoutFeedback({ feedback }: { feedback: LayoutFeedback | null }) {
  if (!feedback) return null;
  const isError = feedback.kind === "error";
  return <div role={isError ? "alert" : "status"} className={`mb-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${isError ? "border-red-100 bg-red-50 text-red-700" : feedback.kind === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-[#E6E9F3] bg-[#F7F8FF] text-[#5267A8]"}`}><Check className="h-4 w-4 shrink-0" />{feedback.text}</div>;
}

export default function BusinessCrmDashboard() {
  const { user, appointments, inquiries, archivedClientKeys, search, isDataLoading, dataError, refreshData, openView } = useCrmContext();
  const [leadPeriod, setLeadPeriod] = useState<"year" | "month">("year");
  const [widgetOrder, setWidgetOrder] = useState<CrmWidgetId[]>(() => [...DEFAULT_CRM_WIDGET_ORDER]);
  const [widgetLayout, setWidgetLayout] = useState<CrmWidgetLayout[]>(createDefaultCrmWidgetLayout);
  const [layoutPreference, setLayoutPreference] = useState<CrmRecord | null>(null);
  const [isLayoutLoading, setIsLayoutLoading] = useState(true);
  const [layoutError, setLayoutError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<LayoutFeedback | null>(null);
  const userIdentity = String(user?.id || user?.email || "");

  useEffect(() => {
    let active = true;
    setIsLayoutLoading(true);
    setLayoutError(false);
    setLayoutPreference(null);
    setWidgetOrder([...DEFAULT_CRM_WIDGET_ORDER]);
    setWidgetLayout(createDefaultCrmWidgetLayout());
    DashboardLayoutPreference.list("-updated_at", 1)
      .then((records) => {
        if (!active) return;
        const record = firstLayoutRecord(records);
        const normalized = normalizeCrmDashboardLayout(record?.widget_order, record?.widget_layout);
        setLayoutPreference(record);
        setWidgetOrder(normalized.order);
        setWidgetLayout(normalized.widgetLayout);
      })
      .catch((error) => {
        console.error("Failed to load dashboard layout preference:", error);
        if (!active) return;
        setLayoutPreference(null);
        setWidgetOrder([...DEFAULT_CRM_WIDGET_ORDER]);
        setWidgetLayout(createDefaultCrmWidgetLayout());
        setLayoutError(true);
      })
      .finally(() => { if (active) setIsLayoutLoading(false); });
    return () => { active = false; };
  }, [userIdentity]);

  const clients = useMemo<CrmClientSummary[]>(() => aggregateClients(appointments).filter((client) => client.appointmentCount > 0 && !archivedClientKeys.has(`client:${client.id}`)).map((client) => ({ id: client.id, name: client.name, lastActivityLabel: activityLabel(client.lastAppointmentDate), appointmentCount: client.appointmentCount, isNew: client.isNew, petNames: client.pets.map((pet) => pet.name).filter(Boolean) })), [appointments, archivedClientKeys]);
  const upcomingAppointments = useMemo<CrmUpcomingSummary[]>(() => {
    const now = new Date();
    return appointments.filter((appointment) => appointment.status === "requested" || appointment.status === "confirmed").map((appointment) => ({ appointment, date: localAppointmentDate(appointment.date, appointment.start_time) })).filter((item): item is { appointment: CrmRecord; date: Date } => Boolean(item.date && isAfter(item.date, now))).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 24).map(({ appointment, date }) => ({ id: String(appointment.id || `${appointment.date}-${appointment.start_time}-${appointment.client_name}`), clientName: String(appointment.client_name || "לקוח ללא שם"), petName: String(appointment.pet_name || ""), appointmentType: String(appointment.appointment_type || "סוג פגישה לא צוין"), status: String(appointment.status), dateKey: String(appointment.date), dateLabel: format(date, "d בMMMM", { locale: he }), weekday: format(date, "EEEE", { locale: he }), dayNumber: format(date, "dd"), timeLabel: `${String(appointment.start_time || "--:--").slice(0, 5)}–${String(appointment.end_time || "").slice(0, 5)}` }));
  }, [appointments]);
  const normalizedSearch = search.trim().toLocaleLowerCase("he");
  const filteredClients = useMemo(() => normalizedSearch ? clients.filter((client) => `${client.name} ${client.petNames.join(" ")}`.toLocaleLowerCase("he").includes(normalizedSearch)) : clients, [clients, normalizedSearch]);
  const filteredAppointments = useMemo(() => normalizedSearch ? upcomingAppointments.filter((appointment) => `${appointment.clientName} ${appointment.petName} ${appointment.appointmentType}`.toLocaleLowerCase("he").includes(normalizedSearch)) : upcomingAppointments, [normalizedSearch, upcomingAppointments]);
  const leadsCount = useMemo(() => {
    const now = new Date();
    return inquiries.filter((inquiry) => { const created = new Date(String(inquiry.created_at || "")); if (!isValid(created)) return false; return leadPeriod === "year" ? created.getFullYear() === now.getFullYear() : created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth(); }).length;
  }, [inquiries, leadPeriod]);

  async function saveLayout() {
    if (isSaving) return;
    const nextOrder = normalizeCrmDashboardLayout(widgetOrder, widgetLayout).order;
    const nextLayout = normalizeWidgetLayout(widgetLayout);
    setIsSaving(true);
    setFeedback(null);
    try {
      const payload = { widget_order: nextOrder, widget_layout: nextLayout };
      const saved = layoutPreference?.id ? await DashboardLayoutPreference.update(String(layoutPreference.id), payload) : await DashboardLayoutPreference.create(payload);
      if (saved && typeof saved === "object") setLayoutPreference(saved as CrmRecord);
      setWidgetOrder(nextOrder);
      setWidgetLayout(nextLayout);
      setIsEditing(false);
      setFeedback({ kind: "success", text: "סדר וגודל הכרטיסים נשמרו בהצלחה." });
    } catch (error) {
      console.error("Failed to save dashboard layout preference:", error);
      setFeedback({ kind: "error", text: "שמירת סדר וגודל הכרטיסים נכשלה. השינויים נשמרו במסך, אפשר לנסות שוב." });
    } finally { setIsSaving(false); }
  }

  function startEditing() { setFeedback(null); setIsEditing(true); }
  function resetLayout() {
    setWidgetOrder([...DEFAULT_CRM_WIDGET_ORDER]);
    setWidgetLayout(createDefaultCrmWidgetLayout());
    setFeedback({ kind: "info", text: "סדר וגודל ברירת המחדל הוחזרו במסך. לחצי על סיום ושמירה כדי לשמור אותם." });
  }

  return <>
    <SEO title={`מסך ניהול | ${VETERINARY_CLINIC_PROFILE.businessName}`} description={`מסך ניהול עסקי פרטי ל${VETERINARY_CLINIC_PROFILE.categoryLabel} של ${VETERINARY_CLINIC_PROFILE.shortName}.`} url={`${VETERINARY_CLINIC_PROFILE.publicOrigin}${VETERINARY_CLINIC_PROFILE.crmBasePath}`} noindex siteName={VETERINARY_CLINIC_PROFILE.businessName} />
    {isDataLoading ? <ContentLoading /> : dataError ? <ContentError onRetry={refreshData} /> : <div id="crm-overview" dir="rtl">
      <div className="mb-5 flex max-w-5xl flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-2xl"><p className="mb-2 text-xs font-extrabold tracking-wide text-slate-500">{VETERINARY_CLINIC_PROFILE.businessName}</p><h1 className="text-3xl font-black tracking-tight text-[#1A1A3E] sm:text-4xl">מסך ניהול</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">{isEditing ? "גררי את הכרטיסים, ושני את הרוחב או הגובה בעזרת הידיות. השינויים יישמרו רק לאחר לחיצה על סיום ושמירה." : "תמונת מצב יומית של הלקוחות, התורים והפניות במרפאה."}</p></div><div className="flex shrink-0 flex-wrap items-center gap-2">{isEditing && <button type="button" onClick={resetLayout} disabled={isSaving} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#D9DEE8] bg-white px-4 text-xs font-extrabold text-[#5267A8] transition hover:border-[#5267A8] hover:bg-[#F7F8FF] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60"><RotateCcw className="h-4 w-4" />איפוס לברירת המחדל</button>}<button type="button" onClick={isEditing ? saveLayout : startEditing} disabled={isLayoutLoading || isSaving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEditing ? <Check className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}{isSaving ? "שומרת..." : isEditing ? "סיום ושמירה" : "התאמה אישית"}</button></div></div>
      <LayoutFeedback feedback={feedback} />
      {!isLayoutLoading && layoutError && !feedback && <p className="mb-5 text-xs font-semibold text-slate-500">לא ניתן היה לטעון את פריסת הכרטיסים השמורה, לכן מוצגים סדר וגודל ברירת המחדל.</p>}
      {isLayoutLoading ? <LayoutLoading /> : <CrmDashboardCards clients={filteredClients} upcomingAppointments={filteredAppointments} search={search} leadsCount={leadsCount} leadPeriod={leadPeriod} onLeadPeriodChange={setLeadPeriod} onOpenCalendar={() => openView({ kind: "calendar" })} onOpenClients={() => openView({ kind: "clients" })} widgetOrder={widgetOrder} widgetLayout={widgetLayout} isEditing={isEditing} onOrderChange={setWidgetOrder} onLayoutChange={setWidgetLayout} />}
    </div>}
  </>;
}
