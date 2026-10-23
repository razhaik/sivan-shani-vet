import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LayoutGrid, RefreshCw, ShieldAlert } from "lucide-react";
import { Appointment, DashboardLayout, DashboardLayoutPreference } from "@/entities";
import { useCrmContext, type CrmRecord } from "@/components/business-crm/CrmContext";
import { DashboardPage, type DashboardHomeActions, type DashboardHomeData, type DashboardHomeRequestState } from "@/components/business-crm/bento-pages";
import { CrmDashboardCards, type DashboardWidgetRequestState } from "@/components/business-crm/CrmDashboardCards";
import { SEO } from "@/components/SEO";
import {
  createDefaultCrmWidgetLayout,
  DEFAULT_CRM_WIDGET_ORDER,
  migrateLegacyCrmDashboardLayout,
  normalizeCrmDashboardLayout,
  type CrmWidgetId,
  type CrmWidgetLayout,
} from "@/lib/crmDashboardLayout";
import {
  fetchDashboardAppointments,
  fetchDashboardClientSummaries,
  fetchDashboardLeadSummary,
  fetchDashboardPendingApprovals,
  getDashboardAppointmentRange,
  type DashboardClientSummary,
  type DashboardLeadSummary,
} from "@/lib/crmDashboardData";
import { approveAppointmentRequest, rejectAppointmentRequest, type AppointmentDecisionAction, type AppointmentDecisionResult } from "@/lib/crmAppointmentDecision";
import { appointmentSnapshotFromRecord } from "@/lib/crmAppointmentActions";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

function records(value: unknown): CrmRecord[] {
  if (Array.isArray(value)) return value.filter((entry) => entry && typeof entry === "object") as CrmRecord[];
  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).data)) return (value as { data: CrmRecord[] }).data;
  return [];
}

function firstRecord(value: unknown): CrmRecord | null {
  return records(value)[0] || null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "לא הצלחנו לשמור את פריסת הכרטיסים.";
}

async function layoutsForUser(userId: string): Promise<CrmRecord[]> {
  const result = await DashboardLayout.query()
    .where("user_id", userId)
    .sort("-updated_at")
    .limit(20)
    .exec();
  return records(result);
}

function mergeAppointmentRecord(current: CrmRecord, updated: CrmRecord): CrmRecord {
  return String(current.id ?? "") === String(updated.id ?? "") ? { ...current, ...updated } : current;
}

function DashboardLayoutLoadingPlaceholder() {
  return <div role="status" aria-label="טוענים את סידור הווידג׳טים" aria-busy="true" dir="rtl" className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:gap-3 min-[1280px]:grid-cols-3 min-[1440px]:grid-cols-4">
    <span className="sr-only">טוענים את סידור הווידג׳טים</span>
    {Array.from({ length: 6 }, (_, index) => <div key={index} aria-hidden="true" className="min-h-[190px] rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_10px_30px_-24px_rgba(26,26,62,0.65)] sm:p-5">
      <div className="mb-5 flex items-center gap-3"><span className="h-9 w-9 animate-pulse rounded-xl bg-[#F2D162]/[0.25]" /><span className="h-4 w-28 animate-pulse rounded-md bg-[#E7EAF0]" /></div>
      <div className="space-y-3"><span className="block h-4 w-full animate-pulse rounded-md bg-[#F1F3F6]" /><span className="block h-4 w-4/5 animate-pulse rounded-md bg-[#F1F3F6]" /><span className="block h-10 w-full animate-pulse rounded-xl bg-[#F1F3F6]" /></div>
    </div>)}
  </div>;
}

