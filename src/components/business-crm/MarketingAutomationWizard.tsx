import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock3, Info, Mail, MessageSquare, Save, ShieldCheck, Sparkles, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MarketingAiCampaignWizard } from "./MarketingAiCampaignWizard";

export type CampaignChannel = "email" | "sms";
export type CampaignStatus = "draft" | "active" | "paused";
export type TimingRelation = "same_day" | "before" | "after";
export type TimingUnit = "hours" | "days";

export interface CampaignDraft {
  campaign_name: string;
  campaign_type: "automatic";
  status: CampaignStatus;
  channel: CampaignChannel;
  template_key: string;
  trigger_type: string;
  trigger_value: number;
  timing_relation: TimingRelation;
  timing_unit: TimingUnit;
  timing_value: number;
  email_subject: string;
  message_body: string;
  audience_description: string;
  sms_consent_acknowledged: boolean;
  enabled: boolean;
}

export interface CampaignRecord extends CampaignDraft {
  id: string;
  created_at?: string;
  updated_at?: string;
}

export interface TemplateStarter {
  key: string;
  title: string;
  description: string;
  triggerType: string;
  triggerValue: number;
  triggerLabel: string;
  subject: string;
  body: string;
  audience: string;
  icon: LucideIcon;
  accent: "yellow" | "blue" | "rose" | "mint";
}

export const TEMPLATE_STARTERS: TemplateStarter[] = [
  {
    key: "review-after-first-visit",
    title: "קבלת חוות דעת מהלקוחות שלך",
    description: "הודעה נעימה אחרי הפגישה הראשונה, כדי לשמוע איך היה ולשמור על קשר.",
    triggerType: "appointment_completed",
    triggerValue: 0,
    triggerLabel: "אחרי פגישה שהושלמה",
    subject: "איך היה הביקור הראשון של {pet_name}?",
    body: "שלום {client_first_name},\nשמחנו לפגוש אתכם ואת {pet_name}. נשמח לשמוע איך הייתה החוויה שלכם במרפאה.",
    audience: "לקוחות שהשלימו את הפגישה הראשונה שלהם",
    icon: MessageSquare,
    accent: "yellow",
  },
  {
    key: "birthday",
    title: "יום הולדת שמח",
    description: "ברכה אישית ליום ההולדת של חיית המחמד, לפי תאריך הלידה בכרטיס הלקוח.",
    triggerType: "birthday",
    triggerValue: 0,
    triggerLabel: "ביום ההולדת",
    subject: "יום הולדת שמח ל-{pet_name}!",
    body: "שלום {client_first_name},\nמאחלים ל-{pet_name} יום הולדת שמח, בריאות והרבה רגעים טובים יחד.",
    audience: "לקוחות עם תאריך לידה מתועד לחיית המחמד",
    icon: Clock3,
    accent: "rose",
  },
  {
    key: "new-client",
    title: "לקוחות חדשים",
    description: "סדרת פתיחה קצרה ללקוח חדש, עם מידע שימושי על המרפאה והמשך הטיפול.",
    triggerType: "client_created",
    triggerValue: 0,
    triggerLabel: "כאשר לקוח חדש נוצר",
    subject: "נעים להכיר, אנחנו כאן בשבילכם",
    body: "שלום {client_first_name},\nשמחים שהצטרפתם למרפאה. כאן תמצאו צוות שמכיר אתכם ואת {pet_name} לאורך הדרך.",
    audience: "לקוחות חדשים שנוספו למערכת",
    icon: ShieldCheck,
    accent: "blue",
  },
  {
    key: "inactive-clients",
    title: "חידוש קשר עם לקוחות לא פעילים",
    description: "תזכורת עדינה ללקוחות שלא הייתה להם פעילות במרפאה במשך תקופה שנבחרה.",
    triggerType: "inactive_days",
    triggerValue: 90,
    triggerLabel: "אחרי 90 ימים ללא פעילות",
    subject: "מה שלומכם? נשמח לשמוע מכם",
    body: "שלום {client_first_name},\nעבר זמן מאז הביקור האחרון של {pet_name}. אם יש משהו שנוכל לעזור בו, אנחנו כאן.",
    audience: "לקוחות עם פעילות אחרונה לפני 90 ימים או יותר",
    icon: Clock3,
    accent: "mint",
  },
];

