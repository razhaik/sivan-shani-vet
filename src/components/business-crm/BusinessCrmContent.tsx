import BusinessCrmDashboard from "@/pages/BusinessCrmDashboard";
import BusinessCrmInbox from "@/pages/BusinessCrmInbox";
import BusinessCrmClients from "@/pages/BusinessCrmClients";
import BusinessCrmClientDetails from "@/pages/BusinessCrmClientDetails";
import BusinessCrmMarketing from "@/pages/BusinessCrmMarketing";
import BusinessCrmCalendar from "@/components/business-crm/BusinessCrmCalendar";
import BusinessCrmSettings from "@/components/business-crm/BusinessCrmSettings";
import { useCrmContext } from "@/components/business-crm/CrmContext";

export default function BusinessCrmContent() {
  const { view } = useCrmContext();
  if (view.kind === "inbox") return <BusinessCrmInbox key="inbox" />;
  if (view.kind === "clients") return <BusinessCrmClients key="clients" />;
  if (view.kind === "client-details") return <BusinessCrmClientDetails key={view.clientId} clientId={view.clientId} />;
  if (view.kind === "marketing") return <BusinessCrmMarketing key={view.subview} view={view.subview} />;
  if (view.kind === "calendar") return <BusinessCrmCalendar key="calendar" />;
  if (view.kind === "settings") return <BusinessCrmSettings key={`settings-${view.section ?? "overview"}`} initialSection={view.section} />;
  return <BusinessCrmDashboard key="overview" />;
}
