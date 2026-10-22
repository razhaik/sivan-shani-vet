import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Cat,
  ChevronDown,
  Dog,
  Mail,
  MessageCircle,
  PawPrint,
  Phone,
  UserRound,
  Users,
} from "lucide-react";
import { isValidClientPhone, normalizeClientPhone } from "@/lib/clientAggregation";
import { formatDateTime, speciesLabel, statusLabel, type ClientRow } from "@/lib/crmClientData";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";
import { initials as bentoInitials } from "@/components/business-crm/bento-ui";

export type ClientColumnKey = "client" | "lastActivity" | "email" | "phone" | "status" | "tags" | "team" | "pets" | "appointments" | "lastAppointment";
export type ClientSortKey = "name" | "lastActivity" | "appointments";
export const clientColumns: Array<{ key: ClientColumnKey; label: string; required?: boolean }> = [
  { key: "client", label: "לקוח", required: true }, { key: "lastActivity", label: "פעילות אחרונה" }, { key: "email", label: "אימייל" },
  { key: "phone", label: "טלפון ראשי" }, { key: "status", label: "סטטוס איש קשר" }, { key: "tags", label: "תגיות" }, { key: "team", label: "איש הצוות" },
  { key: "pets", label: "חיות מחמד" }, { key: "appointments", label: "מספר תורים" }, { key: "lastAppointment", label: "תור אחרון" },
];

interface ClientsTableProps {
  rows: ClientRow[];
  mobileRows?: ClientRow[];
  columns: ClientColumnKey[];
  selectedIds: Set<string>;
  loading?: boolean;
  sortKey: ClientSortKey;
  sortDirection: "asc" | "desc";
  mobileSelectionMode?: boolean;
  mobileNewRequestIds?: Set<string>;
  mobileEmptyTitle?: string;
  mobileEmptyBody?: string;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onSort: (key: ClientSortKey) => void;
  onRefresh: () => void;
  onOpenClient: (id: string) => void;
  emptyTitle: string;
  emptyBody: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.trim().slice(0, 2) || "לק";
}

function display(value: string) { return value || "לא צוין"; }
function primaryPhone(row: ClientRow) { return row.mobilePhone || row.phone || row.homePhone; }