export const TRIGGER_OPTIONS = [
  ["client_created", "לקוח חדש נוצר"],
  ["birthday", "יום הולדת"],
  ["inactive_days", "X ימים ללא פעילות"],
  ["appointment_completed", "פגישה הושלמה"],
  ["quote_unanswered", "הצעת מחיר לא נענתה"],
] as const;

const defaultDraft: CampaignDraft = {
  campaign_name: "",
  campaign_type: "automatic",
  status: "draft",
  channel: "email",
  template_key: "",
  trigger_type: "client_created",
  trigger_value: 30,
  timing_relation: "same_day",
  timing_unit: "days",
  timing_value: 0,
  email_subject: "",
  message_body: "",
  audience_description: "לקוחות המתאימים לטריגר שנבחר",
  sms_consent_acknowledged: false,
  enabled: false,
};

function draftFrom(campaign?: CampaignRecord | null, template?: TemplateStarter, initialDraft?: CampaignDraft | null): CampaignDraft {
  if (campaign) {
    const { campaign_name, status, channel, template_key, trigger_type, trigger_value, timing_relation, timing_unit, timing_value, email_subject, message_body, audience_description, sms_consent_acknowledged, enabled } = campaign;
    return { campaign_name, campaign_type: "automatic", status, channel, template_key, trigger_type, trigger_value, timing_relation, timing_unit, timing_value, email_subject, message_body, audience_description, sms_consent_acknowledged, enabled };
  }
  if (initialDraft) {
    return {
      ...defaultDraft,
      ...initialDraft,
      campaign_type: "automatic",
      status: "draft",
      channel: "email",
      sms_consent_acknowledged: false,
      enabled: false,
    };
  }
  if (!template) return { ...defaultDraft };
  return { ...defaultDraft, campaign_name: template.title, template_key: template.key, trigger_type: template.triggerType, trigger_value: template.triggerValue, email_subject: template.subject, message_body: template.body, audience_description: template.audience };
}

export function triggerLabel(type: string, value = 0) {
  if (type === "inactive_days") return `אחרי ${value || 0} ימים ללא פעילות`;
  return TRIGGER_OPTIONS.find(([key]) => key === type)?.[1] || "טריגר מותאם";
}

export function timingLabel(draft: Pick<CampaignDraft, "timing_relation" | "timing_value" | "timing_unit">) {
  if (draft.timing_relation === "same_day") return "במהלך היום שבו הטריגר זוהה";
  const relation = draft.timing_relation === "before" ? "לפני" : "אחרי";
  const unit = draft.timing_unit === "hours" ? "שעות" : "ימים";
  return `${draft.timing_value} ${unit} ${relation} הטריגר`;
}

const SAMPLE_CLIENT_NAME = "יעל";
const SAMPLE_PET_NAME = "לולה";

function previewText(value: string) {
  return value
    .replace(/\{client_first_name\}/g, SAMPLE_CLIENT_NAME)
    .replace(/\{pet_name\}/g, SAMPLE_PET_NAME);
}

