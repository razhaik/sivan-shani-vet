import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Info, Mail, MessageSquare, Save, Search, ShieldCheck, Sparkles, Trash2, UsersRound, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MarketingAiBroadcastWizard } from "./MarketingAiBroadcastWizard";
import { EmailDesignPreview } from "./EmailDesignPreview";
import { Input } from "@/components/ui/input";
import { isValidClientPhone, normalizeClientPhone } from "@/lib/clientAggregation";
import type { ClientRow } from "@/lib/crmClientData";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

export type BroadcastChannel = "email" | "sms";
export type BroadcastStatus = "draft" | "ready";
export type BroadcastAudienceKey = "all_clients" | "future_appointments" | "selected_clients" | "sms_consent";
export type BroadcastCtaKey = "" | "book_appointment" | "call_clinic" | "google_reviews";
export type BroadcastSendStatus = "completed" | "partial" | "failed";

export const GOOGLE_REVIEWS_URL = VETERINARY_CLINIC_PROFILE.googleReviewsUrl;

export interface BroadcastDraft {
  broadcast_name: string;
  broadcast_type: "broadcast";
  status: BroadcastStatus;
  channel: BroadcastChannel;
  email_subject: string;
  message_body: string;
  audience_key: BroadcastAudienceKey;
  audience_label: string;
  selected_client_ids: string[];
  cta_key: BroadcastCtaKey;
  cta_label: string;
  cta_url: string;
  sms_consent_acknowledged: boolean;
  last_sent_at?: string;
  last_send_status?: BroadcastSendStatus;
  last_sent_count?: number;
  last_skipped_count?: number;
  last_failed_count?: number;
}

export interface BroadcastRecord extends BroadcastDraft {
  id: string;
  created_at?: string;
  updated_at?: string;
}

export interface BroadcastAudienceOption {
  key: BroadcastAudienceKey;
  label: string;
  description: string;
}

export interface AudienceEstimate extends BroadcastAudienceOption {
  count: number | null;
}

export const BROADCAST_AUDIENCE_OPTIONS: BroadcastAudienceOption[] = [
  { key: "all_clients", label: "כל הלקוחות", description: "לקוחות שאינם לידים, מתורים ומרשומות לקוח מיובאות." },
  { key: "future_appointments", label: "לקוחות עם תור עתידי", description: "לקוחות עם תור מסוג בקשה או אישור במועד עתידי." },
  { key: "selected_clients", label: "לקוחות נבחרים", description: "לקוחות שתבחרו ידנית מתוך רשומות הלקוחות של ה-CRM." },
  { key: "sms_consent", label: "אנשי קשר עם הסכמה ל-SMS", description: "לקוחות עם הסכמה מתועדת לקבלת הודעות SMS." },
];

export const CTA_OPTIONS: Array<{ key: BroadcastCtaKey; label: string; url: string }> = [
  { key: "", label: "בלי פעולה", url: "" },
  { key: "book_appointment", label: "קביעת תור", url: "/appointments" },
  { key: "call_clinic", label: "התקשרות למרפאה", url: `tel:${VETERINARY_CLINIC_PROFILE.phone}` },
  { key: "google_reviews", label: "דירוג בגוגל", url: GOOGLE_REVIEWS_URL },
];

const PERSONALIZATION_VARIABLES = ["{client_first_name}", "{pet_name}"] as const;
const defaultDraft: BroadcastDraft = {
  broadcast_name: "",
  broadcast_type: "broadcast",
  status: "draft",
  channel: "email",
  email_subject: "",
  message_body: "",
  audience_key: "all_clients",
  audience_label: "כל הלקוחות",
  selected_client_ids: [],
  cta_key: "",
  cta_label: "",
  cta_url: "",
  sms_consent_acknowledged: false,
};

function safeSelectedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item.length <= 320).map((item) => item.trim())));
}

function safeAudienceKey(value: unknown): BroadcastAudienceKey {
  if (value === "leads") return "selected_clients";
  return BROADCAST_AUDIENCE_OPTIONS.some((option) => option.key === value) ? value as BroadcastAudienceKey : "all_clients";
}

function safeCtaKey(value: unknown): BroadcastCtaKey {
  return CTA_OPTIONS.some((option) => option.key === value) ? value as BroadcastCtaKey : "";
}

