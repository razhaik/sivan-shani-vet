import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Mail, MessageSquare, RefreshCw, Search, Send, ShieldCheck, UsersRound } from "lucide-react";

export type MarketingSendChannel = "email" | "sms";
export type MarketingCampaignType = "automatic" | "broadcast";
export type MarketingSendStatus = "completed" | "partial" | "failed";
export type SentDateRange = "all" | "7" | "30" | "90";

export interface MarketingSendRecord {
  id: string;
  campaign_name?: string;
  campaign_type?: MarketingCampaignType;
  source_id?: string;
  channel?: MarketingSendChannel;
  email_subject?: string;
  message_preview?: string;
  audience_label?: string;
  sent_at?: string;
  status?: MarketingSendStatus;
  recipient_count?: number;
  delivered_count?: number;
  failed_count?: number;
  skipped_count?: number;
  opened_count?: number;
  clicked_count?: number;
}

export interface MarketingRecipientRecord {
  id: string;
  send_log_id: string;
  recipient_label?: string;
  destination_masked?: string;
  channel?: MarketingSendChannel;
  status?: string;
  sent_at?: string;
  delivered_at?: string;
  failure_reason?: string;
}

export function channelLabel(channel?: MarketingSendChannel) { return channel === "email" ? "אימייל" : channel === "sms" ? "SMS" : "לא זמין"; }
export function campaignTypeLabel(type?: MarketingCampaignType) { return type === "automatic" ? "אוטומטי" : type === "broadcast" ? "חד-פעמי" : "לא זמין"; }
export function statusLabel(status?: MarketingSendStatus) { return status === "completed" ? "הושלם" : status === "partial" ? "חלקי" : status === "failed" ? "נכשל" : "לא זמין"; }
export function formatMarketingDate(value?: string) { if (!value) return "לא זמין"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "לא זמין" : new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(date); }
export function displayMarketingNumber(value?: number) { return value === undefined ? "לא זמין" : new Intl.NumberFormat("he-IL").format(value); }

function statusTone(status?: MarketingSendStatus) { return status === "completed" ? "bg-[#EAF8F2] text-[#237354]" : status === "partial" ? "bg-[#FFF7D6] text-[#8B6B00]" : status === "failed" ? "bg-[#FFF0EE] text-[#B33A3A]" : "bg-[#F3F4F6] text-slate-500"; }
function filteredByDate(value: string | undefined, range: SentDateRange) { if (range === "all") return true; if (!value) return false; const timestamp = new Date(value).getTime(); if (Number.isNaN(timestamp)) return false; const now = Date.now(); return timestamp <= now && timestamp >= now - Number(range) * 24 * 60 * 60 * 1000; }

function SendCard({ record, onOpen }: { record: MarketingSendRecord; onOpen: () => void }) {
  const isEmail = record.channel === "email";
  const counts = [["נמענים", record.recipient_count], ["אושרו", record.delivered_count], ["דולגו", record.skipped_count], ["נכשלו", record.failed_count]] as const;
  return <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-[#DDE2EB] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isEmail ? "bg-[#EAF0FF] text-[#5267A8]" : record.channel === "sms" ? "bg-[#EAF8F2] text-[#237354]" : "bg-[#F3F4F6] text-slate-500"}`}>{isEmail ? <Mail className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}</div><div className="min-w-0"><h3 className="break-words text-base font-black text-[#1A1A3E]">{record.campaign_name || "לא זמין"}</h3><div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500"><span>{campaignTypeLabel(record.campaign_type)}</span><span aria-hidden="true">·</span><span>{channelLabel(record.channel)}</span><span aria-hidden="true">·</span><span>{formatMarketingDate(record.sent_at)}</span></div></div></div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone(record.status)}`}><span className="h-2 w-2 rounded-full bg-current" />{statusLabel(record.status)}</span></div><div className="mt-5 grid gap-3 rounded-xl bg-[#FAFBFC] p-3 text-xs font-semibold text-slate-600 sm:grid-cols-2"><p className="min-w-0 break-words"><span className="font-black text-[#1A1A3E]">קהל:</span> {record.audience_label || "לא זמין"}</p><p className="min-w-0 break-words"><span className="font-black text-[#1A1A3E]">נושא:</span> {record.email_subject || "לא זמין"}</p></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{counts.map(([label, value]) => <div key={label} className="rounded-xl border border-[#EEF0F2] bg-white px-3 py-2"><p className="text-[11px] font-bold text-slate-500">{label}</p><p className="mt-1 text-sm font-black text-[#1A1A3E]">{displayMarketingNumber(value)}</p></div>)}</div><button type="button" onClick={onOpen} aria-label={`צפייה בפרטי השליחה ${record.campaign_name || "לא זמין"}`} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#E1E4E8] px-3 text-xs font-extrabold text-[#1A1A3E] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Send className="h-3.5 w-3.5" />צפייה בפרטים</button></motion.article>;
}

function LoadingState() { return <div className="grid gap-4 xl:grid-cols-2" aria-label="טוען את יומן השליחות">{[1, 2].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />)}</div>; }

