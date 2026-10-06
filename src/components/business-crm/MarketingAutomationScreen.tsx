import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Edit3, Eye, Info, Loader2, Mail, MessageSquare, Plus, ShieldCheck, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  MarketingAutomationWizard,
  TEMPLATE_STARTERS,
  timingLabel,
  triggerLabel,
  type CampaignDraft,
  type CampaignRecord,
  type TemplateStarter,
} from "./MarketingAutomationWizard";

interface Props {
  campaigns: CampaignRecord[];
  visibleCampaigns: CampaignRecord[];
  isLoading: boolean;
  search: string;
  successMessage: string;
  errorMessage: string;
  onSave: (draft: CampaignDraft, id?: string) => Promise<void>;
  onToggleEnabled: (campaign: CampaignRecord) => Promise<void>;
  onDelete: (campaign: CampaignRecord) => Promise<void>;
  onClearMessage: () => void;
}

type WizardState = {
  mode: "create" | "edit" | "preview";
  campaign?: CampaignRecord;
  template?: TemplateStarter;
} | null;

const accentClasses = {
  yellow: "bg-[#FFF4C7] text-[#8B6B00]",
  blue: "bg-[#EAF0FF] text-[#5267A8]",
  rose: "bg-[#FFF0EE] text-[#B33A3A]",
  mint: "bg-[#EAF8F2] text-[#237354]",
};

function channelLabel(channel: string) {
  return channel === "sms" ? "SMS" : "אימייל";
}

function StarterCard({ template, onUse, onPreview }: { template: TemplateStarter; onUse: () => void; onPreview: () => void }) {
  const Icon = template.icon;
  return <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-[274px] flex-col rounded-2xl border border-[#E7E9EC] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${accentClasses[template.accent]}`}><Icon className="h-5 w-5" /></div><span className="inline-flex items-center gap-2 rounded-full bg-[#FFF1F0] px-2.5 py-1 text-[11px] font-black text-[#B33A3A]"><span className="h-2 w-2 rounded-full bg-[#D94C4C]" />כבויה · תבנית התחלה</span></div><h3 className="mt-5 text-base font-black leading-6 text-[#1A1A3E]">{template.title}</h3><p className="mt-2 text-sm font-medium leading-6 text-slate-500">{template.description}</p><div className="mt-4 flex items-center gap-2 text-xs font-extrabold text-[#5267A8]"><Info className="h-3.5 w-3.5" />{template.triggerLabel}</div><div className="mt-auto flex items-center gap-2 pt-5"><button type="button" onClick={onUse} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-3 text-xs font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Plus className="h-3.5 w-3.5 text-[#F2D162]" />שימוש בתבנית</button><button type="button" onClick={onPreview} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#E1E4E8] bg-white px-3 text-xs font-extrabold text-[#1A1A3E] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Eye className="h-3.5 w-3.5" />צפייה מקדימה</button></div></motion.article>;
}

function SavedCard({ campaign, onEdit, onPreview, onToggle, onDelete, deleting }: { campaign: CampaignRecord; onEdit: () => void; onPreview: () => void; onToggle: () => void; onDelete: () => void; deleting: boolean }) {
  const active = campaign.enabled && campaign.status === "active";
  const campaignName = campaign.campaign_name || "הקמפיין";
  return <motion.article layout className="rounded-2xl border border-[#DDE2EB] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-[#EAF8F2] text-[#237354]" : "bg-[#F1F2F4] text-slate-500"}`}>{campaign.channel === "sms" ? <MessageSquare className="h-5 w-5" /> : <Mail className="h-5 w-5" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-base font-black text-[#1A1A3E]">{campaign.campaign_name || "הגדרה ללא שם"}</h3><span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F6F8] px-2.5 py-1 text-[11px] font-black text-slate-600"><span className={`h-2 w-2 rounded-full ${active ? "bg-[#39A777]" : "bg-[#A0A5AD]"}`} />{active ? "מסומנת כמופעלת" : campaign.status === "draft" ? "טיוטה" : "מסומנת כמושהית"}</span></div><p className="mt-1 text-xs font-semibold text-slate-500">הגדרה נשמרה · {channelLabel(campaign.channel)} · {triggerLabel(campaign.trigger_type, campaign.trigger_value)}</p></div></div><button type="button" role="switch" aria-checked={active} aria-label={`${active ? "סימון ההגדרה כמושהית" : "סימון ההגדרה כמופעלת"} עבור ${campaignName}`} onClick={onToggle} className="rounded-xl text-[#5267A8] transition hover:bg-[#F2F4FF] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><span className="sr-only">{active ? "מסומנת כמופעלת" : "מסומנת כמושהית"}</span>{active ? <ToggleRight className="h-8 w-8" /> : <ToggleLeft className="h-8 w-8 text-slate-400" />}</button></div><div className="mt-5 grid gap-3 rounded-xl bg-[#FAFBFC] p-3 text-xs font-semibold text-slate-600 sm:grid-cols-2"><p><span className="font-black text-[#1A1A3E]">תזמון:</span> {timingLabel(campaign)}</p><p className="truncate"><span className="font-black text-[#1A1A3E]">קהל:</span> {campaign.audience_description || "לא צוין"}</p></div><div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" onClick={onPreview} aria-label={`צפייה בקמפיין ${campaignName}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#E1E4E8] px-3 text-xs font-extrabold text-[#1A1A3E] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Eye className="h-3.5 w-3.5" />צפייה</button><button type="button" onClick={onEdit} aria-label={`עריכת קמפיין ${campaignName}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#E1E4E8] px-3 text-xs font-extrabold text-[#1A1A3E] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Edit3 className="h-3.5 w-3.5" />עריכה</button><button type="button" onClick={onDelete} disabled={deleting} aria-label={`מחיקת קמפיין ${campaignName}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#F0CACA] bg-[#FFF8F8] px-3 text-xs font-extrabold text-[#B33A3A] transition hover:bg-[#FFF0F0] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50">{deleting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />מוחקים…</> : <><Trash2 className="h-3.5 w-3.5" />מחיקה</>}</button></div></motion.article>;
}