function draftFrom(record?: BroadcastRecord | null): BroadcastDraft {
  if (!record) return { ...defaultDraft, selected_client_ids: [] };
  const audienceKey = safeAudienceKey(record.audience_key);
  const audience = BROADCAST_AUDIENCE_OPTIONS.find((option) => option.key === audienceKey) || BROADCAST_AUDIENCE_OPTIONS[0];
  const ctaKey = safeCtaKey(record.cta_key);
  const cta = CTA_OPTIONS.find((option) => option.key === ctaKey) || CTA_OPTIONS[0];
  const hasCta = cta.key !== "";
  return {
    broadcast_name: record.broadcast_name || "",
    broadcast_type: "broadcast",
    status: record.status === "ready" ? "ready" : "draft",
    channel: record.channel === "sms" ? "sms" : "email",
    email_subject: record.channel === "email" ? record.email_subject || "" : "",
    message_body: record.message_body || "",
    audience_key: audience.key,
    audience_label: audience.label,
    selected_client_ids: safeSelectedIds(record.selected_client_ids),
    cta_key: cta.key,
    cta_label: hasCta ? cta.label : "",
    cta_url: hasCta ? cta.url : "",
    sms_consent_acknowledged: record.sms_consent_acknowledged === true,
    last_sent_at: record.last_sent_at,
    last_send_status: record.last_send_status,
    last_sent_count: record.last_sent_count,
    last_skipped_count: record.last_skipped_count,
    last_failed_count: record.last_failed_count,
  };
}

function countLabel(count: number | null, loading: boolean) {
  if (loading) return "מחשב אומדן…";
  if (count === null) return "אין נתונים";
  return `${count} ${count === 1 ? "איש קשר" : "אנשי קשר"}`;
}

const inputClass = "mt-2 h-11 w-full rounded-xl border border-[#E1E4E8] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#5267A8] focus:ring-2 focus:ring-[#F2D162]/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
const areaClass = "mt-2 min-h-[150px] w-full resize-y rounded-xl border border-[#E1E4E8] bg-white px-3 py-3 text-sm font-semibold leading-6 text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#5267A8] focus:ring-2 focus:ring-[#F2D162]/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