function EmailPreview({ draft }: { draft: CampaignDraft }) {
  return <section role="region" aria-labelledby="email-preview-title" className="overflow-hidden rounded-[22px] border border-[#D7E0F5] bg-[#F5F7FF] shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DDE5F6] px-4 py-4 sm:px-5"><div><p className="text-xs font-black tracking-wide text-[#5267A8]">איך המייל ייראה</p><h3 id="email-preview-title" className="mt-1 text-base font-black text-[#1A1A3E]">תצוגה מקדימה של האימייל</h3></div><span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#5267A8] shadow-sm">ערכים לדוגמה בלבד</span></div><div className="p-3 sm:p-5"><div className="overflow-hidden rounded-2xl border border-[#E0E4EC] bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-[#EEF0F3] bg-[#FCFCFD] px-4 py-4 sm:px-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1A1A3E] text-sm font-black text-[#F2D162]">ס</div><div className="min-w-0"><p className="truncate text-sm font-black text-[#1A1A3E]">ד&quot;ר סיון שני · מרפאה וטרינרית</p><p className="mt-0.5 text-xs font-semibold text-slate-500">טיפול באהבה לבעלי חיים</p></div></div><div className="border-b border-[#EEF0F3] px-4 py-4 sm:px-5"><p className="text-[11px] font-black uppercase tracking-wide text-slate-400">נושא</p><p className="mt-1 break-words text-base font-black leading-6 text-[#1A1A3E]">{previewText(draft.email_subject) || "נושא המייל יופיע כאן"}</p></div><div className="min-h-[150px] px-4 py-5 sm:px-5 sm:py-6"><p className="whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-[#30344D]">{previewText(draft.message_body) || "תוכן ההודעה יופיע כאן לאחר שתוסיפו אותו."}</p></div><div className="border-t border-[#EEF0F3] bg-[#FCFCFD] px-4 py-3 text-center text-[11px] font-semibold text-slate-400 sm:px-5">תצוגה להמחשה בלבד, ללא נמענים או פרטים אישיים</div></div></div></section>;
}

interface Props {
  isOpen: boolean;
  mode: "create" | "edit" | "preview";
  initialCampaign?: CampaignRecord | null;
  initialDraft?: CampaignDraft | null;
  template?: TemplateStarter;
  onClose: () => void;
  onEdit?: () => void;
  onSave: (draft: CampaignDraft, id?: string) => Promise<void>;
}

