import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Appointment, AppointmentRescheduleRequest, BusinessClient, ClientArchive, ContactInquiry, User } from "@/entities";
import { CrmSidebar, type CrmActiveKey, type CrmInstallAction } from "@/components/business-crm/CrmSidebar";
import CrmMobileNavigation from "@/components/business-crm/CrmMobileNavigation";
import AppMarketplaceModal from "@/components/business-crm/AppMarketplaceModal";
import CrmAssistantPanel from "@/components/business-crm/CrmAssistantPanel";
import { CrmTopbar, type CrmOpenItem } from "@/components/business-crm/CrmTopbar";
import type { CrmProfileUpdate } from "@/components/business-crm/CrmProfileMenu";
import BusinessCrmContent from "@/components/business-crm/BusinessCrmContent";
import { CrmContentBoundary } from "@/components/business-crm/CrmContentBoundary";
import { CrmProvider, crmViewIdentity, type CrmContextValue, type CrmRecord, type CrmView } from "@/components/business-crm/CrmContext";
import type { MarketingView } from "@/components/business-crm/MarketingLayout";
import { clearCrmAsHomeScreenStart, markCrmAsHomeScreenStart } from "@/lib/crmHomeScreen";

function records(value: unknown): CrmRecord[] {
  return Array.isArray(value) ? value.filter(Boolean) as CrmRecord[] : [];
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function isHandledRecord(record: CrmRecord) {
  return Boolean(text(record.inbox_handled_at));
}

function inboxLocation(record: CrmRecord) {
  if (text(record.inbox_deleted_at)) return "trash";
  if (text(record.inbox_archived_at)) return "archive";
  return "inbox";
}

function storedDate(value: unknown): Date | null {
  const valueText = text(value);
  if (!valueText) return null;
  const parsed = new Date(valueText);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function firstStoredDate(...values: unknown[]) {
  for (const value of values) {
    const date = storedDate(value);
    if (date) return date;
  }
  return null;
}

interface AppointmentDateInfo {
  date: Date;
  timestamp: number;
  timeLabel: string;
}

function appointmentDateInfo(dateValue: unknown, timeValue: unknown): AppointmentDateInfo | null {
  const dateText = text(dateValue);
  const dateParts = dateText.split("-").map(Number);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || dateParts.some((part) => !Number.isFinite(part))) return null;

  const timeMatch = text(timeValue).match(/^(\d{1,2}):(\d{2})/);
  const hour = timeMatch ? Number(timeMatch[1]) : 0;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  const hasValidTime = Boolean(timeMatch) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  const timeLabel = hasValidTime ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : "";
  const parsed = new Date(`${dateText}T${timeLabel || "00:00"}:00`);
  const [year, month, day] = dateParts;
  if (!Number.isFinite(parsed.getTime()) || parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return null;

  return { date: parsed, timestamp: parsed.getTime(), timeLabel };
}

function dateLabel(date: Date | null) {
  if (!date) return "תאריך לא צוין";
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function appointmentLabel(requestedDate: AppointmentDateInfo | null, createdDate: Date | null) {
  if (!requestedDate) return createdDate ? `נשלחה ${dateLabel(createdDate)}` : "תאריך התור לא צוין";
  const requestedDateLabel = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric" }).format(requestedDate.date);
  return requestedDate.timeLabel ? `${requestedDateLabel} · ${requestedDate.timeLabel}` : requestedDateLabel;
}

function preview(value: unknown, fallback: string) {
  const valueText = text(value);
  if (!valueText) return fallback;
  return valueText.length > 120 ? `${valueText.slice(0, 117).trim()}…` : valueText;
}

function openItemId(kind: CrmOpenItem["kind"], record: CrmRecord, index: number) {
  const realId = text(record.id);
  if (realId) return `${kind}-${realId}`;
  const fingerprint = [record.created_at, record.date, record.start_time, record.proposed_appointment_date, record.proposed_start_time, record.name, record.client_name, record.appointment_id].map(text).filter(Boolean).join("-") || "record";
  return `${kind}-${index}-${fingerprint}`;
}

type SortedOpenItem = CrmOpenItem & { order: number };

function deriveOpenItems(inquiries: CrmRecord[], appointments: CrmRecord[], rescheduleRequests: CrmRecord[]): CrmOpenItem[] {
  const inquiryItems: SortedOpenItem[] = inquiries.filter((record) => inboxLocation(record) === "inbox" && !isHandledRecord(record)).map((record, index) => {
    const createdDate = firstStoredDate(record.created_at, record.updated_at);
    const name = text(record.name) || text(record.client_name) || "שם הפונה לא צוין";
    return {
      id: openItemId("inquiry", record, index),
      kind: "inquiry",
      typeLabel: "פנייה מהאתר",
      name,
      detail: preview(record.message, "לא צורף תוכן לפנייה"),
      dateLabel: dateLabel(createdDate),
      sortTimestamp: createdDate?.getTime() || 0,
      order: index,
    };
  });

  const appointmentItems: SortedOpenItem[] = appointments
    .filter((record) => inboxLocation(record) === "inbox" && text(record.status) === "requested")
    .map((record, index) => {
      const createdDate = firstStoredDate(record.created_at, record.updated_at);
      const requestedDate = appointmentDateInfo(record.date, record.start_time);
      const details = [
        text(record.appointment_type) ? `סוג תור: ${text(record.appointment_type)}` : "",
        text(record.pet_name) ? `חיית מחמד: ${text(record.pet_name)}` : "",
        text(record.notes) ? `הערה: ${preview(record.notes, "")}` : "",
      ].filter(Boolean);
      const sortTimestamp = createdDate?.getTime() || requestedDate?.timestamp || 0;
      return {
        id: openItemId("appointment", record, index),
        kind: "appointment",
        typeLabel: "בקשת תור",
        name: text(record.client_name) || text(record.name) || "שם הלקוח לא צוין",
        detail: details.join(" · ") || "בקשת תור ללא פרטים נוספים",
        dateLabel: appointmentLabel(requestedDate, createdDate),
        sortTimestamp,
        order: inquiries.length + index,
      };
    });

  const appointmentsById = new Map(appointments.map((record) => [text(record.id), record]));
  const rescheduleItems: SortedOpenItem[] = rescheduleRequests
    .filter((record) => inboxLocation(record) === "inbox" && text(record.status) === "pending")
    .map((record, index) => {
      const appointment = appointmentsById.get(text(record.appointment_id));
      const createdDate = firstStoredDate(record.created_at, record.updated_at);
      const oldDate = appointmentDateInfo(record.old_appointment_date, record.old_start_time);
      const proposedDate = appointmentDateInfo(record.proposed_appointment_date, record.proposed_start_time);
      const clientName = text(appointment?.client_name) || "שם הלקוח לא צוין";
      const petName = text(appointment?.pet_name);
      const serviceName = text(appointment?.appointment_type) || text(record.service_identifier) || "סוג הטיפול לא צוין";
      const oldLabel = appointmentLabel(oldDate, null);
      const proposedLabel = appointmentLabel(proposedDate, null);
      return {
        id: openItemId("reschedule_request", record, index),
        kind: "reschedule_request",
        typeLabel: "בקשת שינוי מועד",
        name: clientName,
        detail: [
          `חיית מחמד: ${petName || "לא צוין"}`,
          `טיפול: ${serviceName}`,
          `מועד מקורי: ${oldLabel}`,
          `מועד מוצע: ${proposedLabel}`,
          "סטטוס: ממתין לאישור המרפאה",
        ].join(" · "),
        dateLabel: proposedDate ? appointmentLabel(proposedDate, createdDate) : dateLabel(createdDate),
        sortTimestamp: createdDate?.getTime() || proposedDate?.timestamp || 0,
        order: inquiries.length + appointments.length + index,
      };
    });

  return [...inquiryItems, ...appointmentItems, ...rescheduleItems]
    .sort((first, second) => second.sortTimestamp - first.sortTimestamp || first.order - second.order)
    .map(({ id, kind, typeLabel, name, detail, dateLabel, sortTimestamp }) => ({ id, kind, typeLabel, name, detail, dateLabel, sortTimestamp }));
}

function decodeClientId(value?: string): string | null {
  if (!value) return null;
  try { const decoded = decodeURIComponent(value).trim(); return decoded || null; } catch { return null; }
}

function viewFromPathname(pathname: string, mobileBaseEntry = false): CrmView {
  const path = pathname.replace(/^\/business-crm(?:\/|$)/, "").replace(/^\/+|\/+$/g, "");
  const segments = path ? path.split("/") : [];
  if (segments[0] === "inbox") return { kind: "inbox" };
  if (segments[0] === "settings") return { kind: "settings" };
  if (segments[0] === "clients") {
    const clientId = decodeClientId(segments[1]);
    return clientId ? { kind: "client-details", clientId } : { kind: "clients" };
  }
  if (segments[0] === "marketing") {
    const subview = segments[1] as MarketingView | undefined;
    if (["automatic", "broadcasts", "sent", "reports"].includes(subview || "")) return { kind: "marketing", subview: subview! };
    return { kind: "marketing", subview: "automatic" };
  }
  return mobileBaseEntry && segments.length === 0 ? { kind: "sales" } : { kind: "inbox" };
}

function activeKeyForView(view: CrmView): CrmActiveKey {
  if (view.kind === "inbox") return "inbox";
  if (view.kind === "clients" || view.kind === "client-details") return "clients";
  if (view.kind === "calendar") return "calendar";
  if (view.kind === "settings") return "settings";
  if (view.kind === "marketing") return `marketing-${view.subview}`;
  if (view.kind === "sales") return "sales";
  return "overview";
}

function topbarCopy(view: CrmView) {
  if (view.kind === "settings") return { placeholder: "חיפוש בהגדרות", ariaLabel: "חיפוש בהגדרות היומן" };
  if (view.kind === "clients") return { placeholder: "חיפוש לקוחות", ariaLabel: "חיפוש לקוחות לפי שם, אימייל או טלפון" };
  if (view.kind === "inbox") return { placeholder: "חיפוש בתיבת הדואר", ariaLabel: "חיפוש בתיבת הדואר" };
  if (view.kind === "marketing") return { placeholder: "חיפוש בהגדרות שיווק", ariaLabel: "חיפוש בהגדרות שיווק" };
  if (view.kind === "calendar") return { placeholder: "חיפוש לקוחות, חיות ושירותים", ariaLabel: "חיפוש ביומן לפי לקוח, חיית מחמד או שירות" };
  return { placeholder: "חיפוש", ariaLabel: "חיפוש לקוחות ופגישות" };
}

function AuthGate() {
  return <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#F7F7F7] px-6 text-center" style={{ fontFamily: "Assistant, Heebo, Arial, sans-serif" }}><div className="rounded-2xl border border-[#E5E7EB] bg-white px-8 py-9 shadow-sm"><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5267A8]" /><p className="mt-4 text-sm font-extrabold text-[#1A1A3E]">טוען את סביבת הניהול...</p><p className="mt-1 text-xs font-medium text-slate-500">הנתונים יוצגו לאחר בדיקת ההרשאות.</p></div></div>;
}

export default function BusinessCrmLayout() {
  const location = useLocation();
  const [view, setView] = useState<CrmView>(() => viewFromPathname(location.pathname, typeof window !== "undefined" && window.innerWidth < 768));
  const [user, setUser] = useState<CrmRecord | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileInstallAction, setMobileInstallAction] = useState<CrmInstallAction | null>(null);
  const registerMobileInstallAction = useCallback((action: CrmInstallAction | null) => setMobileInstallAction(() => action), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const [isMarketplaceOpen, setIsMarketplaceOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const marketplaceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    User.me()
      .then((currentUser) => {
        if (!active) return;
        if (!currentUser) {
          clearCrmAsHomeScreenStart();
          User.login();
          return;
        }
        markCrmAsHomeScreenStart();
        setUser(currentUser as CrmRecord);
        setAuthReady(true);
      })
      .catch(() => {
        if (active) User.login();
      });
    return () => { active = false; };
  }, []);

  const userCacheKey = user?.id || user?.email || "anonymous";
  const appointmentsQuery = useQuery({ queryKey: ["business-crm", "appointments", userCacheKey], queryFn: () => Appointment.list("-date", 500), enabled: authReady && Boolean(user) });
  const inquiriesQuery = useQuery({ queryKey: ["business-crm", "inquiries", userCacheKey], queryFn: () => ContactInquiry.list("-created_at", 500), enabled: authReady && Boolean(user) });
  const rescheduleRequestsQuery = useQuery({ queryKey: ["business-crm", "reschedule-requests", userCacheKey], queryFn: () => AppointmentRescheduleRequest.list("-created_at", 500), enabled: authReady && Boolean(user) });
  const businessClientsQuery = useQuery({ queryKey: ["business-crm", "business-clients", userCacheKey], queryFn: () => BusinessClient.list("-created_at", 500), enabled: authReady && Boolean(user) });
  const archivedClientsQuery = useQuery({ queryKey: ["business-crm", "client-archives", userCacheKey], queryFn: () => ClientArchive.list("-created_at", 500), enabled: authReady && Boolean(user) });
  const appointments = useMemo(() => records(appointmentsQuery.data), [appointmentsQuery.data]);
  const inquiries = useMemo(() => records(inquiriesQuery.data), [inquiriesQuery.data]);
  const rescheduleRequests = useMemo(() => records(rescheduleRequestsQuery.data), [rescheduleRequestsQuery.data]);
  const businessClients = useMemo(() => records(businessClientsQuery.data), [businessClientsQuery.data]);
  const archivedClientKeys = useMemo(() => new Set(records(archivedClientsQuery.data).map((record) => text(record.client_key)).filter(Boolean)), [archivedClientsQuery.data]);
  const dataSources = useMemo(() => [
    { key: "appointments", label: "התורים", data: appointmentsQuery.data, error: appointmentsQuery.error, isFetching: appointmentsQuery.isFetching },
    { key: "inquiries", label: "הפניות", data: inquiriesQuery.data, error: inquiriesQuery.error, isFetching: inquiriesQuery.isFetching },
    { key: "reschedule-requests", label: "בקשות שינוי המועד", data: rescheduleRequestsQuery.data, error: rescheduleRequestsQuery.error, isFetching: rescheduleRequestsQuery.isFetching },
    { key: "business-clients", label: "הלקוחות המיובאים", data: businessClientsQuery.data, error: businessClientsQuery.error, isFetching: businessClientsQuery.isFetching },
    { key: "archives", label: "העדפות ההסתרה", data: archivedClientsQuery.data, error: archivedClientsQuery.error, isFetching: archivedClientsQuery.isFetching },
  ], [appointmentsQuery.data, appointmentsQuery.error, appointmentsQuery.isFetching, archivedClientsQuery.data, archivedClientsQuery.error, archivedClientsQuery.isFetching, businessClientsQuery.data, businessClientsQuery.error, businessClientsQuery.isFetching, inquiriesQuery.data, inquiriesQuery.error, inquiriesQuery.isFetching, rescheduleRequestsQuery.data, rescheduleRequestsQuery.error, rescheduleRequestsQuery.isFetching]);
  const dataLoadProgress = useMemo(() => {
    const successfulSources = dataSources.filter((source) => !source.isFetching && source.data !== undefined && !source.error);
    const failedSource = dataSources.find((source) => Boolean(source.error));
    const activeSource = dataSources.find((source) => source.isFetching || (source.data === undefined && !source.error));
    const latestReceived = [...successfulSources].reverse()[0];
    const total = dataSources.length;
    const completed = successfulSources.length;
    const status = failedSource ? "error" as const : completed === total ? "complete" as const : "loading" as const;
    return {
      completed,
      total,
      stage: failedSource ? `טעינת ${failedSource.label} נעצרה` : status === "complete" ? "כל נתוני הלקוחות נטענו" : activeSource ? `טוענת ${activeSource.label}` : "מתחילה טעינת נתוני הלקוחות",
      ...(latestReceived ? { receivedCount: records(latestReceived.data).length, receivedLabel: latestReceived.label } : {}),
      status,
    };
  }, [dataSources]);
  const hasDataSnapshot = dataSources.every((source) => source.data !== undefined);
  const openItems = useMemo(() => deriveOpenItems(inquiries, appointments, rescheduleRequests), [appointments, inquiries, rescheduleRequests]);
  const notificationCount = openItems.length;
  const userLabel = String(user?.full_name || user?.email || "צוות המרפאה");
  const handleProfileUpdated = useCallback((updates: CrmProfileUpdate) => {
    setUser((currentUser) => currentUser ? { ...currentUser, ...updates } : currentUser);
  }, []);
  const refreshData = useCallback(async () => { await Promise.all([appointmentsQuery.refetch(), inquiriesQuery.refetch(), rescheduleRequestsQuery.refetch(), businessClientsQuery.refetch(), archivedClientsQuery.refetch()]); }, [appointmentsQuery.refetch, inquiriesQuery.refetch, rescheduleRequestsQuery.refetch, businessClientsQuery.refetch, archivedClientsQuery.refetch]);
  const openView = useCallback((next: CrmView, optionalTargetId?: string) => {
    setView(next);
    setSearch("");
    setSidebarOpen(false);
    if (optionalTargetId && typeof window !== "undefined") {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.getElementById(optionalTargetId)?.scrollIntoView({ behavior, block: "start" })));
    }
  }, []);
  const openAppMarketplace = useCallback((trigger?: HTMLButtonElement) => {
    marketplaceTriggerRef.current = trigger || null;
    setSidebarOpen(false);
    setIsMarketplaceOpen(true);
  }, []);
  const closeAppMarketplace = useCallback(() => setIsMarketplaceOpen(false), []);
  const toggleAssistant = useCallback(() => setIsAssistantOpen((current) => !current), []);
  const closeAssistant = useCallback(() => setIsAssistantOpen(false), []);
  const activeKey = activeKeyForView(view);
  const searchCopy = topbarCopy(view);
  const viewKey = crmViewIdentity(view);
  const crmContextValue = useMemo<CrmContextValue>(() => ({
    user: user as CrmRecord,
    userLabel,
    appointments,
    inquiries,
    rescheduleRequests,
    businessClients,
    archivedClientKeys,
    hasDataSnapshot,
    dataLoadProgress,
    isDataLoading: appointmentsQuery.isLoading || inquiriesQuery.isLoading || rescheduleRequestsQuery.isLoading || businessClientsQuery.isLoading || archivedClientsQuery.isLoading,
    isDataFetching: appointmentsQuery.isFetching || inquiriesQuery.isFetching || rescheduleRequestsQuery.isFetching || businessClientsQuery.isFetching || archivedClientsQuery.isFetching,
    dataError: appointmentsQuery.error || inquiriesQuery.error || rescheduleRequestsQuery.error || businessClientsQuery.error || archivedClientsQuery.error || null,
    refreshData,
    notificationCount,
    search,
    setSearch,
    view,
    openView,
  }), [appointments, appointmentsQuery.error, appointmentsQuery.isFetching, appointmentsQuery.isLoading, archivedClientKeys, archivedClientsQuery.error, archivedClientsQuery.isFetching, archivedClientsQuery.isLoading, businessClients, businessClientsQuery.error, businessClientsQuery.isFetching, businessClientsQuery.isLoading, dataLoadProgress, hasDataSnapshot, inquiries, inquiriesQuery.error, inquiriesQuery.isFetching, inquiriesQuery.isLoading, notificationCount, openView, refreshData, rescheduleRequests, rescheduleRequestsQuery.error, rescheduleRequestsQuery.isFetching, rescheduleRequestsQuery.isLoading, search, user, userLabel, view]);

  if (!authReady || !user) return <AuthGate />;
  return <div id="crm-root" dir="rtl" className="crm-root min-h-screen overflow-x-hidden bg-[#F7F7F7] font-sans text-[#1A1A3E]" style={{ fontFamily: "Assistant, Heebo, Arial, sans-serif" }}><CrmSidebar isOpen={sidebarOpen} userName={userLabel} onClose={closeSidebar} onNavigate={openView} onOpenAppMarketplace={openAppMarketplace} onRegisterInstallAction={registerMobileInstallAction} activeKey={activeKey} inboxCount={notificationCount} /><div className="min-h-screen lg:mr-[248px]"><CrmTopbar userLabel={userLabel} profileName={text(user?.full_name)} profileEmail={text(user?.email)} profileImageUrl={text(user?.profile_image_url)} onProfileUpdated={handleProfileUpdated} notificationCount={notificationCount} openItems={openItems} search={search} onSearch={setSearch} onOpenSidebar={() => setSidebarOpen(true)} onOpenAssistant={toggleAssistant} assistantOpen={isAssistantOpen} searchPlaceholder={searchCopy.placeholder} searchAriaLabel={searchCopy.ariaLabel} /><main className="crm-main-content mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8"><CrmProvider value={crmContextValue}><CrmContentBoundary viewKey={viewKey}><BusinessCrmContent /></CrmContentBoundary></CrmProvider></main></div><CrmMobileNavigation view={view} onNavigate={openView} onOpenAppMarketplace={openAppMarketplace} onAddToHomeScreen={(trigger) => { if (mobileInstallAction) void mobileInstallAction(trigger); }} /><CrmAssistantPanel isOpen={isAssistantOpen} onClose={closeAssistant} />{isMarketplaceOpen && <AppMarketplaceModal onClose={closeAppMarketplace} returnFocusRef={marketplaceTriggerRef} />}</div>;
}
