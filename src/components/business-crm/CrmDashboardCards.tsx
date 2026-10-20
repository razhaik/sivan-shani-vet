import { useMemo, useState } from "react";
import { ArrowLeft, BadgeDollarSign, CalendarDays, Clock3, Megaphone, MessageCircle, PawPrint, ReceiptText, Send, Sparkles, Target, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, EmptyState, UnavailableButton } from "@/components/business-crm/CrmCardPrimitives";
import { CrmDashboardLayoutEditor, type CrmDashboardWidget } from "@/components/business-crm/CrmDashboardLayoutEditor";
import type { CrmWidgetId, CrmWidgetLayout, CrmWidgetSizeMode } from "@/lib/crmDashboardLayout";

export interface CrmClientSummary {
  id: string;
  name: string;
  lastActivityLabel: string;
  appointmentCount: number;
  isNew: boolean;
  petNames: string[];
}

export interface CrmUpcomingSummary {
  id: string;
  clientName: string;
  petName: string;
  appointmentType: string;
  status: string;
  dateKey: string;
  dateLabel: string;
  weekday: string;
  dayNumber: string;
  timeLabel: string;
}

interface CrmDashboardCardsProps {
  clients: CrmClientSummary[];
  upcomingAppointments: CrmUpcomingSummary[];
  search: string;
  leadsCount: number;
  leadPeriod: "year" | "month";
  onLeadPeriodChange: (period: "year" | "month") => void;
  onOpenCalendar: () => void;
  onOpenClients: () => void;
  widgetOrder: CrmWidgetId[];
  widgetLayout: CrmWidgetLayout[];
  isEditing: boolean;
  onOrderChange: (nextOrder: CrmWidgetId[]) => void;
  onLayoutChange: (nextLayout: CrmWidgetLayout[]) => void;
}

