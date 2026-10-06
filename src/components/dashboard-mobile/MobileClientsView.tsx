import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronDown, Filter, Loader2, Mail, MessageSquare, PawPrint, Phone, Send, ShieldCheck, SlidersHorizontal, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Appointment } from "@/entities";
import { cn } from "@/lib/utils";
import type { AggregatedClient, ClientPet, PetSpecies } from "@/lib/clientAggregation";
import BulkSmsComposer, { type BulkSmsResult } from "@/components/dashboard-mobile/BulkSmsComposer";
import ClientDetailsPanel from "@/components/dashboard-mobile/ClientDetailsPanel";
import ClientFilterMenu, { createEmptyClientFilters, type AppointmentCountFilter, type ClientFilters, type FilterColumn, type LastAppointmentFilter, type MultiFilterKey, type TextFilterKey } from "@/components/dashboard-mobile/ClientFilterMenu";

interface MobileClientsViewProps { clients: AggregatedClient[]; isLoading: boolean; onAppointmentsChanged?: () => Promise<void> | void; }
const speciesLabels: Record<PetSpecies, string> = { dog: "כלב", cat: "חתול", other: "אחר", "": "לא ידוע" };
const appointmentLabels: Record<AppointmentCountFilter, string> = { one: "תור אחד", "two-three": "2–3 תורים", "four-plus": "4 תורים ומעלה" };
const lastAppointmentLabels: Record<LastAppointmentFilter, string> = { recent: "30 הימים האחרונים", "this-month": "החודש", older: "לפני יותר מ-30 יום", unknown: "תאריך לא ידוע" };
const customerTypeLabels = { new: "לקוח חדש", returning: "לקוח חוזר" } as const;
const smsLabels = { eligible: "יש הסכמה", unavailable: "אין הסכמה" } as const;
const filterColumns: { column: FilterColumn; label: string }[] = [
  { column: "name", label: "לקוח" }, { column: "contact", label: "קשר" }, { column: "species", label: "חיות" },
  { column: "appointments", label: "תורים" }, { column: "lastAppointment", label: "תור אחרון" }, { column: "customerType", label: "סוג" }, { column: "sms", label: "SMS" },
];

function displaySpecies(pet: ClientPet): string { return speciesLabels[pet.species]; }
function displayDate(value?: string): string { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "")); return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "-"); }
function getLastAppointmentGroups(value?: string): LastAppointmentFilter[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return ["unknown"];
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (Number.isNaN(date.getTime())) return ["unknown"];
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 12);
  const groups: LastAppointmentFilter[] = [date >= cutoff ? "recent" : "older"];
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) groups.push("this-month");
  return groups;
}
function matchesClient(client: AggregatedClient, filters: ClientFilters): boolean {
  const nameQuery = filters.name.trim().toLocaleLowerCase("he");
  const phoneQuery = filters.phone.trim().toLocaleLowerCase("he");
  const emailQuery = filters.email.trim().toLocaleLowerCase("he");
  const matchesName = !nameQuery || client.name.toLocaleLowerCase("he").includes(nameQuery);
  const matchesContact = (!phoneQuery && !emailQuery) || (Boolean(phoneQuery) && client.phone.toLocaleLowerCase("he").includes(phoneQuery)) || (Boolean(emailQuery) && client.email.toLocaleLowerCase("he").includes(emailQuery));
  const matchesSpecies = !filters.species.length || client.pets.some((pet) => filters.species.includes(pet.species));
  const matchesCount = !filters.appointmentCount.length || filters.appointmentCount.some((filter) => filter === "one" ? client.appointmentCount === 1 : filter === "two-three" ? client.appointmentCount >= 2 && client.appointmentCount <= 3 : client.appointmentCount >= 4);
  const lastGroups = getLastAppointmentGroups(client.lastAppointmentDate);
  const matchesLast = !filters.lastAppointment.length || filters.lastAppointment.some((filter) => lastGroups.includes(filter));
  const matchesType = !filters.customerType.length || filters.customerType.includes(client.isNew ? "new" : "returning");
  const matchesSms = !filters.sms.length || filters.sms.includes(client.eligiblePhones.length ? "eligible" : "unavailable");
  return matchesName && matchesContact && matchesSpecies && matchesCount && matchesLast && matchesType && matchesSms;
}
function columnFilterCount(column: FilterColumn, filters: ClientFilters): number {
  if (column === "name") return filters.name.trim() ? 1 : 0;
  if (column === "contact") return Number(Boolean(filters.phone.trim())) + Number(Boolean(filters.email.trim()));
  if (column === "species") return filters.species.length;
  if (column === "appointments") return filters.appointmentCount.length;
  if (column === "lastAppointment") return filters.lastAppointment.length;
  if (column === "customerType") return filters.customerType.length;
  return filters.sms.length;
}

