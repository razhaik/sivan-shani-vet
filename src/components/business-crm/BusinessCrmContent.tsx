import { useEffect } from "react";
import BusinessCrmDashboard from "@/pages/BusinessCrmDashboard";
import BusinessCrmInbox from "@/pages/BusinessCrmInbox";
import BusinessCrmClients from "@/pages/BusinessCrmClients";
import BusinessCrmClientDetails from "@/pages/BusinessCrmClientDetails";
import BusinessCrmMarketing from "@/pages/BusinessCrmMarketing";
import BusinessCrmCalendar from "@/components/business-crm/BusinessCrmCalendar";
import BusinessCrmSettings from "@/components/business-crm/BusinessCrmSettings";
import BusinessCrmSales from "@/components/business-crm/BusinessCrmSales";
import { useCrmContext, type CrmView } from "@/components/business-crm/CrmContext";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

const marketingTitles: Record<string, string> = {
  automatic: "קמפיינים אוטומטיים",
  broadcasts: "הודעות שיווקיות",
  sent: "קמפיינים והודעות שנשלחו",
  reports: "דו\"חות שיווק",
};

function titleForView(view: CrmView): string | null {
  if (view.kind === "overview") return "מסך ניהול";
  if (view.kind === "inbox") return "תיבת דואר";
  if (view.kind === "clients") return "לקוחות";
  if (view.kind === "client-details") return "פרטי לקוח";
  if (view.kind === "calendar") return "יומן";
  if (view.kind === "sales") return "מכירות ונתונים";
  if (view.kind === "marketing") return marketingTitles[view.subview] || "שיווק";
  return null;
}

export default function BusinessCrmContent() {
  const { view } = useCrmContext();
  const title = titleForView(view);

  useEffect(() => {
    if (!title || typeof document === "undefined") return;
    document.title = `${title} | ${VETERINARY_CLINIC_PROFILE.shortName}`;
  }, [title]);

  if (view.kind === "inbox") return <BusinessCrmInbox key="inbox" />;
  if (view.kind === "clients") return <BusinessCrmClients key="clients" />;
  if (view.kind === "client-details") return <BusinessCrmClientDetails key={view.clientId} clientId={view.clientId} />;
  if (view.kind === "marketing") return <BusinessCrmMarketing key={view.subview} view={view.subview} />;
  if (view.kind === "calendar") return <BusinessCrmCalendar key="calendar" />;
  if (view.kind === "sales") return <BusinessCrmSales key="sales" />;
  if (view.kind === "settings") return <BusinessCrmSettings key={`settings-${view.section ?? "overview"}`} initialSection={view.section} />;
  return <BusinessCrmDashboard key="overview" />;
}