const avatarColors = ["bg-[#F8C4B4] text-[#8D342E]", "bg-[#FFD98E] text-[#855517]", "bg-[#B9DCE0] text-[#205C67]", "bg-[#D7C6F2] text-[#54358A]", "bg-[#C6E2B5] text-[#35672C]"];

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`;
  return name.trim().slice(0, 2) || "לק";
}

function QuickActions({ onOpenCalendar, onOpenClients, mode }: { onOpenCalendar: () => void; onOpenClients: () => void; mode: CrmWidgetSizeMode }) {
  const compact = mode === "compact";
  return <Card id="crm-quick-actions" title="תפריט מהיר" icon={Sparkles} mode={mode}>
    <p className="mb-3 text-xs font-medium leading-5 text-slate-500">{compact ? "פעולות מרכזיות במרפאה." : mode === "expanded" ? "גישה מהירה לפעולות שמובילות למערכת התורים הקיימת." : "פעולות יומיומיות שמובילות למערכת התורים הקיימת."}</p>
    <div className="space-y-2">
      <button type="button" onClick={onOpenClients} className="group flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl border border-[#EEF0F3] px-3 text-right text-sm font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F8] text-[#1A1A3E] group-hover:bg-white"><UserPlus className="h-4 w-4" /></span><span className="min-w-0 flex-1 truncate">פתיחת רשימת הלקוחות</span><ArrowLeft className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:-translate-x-0.5" /></button>
      <button type="button" onClick={onOpenCalendar} className="group flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl border border-[#EEF0F3] px-3 text-right text-sm font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] hover:bg-[#FFFBEA] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F8] text-[#1A1A3E] group-hover:bg-white"><CalendarDays className="h-4 w-4" /></span><span className="min-w-0 flex-1 truncate">קביעה חדשה</span><ArrowLeft className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:-translate-x-0.5" /></button>
      {!compact && <UnavailableButton><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F8]"><ReceiptText className="h-4 w-4" /></span><span>חיוב לקוח</span><span className="mr-auto text-[10px] font-bold text-slate-400">בקרוב</span></UnavailableButton>}
    </div>
  </Card>;
}

function CustomersCard({ clients, search, onOpenClients, mode }: { clients: CrmClientSummary[]; search: string; onOpenClients: () => void; mode: CrmWidgetSizeMode }) {
  const limit = mode === "compact" ? 2 : mode === "medium" ? 6 : clients.length;
  return <Card id="crm-customers" title="לקוחות" icon={Users} mode={mode}>
    <div className="mb-3 flex min-w-0 items-start justify-between gap-3"><p className="min-w-0 text-xs font-medium leading-5 text-slate-500">{mode === "compact" ? `${clients.length} לקוחות פעילים` : "לקוחות פעילים שנגזרו מהתורים במערכת."}</p>{mode !== "compact" && <button type="button" onClick={onOpenClients} className="shrink-0 text-[11px] font-extrabold text-[#5267A8] hover:underline focus:outline-none focus:ring-2 focus:ring-[#F2D162]">לכל הלקוחות</button>}</div>
    {clients.length === 0 ? <div className="rounded-xl bg-[#FBFCFD] px-4 py-7 text-center text-sm font-bold text-slate-500">{search ? "לא נמצאו לקוחות תואמים לחיפוש." : "אין עדיין לקוחות פעילים להצגה."}</div> : <div className={cn("space-y-1", mode === "expanded" ? "max-h-[28rem] overflow-y-auto pr-1" : mode === "medium" && "max-h-[20rem] overflow-y-auto pr-1")}>
      {clients.slice(0, limit).map((client, index) => <div key={client.id} className="flex min-w-0 items-center gap-3 rounded-xl px-1 py-2"><span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black", avatarColors[index % avatarColors.length])}>{initials(client.name)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-[#1A1A3E]">{client.name}</p><p className="truncate text-[11px] font-medium text-slate-500">{client.isNew ? "לקוח חדש" : `${client.appointmentCount} ביקורים`} · {client.lastActivityLabel}</p></div>{client.petNames[0] && <PawPrint className="h-4 w-4 shrink-0 text-slate-300" aria-label={`חיית מחמד: ${client.petNames[0]}`} />}</div>)}
    </div>}
  </Card>;
}

function SalesCard({ mode }: { mode: CrmWidgetSizeMode }) {
  return <Card id="crm-sales" title="מכירות" icon={BadgeDollarSign} mode={mode}><p className="mb-3 text-xs font-semibold text-slate-500">{mode === "compact" ? "נתוני תשלומים" : "סך ההכנסות"}</p><EmptyState mode={mode} icon={BadgeDollarSign} title="אין מקור תשלומים מחובר" body="אין במערכת מקור נתונים לתשלומים, לכן לא יוצג כאן סכום משוער." action={<UnavailableButton><BadgeDollarSign className="h-4 w-4" />קבלת תשלומים</UnavailableButton>} /></Card>;
}

function AppointmentsCard({ appointments, search, onOpenCalendar, mode }: { appointments: CrmUpcomingSummary[]; search: string; onOpenCalendar: () => void; mode: CrmWidgetSizeMode }) {
  const allDateTabs = useMemo(() => Array.from(new Map(appointments.map((appointment) => [appointment.dateKey, { key: appointment.dateKey, weekday: appointment.weekday, day: appointment.dayNumber, label: appointment.dateLabel }])).values()), [appointments]);
  const [selectedDate, setSelectedDate] = useState(appointments[0]?.dateKey || "");
  const dateTabs = mode === "expanded" ? allDateTabs : allDateTabs.slice(0, 5);
  const activeDate = dateTabs.some((tab) => tab.key === selectedDate) ? selectedDate : dateTabs[0]?.key || "";
  const currentAppointments = appointments.filter((appointment) => appointment.dateKey === activeDate);
  const visibleAppointments = mode === "expanded" ? currentAppointments : currentAppointments.slice(0, mode === "compact" ? 1 : 4);
  return <Card id="crm-appointments" title="יומן פגישות" icon={CalendarDays} mode={mode}>
    <div className="mb-3 flex min-w-0 items-center justify-between gap-3"><p className="truncate text-xs font-semibold text-slate-500">{mode === "compact" ? "הפגישה הקרובה" : "פגישות עתידיות"}</p>{mode !== "compact" ? <button type="button" onClick={onOpenCalendar} className="shrink-0 text-[11px] font-extrabold text-[#5267A8] hover:underline focus:outline-none focus:ring-2 focus:ring-[#F2D162]">פתיחת היומן</button> : <span className="shrink-0 text-[11px] font-extrabold text-[#5267A8]">לו"ז עתידי</span>}</div>
    {allDateTabs.length === 0 ? <EmptyState mode={mode} icon={CalendarDays} title={search ? "לא נמצאו פגישות תואמות" : "אין פגישות עתידיות"} body={search ? "נסי לחפש בשם אחר או לנקות את שדה החיפוש." : "פגישות חדשות שיוזמנו יופיעו כאן לפי התאריך שלהן."} /> : <>
      {mode !== "compact" && <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="בחירת תאריך">{dateTabs.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={activeDate === tab.key} onClick={() => setSelectedDate(tab.key)} className={cn("min-w-[58px] rounded-2xl border px-2 py-2 text-center transition focus:outline-none focus:ring-2 focus:ring-[#F2D162]", activeDate === tab.key ? "border-[#F2D162] bg-[#F2D162] text-[#1A1A3E]" : "border-[#EEF0F3] bg-white text-slate-500 hover:bg-[#FFFBEA]")}><span className="block text-[10px] font-bold">{tab.weekday}</span><span className="mt-0.5 block text-lg font-black leading-5">{tab.day}</span></button>)}</div>}
      <div className={cn("space-y-2", mode === "expanded" ? "max-h-[34rem] overflow-y-auto pr-1" : mode === "medium" && "max-h-[22rem] overflow-y-auto pr-1")}>{visibleAppointments.map((appointment) => <div key={appointment.id} className="rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] p-3"><div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F8C4B4] text-xs font-black text-[#8D342E]">{initials(appointment.clientName)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="truncate text-sm font-extrabold text-[#1A1A3E]">{appointment.clientName}</p><span className="shrink-0 text-xs font-black text-[#1A1A3E]" dir="ltr">{appointment.timeLabel}</span></div><p className="mt-1 truncate text-xs font-medium text-slate-500">{appointment.appointmentType}{appointment.petName ? ` · ${appointment.petName}` : ""}</p>{mode !== "compact" && <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-slate-400"><Clock3 className="h-3.5 w-3.5" />{appointment.dateLabel} · {appointment.status === "requested" ? "ממתין לאישור" : "מאושר"}</p>}</div></div></div>)}</div>
    </>}
  </Card>;
}

function LeadsCard({ leadsCount, leadPeriod, onLeadPeriodChange, mode }: Pick<CrmDashboardCardsProps, "leadsCount" | "leadPeriod" | "onLeadPeriodChange"> & { mode: CrmWidgetSizeMode }) {
  return <Card id="crm-leads" title="לידים חדשים" icon={UserPlus} mode={mode}><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="text-4xl font-black tracking-tight text-[#1A1A3E]">{leadsCount}</p><p className="mt-2 text-xs font-semibold text-slate-500">פניות יצירת קשר בתקופה הנבחרת</p></div>{mode === "compact" ? <span className="shrink-0 rounded-lg bg-[#F7F8FF] px-2 py-2 text-[10px] font-extrabold text-[#5267A8]">{leadPeriod === "year" ? "השנה" : "החודש"}</span> : <select value={leadPeriod} onChange={(event) => onLeadPeriodChange(event.target.value as "year" | "month")} className="h-9 shrink-0 rounded-lg border border-[#E1E4E8] bg-white px-2 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-[#F2D162]" aria-label="תקופת לידים"><option value="year">השנה</option><option value="month">החודש</option></select>}</div>{mode === "expanded" && <p className="mt-5 rounded-xl bg-[#FBFCFD] px-3 py-3 text-xs font-medium leading-5 text-slate-500">הספירה מבוססת על פניות יצירת קשר שהתקבלו בתקופה שבחרת.</p>}</Card>;
}

function AiChatCard({ mode }: { mode: CrmWidgetSizeMode }) {
  return <Card id="crm-ai-chat" title="שיחות מענה צ'אט AI" icon={MessageCircle} mode={mode}><p className="text-4xl font-black tracking-tight text-[#1A1A3E]" aria-label="אין נתון זמין">—</p><p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{mode === "compact" ? "אין נתוני צ'אט זמינים." : "אין כרגע מקור נתונים לשיחות צ'אט AI במערכת."}</p>{mode === "expanded" && <p className="mt-4 rounded-xl bg-[#FBFCFD] px-3 py-3 text-xs font-medium leading-5 text-slate-500">הנתון יוצג לאחר חיבור מקור שיחות צ'אט למערכת.</p>}</Card>;
}

function MarketingCard({ mode }: { mode: CrmWidgetSizeMode }) {
  return <Card id="crm-marketing" title="ערוצי שיווק פופולריים" icon={Megaphone} mode={mode}><EmptyState mode={mode} icon={Megaphone} title="אין נתוני מקור שיווק" body="פניות קיימות, אך המערכת עדיין לא שומרת את ערוץ ההגעה שלהן." /></Card>;
}

function CampaignsCard({ mode }: { mode: CrmWidgetSizeMode }) {
  return <Card id="crm-campaigns" title="קמפיינים אחרונים" icon={Send} mode={mode}><EmptyState mode={mode} icon={Target} title="אין נתוני קמפיינים זמינים" body="אין חיבור פעיל למערכת קמפיינים, לכן לא יוצגו כאן נתונים מומצאים." action={<UnavailableButton><Send className="h-4 w-4" />יצירת קמפיין חדש</UnavailableButton>} /></Card>;
}

export function CrmDashboardCards({ clients, upcomingAppointments, search, leadsCount, leadPeriod, onLeadPeriodChange, onOpenCalendar, onOpenClients, widgetOrder, widgetLayout, isEditing, onOrderChange, onLayoutChange }: CrmDashboardCardsProps) {
  const widgets: CrmDashboardWidget[] = [
    { id: "quick-actions", label: "תפריט מהיר", render: (mode) => <QuickActions onOpenCalendar={onOpenCalendar} onOpenClients={onOpenClients} mode={mode} /> },
    { id: "customers", label: "לקוחות", render: (mode) => <CustomersCard clients={clients} search={search} onOpenClients={onOpenClients} mode={mode} /> },
    { id: "sales", label: "מכירות", render: (mode) => <SalesCard mode={mode} /> },
    { id: "appointments", label: "יומן פגישות", render: (mode) => <AppointmentsCard appointments={upcomingAppointments} search={search} onOpenCalendar={onOpenCalendar} mode={mode} /> },
    { id: "leads", label: "לידים חדשים", render: (mode) => <LeadsCard leadsCount={leadsCount} leadPeriod={leadPeriod} onLeadPeriodChange={onLeadPeriodChange} mode={mode} /> },
    { id: "ai-chat", label: "שיחות מענה צ'אט AI", render: (mode) => <AiChatCard mode={mode} /> },
    { id: "marketing", label: "ערוצי שיווק פופולריים", render: (mode) => <MarketingCard mode={mode} /> },
    { id: "campaigns", label: "קמפיינים אחרונים", render: (mode) => <CampaignsCard mode={mode} /> },
  ];
  return <div className="space-y-5"><CrmDashboardLayoutEditor widgets={widgets} order={widgetOrder} layout={widgetLayout} isEditing={isEditing} onOrderChange={onOrderChange} onLayoutChange={onLayoutChange} />{search && <p className="text-center text-xs font-semibold text-slate-400">החיפוש מסנן את רשימות הלקוחות והפגישות לפי "{search}"</p>}</div>;
}