function PreviewCard({ draft }: { draft: BroadcastDraft }) {
  if (draft.channel === "email") {
    return <EmailDesignPreview subject={draft.email_subject} body={draft.message_body} ctaLabel={draft.cta_label} ctaUrl={draft.cta_url} broadcastName={draft.broadcast_name} />;
  }

  return <aside className="rounded-2xl border border-[#DDE2EB] bg-[#F7F8FC] p-4" aria-label="תצוגה מקדימה של ההודעה"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black text-[#5267A8]">תצוגה מקדימה</p><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">תצוגה בלבד</span></div><div className="mt-4 rounded-2xl border border-[#E7E9EE] bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-black text-[#1A1A3E]"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EAF8F2] text-[#237354]"><MessageSquare className="h-4 w-4" /></span>SMS</div><p className="mt-4 whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-600">{draft.message_body || "תוכן ההודעה יופיע כאן"}</p>{draft.cta_key && draft.cta_label && draft.cta_url && <div className="mt-5"><span className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#1A1A3E] px-4 text-xs font-black text-white">{draft.cta_label}</span><p dir="ltr" className="mt-2 break-all text-[10px] font-semibold text-slate-400">{draft.cta_url}</p></div>}</div></aside>;
}

interface ClientPickerDialogProps {
  open: boolean;
  rows: ClientRow[];
  selectedIds: string[];
  search: string;
  onOpenChange: (open: boolean) => void;
  onSearchChange: (value: string) => void;
  onToggle: (id: string) => void;
  onSelectAllVisible: (ids: string[]) => void;
  onClearVisible: (ids: string[]) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function ClientPickerDialog({ open, rows, selectedIds, search, onOpenChange, onSearchChange, onToggle, onSelectAllVisible, onClearVisible, onCancel, onConfirm }: ClientPickerDialogProps) {
  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("he");
    if (!query) return rows;
    const normalizedQuery = query.replace(/\s+/g, "");
    const phoneQuery = query.replace(/\D/g, "");
    return rows.filter((row) => [row.name, row.phone, row.email].some((value) => {
      const normalizedValue = value.toLocaleLowerCase("he");
      const phoneValue = value.replace(/\D/g, "");
      return normalizedValue.includes(query) || normalizedValue.replace(/\s+/g, "").includes(normalizedQuery) || (phoneQuery.length > 0 && phoneValue.includes(phoneQuery));
    }));
  }, [rows, search]);
  const selectedVisibleCount = useMemo(() => filteredRows.filter((row) => selectedIds.includes(row.id)).length, [filteredRows, selectedIds]);
  const allVisibleSelected = filteredRows.length > 0 && selectedVisibleCount === filteredRows.length;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl" className="z-[100] max-h-[calc(100vh-2rem)] max-w-2xl overflow-hidden border-[#DDE2EB] bg-white p-0 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
      <div className="flex max-h-[calc(100vh-2rem)] min-h-0 flex-col sm:max-h-[calc(100vh-3rem)]">
        <DialogHeader className="shrink-0 border-b border-[#E8EAED] px-5 pb-4 pt-5 text-right sm:px-6">
          <DialogTitle className="pr-10 text-right text-xl font-black text-[#1A1A3E]">בחירת לקוחות</DialogTitle>
          <DialogDescription className="pr-10 text-right text-sm font-medium leading-6 text-slate-500">חפשו לקוחות לפי שם, טלפון או אימייל וסמנו את מי שיקבל את ההודעה. השינויים יישמרו רק אחרי אישור הבחירה.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="חיפוש לפי שם, טלפון או אימייל" aria-label="חיפוש לקוחות לפי שם, טלפון או אימייל" autoFocus className="h-11 rounded-xl border-[#E1E4E8] bg-white pr-10 text-sm font-semibold text-[#1A1A3E] focus:border-[#5267A8] focus:ring-[#F2D162]/70" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500" aria-live="polite">
            <p>{filteredRows.length} {filteredRows.length === 1 ? "לקוח תואם" : "לקוחות תואמים"}</p>
            <p className="text-[#5267A8]">נבחרו {selectedIds.length} לקוחות</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={filteredRows.length === 0 || allVisibleSelected} onClick={() => onSelectAllVisible(filteredRows.map((row) => row.id))} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#DDE2EB] bg-white px-3 text-xs font-extrabold text-[#5267A8] transition hover:border-[#5267A8] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-3.5 w-3.5" />בחירת כל התוצאות</button>
            <button type="button" disabled={selectedVisibleCount === 0} onClick={() => onClearVisible(filteredRows.map((row) => row.id))} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#DDE2EB] bg-white px-3 text-xs font-extrabold text-slate-600 transition hover:border-[#5267A8] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />ניקוי הבחירה בתוצאות</button>
          </div>
          <div className="mt-3 max-h-[48vh] min-h-[230px] overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white" aria-label="רשימת לקוחות">
            {rows.length === 0 ? <div className="flex min-h-[230px] items-center justify-center p-6 text-center"><div><UsersRound className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" /><p className="mt-3 text-sm font-black text-[#1A1A3E]">אין כרגע לקוחות לבחירה</p><p className="mt-1 max-w-sm text-xs font-semibold leading-5 text-slate-500">רשומות לידים אינן מופיעות כאן. לאחר שיופיעו לקוחות ב-CRM, תוכלו לבחור אותם לפי הצורך.</p></div></div> : filteredRows.length === 0 ? <div className="flex min-h-[230px] items-center justify-center p-6 text-center"><div><Search className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" /><p className="mt-3 text-sm font-black text-[#1A1A3E]">לא נמצאו לקוחות מתאימים</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">נסו לחפש לפי שם, מספר טלפון או כתובת אימייל אחרת.</p><button type="button" onClick={() => onSearchChange("")} className="mt-3 rounded-lg px-3 py-2 text-xs font-extrabold text-[#5267A8] transition hover:bg-[#F5F7FF] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">ניקוי החיפוש</button></div></div> : <div className="divide-y divide-[#EEF0F2]">{filteredRows.map((row) => {
              const phoneValid = isValidClientPhone(normalizeClientPhone(row.phone));
              const selected = selectedIds.includes(row.id);
              return <label key={row.id} className={`flex cursor-pointer items-start gap-3 p-3 transition hover:bg-[#FFFDF2] sm:p-4 ${selected ? "bg-[#F8FAFF]" : ""}`}><input type="checkbox" checked={selected} onChange={() => onToggle(row.id)} aria-label={`בחירת ${row.name || "לקוח ללא שם"}`} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#1A1A3E] focus:ring-[#F2D162]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-[#1A1A3E]">{row.name || "לקוח ללא שם"}</span><span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500"><span dir="ltr">{row.phone || "ללא טלפון"}</span>{row.email && <span dir="ltr" className="break-all">{row.email}</span>}</span><span className="mt-2 flex flex-wrap gap-1.5">{row.smsConsent ? <span className="rounded-full bg-[#EAF8F2] px-2 py-1 text-[10px] font-black text-[#237354]">הסכמה ל-SMS נשמרה</span> : <span className="rounded-full bg-[#FFF7D6] px-2 py-1 text-[10px] font-black text-[#8B6B00]">ללא הסכמה ל-SMS</span>}{phoneValid ? <span className="rounded-full bg-[#EEF4FF] px-2 py-1 text-[10px] font-black text-[#5267A8]">מספר תקין</span> : <span className="rounded-full bg-[#FFF0EE] px-2 py-1 text-[10px] font-black text-[#B33A3A]">ללא טלפון תקין</span>}</span></span></label>;
            })}</div>}
          </div>
        </div>
        <DialogFooter className="shrink-0 flex-row justify-start gap-2 border-t border-[#E8EAED] bg-[#FCFCFD] px-5 py-4 sm:px-6">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-[#E1E4E8] bg-white px-4 text-sm font-extrabold text-[#1A1A3E] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162]">ביטול</button>
          <button type="button" onClick={onConfirm} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Check className="h-4 w-4 text-[#F2D162]" />אישור הבחירה</button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>;
}