function FilterHeading({ column, label, activeCount, isOpen, onClick, className }: { column: FilterColumn; label: string; activeCount: number; isOpen: boolean; onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void; className?: string }) {
  return <th className={cn("px-3 py-3", className)}><button type="button" onClick={onClick} aria-haspopup="dialog" aria-expanded={isOpen} aria-controls="client-filter-menu" aria-label={`${isOpen ? "סגירת" : "פתיחת"} סינון ${label}`} className={cn("group flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-right transition-colors hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400", isOpen && "bg-orange-50", activeCount > 0 && "text-orange-800")}><span>{label}</span><span className="flex items-center gap-1.5">{activeCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-black text-white">{activeCount}</span>}<Filter className={cn("h-3.5 w-3.5", activeCount > 0 ? "text-orange-600" : "text-slate-400 group-hover:text-orange-500")} /><ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", isOpen && "rotate-180 text-orange-600")} /></span></button></th>;
}
function FilterChip({ column, label, activeCount, isOpen, onClick }: { column: FilterColumn; label: string; activeCount: number; isOpen: boolean; onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void }) {
  return <button type="button" onClick={onClick} aria-haspopup="dialog" aria-expanded={isOpen} aria-controls="client-filter-menu" aria-label={`${isOpen ? "סגירת" : "פתיחת"} סינון ${label}`} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400", activeCount > 0 ? "border-orange-200 bg-orange-50 text-orange-800" : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50", isOpen && "ring-2 ring-orange-200")}><span>{label}</span>{activeCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] text-white">{activeCount}</span>}<Filter className={cn("h-3.5 w-3.5", activeCount > 0 ? "text-orange-600" : "text-slate-400")} /></button>;
}

