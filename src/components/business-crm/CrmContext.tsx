import { createContext, useContext, type PropsWithChildren } from "react";
import type { MarketingView } from "@/components/business-crm/MarketingLayout";
import type { AppointmentDecisionAction, AppointmentDecisionResult } from "@/lib/crmAppointmentDecision";

export type CrmRecord = Record<string, any>;

export type CrmSettingsSection = "calendar" | "services" | "reminders" | "notifications" | "selfService";

export type CrmView =
  | { kind: "overview" }
  | { kind: "inbox" }
  | { kind: "clients" }
  | { kind: "client-details"; clientId: string }
  | { kind: "marketing"; subview: MarketingView }
  | { kind: "calendar" }
  | { kind: "sales" }
  | { kind: "settings"; section?: CrmSettingsSection };

export type CrmCalendarLaunchRequest =
  | { requestId: number; kind: "new" }
  | { requestId: number; kind: "appointment"; appointmentId: string; record: CrmRecord };

export type CrmMobileDecisionPhase = "undo" | "committing" | "success" | "partial" | "error" | "undone";

export interface CrmMobileAppointmentDecisionNotice {
  requestId: number;
  id: string;
  clientName: string;
  action: AppointmentDecisionAction;
  phase: CrmMobileDecisionPhase;
  message: string;
}

export function crmViewIdentity(view: CrmView): string {
  if (view.kind === "client-details") return `client-details:${view.clientId}`;
  if (view.kind === "marketing") return `marketing:${view.subview}`;
  return view.kind;
}

export interface CrmDataLoadProgress {
  completed: number;
  total: number;
  stage: string;
  receivedCount?: number;
  receivedLabel?: string;
  status: "loading" | "complete" | "error";
}

export interface CrmContextValue {
  user: CrmRecord;
  /** Merges a saved profile change (name / photo) into the signed-in user. */
  updateUserProfile: (updates: { full_name: string; profile_image_url?: string }) => void;
  /** Opens the app marketplace modal (used from the phone settings page). */
  openAppMarketplace: (trigger?: HTMLButtonElement) => void;
  userLabel: string;
  appointments: CrmRecord[];
  inquiries: CrmRecord[];
  rescheduleRequests: CrmRecord[];
  businessClients: CrmRecord[];
  archivedClientKeys: Set<string>;
  hasDataSnapshot: boolean;
  dataLoadProgress: CrmDataLoadProgress;
  isDataLoading: boolean;
  isDataFetching: boolean;
  dataError: unknown;
  inquiriesIsLoading: boolean;
  inquiriesError: unknown;
  refreshData: () => void | Promise<void>;
  notificationCount: number;
  search: string;
  setSearch: (value: string) => void;
  view: CrmView;
  openView: (next: CrmView, optionalTargetId?: string) => void;
  openNewAppointment: () => void;
  openAppointmentInCalendar: (record: CrmRecord) => void;
  calendarLaunchRequest: CrmCalendarLaunchRequest | null;
  consumeCalendarLaunchRequest: (requestId: number) => void;
  openMobileMoreMenu: (trigger?: HTMLButtonElement) => void;
  mobileMoreRequest: number;
  mobileAppointmentDecision: CrmMobileAppointmentDecisionNotice | null;
  scheduleMobileAppointmentDecision: (
    record: CrmRecord,
    action: AppointmentDecisionAction,
    commit: () => Promise<AppointmentDecisionResult>,
  ) => boolean;
  undoMobileAppointmentDecision: () => boolean;
}

export type CrmOutletContext = CrmContextValue;

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({ value, children }: PropsWithChildren<{ value: CrmContextValue }>) {
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrmContext(): CrmContextValue {
  const context = useContext(CrmContext);
  if (!context) throw new Error("CRM content must be rendered inside <CrmProvider>.");
  return context;
}