export default function BusinessCrmDashboard() {
  const {
    user,
    search,
    openView,
    inquiries,
    inquiriesIsLoading,
    inquiriesError,
    refreshData,
    notificationCount,
    openNewAppointment,
    openAppointmentInCalendar,
    openMobileMoreMenu,
    updateUserProfile,
    mobileAppointmentDecision,
    scheduleMobileAppointmentDecision,
  } = useCrmContext();
  const queryClient = useQueryClient();
  const userIdentity = String(user?.id || user?.email || "");
  const range = useMemo(() => getDashboardAppointmentRange(), []);
  const appointmentsKey = ["crm-dashboard-widgets", "appointments", userIdentity, range.start, range.end] as const;
  const pendingKey = ["crm-dashboard-widgets", "pending-approvals", userIdentity] as const;
  const clientOverviewKey = ["crm-dashboard-widgets", "client-overview", userIdentity] as const;
  const leadsKey = ["crm-dashboard-widgets", "new-leads", userIdentity, range.today] as const;

  const appointmentsQuery = useQuery({
    queryKey: appointmentsKey,
    queryFn: () => fetchDashboardAppointments(range.start, range.end),
    enabled: Boolean(userIdentity),
    staleTime: 60_000,
  });
  const pendingQuery = useQuery({
    queryKey: pendingKey,
    queryFn: fetchDashboardPendingApprovals,
    enabled: Boolean(userIdentity),
    staleTime: 30_000,
  });
  const clientOverviewQuery = useQuery<DashboardClientSummary[]>({
    queryKey: clientOverviewKey,
    queryFn: fetchDashboardClientSummaries,
    enabled: Boolean(userIdentity),
    staleTime: 60_000,
  });
  const leadsQuery = useQuery<DashboardLeadSummary>({
    queryKey: leadsKey,
    queryFn: () => fetchDashboardLeadSummary(),
    enabled: Boolean(userIdentity),
    staleTime: 60_000,
  });

  const [widgetOrder, setWidgetOrder] = useState<CrmWidgetId[]>(() => [...DEFAULT_CRM_WIDGET_ORDER]);
  const [widgetLayout, setWidgetLayout] = useState<CrmWidgetLayout[]>(createDefaultCrmWidgetLayout);
  const [isLayoutLoading, setIsLayoutLoading] = useState(true);
  const [layoutError, setLayoutError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [layoutReloadVersion, setLayoutReloadVersion] = useState(0);
  const [loadedLayoutRequestKey, setLoadedLayoutRequestKey] = useState<string | null>(null);
  const [saveRetryVersion, setSaveRetryVersion] = useState(0);
  const layoutRequestKey = `${userIdentity}:${layoutReloadVersion}`;
  const isLayoutPending = isLayoutLoading || loadedLayoutRequestKey !== layoutRequestKey;
  const layoutRecordRef = useRef<CrmRecord | null>(null);
  const layoutSessionRef = useRef(0);
  const layoutSaveVersionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const session = ++layoutSessionRef.current;
    const requestKey = `${userIdentity}:${layoutReloadVersion}`;
    let active = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    layoutRecordRef.current = null;
    setIsLayoutLoading(true);
    setLayoutError(false);
    setSaveError(false);
    setIsEditing(false);
    setWidgetOrder([...DEFAULT_CRM_WIDGET_ORDER]);
    setWidgetLayout(createDefaultCrmWidgetLayout());

    async function loadLayout() {
      if (!userIdentity) {
        if (active) {
          setLayoutError(true);
          setIsLayoutLoading(false);
          setLoadedLayoutRequestKey(requestKey);
        }
        return;
      }
      try {
        const storedRows = await layoutsForUser(userIdentity);
        if (!active || session !== layoutSessionRef.current) return;
        const storedLayout = storedRows[0] || null;
        if (storedLayout) {
          layoutRecordRef.current = storedLayout;
          const normalized = normalizeCrmDashboardLayout(storedLayout.items);
          setWidgetOrder(normalized.order);
          setWidgetLayout(normalized.widgetLayout);
        } else {
          const legacyRecord = firstRecord(await DashboardLayoutPreference.list("-updated_at", 1));
          if (!active || session !== layoutSessionRef.current) return;
          const migrated = legacyRecord
            ? migrateLegacyCrmDashboardLayout(legacyRecord.widget_order, legacyRecord.widget_layout)
            : normalizeCrmDashboardLayout(createDefaultCrmWidgetLayout());
          setWidgetOrder(migrated.order);
          setWidgetLayout(migrated.widgetLayout);
        }
        setIsLayoutLoading(false);
        setLoadedLayoutRequestKey(requestKey);
      } catch (error) {
        console.error("Failed to load the personal dashboard layout:", error);
        if (!active || session !== layoutSessionRef.current) return;
        layoutRecordRef.current = null;
        setLayoutError(true);
        setIsLayoutLoading(false);
        setLoadedLayoutRequestKey(requestKey);
      }
    }

    void loadLayout();
    return () => {
      active = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (layoutSessionRef.current === session) layoutSessionRef.current += 1;
    };
  }, [layoutReloadVersion, userIdentity]);

  useEffect(() => {
    if (!userIdentity || isLayoutLoading || layoutError || loadedLayoutRequestKey !== layoutRequestKey) return;
    const layoutItems = widgetOrder.map((widgetId) => ({
      widget_id: widgetId,
      size: widgetLayout.find((item) => item.widget_id === widgetId)?.size
        || createDefaultCrmWidgetLayout().find((item) => item.widget_id === widgetId)!.size,
    }));
    const normalized = normalizeCrmDashboardLayout(layoutItems);
    const payload = {
      user_id: userIdentity,
      items: normalized.order.map((widgetId) => ({
        widget_id: widgetId,
        size: normalized.widgetLayout.find((item) => item.widget_id === widgetId)!.size,
      })),
    };
    const version = ++layoutSaveVersionRef.current;
    const session = layoutSessionRef.current;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      const persistLatestLayout = async () => {
        if (session !== layoutSessionRef.current) return;
        try {
          let target = layoutRecordRef.current;
          if (!target?.id) {
            const latestRows = await layoutsForUser(userIdentity);
            if (session !== layoutSessionRef.current) return;
            target = latestRows[0] || null;
            if (target) layoutRecordRef.current = target;
          }
          if (session !== layoutSessionRef.current) return;
          const saved = target?.id
            ? await DashboardLayout.update(String(target.id), payload)
            : await DashboardLayout.create(payload);
          if (session !== layoutSessionRef.current) return;
          if (saved && typeof saved === "object") layoutRecordRef.current = saved as CrmRecord;
          if (version === layoutSaveVersionRef.current) setSaveError(false);
        } catch (error) {
          console.error("Failed to save the personal dashboard layout:", error);
          if (session === layoutSessionRef.current && version === layoutSaveVersionRef.current) setSaveError(true);
        }
      };
      saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(persistLatestLayout);
    }, 300);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isLayoutLoading, layoutError, layoutRequestKey, loadedLayoutRequestKey, saveRetryVersion, userIdentity, widgetLayout, widgetOrder]);

  const onAppointmentDecision = useCallback(async (record: CrmRecord, action: AppointmentDecisionAction): Promise<AppointmentDecisionResult> => {
    const snapshot = appointmentSnapshotFromRecord(record);
    const result = action === "approve"
      ? await approveAppointmentRequest(snapshot)
      : await rejectAppointmentRequest(snapshot);
    const status = action === "approve" ? "confirmed" : "cancelled";
    const updatedRecord: CrmRecord = {
      ...record,
      status,
      inbox_handled_at: new Date().toISOString(),
      ...(action === "reject" ? { cancelled_by: "admin" } : {}),
      ...(result.googleEventId ? { google_event_id: result.googleEventId } : {}),
    };

    queryClient.setQueryData<CrmRecord[]>(pendingKey, (current) => (current || []).filter((item) => String(item.id ?? "") !== snapshot.id));
    queryClient.setQueryData<CrmRecord[]>(appointmentsKey, (current) => {
      if (!current) return current;
      return action === "reject" ? current.filter((item) => String(item.id ?? "") !== snapshot.id) : current.map((item) => mergeAppointmentRecord(item, updatedRecord));
    });
    queryClient.setQueryData<CrmRecord[]>(["business-crm", "appointments", userIdentity], (current) => current?.map((item) => mergeAppointmentRecord(item, updatedRecord)));
    void queryClient.invalidateQueries({ queryKey: clientOverviewKey });
    return result;
  }, [appointmentsKey, clientOverviewKey, pendingKey, queryClient, userIdentity]);

  const onCheckIn = useCallback(async (record: CrmRecord) => {
    const appointmentId = String(record.id ?? "").trim();
    if (!appointmentId) throw new Error("לתור חסר מזהה, ולכן לא ניתן לשמור את סימון ההגעה.");
    if (String(record.arrived_at ?? "").trim()) return;

    const arrivedAt = new Date().toISOString();
    try {
      await Appointment.update(appointmentId, { arrived_at: arrivedAt });
    } catch (error) {
      console.error("Failed to save the appointment arrival marker:", error);
      throw new Error("לא הצלחנו לשמור את סימון ההגעה. נסי שוב.");
    }

    const updatedRecord: CrmRecord = { ...record, arrived_at: arrivedAt };
    queryClient.setQueryData<CrmRecord[]>(appointmentsKey, (current) => current?.map((item) => mergeAppointmentRecord(item, updatedRecord)));
    queryClient.setQueryData<CrmRecord[]>(["business-crm", "appointments", userIdentity], (current) => current?.map((item) => mergeAppointmentRecord(item, updatedRecord)));
    void queryClient.invalidateQueries({ queryKey: appointmentsKey });
  }, [appointmentsKey, queryClient, userIdentity]);

  const appointments = Array.isArray(appointmentsQuery.data) ? appointmentsQuery.data : [];
  const pendingAppointments = Array.isArray(pendingQuery.data) ? pendingQuery.data : [];
  const clients = Array.isArray(clientOverviewQuery.data) ? clientOverviewQuery.data : [];
  const leads = leadsQuery.data || { count: 0, latest: null };
  const appointmentsState: DashboardWidgetRequestState = { isLoading: appointmentsQuery.isLoading, error: appointmentsQuery.error, onRetry: () => { void appointmentsQuery.refetch(); } };
  const pendingState: DashboardWidgetRequestState = { isLoading: pendingQuery.isLoading, error: pendingQuery.error, onRetry: () => { void pendingQuery.refetch(); } };
  const clientsState: DashboardWidgetRequestState = { isLoading: clientOverviewQuery.isLoading, error: clientOverviewQuery.error, onRetry: () => { void clientOverviewQuery.refetch(); } };
  const leadsState: DashboardWidgetRequestState = { isLoading: leadsQuery.isLoading, error: leadsQuery.error, onRetry: () => { void leadsQuery.refetch(); } };

  const mobileAppointmentsState: DashboardHomeRequestState = { isLoading: appointmentsQuery.isLoading, error: appointmentsQuery.error, onRetry: () => { void appointmentsQuery.refetch(); } };
  const mobilePendingState: DashboardHomeRequestState = { isLoading: pendingQuery.isLoading, error: pendingQuery.error, onRetry: () => { void pendingQuery.refetch(); } };
  const mobileClientsState: DashboardHomeRequestState = { isLoading: clientOverviewQuery.isLoading, error: clientOverviewQuery.error, onRetry: () => { void clientOverviewQuery.refetch(); } };
  const mobileInquiriesState: DashboardHomeRequestState = { isLoading: inquiriesIsLoading, error: inquiriesError, onRetry: () => { void refreshData(); } };
  const mobileHomeData: DashboardHomeData = {
    appointments,
    pendingAppointments,
    clients,
    inquiries,
    today: range.today,
    profile: {
      name: VETERINARY_CLINIC_PROFILE.shortName,
      shortName: "ד״ר סיון",
      subtitle: "מרפאה וטרינרית · נס ציונה",
      fullName: String(user?.full_name ?? "").trim(),
      email: String(user?.email ?? "").trim(),
      imageUrl: String(user?.profile_image_url ?? "").trim() || undefined,
    },
  };
  const mobileHomeActions: DashboardHomeActions = {
    onNavigate: (tab) => {
      if (tab === "dashboard") openView({ kind: "overview" });
      else if (tab === "calendar") openView({ kind: "calendar" });
      else if (tab === "clients") openView({ kind: "clients" });
      else openView({ kind: "inbox" });
    },
    onOpenInbox: () => openView({ kind: "inbox" }),
    onOpenSales: () => openView({ kind: "sales" }),
    onOpenMore: openMobileMoreMenu,
    onOpenSettings: () => openView({ kind: "settings" }),
    onProfileUpdated: updateUserProfile,
    onNewAppointment: openNewAppointment,
    onOpenAppointment: openAppointmentInCalendar,
    onCheckIn,
    onScheduleDecision: (record, action) => scheduleMobileAppointmentDecision(record, action, () => onAppointmentDecision(record, action)),
  };

  return <>
    <SEO title={`מסך ניהול | ${VETERINARY_CLINIC_PROFILE.businessName}`} description={`מסך ניהול עסקי פרטי ל${VETERINARY_CLINIC_PROFILE.categoryLabel} של ${VETERINARY_CLINIC_PROFILE.shortName}.`} url={`${VETERINARY_CLINIC_PROFILE.publicOrigin}${VETERINARY_CLINIC_PROFILE.crmBasePath}`} noindex siteName={VETERINARY_CLINIC_PROFILE.businessName} />
    <div className="crm-dashboard-mobile-home">
      <DashboardPage
        data={mobileHomeData}
        actions={mobileHomeActions}
        appointmentState={mobileAppointmentsState}
        pendingState={mobilePendingState}
        clientsState={mobileClientsState}
        inquiriesState={mobileInquiriesState}
        notificationCount={notificationCount}
        decisionNotice={mobileAppointmentDecision}
      />
    </div>
    <div id="crm-overview" className="crm-dashboard-desktop" dir="rtl">
      <div className="crm-dashboard-title-desktop mb-5 flex max-w-5xl flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl"><p className="mb-2 text-xs font-extrabold tracking-wide text-slate-500">{VETERINARY_CLINIC_PROFILE.businessName}</p><h1 className="text-3xl font-black tracking-tight text-[#1A1A3E] sm:text-4xl">מסך ניהול</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">{isEditing ? "סדרי את הווידג׳טים כפי שנוח לך. השינויים נשמרים אוטומטית." : "תמונת מצב יומית של הלקוחות, התורים והפניות במרפאה."}</p></div>
        <button type="button" onClick={() => setIsEditing((current) => !current)} disabled={isLayoutPending || layoutError} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60">{isEditing ? <Check className="h-4 w-4" aria-hidden="true" /> : <LayoutGrid className="h-4 w-4" aria-hidden="true" />}{isEditing ? "סיום" : "התאמה אישית"}</button>
      </div>
      <div className="crm-dashboard-title-mobile mb-4 flex items-center justify-between gap-3" dir="rtl">
        <h1 className="text-2xl font-black tracking-tight text-[#1A1A3E]">מסך ניהול</h1>
        <button type="button" onClick={() => setIsEditing((current) => !current)} disabled={isLayoutPending || layoutError} aria-label={isEditing ? "סיום" : "התאמה אישית"} title={isEditing ? "סיום" : "התאמה אישית"} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#1A1A3E] text-white shadow-sm transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60 md:h-10 md:w-10">{isEditing ? <Check className="h-4 w-4" aria-hidden="true" /> : <LayoutGrid className="h-4 w-4" aria-hidden="true" />}</button>
      </div>

      {layoutError && !isLayoutPending && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900"><span>לא הצלחנו לטעון את סידור הכרטיסים. מוצגת פריסת ברירת המחדל, והשמירה מושהית כדי לשמור על הסידור הקיים.</span><button type="button" onClick={() => setLayoutReloadVersion((current) => current + 1)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 font-extrabold text-[#5267A8] transition hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />נסי שוב</button></div>}
      {saveError && !isLayoutPending && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold text-red-800"><span>השינויים נשארו במסך, אך לא הצלחנו לשמור אותם.</span><button type="button" onClick={() => setSaveRetryVersion((current) => current + 1)} className="min-h-9 rounded-lg bg-white px-3 font-extrabold text-[#5267A8] transition hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">נסי לשמור שוב</button></div>}

      {isLayoutPending ? <DashboardLayoutLoadingPlaceholder /> : <CrmDashboardCards
        appointments={appointments}
        appointmentsState={appointmentsState}
        pendingAppointments={pendingAppointments}
        pendingState={pendingState}
        clients={clients}
        clientsState={clientsState}
        leads={leads}
        leadsState={leadsState}
        today={range.today}
        search={search}
        onOpenCalendar={() => openView({ kind: "calendar" })}
        onOpenClients={() => openView({ kind: "clients" })}
        onAppointmentDecision={onAppointmentDecision}
        widgetOrder={widgetOrder}
        widgetLayout={widgetLayout}
        isEditing={isEditing}
        onOrderChange={setWidgetOrder}
        onLayoutChange={setWidgetLayout}
      />}
    </div>
  </>;
}