interface MobileClientCardProps { client: AggregatedClient; index: number; selected: boolean; isExpanded: boolean; savingPetKey: string | null; onSelect: (checked: boolean) => void; onToggleExpand: () => void; onSpeciesChange: (pet: ClientPet, species: PetSpecies) => void; }
function MobileClientCard({ client, index, selected, isExpanded, savingPetKey, onSelect, onToggleExpand, onSpeciesChange }: MobileClientCardProps) {
  const initial = client.name.trim().slice(0, 1) || "ל";
  return <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} layout transition={{ delay: Math.min(index, 8) * 0.03, duration: 0.3 }} className={cn("max-w-full overflow-hidden rounded-3xl border bg-gradient-to-br from-white via-white to-orange-50/60 transition-shadow", isExpanded ? "border-orange-200 shadow-lg shadow-orange-100/70" : "border-slate-100 shadow-sm")}>
    <div className="min-w-0 p-3 sm:p-4">
      <div className="flex min-w-0 items-start gap-2.5">
        <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`בחירת ${client.name}`} className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2" />
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-base font-black text-orange-700">{initial}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 break-words text-base font-black leading-tight text-slate-900">{client.name}</h3><span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black", client.isNew ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{client.isNew ? <UserPlus className="h-3 w-3" /> : <Users className="h-3 w-3" />}{client.isNew ? "לקוח חדש" : "לקוח חוזר"}</span></div>
            {(client.phone || client.email) && <div className="mt-2 min-w-0 space-y-1.5">{client.phone && <a href={`tel:${client.phone}`} dir="ltr" className="flex min-w-0 max-w-full items-center gap-1.5 text-xs font-black text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"><Phone className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-all">{client.phone}</span></a>}{client.email && <a href={`mailto:${client.email}`} dir="ltr" className="flex min-w-0 max-w-full items-start gap-1.5 text-xs font-medium text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"><Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="min-w-0 break-all">{client.email}</span></a>}</div>}
          </div>
        </div>
      </div>
      <div className="mt-3 flex max-w-full flex-wrap gap-1.5">{client.pets.length ? client.pets.map((pet) => <span key={pet.key} className="inline-flex max-w-full items-center gap-1 rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[10px] font-black text-orange-800"><PawPrint className="h-3 w-3 shrink-0" /><span className="break-words">{pet.name} · {displaySpecies(pet)}</span></span>) : <span className="rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500">אין חיות רשומות</span>}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="min-w-0 rounded-2xl bg-white/80 p-2.5 ring-1 ring-slate-100"><p className="text-[10px] font-bold text-slate-400">תורים פעילים</p><p className="mt-1 text-base font-black text-slate-900">{client.appointmentCount}</p></div>
        <div className="min-w-0 rounded-2xl bg-white/80 p-2.5 ring-1 ring-slate-100"><p className="text-[10px] font-bold text-slate-400">תור אחרון</p><p className="mt-1 break-words text-sm font-black text-slate-700">{displayDate(client.lastAppointmentDate)}</p></div>
        <div className="col-span-2 min-w-0 rounded-2xl bg-white/80 p-2.5 ring-1 ring-slate-100 sm:col-span-1"><p className="flex items-center gap-1 text-[10px] font-bold text-slate-400"><ShieldCheck className="h-3.5 w-3.5" />זכאות SMS</p><p className={cn("mt-1 break-words text-xs font-black", client.eligiblePhones.length ? "text-emerald-700" : "text-slate-500")}>{client.eligiblePhones.length ? `${client.eligiblePhones.length} מספרים עם הסכמה` : "אין הסכמה מפורשת"}</p></div>
      </div>
      <button type="button" onClick={onToggleExpand} aria-expanded={isExpanded} aria-label={`${isExpanded ? "סגירת" : "פתיחת"} פרטי ${client.name}`} className="mt-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border border-orange-100 bg-white/80 px-3 text-xs font-black text-orange-800 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"><span>{isExpanded ? "הסתרת פרטים" : "היסטוריית תורים וסוגי חיות"}</span><ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} /></button>
    </div>
    <AnimatePresence initial={false}>{isExpanded && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-orange-100"><ClientDetailsPanel client={client} savingPetKey={savingPetKey} onSpeciesChange={onSpeciesChange} /></motion.div>}</AnimatePresence>
  </motion.article>;
}

export default function MobileClientsView({ clients, isLoading, onAppointmentsChanged }: MobileClientsViewProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<ClientFilters>(createEmptyClientFilters);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [openFilter, setOpenFilter] = useState<FilterColumn | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 100, left: 12, maxHeight: 520 });
  const [composerOpen, setComposerOpen] = useState(false);
  const [savingPetKey, setSavingPetKey] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkSmsResult | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const desktopSelectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const mobileSelectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const clientNames = useMemo(() => Array.from(new Set(clients.map((client) => client.name).filter(Boolean))).sort((a, b) => a.localeCompare(b, "he")), [clients]);
  const filteredClients = useMemo(() => clients.filter((client) => matchesClient(client, filters)), [clients, filters]);
  const selectedVisibleClients = useMemo(() => filteredClients.filter((client) => selectedKeys.has(client.key)), [filteredClients, selectedKeys]);
  const hiddenSelectedCount = Math.max(0, selectedKeys.size - selectedVisibleClients.length);
  const allVisibleSelected = filteredClients.length > 0 && filteredClients.every((client) => selectedKeys.has(client.key));
  const activeFilterSummary = useMemo(() => {
    const summary: string[] = [];
    if (filters.name.trim()) summary.push(`שם: ${filters.name.trim()}`);
    if (filters.phone.trim()) summary.push(`טלפון: ${filters.phone.trim()}`);
    if (filters.email.trim()) summary.push(`אימייל: ${filters.email.trim()}`);
    if (filters.species.length) summary.push(`חיות: ${filters.species.map((value) => speciesLabels[value]).join(" או ")}`);
    if (filters.appointmentCount.length) summary.push(`תורים: ${filters.appointmentCount.map((value) => appointmentLabels[value]).join(" או ")}`);
    if (filters.lastAppointment.length) summary.push(`תור אחרון: ${filters.lastAppointment.map((value) => lastAppointmentLabels[value]).join(" או ")}`);
    if (filters.customerType.length) summary.push(`סוג לקוח: ${filters.customerType.map((value) => customerTypeLabels[value]).join(" או ")}`);
    if (filters.sms.length) summary.push(`SMS: ${filters.sms.map((value) => smsLabels[value]).join(" או ")}`);
    return summary;
  }, [filters]);
  const hasActiveFilters = activeFilterSummary.length > 0;

  useEffect(() => {
    const currentKeys = new Set(clients.map((client) => client.key));
    setSelectedKeys((previous) => new Set([...previous].filter((key) => currentKeys.has(key))));
    if (expandedKey && !currentKeys.has(expandedKey)) setExpandedKey(null);
  }, [clients, expandedKey]);
  useEffect(() => {
    const indeterminate = selectedVisibleClients.length > 0 && !allVisibleSelected;
    [desktopSelectAllCheckboxRef, mobileSelectAllCheckboxRef].forEach((ref) => { if (ref.current) ref.current.indeterminate = indeterminate; });
  }, [allVisibleSelected, selectedVisibleClients.length]);
  useEffect(() => {
    if (!openFilter) return;
    const closeOnOutsideClick = (event: PointerEvent) => { if (!filterMenuRef.current?.contains(event.target as Node)) setOpenFilter(null); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenFilter(null); };
    document.addEventListener("pointerdown", closeOnOutsideClick); document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutsideClick); document.removeEventListener("keydown", closeOnEscape); };
  }, [openFilter]);

  const openColumnFilter = (column: FilterColumn, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (openFilter === column) { setOpenFilter(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    const maxHeight = Math.min(520, Math.max(180, window.innerHeight - 24));
    const top = Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - maxHeight - 12));
    setMenuPosition({ top, left, maxHeight }); setOpenFilter(column);
  };
  const updateTextFilter = (key: TextFilterKey, value: string) => setFilters((previous) => ({ ...previous, [key]: value } as ClientFilters));
  const toggleMultiFilter = (key: MultiFilterKey, value: string) => setFilters((previous) => { const values = previous[key] as string[]; return { ...previous, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] } as ClientFilters; });
  const resetColumnFilter = (column: FilterColumn) => setFilters((previous) => { const next = { ...previous }; if (column === "name") next.name = ""; if (column === "contact") { next.phone = ""; next.email = ""; } if (column === "species") next.species = []; if (column === "appointments") next.appointmentCount = []; if (column === "lastAppointment") next.lastAppointment = []; if (column === "customerType") next.customerType = []; if (column === "sms") next.sms = []; return next; });
  const clearAllFilters = () => { setFilters(createEmptyClientFilters()); setOpenFilter(null); };
  const toggleSelected = (key: string, checked: boolean) => setSelectedKeys((previous) => { const next = new Set(previous); if (checked) next.add(key); else next.delete(key); return next; });
  const toggleVisible = (checked: boolean) => setSelectedKeys((previous) => { const next = new Set(previous); filteredClients.forEach((client) => checked ? next.add(client.key) : next.delete(client.key)); return next; });
  const handleSpeciesChange = async (client: AggregatedClient, pet: ClientPet, species: PetSpecies) => {
    const appointmentIds = pet.appointmentIds.filter(Boolean); if (!appointmentIds.length) return;
    const petKey = `${client.key}:${pet.key}`; setSavingPetKey(petKey);
    try {
      const results = await Promise.allSettled(appointmentIds.map((id) => Appointment.update(id, { pet_species: species })));
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed) toast({ variant: "destructive", title: "הסוג עודכן חלקית", description: `${appointmentIds.length - failed} תורים עודכנו, ${failed} לא עודכנו. נסי שוב עבור הרשומות החסרות.` });
      else toast({ title: "סוג חיית המחמד עודכן", description: `${pet.name} מסומנת עכשיו כ${displaySpecies({ ...pet, species })}.` });
      await onAppointmentsChanged?.();
    } catch (error) { console.error("Failed to update pet species:", error); toast({ variant: "destructive", title: "לא הצלחנו לעדכן את הסוג", description: "אפשר לנסות שוב בעוד רגע." }); }
    finally { setSavingPetKey(null); }
  };
  const handleBulkSuccess = (result: BulkSmsResult) => { setBulkResult(result); setSelectedKeys(new Set()); setComposerOpen(false); };

  return <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden" dir="rtl">
    <section className="rounded-3xl border border-slate-100 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-2.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><SlidersHorizontal className="h-4 w-4" /></div><div className="min-w-0"><p className="text-sm font-black text-slate-800" aria-live="polite">{filteredClients.length} מתוך {clients.length} לקוחות</p><p className="mt-0.5 text-xs font-medium text-slate-400 lg:hidden">סנני לפי שדה ובחרי לקוחות לשליחת SMS.</p><p className="mt-0.5 hidden text-xs font-medium text-slate-400 lg:block">לחצי על כותרת עמודה כדי לפתוח סינון ממוקד.</p></div></div><Button type="button" variant="outline" onClick={clearAllFilters} disabled={!hasActiveFilters} className="h-10 w-full shrink-0 rounded-xl border-slate-200 px-3 text-xs font-black text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">ניקוי כל הסינונים</Button></div>
      <div className="mt-4 border-t border-slate-100 pt-3 lg:hidden"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-[11px] font-black uppercase tracking-wide text-slate-400">סינון מהיר</p>{hasActiveFilters && <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-700">{activeFilterSummary.length} פעילים</span>}</div><div className="flex max-w-full flex-wrap gap-2">{filterColumns.map(({ column, label }) => <FilterChip key={column} column={column} label={label} activeCount={columnFilterCount(column, filters)} isOpen={openFilter === column} onClick={(event) => openColumnFilter(column, event)} />)}</div></div>
      {activeFilterSummary.length > 0 && <div className="mt-3 flex max-w-full flex-wrap gap-2 border-t border-slate-100 pt-3">{activeFilterSummary.map((label) => <span key={label} className="max-w-full break-words rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-800">{label}</span>)}</div>}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 lg:hidden"><label className="flex min-w-0 cursor-pointer items-center gap-2 text-xs font-black text-slate-700"><input ref={mobileSelectAllCheckboxRef} type="checkbox" checked={allVisibleSelected} disabled={!filteredClients.length} onChange={(event) => toggleVisible(event.target.checked)} aria-label="בחירת כל הלקוחות המוצגים" title="בחירת הלקוחות המוצגים" className="h-5 w-5 shrink-0 cursor-pointer accent-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" /><span>בחירת כל הלקוחות המוצגים</span></label><span className="shrink-0 text-[11px] font-bold text-slate-400">{filteredClients.length} מוצגים</span></div>
      {selectedKeys.size > 0 && <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between" aria-live="polite"><div className="min-w-0"><p className="text-xs font-black text-slate-600">{selectedKeys.size} לקוחות נבחרו{hiddenSelectedCount > 0 && <span className="text-slate-400"> · {selectedVisibleClients.length} מוצגים עכשיו</span>}</p>{hiddenSelectedCount > 0 && <p className="mt-1 max-w-2xl break-words text-[11px] font-bold leading-relaxed text-slate-500">{hiddenSelectedCount} בחירות מוסתרות בגלל הסינון הנוכחי. הן נשארות מסומנות, אך לא ייכללו בשליחה עד שיוצגו שוב.</p>}</div>{selectedVisibleClients.length > 0 && <Button type="button" onClick={() => setComposerOpen(true)} className="h-10 w-full shrink-0 rounded-xl bg-orange-600 px-3 text-xs font-black text-white hover:bg-orange-700 sm:w-auto"><Send className="ml-1.5 h-3.5 w-3.5" />שליחת SMS מרוכז ({selectedVisibleClients.length})</Button>}</div>}
    </section>
    {bulkResult && <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold leading-relaxed text-emerald-800"><MessageSquare className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">השליחה הסתיימה: {bulkResult.sent} נשלחו, {bulkResult.skipped} דולגו, {bulkResult.failed} נכשלו.</span></div>}
    {composerOpen && selectedVisibleClients.length > 0 && <BulkSmsComposer selectedClients={selectedVisibleClients} onClose={() => setComposerOpen(false)} onSuccess={handleBulkSuccess} />}
    {isLoading ? <div className="flex justify-center rounded-3xl border border-slate-100 bg-white py-16"><Loader2 className="h-7 w-7 animate-spin text-orange-600" /></div> : filteredClients.length === 0 ? <div className="rounded-3xl border-2 border-dashed border-orange-100 bg-white px-4 py-16 text-center"><Users className="mx-auto mb-3 h-10 w-10 text-orange-200" /><p className="font-black text-slate-700">לא נמצאו לקוחות לפי הסינון הנוכחי</p><p className="mt-1 text-sm font-medium text-slate-400">נסי לנקות את הסינון או לבחור אפשרויות אחרות.</p></div> : <>
      <div className="space-y-3 lg:hidden">{filteredClients.map((client, index) => <MobileClientCard key={client.key} client={client} index={index} selected={selectedKeys.has(client.key)} isExpanded={expandedKey === client.key} savingPetKey={savingPetKey} onSelect={(checked) => toggleSelected(client.key, checked)} onToggleExpand={() => setExpandedKey(expandedKey === client.key ? null : client.key)} onSpeciesChange={(pet, species) => handleSpeciesChange(client, pet, species)} />)}</div>
      <div className="hidden overflow-x-auto rounded-3xl border border-slate-100 bg-white shadow-sm lg:block"><table aria-label="טבלת לקוחות" className="w-full min-w-[1260px] border-collapse text-right"><thead className="bg-slate-50/95"><tr className="border-b border-slate-100 text-[11px] font-black text-slate-500"><th className="w-12 px-4 py-4 text-right"><input ref={desktopSelectAllCheckboxRef} type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleVisible(event.target.checked)} aria-label="בחירת כל הלקוחות המוצגים" title="בחירת הלקוחות המוצגים" className="h-4 w-4 cursor-pointer accent-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2" /></th><FilterHeading column="name" label="לקוח" activeCount={columnFilterCount("name", filters)} isOpen={openFilter === "name"} onClick={(event) => openColumnFilter("name", event)} className="w-[220px]" /><FilterHeading column="contact" label="פרטי קשר" activeCount={columnFilterCount("contact", filters)} isOpen={openFilter === "contact"} onClick={(event) => openColumnFilter("contact", event)} className="w-[235px]" /><FilterHeading column="species" label="חיות מחמד וסוג" activeCount={columnFilterCount("species", filters)} isOpen={openFilter === "species"} onClick={(event) => openColumnFilter("species", event)} className="w-[265px]" /><FilterHeading column="appointments" label="תורים" activeCount={columnFilterCount("appointments", filters)} isOpen={openFilter === "appointments"} onClick={(event) => openColumnFilter("appointments", event)} className="w-[145px]" /><FilterHeading column="lastAppointment" label="תור אחרון" activeCount={columnFilterCount("lastAppointment", filters)} isOpen={openFilter === "lastAppointment"} onClick={(event) => openColumnFilter("lastAppointment", event)} className="w-[175px]" /><FilterHeading column="customerType" label="סוג לקוח" activeCount={columnFilterCount("customerType", filters)} isOpen={openFilter === "customerType"} onClick={(event) => openColumnFilter("customerType", event)} className="w-[155px]" /><FilterHeading column="sms" label="SMS" activeCount={columnFilterCount("sms", filters)} isOpen={openFilter === "sms"} onClick={(event) => openColumnFilter("sms", event)} className="w-[135px]" /><th className="w-12 px-3 py-4"><span className="sr-only">פרטים</span></th></tr></thead><tbody>{filteredClients.map((client) => { const isExpanded = expandedKey === client.key; return <Fragment key={client.key}><tr className={cn("border-b border-slate-100 align-top transition-colors", isExpanded ? "bg-orange-50/35" : "hover:bg-slate-50/80")}><td className="px-4 py-4"><input type="checkbox" checked={selectedKeys.has(client.key)} onChange={(event) => toggleSelected(client.key, event.target.checked)} aria-label={`בחירת ${client.name}`} className="h-4 w-4 accent-orange-600" /></td><td className="px-3 py-4"><div className="flex min-w-[180px] items-start gap-2"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-sm font-black text-orange-700">{client.name.slice(0, 1)}</div><p className="pt-1 font-black text-slate-900">{client.name}</p></div></td><td className="px-3 py-4"><div className="min-w-[190px] space-y-1.5">{client.phone ? <a href={`tel:${client.phone}`} dir="ltr" className="flex items-center justify-end gap-1.5 text-xs font-black text-orange-700"><Phone className="h-3.5 w-3.5" />{client.phone}</a> : <span className="block text-xs font-bold text-slate-400">אין טלפון</span>}{client.email ? <a href={`mailto:${client.email}`} dir="ltr" className="flex items-center justify-end gap-1.5 break-all text-xs font-medium text-slate-500"><Mail className="h-3.5 w-3.5 shrink-0" />{client.email}</a> : <span className="block text-xs font-bold text-slate-400">אין אימייל</span>}</div></td><td className="px-3 py-4"><div className="flex min-w-[220px] flex-wrap gap-1.5">{client.pets.map((pet) => <span key={pet.key} className="inline-flex items-center gap-1 rounded-full border border-orange-100 bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-800"><PawPrint className="h-3 w-3" />{pet.name} · {displaySpecies(pet)}</span>)}</div></td><td className="px-3 py-4"><span className="whitespace-nowrap text-sm font-black text-slate-800">{client.appointmentCount}</span><span className="mr-1 text-xs font-bold text-slate-400">{client.appointmentCount === 1 ? "תור" : "תורים"}</span></td><td className="whitespace-nowrap px-3 py-4 text-xs font-bold text-slate-500">{displayDate(client.lastAppointmentDate)}</td><td className="px-3 py-4"><span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black", client.isNew ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{client.isNew ? <UserPlus className="h-3 w-3" /> : <Users className="h-3 w-3" />}{client.isNew ? "לקוח חדש" : "לקוח חוזר"}</span></td><td className="px-3 py-4">{client.eligiblePhones.length ? <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">{client.eligiblePhones.length} זכאים</span> : <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">לא זכאי</span>}</td><td className="px-3 py-4"><button type="button" onClick={() => setExpandedKey(isExpanded ? null : client.key)} aria-expanded={isExpanded} aria-label={`${isExpanded ? "סגירת" : "פתיחת"} פרטי ${client.name}`} className="rounded-xl p-2 text-slate-400 transition hover:bg-orange-100 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"><ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} /></button></td></tr>{isExpanded && <tr><td colSpan={9} className="p-0"><ClientDetailsPanel client={client} savingPetKey={savingPetKey} onSpeciesChange={(pet, species) => handleSpeciesChange(client, pet, species)} /></td></tr>}</Fragment>; })}</tbody></table></div>
    </>}
    {openFilter && <ClientFilterMenu column={openFilter} filters={filters} clientNames={clientNames} menuRef={filterMenuRef} position={menuPosition} onClose={() => setOpenFilter(null)} onTextChange={updateTextFilter} onToggle={toggleMultiFilter} onReset={() => resetColumnFilter(openFilter)} />}
    <p className="px-1 text-center text-[11px] font-medium leading-relaxed text-slate-400">הנתונים מוצגים מתוך תורים שנשמרו במערכת. תורים שבוטלו אינם נספרים בהגדרת לקוח חדש.</p>
  </div>;
}