function Tags({ row }: { row: ClientRow }) {
  const tags = Array.from(new Set([
    ...row.pets.map((pet) => speciesLabel(pet.species)),
    ...(row.status === "new" ? ["חדש"] : []),
    ...(row.isImported ? ["מיובא"] : []),
  ]));
  return tags.length ? <div className="flex flex-wrap gap-1.5">{tags.map((tag) => <span key={tag} className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${tag === "מיובא" ? "bg-[#E8F0FF] text-[#315A94]" : "bg-[#F2D162]/25 text-[#69550C]"}`}>{tag}</span>)}</div> : <span className="text-xs text-slate-400">לא צוין</span>;
}

function SortButton({ label, active, direction, onClick }: { label: string; active: boolean; direction: "asc" | "desc"; onClick: () => void }) {
  const Icon = active && direction === "asc" ? ArrowUp : ArrowDown;
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-lg px-1 py-1 text-right font-extrabold transition hover:bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">{label}<Icon className={`h-3.5 w-3.5 ${active ? "text-[#5267A8]" : "text-slate-300"}`} aria-hidden="true" /></button>;
}

function StatusBadge({ row }: { row: ClientRow }) {
  const tone = row.status === "active" ? "bg-[#E8F2EA] text-[#2C6A3B]" : row.status === "new" ? "bg-[#FFF4CF] text-[#69550C]" : row.status === "imported" ? "bg-[#E8F0FF] text-[#315A94]" : "bg-[#EEEAFE] text-[#5744A4]";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${tone}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{statusLabel(row.status)}</span>;
}

function Cell({ column, row, onOpenClient }: { column: ClientColumnKey; row: ClientRow; onOpenClient: (id: string) => void }) {
  if (column === "client") return <button type="button" onClick={() => onOpenClient(row.id)} className="group flex min-w-[170px] items-center gap-3 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1A1A3E] text-[10px] font-black text-[#F2D162]">{initials(row.name)}</span><span className="min-w-0"><span className="block truncate text-sm font-extrabold text-[#1A1A3E] group-hover:text-[#5267A8] group-hover:underline">{row.name}</span><span className="mt-0.5 block text-[10px] font-semibold text-slate-400">{row.status === "lead" ? "פנייה ללא תור" : row.status === "imported" ? "0 תורים · לקוח מיובא" : `${row.appointmentCount} תורים פעילים${row.isImported ? " · מידע מיובא" : ""}`}</span></span></button>;
  if (column === "lastActivity") return <div className="min-w-[150px]"><p className="text-xs font-extrabold text-[#1A1A3E]">{row.lastActivityLabel}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">{row.lastActivityTimestamp ? formatDateTime(new Date(row.lastActivityTimestamp), true) : "אין פעילות מתועדת"}</p></div>;
  if (column === "email") return <span dir="ltr" className="block min-w-[170px] text-xs font-semibold text-slate-600">{display(row.email)}</span>;
  if (column === "phone") return <span dir="ltr" className="block min-w-[125px] text-xs font-semibold text-slate-600">{display(primaryPhone(row))}</span>;
  if (column === "status") return <StatusBadge row={row} />;
  if (column === "tags") return <Tags row={row} />;
  if (column === "team") return <span className="text-xs font-semibold text-slate-400">לא שויך</span>;
  if (column === "pets") return <span className="text-xs font-semibold text-slate-600">{row.pets.length ? row.pets.map((pet) => pet.name).join(", ") : "לא צוין"}</span>;
  if (column === "appointments") return <span className="text-sm font-black text-[#1A1A3E]">{row.appointmentCount}</span>;
  return <span className="text-xs font-semibold text-slate-600">{row.lastAppointment ? formatDateTime(new Date(`${row.lastAppointment.date}T${row.lastAppointment.start_time || "00:00"}`)) : "אין תור"}</span>;
}

function compactActivityDate(timestamp: number): string {
  if (!timestamp) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VETERINARY_CLINIC_PROFILE.timezone,
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(new Date(timestamp));
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return day && month ? `${day}.${month}` : "";
}

function fullActivityDateTime(timestamp: number): string {
  if (!timestamp) return "אין פעילות מתועדת";
  return new Intl.DateTimeFormat(VETERINARY_CLINIC_PROFILE.locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: VETERINARY_CLINIC_PROFILE.timezone,
  }).format(new Date(timestamp));
}

function MobilePetChips({ row }: { row: ClientRow }) {
  // Appointment aggregation can add a display-only name when the stored pet name was blank.
  const savedPets = row.pets.filter((pet) => pet.name.trim() && pet.name.trim() !== "חיית מחמד ללא שם");
  const shownPets = savedPets.slice(0, 2);
  const remainingCount = Math.max(0, savedPets.length - shownPets.length);
  if (shownPets.length === 0) return null;

  return <span className="client-mobile-pet-chips flex min-w-0 max-w-[min(42vw,140px)] shrink items-center gap-1">
    {shownPets.map((pet) => {
      const PetIcon = pet.species === "dog" ? Dog : pet.species === "cat" ? Cat : PawPrint;
      return <span key={pet.key} title={pet.name} className="client-mobile-pet-chip inline-flex min-w-0 max-w-[112px] items-center gap-0.5 truncate rounded-full bg-[#F2D162]/[0.28] px-1.5 py-0.5 text-xs font-bold text-[#1A1A3E]"><PetIcon className="h-3.5 w-3.5 shrink-0 text-[#1A1A3E]" aria-hidden="true" /><span className="min-w-0 truncate">{pet.name}</span></span>;
    })}
    {remainingCount > 0 && <span className="client-mobile-pet-count shrink-0 rounded-full bg-[#F2D162]/[0.28] px-1.5 py-0.5 text-[10px] font-extrabold text-[#1A1A3E]" aria-label={`${remainingCount} חיות מחמד נוספות`}>+{remainingCount}</span>}
  </span>;
}

function MobileContactDetails({ row, onOpenClient }: { row: ClientRow; onOpenClient: (id: string) => void }) {
  const rawPhone = primaryPhone(row).trim();
  const normalizedPhone = normalizeClientPhone(rawPhone);
  const canonicalPhone = normalizedPhone?.replace(/[\s().-]+/g, "") || null;
  const validPhone = isValidClientPhone(canonicalPhone) ? canonicalPhone : "";
  const email = row.email.trim();
  const callButtonClass = "client-mobile-action inline-flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 text-[11px] font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162]";

  return <div className="client-mobile-details bg-[#F7F8FA] px-3 pb-3 pt-2.5" dir="rtl">
    <div className="client-mobile-contact-row flex min-w-0 items-center gap-2 text-[11px] font-semibold text-slate-600" aria-label="פרטי קשר">
      <span className="flex min-w-0 max-w-[46%] items-center gap-1">
        <Phone className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
        {rawPhone ? validPhone ? <a href={`tel:${validPhone}`} dir="ltr" className="min-w-0 truncate font-bold text-[#1A1A3E]">{rawPhone}</a> : <span dir="ltr" className="min-w-0 truncate">{rawPhone}</span> : <span className="truncate">טלפון לא צוין</span>}
      </span>
      <span className="shrink-0 text-slate-300" aria-hidden="true">·</span>
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <Mail className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
        {email ? <a href={`mailto:${email}`} dir="ltr" className="min-w-0 truncate font-bold text-[#1A1A3E]">{email}</a> : <span className="truncate">אימייל לא צוין</span>}
      </span>
    </div>

    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-bold text-slate-500">
      <span><span className="text-slate-400">תורים פעילים: </span><span className="text-[#1A1A3E]">{row.appointmentCount}</span></span>
      <span className="min-w-0"><span className="text-slate-400">פעילות אחרונה: </span><span className="text-[#1A1A3E]">{fullActivityDateTime(row.lastActivityTimestamp)}</span></span>
    </div>

    <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label={`פעולות עבור ${row.name}`}>
      {validPhone ? <a href={`tel:${validPhone}`} className={`${callButtonClass} client-mobile-action--call border-[#D9DEE5] bg-white text-[#1A1A3E] hover:border-[#1A1A3E]/30`} aria-label={`התקשר אל ${row.name}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" />התקשר</a> : <button type="button" disabled className={`${callButtonClass} client-mobile-action--disabled cursor-not-allowed border-[#E5E7EB] bg-[#F1F2F3] text-slate-400`}><Phone className="h-3.5 w-3.5" aria-hidden="true" />התקשר</button>}
      {validPhone ? <a href={`https://wa.me/${validPhone.slice(1)}`} target="_blank" rel="noopener noreferrer" className={`${callButtonClass} client-mobile-action--whatsapp border-[#B8DCD9] bg-[#F5FBFA] text-[#236B68] hover:border-[#236B68]`} aria-label={`פתיחת שיחת WhatsApp עם ${row.name}`}><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />וואטסאפ</a> : <button type="button" disabled className={`${callButtonClass} client-mobile-action--disabled cursor-not-allowed border-[#E5E7EB] bg-[#F1F2F3] text-slate-400`}><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />וואטסאפ</button>}
      <button type="button" onClick={() => onOpenClient(row.id)} className={`${callButtonClass} client-mobile-action--profile border-[#1A1A3E] bg-[#1A1A3E] text-white hover:bg-[#2A2A5A]`} aria-label={`פתיחת כרטיס הלקוח ${row.name}`}><UserRound className="h-3.5 w-3.5" aria-hidden="true" />כרטיס לקוח</button>
    </div>
  </div>;
}

const PET_TONES = ["sun", "blue", "mint", "lav"] as const;

/** Pet names (without the display-only placeholder) for the phone list. */
function savedPetNames(row: ClientRow): string[] {
  return row.pets.map((pet) => pet.name.trim()).filter((name) => name && name !== "חיית מחמד ללא שם");
}

function MobileContactRow({ row, selected, selectionMode, hasNewRequest, onToggle, onOpenClient }: {
  row: ClientRow;
  selected: boolean;
  selectionMode: boolean;
  hasNewRequest: boolean;
  isExpanded?: boolean;
  onToggle: () => void;
  onExpand?: () => void;
  onOpenClient: (id: string) => void;
}) {
  const activityDate = compactActivityDate(row.lastActivityTimestamp);
  const shownPets = row.pets.filter((pet) => pet.name.trim() && pet.name.trim() !== "חיית מחמד ללא שם").slice(0, 2);
  const petNames = savedPetNames(row);
  const phone = primaryPhone(row).trim();

  return <article className={`client-mobile-row client-row${selected ? " is-selected" : ""}`}>
    {selectionMode && <label className="client-row-check" aria-label={`בחירת ${row.name}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`בחירת ${row.name}`} />
    </label>}
    <button
      type="button"
      onClick={selectionMode ? onToggle : () => onOpenClient(row.id)}
      aria-label={selectionMode ? `בחירת ${row.name}` : `פתיחת כרטיס הלקוח ${row.name}`}
      aria-pressed={selectionMode ? selected : undefined}
      className="client-row-button press"
    >
      <span className="client-row-pets" aria-hidden="true">
        {shownPets.length === 0
          ? <span className="client-row-pet tone-blue is-initials">{bentoInitials(row.name)}</span>
          : shownPets.map((pet, index) => {
            const PetIcon = pet.species === "dog" ? Dog : pet.species === "cat" ? Cat : PawPrint;
            return <span key={pet.key} className={`client-row-pet tone-${PET_TONES[index % PET_TONES.length]}`}><PetIcon /></span>;
          })}
      </span>
      <span className="client-row-body">
        <span className="client-row-name" dir="auto">{row.name}</span>
        <span className="client-row-meta">
          {petNames.length > 0 && <span className="client-row-petnames">{petNames.slice(0, 3).join(", ")}{petNames.length > 3 ? ` +${petNames.length - 3}` : ""}</span>}
          {petNames.length > 0 && phone && <span aria-hidden="true"> · </span>}
          {phone && <span className="client-row-phone" dir="ltr">{phone}</span>}
          {petNames.length === 0 && !phone && <span>{row.lastActivityTimestamp ? row.lastActivityLabel : "אין פרטים נוספים"}</span>}
        </span>
      </span>
      <span className="client-row-side">
        <span className="client-row-date" dir="ltr">{activityDate || "—"}</span>
        {hasNewRequest && <em className="client-row-flag">בקשה<span className="sr-only"> חדשה בתיבת הדואר</span></em>}
      </span>
    </button>
  </article>;
}

function EmptyTable({ title, body, loading, onRefresh }: { title: string; body: string; loading?: boolean; onRefresh: () => void }) {
  if (loading) return <div className="client-mobile-empty-loading space-y-3 p-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-[#F2F4F6]" />)}</div>;
  return <div className="client-mobile-empty flex min-h-[270px] flex-col items-center justify-center px-5 py-12 text-center"><span className="client-mobile-empty-icon flex h-14 w-14 items-center justify-center rounded-full bg-[#F7F7F7] text-slate-400"><Users className="h-6 w-6" /></span><h3 className="client-mobile-empty-title mt-4 text-base font-extrabold text-[#1A1A3E]">{title}</h3><p className="client-mobile-empty-copy mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">{body}</p><button type="button" onClick={onRefresh} className="client-mobile-empty-action mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#D9DEE5] bg-white px-4 text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">רענון נתונים</button></div>;
}

export function ClientsTable({
  rows,
  mobileRows,
  columns,
  selectedIds,
  loading,
  sortKey,
  sortDirection,
  mobileSelectionMode = false,
  mobileNewRequestIds = new Set<string>(),
  mobileEmptyTitle,
  mobileEmptyBody,
  onToggle,
  onToggleAll,
  onSort,
  onRefresh,
  onOpenClient,
  emptyTitle,
  emptyBody,
}: ClientsTableProps) {
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const visibleColumns = columns.length ? columns : ["client"];
  const phoneRows = mobileRows ?? rows;
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  useEffect(() => {
    if (mobileSelectionMode) setExpandedRowId(null);
  }, [mobileSelectionMode]);
  useEffect(() => {
    if (expandedRowId && !phoneRows.some((row) => row.id === expandedRowId)) setExpandedRowId(null);
  }, [expandedRowId, phoneRows]);

  return <section className="client-mobile-table overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_14px_38px_-30px_rgba(26,26,62,0.6)]">
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-[980px] w-full text-right">
        <thead className="border-b border-[#EEF0F3] bg-[#FBFCFD]">
          <tr>
            <th className="w-12 px-4 py-3"><input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="בחירת כל הלקוחות בעמוד" className="h-4 w-4 rounded border-slate-300 accent-[#1A1A3E] focus:ring-[#F2D162]" /></th>
            {visibleColumns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-3 text-[11px] text-slate-500">{column === "client" ? <SortButton label="לקוח" active={sortKey === "name"} direction={sortDirection} onClick={() => onSort("name")} /> : column === "lastActivity" ? <SortButton label="פעילות אחרונה" active={sortKey === "lastActivity"} direction={sortDirection} onClick={() => onSort("lastActivity")} /> : column === "appointments" ? <SortButton label="מספר תורים" active={sortKey === "appointments"} direction={sortDirection} onClick={() => onSort("appointments")} /> : clientColumns.find((item) => item.key === column)?.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F0F1F3]">
          {loading ? <tr><td colSpan={visibleColumns.length + 1}><EmptyTable title="טוען את הלקוחות..." body="הנתונים יוצגו לאחר טעינת התורים, הפניות והלקוחות המיובאים." loading onRefresh={onRefresh} /></td></tr> : rows.length ? rows.map((row) => <tr key={row.id} className="transition hover:bg-[#FFFDF2]"><td className="px-4 py-3 align-top"><input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => onToggle(row.id)} aria-label={`בחירת ${row.name}`} className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#1A1A3E] focus:ring-[#F2D162]" /></td>{visibleColumns.map((column) => <td key={column} className="px-3 py-3 align-middle"><Cell column={column} row={row} onOpenClient={onOpenClient} /></td>)}</tr>) : <tr><td colSpan={visibleColumns.length + 1}><EmptyTable title={emptyTitle} body={emptyBody} onRefresh={onRefresh} /></td></tr>}
        </tbody>
      </table>
    </div>

    <div className="md:hidden">
      {loading ? <EmptyTable title="טוען את הלקוחות..." body="הנתונים יוצגו לאחר טעינת התורים, הפניות והלקוחות המיובאים." loading onRefresh={onRefresh} /> : phoneRows.length ? <div className="client-mobile-row-list" dir="rtl">
        {phoneRows.map((row) => <MobileContactRow key={row.id} row={row} selected={selectedIds.has(row.id)} selectionMode={mobileSelectionMode} hasNewRequest={mobileNewRequestIds.has(row.id)} isExpanded={expandedRowId === row.id} onToggle={() => onToggle(row.id)} onExpand={() => setExpandedRowId((current) => current === row.id ? null : row.id)} onOpenClient={onOpenClient} />)}
      </div> : <EmptyTable title={mobileEmptyTitle || emptyTitle} body={mobileEmptyBody || emptyBody} onRefresh={onRefresh} />}
    </div>
  </section>;
}