interface Props {
  records: MarketingSendRecord[];
  isLoading: boolean;
  isFetching: boolean;
  recipientError: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void | Promise<void>;
  onOpenDetails: (record: MarketingSendRecord) => void;
}

export function MarketingSentScreen({ records, isLoading, isFetching, recipientError, search, onSearchChange, onRefresh, onOpenDetails }: Props) {
  const [filters, setFilters] = useState<{ channel: "all" | MarketingSendChannel; status: "all" | MarketingSendStatus; dateRange: SentDateRange }>({ channel: "all", status: "all", dateRange: "all" });
  const normalizedSearch = search.trim().toLocaleLowerCase("he");
  const visibleRecords = useMemo(() => records.filter((record) => {
    const searchable = [record.campaign_name, campaignTypeLabel(record.campaign_type), record.source_id, channelLabel(record.channel), record.email_subject, record.message_preview, record.audience_label, statusLabel(record.status)].filter(Boolean).join(" ").toLocaleLowerCase("he");
    return (!normalizedSearch || searchable.includes(normalizedSearch)) && (filters.channel === "all" || record.channel === filters.channel) && (filters.status === "all" || record.status === filters.status) && filteredByDate(record.sent_at, filters.dateRange);
  }), [filters, normalizedSearch, records]);
  const hasFilters = Boolean(normalizedSearch || filters.channel !== "all" || filters.status !== "all" || filters.dateRange !== "all");
  const clearFilters = () => { onSearchChange(""); setFilters({ channel: "all", status: "all", dateRange: "all" }); };
  return <div dir="rtl" className="space-y-7"><section className="overflow-hidden rounded-[26px] border border-[#E4E7EC] bg-white shadow-sm"><div className="relative p-5 sm:p-7"><div className="pointer-events-none absolute -left-12 -top-16 h-48 w-48 rounded-full bg-[#FFF4C7]/70 blur-3xl" /><div className="relative flex flex-wrap items-start justify-between gap-5"><div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full bg-[#EAF0FF] px-3 py-1.5 text-xs font-black text-[#5267A8]"><ShieldCheck className="h-3.5 w-3.5" />שליחות מתועדות בלבד</span><h2 className="mt-4 text-2xl font-black tracking-tight text-[#1A1A3E]">יומן אחד לכל שליחה אמיתית</h2><p className="mt-2 text-sm font-medium leading-7 text-slate-500">כאן יופיעו אימיילים ו-SMS שנשלחו בפועל ונרשמו ממקור שליחה מחובר. טיוטה מוכנה או קמפיין מופעל אינם נחשבים לשליחה, ולכן לא יופיעו ביומן בלי אירוע שליחה אמיתי.</p></div><button type="button" onClick={() => void onRefresh()} disabled={isFetching} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#DDE2EB] bg-white px-4 text-xs font-extrabold text-[#1A1A3E] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />רענון היומן</button></div></div><div className="grid gap-3 border-t border-[#EEF0F2] bg-[#FCFCFD] p-4 text-xs font-semibold leading-5 text-slate-500 sm:grid-cols-3"><div className="flex items-start gap-2"><Send className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" /><span>השליחה עצמה נרשמת בנפרד מהטיוטה או מהגדרת הקמפיין.</span></div><div className="flex items-start gap-2"><UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" /><span>פרטי נמענים יוצגו רק אם נשמרו רשומות סטטוס אמיתיות.</span></div><div className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" /><span>שדות חסרים מסומנים כ"לא זמין", בלי השלמות או חישובים.</span></div></div></section>{recipientError && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-[#F0D995] bg-[#FFF9E8] px-4 py-3 text-sm font-bold leading-6 text-[#6C5500]"><MessageSquare className="mt-1 h-4 w-4 shrink-0" /><span>יומן השליחות נטען, אבל פרטי סטטוסי הנמענים לא נטענו כרגע. אפשר לרענן ולנסות שוב.</span></div>}<section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black tracking-wide text-[#5267A8]">היסטוריית שליחה</p><h2 className="mt-1 text-xl font-black text-[#1A1A3E]">קמפיינים והודעות שנשלחו</h2><p className="mt-1 text-sm font-medium text-slate-500" aria-live="polite">{visibleRecords.length} מתוך {records.length} רשומות אמיתיות</p></div><label className="relative w-full sm:max-w-sm"><span className="sr-only">חיפוש ביומן השליחות</span><Search className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="חיפוש לפי שם, קהל, נושא או ערוץ" aria-label="חיפוש ביומן השליחות" className="h-10 w-full rounded-xl border border-[#D9DEE5] bg-white pr-9 pl-3 text-sm font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#5267A8] focus:ring-2 focus:ring-[#F2D162]" /></label></div><div className="grid gap-3 rounded-2xl border border-[#E4E7EC] bg-white p-4 shadow-sm sm:grid-cols-3"><label className="block text-xs font-extrabold text-[#1A1A3E]">ערוץ<select value={filters.channel} onChange={(event) => setFilters((current) => ({ ...current, channel: event.target.value as typeof current.channel }))} className="mt-2 h-10 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none focus:border-[#5267A8] focus:ring-2 focus:ring-[#F2D162]"><option value="all">כל הערוצים</option><option value="email">אימייל</option><option value="sms">SMS</option></select></label><label className="block text-xs font-extrabold text-[#1A1A3E]">סטטוס<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as typeof current.status }))} className="mt-2 h-10 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none focus:border-[#5267A8] focus:ring-2 focus:ring-[#F2D162]"><option value="all">כל הסטטוסים</option><option value="completed">הושלם</option><option value="partial">חלקי</option><option value="failed">נכשל</option></select></label><label className="block text-xs font-extrabold text-[#1A1A3E]">טווח תאריכים<select value={filters.dateRange} onChange={(event) => setFilters((current) => ({ ...current, dateRange: event.target.value as typeof current.dateRange }))} className="mt-2 h-10 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none focus:border-[#5267A8] focus:ring-2 focus:ring-[#F2D162]"><option value="all">כל התאריכים</option><option value="7">7 הימים האחרונים</option><option value="30">30 הימים האחרונים</option><option value="90">90 הימים האחרונים</option></select></label></div>{hasFilters && <div className="flex justify-start"><button type="button" onClick={clearFilters} className="text-xs font-extrabold text-[#5267A8] underline-offset-4 transition hover:underline focus:outline-none focus:ring-2 focus:ring-[#F2D162]">ניקוי החיפוש והסינון</button></div>}{isLoading ? <LoadingState /> : visibleRecords.length === 0 ? <div className="rounded-2xl border border-dashed border-[#DDE2EB] bg-white px-6 py-14 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF0FF] text-[#5267A8]"><Send className="h-6 w-6" /></div><h3 className="mt-4 text-base font-black text-[#1A1A3E]">{records.length === 0 ? "אין עדיין שליחות מתועדות" : "לא נמצאו שליחות תואמות"}</h3><p className="mx-auto mt-2 max-w-lg text-sm font-medium leading-7 text-slate-500">{records.length === 0 ? "היומן יתמלא רק לאחר שמקור שליחה אמיתי ישמור רשומת מסירה. טיוטות, הגדרות מופעלות ונתוני דוגמה לא יופיעו כאן." : "נסו לשנות את החיפוש או את הסינון. הרשומות נשארות ללא שינוי."}</p>{records.length > 0 && <button type="button" onClick={clearFilters} className="mt-5 inline-flex min-h-10 items-center rounded-xl bg-[#1A1A3E] px-4 text-xs font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">ניקוי הסינון</button>}</div> : <div className="grid gap-4 xl:grid-cols-2">{visibleRecords.map((record) => <SendCard key={record.id} record={record} onOpen={() => onOpenDetails(record)} />)}</div>}</section></div>;
}
