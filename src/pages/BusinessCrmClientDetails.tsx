import { useMemo } from "react";
import { RefreshCw, Users } from "lucide-react";
import { SEO } from "@/components/SEO";
import { ClientDetailsView } from "@/components/business-crm/ClientDetailsView";
import { useCrmContext } from "@/components/business-crm/CrmContext";
import { buildClientRows, type CrmRecord } from "@/lib/crmClientData";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

function ContentLoading() { return <div dir="rtl" className="flex min-h-[260px] items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white px-6 text-center"><div><RefreshCw className="mx-auto h-8 w-8 animate-spin text-[#5267A8]" /><p className="mt-4 text-sm font-extrabold text-[#1A1A3E]">טוען את פרטי הלקוח...</p><p className="mt-1 text-xs font-medium text-slate-500">התורים, הפניות והלקוחות המיובאים נטענים יחד.</p></div></div>; }
function ContentError({ onRetry }: { onRetry: () => void }) { return <div dir="rtl" className="flex min-h-[260px] items-center justify-center rounded-2xl border border-red-100 bg-white px-5 text-center"><div className="max-w-md"><Users className="mx-auto h-9 w-9 text-red-500" /><h1 className="mt-4 text-lg font-extrabold text-[#1A1A3E]">לא הצלחנו לטעון את פרטי הלקוח</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">אפשר לנסות שוב. אם הבעיה נמשכת, חזרי לרשימת הלקוחות.</p><button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><RefreshCw className="h-4 w-4" />נסי שוב</button></div></div>; }

export default function BusinessCrmClientDetails({ clientId }: { clientId: string }) {
  const { appointments, inquiries, businessClients, userLabel, isDataLoading, dataError, refreshData, openView } = useCrmContext();
  const rows = useMemo(() => buildClientRows(appointments as CrmRecord[], inquiries as CrmRecord[], businessClients as CrmRecord[]), [appointments, businessClients, inquiries]);
  const row = rows.find((item) => item.id === clientId);

  return (
    <>
      <SEO title={`${row?.name || "לקוח"} | ${VETERINARY_CLINIC_PROFILE.businessName}`} description="פרופיל לקוח פנימי במערכת העסקית של המרפאה הווטרינרית." url={`${VETERINARY_CLINIC_PROFILE.publicOrigin}${VETERINARY_CLINIC_PROFILE.crmBasePath}/clients/${encodeURIComponent(clientId)}`} noindex siteName={VETERINARY_CLINIC_PROFILE.businessName} />
      {isDataLoading ? <ContentLoading /> : dataError ? <ContentError onRetry={refreshData} /> : row ? <ClientDetailsView row={row} businessClients={businessClients as CrmRecord[]} staffName={userLabel} onBack={() => openView({ kind: "clients" })} onSaved={refreshData} /> : <div dir="rtl" className="mx-auto max-w-lg rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm"><Users className="mx-auto h-9 w-9 text-slate-400" /><h1 className="mt-4 text-xl font-black text-[#1A1A3E]">הלקוח לא נמצא</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">ייתכן שהרשומה הוסרה או שאין לך גישה אליה.</p><button type="button" onClick={() => openView({ kind: "clients" })} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-[#F2D162]">חזרה ללקוחות</button></div>}
    </>
  );
}