export function MarketingAutomationScreen({ campaigns, visibleCampaigns, isLoading, search, successMessage, errorMessage, onSave, onToggleEnabled, onDelete, onClearMessage }: Props) {
  const [wizard, setWizard] = useState<WizardState>(null);
  const [confirmDeleteCampaign, setConfirmDeleteCampaign] = useState<CampaignRecord | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const openCreate = (template?: TemplateStarter) => setWizard({ mode: "create", template });
  const openPreview = (campaign: CampaignRecord) => setWizard({ mode: "preview", campaign });
  const openTemplatePreview = (template: TemplateStarter) => setWizard({ mode: "preview", template });
  const openEdit = (campaign: CampaignRecord) => setWizard({ mode: "edit", campaign });
  const requestDelete = (campaign: CampaignRecord) => {
    if (deletingId) return;
    setDeleteError("");
    setConfirmDeleteCampaign(campaign);
  };
  const confirmDelete = async () => {
    if (!confirmDeleteCampaign || deletingId) return;
    const campaign = confirmDeleteCampaign;
    const deletionKey = campaign.id.trim() || "campaign-without-id";
    setDeletingId(deletionKey);
    setDeleteError("");
    try {
      await onDelete(campaign);
      setConfirmDeleteCampaign(null);
    } catch (error) {
      console.error("Failed to delete automatic marketing campaign:", error);
      setDeleteError("לא הצלחנו למחוק את הקמפיין. נסו שוב.");
    } finally {
      setDeletingId("");
    }
  };
  const deletingCampaignIsActive = Boolean(confirmDeleteCampaign?.enabled && confirmDeleteCampaign.status === "active");
  return <div className="space-y-8">
    {(successMessage || errorMessage) && <div role="status" className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-bold ${errorMessage ? "border-red-100 bg-red-50 text-[#B33A3A]" : "border-[#CDEBDD] bg-[#F0FBF5] text-[#237354]"}`}><div className="flex items-start gap-2">{errorMessage ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}<span>{errorMessage || successMessage}</span></div><button type="button" onClick={onClearMessage} className="rounded-lg p-1 opacity-70 transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-[#F2D162]" aria-label="סגירת הודעה">×</button></div>}
    <section className="overflow-hidden rounded-[26px] border border-[#E4E7EC] bg-white shadow-sm"><div className="relative p-5 sm:p-7"><div className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full bg-[#FFF4C7]/70 blur-3xl" /><div className="relative flex flex-wrap items-end justify-between gap-5"><div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full bg-[#FFF7D6] px-3 py-1.5 text-xs font-black text-[#8B6B00]"><ShieldCheck className="h-3.5 w-3.5" />הגדרות לפני שליחה</span><h2 className="mt-4 text-2xl font-black tracking-tight text-[#1A1A3E]">שומרים את המסר, מחברים את הטריגר</h2><p className="mt-2 text-sm font-medium leading-7 text-slate-500">בחרו נקודת התחלה, כתבו תוכן ברור והגדירו למי הוא מתאים. בשלב הזה נשמרת הגדרה בלבד, בלי שליחת הודעות ובלי יצירת אנשי קשר.</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => openCreate()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Plus className="h-4 w-4 text-[#F2D162]" />קמפיין אוטומטי חדש</button></div></div></div><div className="grid border-t border-[#EEF0F2] bg-[#FCFCFD] sm:grid-cols-2"><div className="flex items-start gap-3 border-b border-[#EEF0F2] p-5 sm:border-b-0 sm:border-l sm:p-6"><div className="rounded-xl bg-[#EAF0FF] p-2.5 text-[#5267A8]"><Mail className="h-4 w-4" /></div><div><p className="text-sm font-black text-[#1A1A3E]">אימייל</p><p className="mt-1 text-xs font-medium leading-5 text-slate-500">לפני שליחה תידרשו לדומיין שולח מאומת ולכתובת פיזית בדיוור.</p></div></div><div className="flex items-start gap-3 p-5 sm:p-6"><div className="rounded-xl bg-[#EAF8F2] p-2.5 text-[#237354]"><MessageSquare className="h-4 w-4" /></div><div><p className="text-sm font-black text-[#1A1A3E]">SMS</p><p className="mt-1 text-xs font-medium leading-5 text-slate-500">נדרשים מספר שיווקי, רישום מול הספק והסכמה מפורשת לכל איש קשר.</p></div></div></div></section>
    <section><div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-black tracking-wide text-[#5267A8]">מתחילים מתבנית</p><h2 className="mt-1 text-xl font-black text-[#1A1A3E]">תבניות לקליניקה הווטרינרית</h2><p className="mt-1 text-sm font-medium text-slate-500">התבניות הן נקודת פתיחה כבויה. בחרו אחת, ערכו את הפרטים ושמרו אותה כהגדרה משלכם.</p></div><span className="hidden rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 shadow-sm sm:inline-flex">{TEMPLATE_STARTERS.length} תבניות התחלה</span></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{TEMPLATE_STARTERS.map((template) => <StarterCard key={template.key} template={template} onUse={() => openCreate(template)} onPreview={() => openTemplatePreview(template)} />)}</div></section>
    <section><div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-black tracking-wide text-[#5267A8]">ההגדרות שלך</p><h2 className="mt-1 text-xl font-black text-[#1A1A3E]">קמפיינים שנשמרו</h2><p className="mt-1 text-sm font-medium text-slate-500">כל כרטיס כאן הוא הגדרה שנשמרה. הוא אינו מעיד שהודעה נשלחה או שהתקבלו תוצאות.</p></div><span className="rounded-full border border-[#E1E4E8] bg-white px-3 py-1 text-xs font-black text-slate-500">{campaigns.length} הגדרות</span></div>{isLoading ? <div className="rounded-2xl border border-dashed border-[#DDE2EB] bg-white px-6 py-12 text-center"><span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-[#DDE2EB] border-t-[#5267A8]" /><p className="mt-3 text-sm font-bold text-slate-500">טוען את ההגדרות שנשמרו...</p></div> : visibleCampaigns.length === 0 ? <div className="rounded-2xl border border-dashed border-[#DDE2EB] bg-white px-6 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F3F5F8] text-slate-400"><Mail className="h-5 w-5" /></div><h3 className="mt-4 text-base font-black text-[#1A1A3E]">{search ? "לא נמצאו הגדרות תואמות" : "עדיין אין קמפיינים שנשמרו"}</h3><p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">{search ? "נסו לחפש לפי שם, ערוץ או טריגר אחר." : "בחרו תבנית התחלה או פתחו קמפיין חדש. בתוך הטופס תוכלו לבחור יצירה עם AI, לערוך את הטיוטה ולשמור את ההגדרה הראשונה שלכם."}</p></div> : <div className="grid gap-4 xl:grid-cols-2">{visibleCampaigns.map((campaign) => <SavedCard key={campaign.id} campaign={campaign} onEdit={() => openEdit(campaign)} onPreview={() => openPreview(campaign)} onToggle={() => void onToggleEnabled(campaign)} onDelete={() => requestDelete(campaign)} deleting={Boolean(deletingId) && deletingId === campaign.id} />)}</div>}</section>
    <MarketingAutomationWizard isOpen={Boolean(wizard)} mode={wizard?.mode || "create"} initialCampaign={wizard?.campaign} template={wizard?.template} onClose={() => setWizard(null)} onEdit={wizard?.mode === "preview" ? () => wizard.campaign ? setWizard({ mode: "edit", campaign: wizard.campaign }) : setWizard({ mode: "create", template: wizard.template }) : undefined} onSave={onSave} />
    <AlertDialog open={Boolean(confirmDeleteCampaign)} onOpenChange={(open) => { if (!open && !deletingId) { setConfirmDeleteCampaign(null); setDeleteError(""); } }}>
      <AlertDialogContent dir="rtl" role="dialog" aria-modal="true" className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right">מחיקת קמפיין אוטומטי?</AlertDialogTitle>
          <AlertDialogDescription className="text-right leading-6">{confirmDeleteCampaign ? `האם למחוק את ההגדרה "${confirmDeleteCampaign.campaign_name || "הקמפיין"}"?` : ""}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmDeleteCampaign && <div className="space-y-3">
          {deletingCampaignIsActive && <div className="flex items-start gap-2 rounded-2xl border border-[#F0D995] bg-[#FFF9E8] p-4 text-sm font-semibold leading-6 text-[#6C5500]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>הקמפיין מסומן כמופעל. לאחר המחיקה הוא לא יהיה זמין להפעלות אוטומטיות עתידיות.</span></div>}
          <div className="rounded-2xl border border-[#E4E7EC] bg-[#FCFCFD] p-4 text-sm font-semibold leading-6 text-slate-700"><p className="font-black text-[#1A1A3E]">{confirmDeleteCampaign.campaign_name || "הגדרה ללא שם"}</p><p className="mt-1 text-xs font-bold text-slate-500">{channelLabel(confirmDeleteCampaign.channel)} · {triggerLabel(confirmDeleteCampaign.trigger_type, confirmDeleteCampaign.trigger_value)}</p></div>
          <div className="rounded-2xl border border-[#F0CACA] bg-[#FFF7F7] p-4 text-sm font-semibold leading-6 text-[#7F2E2E]"><p>תימחק רק הגדרת הקמפיין השמורה, והיא לא תהיה זמינה עוד לניהול אוטומציות עתידיות.</p><p className="mt-2">היסטוריית השליחות, סטטוסי הנמענים, אנשי הקשר והתורים יישארו ללא שינוי.</p></div>
          {deleteError && <div role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-[#B33A3A]"><Info className="mt-0.5 h-4 w-4 shrink-0" /><span>{deleteError}</span></div>}
        </div>}
        <AlertDialogFooter className="flex-row-reverse gap-2">
          <AlertDialogAction onClick={(event) => { event.preventDefault(); void confirmDelete(); }} disabled={Boolean(deletingId)} className="bg-[#B33A3A] font-black text-white hover:bg-[#992F2F] focus:ring-[#F2D162]">{deletingId ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מוחקים...</> : <><Trash2 className="ml-2 h-4 w-4" />מחיקת הקמפיין</>}</AlertDialogAction>
          <AlertDialogCancel disabled={Boolean(deletingId)} className="font-black">ביטול</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