interface Props {
  isOpen: boolean;
  mode: "create" | "edit" | "preview";
  initialBroadcast?: BroadcastRecord | null;
  audienceEstimates: AudienceEstimate[];
  audienceLoading?: boolean;
  clientRows: ClientRow[];
  onClose: () => void;
  onEdit?: () => void;
  onSave: (draft: BroadcastDraft, id?: string) => Promise<void>;
}

export function MarketingBroadcastWizard({ isOpen, mode, initialBroadcast, audienceEstimates, audienceLoading = false, clientRows, onClose, onEdit, onSave }: Props) {
  const readOnly = mode === "preview";
  const [draft, setDraft] = useState<BroadcastDraft>(() => draftFrom(initialBroadcast));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const selectableRows = useMemo(() => clientRows.filter((row) => row.status !== "lead"), [clientRows]);
  const selectedRows = useMemo(() => selectableRows.filter((row) => draft.selected_client_ids.includes(row.id)), [draft.selected_client_ids, selectableRows]);
  const selectedSummaryRows = selectedRows.slice(0, 3);
  const hiddenSelectedCount = Math.max(0, draft.selected_client_ids.length - selectedSummaryRows.length);

  useEffect(() => {
    if (!isOpen) {
      setPickerOpen(false);
      setPickerSelectedIds([]);
      setPickerSearch("");
      setAiOpen(false);
      return;
    }
    setDraft(draftFrom(initialBroadcast));
    setTouched(false);
    setSaving(false);
    setSubmitError("");
    setPickerOpen(false);
    setPickerSelectedIds([]);
    setPickerSearch("");
  }, [initialBroadcast, isOpen]);

  useEffect(() => {
    if (!readOnly) return;
    setPickerOpen(false);
    setPickerSelectedIds([]);
    setPickerSearch("");
    setAiOpen(false);
  }, [readOnly]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (aiOpen || pickerOpen || target?.closest("[data-radix-dialog-content]")) return;
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [aiOpen, isOpen, onClose, pickerOpen]);

  const errors = useMemo<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    if (!draft.broadcast_name.trim()) next.broadcast_name = "הוסיפו שם כדי לזהות את ההודעה.";
    if (!draft.message_body.trim()) next.message_body = "כתבו את תוכן ההודעה.";
    if (!BROADCAST_AUDIENCE_OPTIONS.some((option) => option.key === draft.audience_key)) next.audience_key = "בחרו קהל יעד מתוך האפשרויות.";
    if (draft.audience_key === "selected_clients" && draft.selected_client_ids.length === 0) next.selected_client_ids = "בחרו לפחות לקוח אחד לשליחה ידנית.";
    if (draft.channel === "email" && !draft.email_subject.trim()) next.email_subject = "נושא האימייל הוא שדה חובה.";
    if (draft.channel === "sms" && !draft.sms_consent_acknowledged) next.sms_consent_acknowledged = "יש לאשר שההסכמה נאספה מאנשי הקשר עצמם.";
    if (draft.cta_key && (!draft.cta_label.trim() || !draft.cta_url.trim())) next.cta = "הפעולה שנבחרה אינה שלמה. בחרו פעולה אחרת.";
    return next;
  }, [draft]);

  function setField<K extends keyof BroadcastDraft>(key: K, value: BroadcastDraft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  function openPicker() {
    if (readOnly) return;
    setPickerSelectedIds(safeSelectedIds(draft.selected_client_ids));
    setPickerSearch("");
    setPickerOpen(true);
  }
  function discardPickerChanges() {
    setPickerOpen(false);
    setPickerSelectedIds([]);
    setPickerSearch("");
  }
  function confirmPickerSelection() {
    setDraft((current) => ({ ...current, selected_client_ids: safeSelectedIds(pickerSelectedIds) }));
    setPickerOpen(false);
    setPickerSelectedIds([]);
    setPickerSearch("");
  }
  function handlePickerOpenChange(open: boolean) {
    if (open) {
      if (!readOnly) openPicker();
      return;
    }
    discardPickerChanges();
  }
  function setAudience(key: BroadcastAudienceKey) {
    const option = BROADCAST_AUDIENCE_OPTIONS.find((item) => item.key === key);
    if (!option) return;
    setDraft((current) => ({ ...current, audience_key: option.key, audience_label: option.label }));
    if (option.key === "selected_clients" && !readOnly) openPicker();
  }
  function setCta(key: BroadcastCtaKey) { const option = CTA_OPTIONS.find((item) => item.key === key) || CTA_OPTIONS[0]; setDraft((current) => ({ ...current, cta_key: option.key, cta_label: option.key ? option.label : "", cta_url: option.key ? option.url : "" })); }
  function setChannel(channel: BroadcastChannel) { setDraft((current) => ({ ...current, channel, email_subject: channel === "email" ? current.email_subject : "" })); }
  function appendVariable(variable: string) { setDraft((current) => ({ ...current, message_body: `${current.message_body}${current.message_body && !/\s$/.test(current.message_body) ? " " : ""}${variable}` })); }
  function togglePickerClient(id: string) { setPickerSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function selectAllVisibleClients(ids: string[]) { setPickerSelectedIds((current) => Array.from(new Set([...current, ...ids]))); }
  function clearVisibleClients(ids: string[]) {
    const visibleIds = new Set(ids);
    setPickerSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
  }
  function handleAiGenerated(generated: { broadcast_name: string; email_subject: string; message_body: string }) {
    setDraft((current) => ({
      ...current,
      broadcast_name: generated.broadcast_name,
      email_subject: current.channel === "email" ? generated.email_subject : "",
      message_body: generated.message_body,
    }));
    setSubmitError("");
    setAiOpen(false);
  }

  const showError = (key: string) => touched && errors[key] ? <p className="mt-1 text-xs font-bold text-[#B33A3A]">{errors[key]}</p> : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setTouched(true); if (readOnly || Object.keys(errors).length > 0) return; setSaving(true); setSubmitError("");
    try { await onSave({ ...draft, broadcast_name: draft.broadcast_name.trim(), email_subject: draft.channel === "email" ? draft.email_subject.trim() : "", message_body: draft.message_body.trim(), selected_client_ids: Array.from(new Set(draft.selected_client_ids)) }, initialBroadcast?.id); onClose(); } catch { setSubmitError("לא הצלחנו לשמור את הטיוטה. בדקו את הפרטים ונסו שוב."); } finally { setSaving(false); }
  }

  return <AnimatePresence>{isOpen && <motion.div dir="rtl" className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button type="button" aria-label="סגירת אשף ההודעה" onClick={onClose} className="absolute inset-0 bg-[#1A1A3E]/[0.45] backdrop-blur-[2px]" />{pickerOpen && !readOnly && <button type="button" aria-label="סגירת חלון בחירת הלקוחות" onClick={discardPickerChanges} className="absolute inset-0 z-[90] bg-[#1A1A3E]/[0.55] backdrop-blur-[2px]" />}<motion.section role="dialog" aria-modal="true" aria-labelledby="broadcast-wizard-title" className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[26px] bg-white shadow-2xl" initial={{ y: 18, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, scale: 0.98 }}>
    <header className="flex items-start justify-between gap-4 border-b border-[#E8EAED] px-5 py-5 sm:px-7"><div><p className="text-xs font-black tracking-wide text-[#5267A8]">{readOnly ? "תצוגה מקדימה" : mode === "edit" ? "עריכת טיוטה" : "הודעה חדשה"}</p><h2 id="broadcast-wizard-title" className="mt-1 text-xl font-black text-[#1A1A3E]">{readOnly ? draft.broadcast_name || "טיוטת הודעה" : mode === "edit" ? "עדכון הודעה שיווקית" : "יצירת הודעה שיווקית"}</h2><p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-500">שמירה יוצרת טיוטה בלבד. הודעה שמוכנה לאישור נשלחת רק מהכרטיס, אחרי אישור סופי.</p></div><button type="button" onClick={onClose} aria-label="סגירה" className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><X className="h-5 w-5" /></button></header>
    <form onSubmit={submit} onBlur={() => setTouched(true)} className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6"><div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#C9D5F5] bg-[#F5F7FF] px-4 py-3 text-sm font-semibold leading-6 text-[#344777]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />השמירה כאן אינה שולחת הודעה, אינה מתזמנת הודעה ואינה משנה הסכמות של אנשי קשר. פעולת השליחה נמצאת בכרטיס של הודעה מוכנה.</div><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="space-y-6">
      <section><div className="mb-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFF4C7] text-xs font-black text-[#8B6B00]">1</span><h3 className="text-sm font-black text-[#1A1A3E]">פרטי ההודעה</h3></div><label htmlFor="broadcast-name" className="block text-sm font-extrabold text-[#1A1A3E]">שם ההודעה<input id="broadcast-name" value={draft.broadcast_name} disabled={readOnly} maxLength={120} onChange={(event) => setField("broadcast_name", event.target.value)} placeholder="לדוגמה: עדכון שעות פעילות בחג" className={inputClass} />{showError("broadcast_name")}</label></section>
      <section><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EAF0FF] text-xs font-black text-[#5267A8]">2</span><h3 className="text-sm font-black text-[#1A1A3E]">ערוץ ותוכן</h3></div><button type="button" disabled={readOnly || saving} onClick={() => setAiOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[#D7C36E] bg-[#FFF9E6] px-3 text-xs font-black text-[#6D5600] transition hover:border-[#B59A2A] hover:bg-[#FFF4C7] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-3.5 w-3.5 text-[#B08A00]" aria-hidden="true" />יצירה עם AI</button></div><fieldset><legend className="text-sm font-extrabold text-[#1A1A3E]">ערוץ ההודעה</legend><div className="mt-2 grid grid-cols-2 gap-2">{([["email", "אימייל", Mail], ["sms", "SMS", MessageSquare]] as const).map(([value, label, Icon]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-extrabold transition ${draft.channel === value ? "border-[#5267A8] bg-[#F5F7FF] text-[#1A1A3E] ring-2 ring-[#F2D162]/50" : "border-[#E1E4E8] text-slate-500 hover:border-[#5267A8]/50"}`}><input type="radio" name="broadcast-channel" value={value} checked={draft.channel === value} disabled={readOnly} onChange={() => setChannel(value)} className="sr-only" /><Icon className="h-4 w-4" aria-hidden="true" />{label}</label>)}</div></fieldset>{draft.channel === "email" && <label htmlFor="broadcast-subject" className="mt-4 block text-sm font-extrabold text-[#1A1A3E]">נושא האימייל<input id="broadcast-subject" value={draft.email_subject} disabled={readOnly} maxLength={160} onChange={(event) => setField("email_subject", event.target.value)} placeholder="נושא קצר וברור" className={inputClass} />{showError("email_subject")}</label>}<label htmlFor="broadcast-body" className="mt-4 block text-sm font-extrabold text-[#1A1A3E]">תוכן ההודעה<textarea id="broadcast-body" value={draft.message_body} disabled={readOnly} maxLength={500} onChange={(event) => setField("message_body", event.target.value)} placeholder="שלום {client_first_name}, רצינו לעדכן אתכם..." className={areaClass} />{showError("message_body")}<span className="mt-1 block text-xs font-medium text-slate-400">{draft.message_body.length}/500 תווים, לפני התאמה אישית וקישור פעולה.</span></label><div className="mt-3 rounded-xl border border-[#EEF0F2] bg-[#FCFCFD] p-3"><p className="text-xs font-black text-[#1A1A3E]">משתנים בטוחים להתאמה אישית</p><p className="mt-1 text-xs font-medium text-slate-500">הוסיפו משתנה במקום שבו תרצו שיוחלף בפרטי הלקוח או חיית המחמד.</p><div className="mt-2 flex flex-wrap gap-2">{PERSONALIZATION_VARIABLES.map((variable) => <button key={variable} type="button" disabled={readOnly} onClick={() => appendVariable(variable)} className="rounded-lg border border-[#DDE2EB] bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-[#5267A8] transition hover:border-[#5267A8] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50">{variable}</button>)}</div></div></section>
      <section><div className="mb-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EAF8F2] text-xs font-black text-[#237354]">3</span><h3 className="text-sm font-black text-[#1A1A3E]">קהל יעד</h3></div><p className="mb-3 text-xs font-medium leading-5 text-slate-500">הקהל נפתר מחדש מרשומות ה-CRM בעת השליחה. הבחירה אינה מעתיקה פרטי לקוח ואינה כוללת לידים.</p><div className="grid gap-2 sm:grid-cols-2">{BROADCAST_AUDIENCE_OPTIONS.map((option) => { const estimate = audienceEstimates.find((item) => item.key === option.key); return <label key={option.key} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition ${draft.audience_key === option.key ? "border-[#5267A8] bg-[#F5F7FF] ring-2 ring-[#F2D162]/50" : "border-[#E1E4E8] hover:border-[#5267A8]/50"}`}><input type="radio" name="broadcast-audience" value={option.key} checked={draft.audience_key === option.key} disabled={readOnly} onChange={() => setAudience(option.key)} className="mt-1 h-4 w-4 accent-[#1A1A3E]" /><span className="min-w-0"><span className="block text-sm font-black text-[#1A1A3E]">{option.label}</span><span className="mt-1 block text-xs font-medium leading-5 text-slate-500">{option.description}</span><span className="mt-2 block text-xs font-black text-[#5267A8]">אומדן: {countLabel(estimate?.count ?? null, audienceLoading)}</span></span></label>; })}</div>{showError("audience_key")}{draft.audience_key === "selected_clients" && <div className="mt-4 rounded-2xl border border-[#DDE2EB] bg-[#FCFCFD] p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF0FF] text-[#5267A8]"><UsersRound className="h-4 w-4" /></span><div><p className="text-sm font-black text-[#1A1A3E]">בחירת לקוחות ספציפיים</p><p className="mt-1 text-xs font-semibold text-slate-500">נבחרו {draft.selected_client_ids.length} מתוך {selectableRows.length} לקוחות זמינים.</p></div></div>{draft.selected_client_ids.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5" aria-label="לקוחות שנבחרו"><div className="flex flex-wrap gap-1.5">{selectedSummaryRows.map((row) => <span key={row.id} className="max-w-[180px] truncate rounded-full bg-white px-2.5 py-1.5 text-[11px] font-black text-[#5267A8] ring-1 ring-[#DDE2EB]">{row.name || "לקוח ללא שם"}</span>)}{hiddenSelectedCount > 0 && <span className="rounded-full bg-[#FFF4C7] px-2.5 py-1.5 text-[11px] font-black text-[#8B6B00]">+{hiddenSelectedCount} נוספים</span>}</div></div> : <p className="mt-3 text-xs font-semibold text-slate-500">עדיין לא נבחרו לקוחות. פתחו את החלון כדי לבחור נמענים.</p>}</div>{readOnly ? <span className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-white px-3 text-xs font-extrabold text-slate-400 ring-1 ring-[#E1E4E8]">תצוגה בלבד</span> : <button type="button" onClick={openPicker} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-3.5 text-xs font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><UsersRound className="h-4 w-4 text-[#F2D162]" />{draft.selected_client_ids.length > 0 ? "עריכת בחירת הלקוחות" : "בחירת לקוחות"}</button>}</div><div className="mt-4 flex items-start gap-2 text-xs font-semibold leading-5 text-slate-500"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8B6B00]" />בעת השליחה המערכת תדלג על לקוחות {draft.channel === "sms" ? "בלי הסכמה מתועדת או בלי מספר טלפון תקין" : "בלי כתובת אימייל תקינה או עם כתובת כפולה"}. הבחירה עצמה אינה משנה את ההסכמה.</div>{showError("selected_client_ids")}</div>}</section>
      <section><div className="mb-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFF0EE] text-xs font-black text-[#B33A3A]">4</span><h3 className="text-sm font-black text-[#1A1A3E]">פעולה ומצב</h3></div><label htmlFor="broadcast-cta" className="block text-sm font-extrabold text-[#1A1A3E]">פעולה בסוף ההודעה<select id="broadcast-cta" value={draft.cta_key} disabled={readOnly} onChange={(event) => setCta(event.target.value as BroadcastCtaKey)} className={inputClass}>{CTA_OPTIONS.map((option) => <option key={option.key || "none"} value={option.key}>{option.label}</option>)}</select></label>{draft.cta_key === "google_reviews" && <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#C9D5F5] bg-[#F5F7FF] p-3 text-xs font-semibold leading-5 text-[#344777]"><Info className="mt-0.5 h-4 w-4 shrink-0" /><span>הקישור שיופיע בסוף הודעת {draft.channel === "sms" ? "ה-SMS" : "האימייל"} הוא דף הביקורות של המרפאה.<a href={GOOGLE_REVIEWS_URL} target="_blank" rel="noreferrer" dir="ltr" className="mt-1 block break-all font-bold text-[#5267A8] underline underline-offset-2">{GOOGLE_REVIEWS_URL}</a></span></div>}{showError("cta")}<label htmlFor="broadcast-status" className="mt-4 block max-w-xs text-sm font-extrabold text-[#1A1A3E]">מצב הטיוטה<select id="broadcast-status" value={draft.status} disabled={readOnly} onChange={(event) => setField("status", event.target.value as BroadcastStatus)} className={inputClass}><option value="draft">טיוטה</option><option value="ready">מוכנה לאישור</option></select></label>{draft.channel === "sms" && <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[#F0D995] bg-[#FFF9E8] p-4 text-sm font-semibold leading-6 text-[#6C5500]"><input type="checkbox" checked={draft.sms_consent_acknowledged} disabled={readOnly} onChange={(event) => setField("sms_consent_acknowledged", event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#5267A8]" /><span>אני מאשר/ת שהודעת SMS תישלח רק לאנשי קשר שנתנו הסכמה מפורשת ומתועדת לקבלת הודעות מהמרפאה. ההסכמה חייבת להגיע מאיש הקשר עצמו, והשמירה כאן אינה אוספת או משנה אותה.</span></label>}{showError("sms_consent_acknowledged")}</section>
    </div><PreviewCard draft={draft} /></div></div><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8EAED] bg-[#FCFCFD] px-5 py-4 sm:px-7"><div className="min-w-0 flex-1">{submitError && <p role="alert" className="text-sm font-bold text-[#B33A3A]">{submitError}</p>}{!submitError && touched && Object.keys(errors).length > 0 && <p className="text-xs font-bold text-[#B33A3A]">השלימו את שדות החובה כדי לשמור את הטיוטה.</p>}{!submitError && <p className="mt-1 text-xs font-semibold text-slate-500">{draft.status === "ready" ? "מוכנה לאישור" : "טיוטה"} · השמירה אינה שולחת דבר.</p>}</div><div className="flex items-center gap-2">{readOnly ? <><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[#E1E4E8] bg-white px-4 text-sm font-extrabold text-[#1A1A3E] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162]">סגירה</button>{onEdit && <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Check className="h-4 w-4 text-[#F2D162]" />עריכת הטיוטה</button>}</> : <><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[#E1E4E8] bg-white px-4 text-sm font-extrabold text-[#1A1A3E] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162]">ביטול</button><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-4 w-4 text-[#F2D162]" />}שמירת הטיוטה</button></>}</div></footer></form>
  </motion.section><ClientPickerDialog open={pickerOpen && !readOnly} rows={selectableRows} selectedIds={pickerSelectedIds} search={pickerSearch} onOpenChange={handlePickerOpenChange} onSearchChange={setPickerSearch} onToggle={togglePickerClient} onSelectAllVisible={selectAllVisibleClients} onClearVisible={clearVisibleClients} onCancel={discardPickerChanges} onConfirm={confirmPickerSelection} /></motion.div>}<MarketingAiBroadcastWizard isOpen={isOpen && aiOpen && !readOnly} channel={draft.channel} onClose={() => setAiOpen(false)} onGenerated={handleAiGenerated} /></AnimatePresence>;
}