const inputClass = "mt-2 h-11 w-full rounded-xl border border-[#E1E4E8] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#5267A8] focus:ring-2 focus:ring-[#F2D162]/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
const areaClass = "mt-2 min-h-[128px] w-full resize-y rounded-xl border border-[#E1E4E8] bg-white px-3 py-3 text-sm font-semibold leading-6 text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#5267A8] focus:ring-2 focus:ring-[#F2D162]/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export function MarketingAutomationWizard({ isOpen, mode, initialCampaign, initialDraft, template, onClose, onEdit, onSave }: Props) {
  const readOnly = mode === "preview";
  const [draft, setDraft] = useState<CampaignDraft>(() => draftFrom(initialCampaign, template, initialDraft));
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(draftFrom(initialCampaign, template, initialDraft));
      setSubmitError("");
      setTouched(false);
    }
  }, [initialCampaign, initialDraft, isOpen, template]);

  useEffect(() => {
    if (!isOpen || readOnly) setAiOpen(false);
  }, [isOpen, readOnly]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || aiOpen) return;
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [aiOpen, isOpen, onClose]);

  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    if (!draft.campaign_name.trim()) next.campaign_name = "הוסיפו שם כדי לזהות את ההגדרה.";
    if (draft.trigger_type === "inactive_days" && draft.trigger_value < 1) next.trigger_value = "בחרו מספר ימים גדול מאפס.";
    if (draft.channel === "email" && !draft.email_subject.trim()) next.email_subject = "נושא המייל הוא שדה חובה.";
    if (!draft.message_body.trim()) next.message_body = "כתבו את תוכן ההודעה.";
    if (!draft.audience_description.trim()) next.audience_description = "תארו בקצרה את קהל היעד.";
    if (draft.timing_relation !== "same_day" && draft.timing_value < 1) next.timing_value = "בחרו ערך גדול מאפס.";
    if (draft.channel === "sms" && !draft.sms_consent_acknowledged) next.sms_consent_acknowledged = "יש לאשר את תנאי ההסכמה לפני שמירה.";
    return next;
  }, [draft]);

  const setField = <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const handleAiGenerated = (generatedDraft: CampaignDraft) => {
    setDraft(generatedDraft);
    setSubmitError("");
    setTouched(false);
    setAiOpen(false);
  };
  const showError = (key: string) => touched && errors[key] ? <p className="mt-1 text-xs font-bold text-[#B33A3A]">{errors[key]}</p> : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (readOnly || Object.keys(errors).length > 0) return;
    setSaving(true);
    setSubmitError("");
    try {
      await onSave({ ...draft, campaign_name: draft.campaign_name.trim(), enabled: draft.status === "active" }, initialCampaign?.id);
      onClose();
    } catch {
      setSubmitError("לא הצלחנו לשמור את ההגדרה. נסו שוב בעוד רגע.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6" dir="rtl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="סגירת אשף הקמפיין" onClick={onClose} className="absolute inset-0 bg-[#1A1A3E]/[0.45] backdrop-blur-[2px]" />
          <motion.section role="dialog" aria-modal="true" aria-labelledby="marketing-wizard-title" initial={{ y: 18, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, scale: 0.98 }} className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[26px] bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]">
            <header className="flex items-start justify-between gap-4 border-b border-[#E8EAED] px-5 py-5 sm:px-7">
              <div><p className="text-xs font-black tracking-wide text-[#5267A8]">{readOnly ? "תצוגה מקדימה" : mode === "edit" ? "עריכת הגדרה" : "הגדרה חדשה"}</p><h2 id="marketing-wizard-title" className="mt-1 text-xl font-black text-[#1A1A3E]">{readOnly ? draft.campaign_name || "קמפיין אוטומטי" : mode === "edit" ? "עדכון קמפיין אוטומטי" : "קמפיין אוטומטי חדש"}</h2><p className="mt-1 text-sm font-medium text-slate-500">הגדרה נשמרת במערכת. שליחה בפועל אינה מתבצעת במסך הזה.</p></div>
              <button type="button" onClick={onClose} aria-label="סגירה" className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><X className="h-5 w-5" /></button>
            </header>
            <form onSubmit={submit} onBlur={() => setTouched(true)} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                {readOnly && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#C9D5F5] bg-[#F5F7FF] px-4 py-3 text-sm font-semibold leading-6 text-[#344777]"><Info className="mt-0.5 h-4 w-4 shrink-0" />זהו סיכום ההגדרה כפי שנשמרה. היא אינה מציגה נמענים, תוצאות או שליחה שבוצעה.</div>}
                {readOnly && draft.channel === "email" && <div className="mb-6"><EmailPreview draft={draft} /></div>}
                <div className="space-y-6">
                  <section><div className="mb-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFF4C7] text-xs font-black text-[#8B6B00]">1</span><h3 className="text-sm font-black text-[#1A1A3E]">פרטי ההגדרה</h3></div><label className="block text-sm font-extrabold text-[#1A1A3E]" htmlFor="campaign-name">שם הקמפיין<input id="campaign-name" value={draft.campaign_name} disabled={readOnly} onChange={(e) => setField("campaign_name", e.target.value)} maxLength={120} placeholder="לדוגמה: ברכת יום הולדת לחיות מחמד" className={inputClass} /></label>{showError("campaign_name")}</section>
                  <section><div className="mb-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EAF0FF] text-xs font-black text-[#5267A8]">2</span><h3 className="text-sm font-black text-[#1A1A3E]">טריגר וערוץ</h3></div><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-extrabold text-[#1A1A3E]" htmlFor="trigger-type">מה יפעיל את שליחת הקמפיין?<select id="trigger-type" value={draft.trigger_type} disabled={readOnly} onChange={(e) => setField("trigger_type", e.target.value)} className={inputClass}>{TRIGGER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div><p className="text-sm font-extrabold text-[#1A1A3E]">ערוץ שיווק</p><div className="mt-2 grid grid-cols-2 gap-2">{([["email", "שיווק באימייל", Mail], ["sms", "שיווק ב-SMS", MessageSquare]] as const).map(([value, label, Icon]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-extrabold transition ${draft.channel === value ? "border-[#5267A8] bg-[#F5F7FF] text-[#1A1A3E] ring-2 ring-[#F2D162]/50" : "border-[#E1E4E8] text-slate-500 hover:border-[#5267A8]/50"}`}><input type="radio" name="campaign-channel" value={value} checked={draft.channel === value} disabled={readOnly} onChange={() => setField("channel", value)} className="sr-only" /><Icon className="h-4 w-4" aria-hidden="true" />{label}</label>)}</div></div></div>{draft.trigger_type === "inactive_days" && <label className="mt-4 block max-w-xs text-sm font-extrabold text-[#1A1A3E]" htmlFor="trigger-value">כמה ימים ללא פעילות?<input id="trigger-value" type="number" min={1} max={3650} value={draft.trigger_value || ""} disabled={readOnly} onChange={(e) => setField("trigger_value", Number(e.target.value) || 0)} className={inputClass} /></label>}{showError("trigger_value")}</section>
                  <section><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EAF8F2] text-xs font-black text-[#237354]">3</span><h3 className="text-sm font-black text-[#1A1A3E]">תוכן וקהל</h3></div><button type="button" disabled={readOnly || saving} onClick={() => setAiOpen(true)} aria-label="יצירה עם AI לקמפיין אוטומטי" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[#D7C36E] bg-[#FFF9E6] px-3 text-xs font-black text-[#6D5600] transition hover:border-[#B59A2A] hover:bg-[#FFF4C7] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-3.5 w-3.5 text-[#B08A00]" aria-hidden="true" />יצירה עם AI</button></div>{draft.channel === "email" && <label className="mb-4 block text-sm font-extrabold text-[#1A1A3E]" htmlFor="email-subject">נושא המייל<input id="email-subject" value={draft.email_subject} disabled={readOnly} onChange={(e) => setField("email_subject", e.target.value)} maxLength={160} placeholder="נושא קצר וברור" className={inputClass} />{showError("email_subject")}</label>}<label className="block text-sm font-extrabold text-[#1A1A3E]" htmlFor="message-body">תוכן ההודעה<textarea id="message-body" value={draft.message_body} disabled={readOnly} onChange={(e) => setField("message_body", e.target.value)} placeholder="כתבו כאן את ההודעה. אפשר להשתמש בשדות כמו {client_first_name} או {pet_name}." className={areaClass} />{showError("message_body")}</label><label className="mt-4 block text-sm font-extrabold text-[#1A1A3E]" htmlFor="audience-description">למי מיועדת ההגדרה?<input id="audience-description" value={draft.audience_description} disabled={readOnly} onChange={(e) => setField("audience_description", e.target.value)} placeholder="למשל: לקוחות פעילים עם חיית מחמד" className={inputClass} />{showError("audience_description")}</label></section>
                  <section><div className="mb-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFF0EE] text-xs font-black text-[#B33A3A]">4</span><h3 className="text-sm font-black text-[#1A1A3E]">תזמון ומצב</h3></div><div className="rounded-2xl border border-[#E8EAED] bg-[#FAFBFC] p-4"><div className="flex items-start gap-2 text-sm font-semibold leading-6 text-slate-600"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" /><span>התזמון יחסי לאירוע המפעיל. הוא מתאר מתי המערכת תוכל לבדוק את ההגדרה, בלי להבטיח שעת שליחה מדויקת.</span></div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_0.8fr]"><label className="text-sm font-extrabold text-[#1A1A3E]" htmlFor="timing-relation">מתי ביחס לטריגר?<select id="timing-relation" value={draft.timing_relation} disabled={readOnly} onChange={(e) => setField("timing_relation", e.target.value as TimingRelation)} className={inputClass}><option value="same_day">במהלך היום</option><option value="after">אחרי הטריגר</option><option value="before">לפני הטריגר</option></select></label>{draft.timing_relation !== "same_day" && <label className="text-sm font-extrabold text-[#1A1A3E]" htmlFor="timing-value">כמה?<input id="timing-value" type="number" min={1} max={3650} value={draft.timing_value || ""} disabled={readOnly} onChange={(e) => setField("timing_value", Number(e.target.value) || 0)} className={inputClass} />{showError("timing_value")}</label>}<label className="text-sm font-extrabold text-[#1A1A3E]" htmlFor="timing-unit">יחידה<select id="timing-unit" value={draft.timing_unit} disabled={readOnly} onChange={(e) => setField("timing_unit", e.target.value as TimingUnit)} className={inputClass}><option value="days">ימים</option><option value="hours">שעות</option></select></label></div></div><label className="mt-4 block max-w-xs text-sm font-extrabold text-[#1A1A3E]" htmlFor="campaign-status">מצב ההגדרה<select id="campaign-status" value={draft.status} disabled={readOnly} onChange={(e) => setField("status", e.target.value as CampaignStatus)} className={inputClass}><option value="draft">טיוטה</option><option value="active">מסומנת כמופעלת, ללא שליחה</option><option value="paused">מסומנת כמושהית</option></select></label>{draft.channel === "sms" && <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[#F0D995] bg-[#FFF9E8] p-4 text-sm font-semibold leading-6 text-[#6C5500]"><input type="checkbox" checked={draft.sms_consent_acknowledged} disabled={readOnly} onChange={(e) => setField("sms_consent_acknowledged", e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#5267A8]" /> <span>אני מאשר/ת שהודעת SMS תוכל להישלח רק לאנשי קשר עם הסכמה מפורשת ומתועדת לקבלת הודעות שיווקיות ב-SMS. ההסכמה נאספת במקום אחר ואינה נרשמת כאן.</span></label>}{showError("sms_consent_acknowledged")}</section>
                </div>
              </div>
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8EAED] bg-[#FCFCFD] px-5 py-4 sm:px-7"><div className="min-w-0 flex-1">{submitError && <p className="text-sm font-bold text-[#B33A3A]">{submitError}</p>}{!submitError && Object.keys(errors).length > 0 && <p className="text-xs font-bold text-[#B33A3A]">השלימו את שדות החובה כדי לשמור את ההגדרה.</p>}{!submitError && draft.channel === "email" && <p className="mt-1 text-xs font-semibold text-slate-500">אימייל דורש דומיין שולח מאומת וכתובת פיזית למשלוח.</p>}{!submitError && draft.channel === "sms" && <p className="mt-1 text-xs font-semibold text-slate-500">SMS דורש מספר שיווקי, רישום מול הספק והסכמה מתועדת.</p>}</div><div className="flex items-center gap-2">{readOnly ? <><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[#E1E4E8] bg-white px-4 text-sm font-extrabold text-[#1A1A3E] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162]">סגירה</button>{onEdit && <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Check className="h-4 w-4 text-[#F2D162]" />עריכת ההגדרה</button>}</> : <><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[#E1E4E8] bg-white px-4 text-sm font-extrabold text-[#1A1A3E] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162]">ביטול</button><button type="submit" disabled={saving || Object.keys(errors).length > 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-4 w-4 text-[#F2D162]" />}שמירת ההגדרה</button></>}</div></footer>
            </form>
          </motion.section>
        </motion.div>
      )}
      <MarketingAiCampaignWizard isOpen={isOpen && aiOpen && !readOnly} onClose={() => setAiOpen(false)} onGenerated={handleAiGenerated} />
    </AnimatePresence>
  );
}
