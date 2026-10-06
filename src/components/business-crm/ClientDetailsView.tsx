import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CalendarClock, Check, CheckCircle2, ChevronLeft, Clipboard, Clock3, CreditCard, Loader2, Mail, MoreHorizontal, PawPrint, Pencil, Phone, Plus, Send, StickyNote } from "lucide-react";
import { ClientReminder } from "@/entities";
import { ClientEmailComposer } from "@/components/business-crm/ClientEmailComposer";
import { ClientProfileEditor } from "@/components/business-crm/ClientProfileEditor";
import { ClientReminderComposer, type ClientReminderCreatePayload } from "@/components/business-crm/ClientReminderComposer";
import { PetMedicalJournal } from "@/components/business-crm/PetMedicalJournal";
import type { ClientProfileDraft } from "@/lib/clientProfilePersistence";
import { saveClientProfile } from "@/lib/clientProfilePersistence";
import { appointmentDate, formatDateTime, speciesLabel, statusLabel, storedDate, type ClientRow, type CrmRecord } from "@/lib/crmClientData";
import type { ClientPet } from "@/lib/clientAggregation";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.trim().slice(0, 2) || "לק";
}

function fieldText(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function appointmentStatus(value: unknown) {
  const status = fieldText(value).toLowerCase();
  if (status === "requested") return "ממתין לאישור";
  if (status === "confirmed") return "מאושר";
  if (["cancelled", "canceled"].includes(status)) return "בוטל";
  if (["no_show", "no-show", "noshow"].includes(status)) return "לא הגיע";
  return fieldText(value) || "סטטוס לא צוין";
}

function statusTone(row: ClientRow) {
  return row.status === "active"
    ? "bg-[#E8F2EA] text-[#2C6A3B]"
    : row.status === "new"
      ? "bg-[#FFF4CF] text-[#69550C]"
      : row.status === "imported"
        ? "bg-[#E8F0FF] text-[#315A94]"
        : "bg-[#EEEAFE] text-[#5744A4]";
}

function formatPetAge(birthDate?: string): string {
  const value = fieldText(birthDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const birth = new Date(year, month - 1, day);
  const today = new Date();
  birth.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day || birth > today) return "";

  let years = today.getFullYear() - year;
  let months = today.getMonth() - month;
  if (today.getDate() < day) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years > 0) return `${years} ${years === 1 ? "שנה" : "שנים"}`;
  if (months > 0) return `${months} ${months === 1 ? "חודש" : "חודשים"}`;
  return "פחות מחודש";
}

function formatPetWeight(weight: unknown): string {
  const numeric = typeof weight === "number" ? weight : Number(fieldText(weight).replace(",", "."));
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 250) return "";
  return `${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(numeric)} ק״ג`;
}

function SoonButton({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  return <button type="button" disabled title="הפעולה תתחבר בשלב הבא" className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${primary ? "bg-[#152E4D] text-white opacity-75" : "border border-[#D5E0E2] bg-white text-slate-500 opacity-80"}`}>{children}<span className="text-[10px] font-bold opacity-70">בקרוב</span></button>;
}

function ActionButton({ children, onClick, disabled = false, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={title} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${disabled ? "cursor-not-allowed border-[#E4E9EB] bg-[#F8FAFA] text-slate-300" : "border-[#B8DCD9] bg-[#F5FBFA] text-[#236B68] hover:border-[#236B68] hover:bg-[#EAF7F5]"}`}>{children}</button>;
}

function EditButton({ onEdit, disabled = false, compact = false }: { onEdit: () => void; disabled?: boolean; compact?: boolean }) {
  return <button type="button" onClick={onEdit} disabled={disabled} title={disabled ? "עריכת תיק הלקוח זמינה לאחר יצירת רשומת לקוח" : "עריכת תיק הלקוח"} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-[11px] font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${disabled ? "cursor-not-allowed border-[#E4E9EB] bg-[#F8FAFA] text-slate-300" : "border-[#B8DCD9] bg-[#F5FBFA] text-[#236B68] hover:border-[#236B68] hover:bg-[#EAF7F5]"}`}><Pencil className="h-3.5 w-3.5" />{compact ? "עריכה" : "עריכת תיק הלקוח"}</button>;
}

function CopyField({ label, value, icon: Icon, href }: { label: string; value: string; icon: typeof Mail; href?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  return <div className="rounded-xl border border-[#E8EFF0] bg-[#FBFCFD] p-3"><div className="flex items-center gap-2 text-[10px] font-extrabold text-slate-400"><Icon className="h-3.5 w-3.5" />{label}</div>{value ? <div className="mt-2 flex items-center gap-2">{href ? <a href={href} dir="ltr" className="min-w-0 flex-1 truncate text-xs font-bold text-[#5267A8] hover:underline">{value}</a> : <span dir="ltr" className="min-w-0 flex-1 truncate text-xs font-bold text-[#152E4D]">{value}</span>}<button type="button" onClick={copy} className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-[#152E4D] focus:outline-none focus:ring-2 focus:ring-[#F2D162]" aria-label={`העתקת ${label}`}>{copied ? <Check className="h-3.5 w-3.5 text-[#2C6A3B]" /> : <Clipboard className="h-3.5 w-3.5" />}</button></div> : <p className="mt-2 text-xs font-semibold text-slate-400">לא צוין</p>}</div>;
}

function ReadOnlyValue({ label, value, dir = "rtl" }: { label: string; value: string; dir?: "ltr" | "rtl" | "auto" }) {
  return <div className="rounded-xl border border-[#E8EFF0] bg-[#FBFCFD] p-3"><p className="text-[10px] font-extrabold text-slate-400">{label}</p><p dir={dir} className="mt-1 break-words text-xs font-bold leading-5 text-[#152E4D]">{value}</p></div>;
}

function PetProfileCard({ pet }: { pet: ClientPet }) {
  const age = formatPetAge(pet.birthDate);
  const weight = formatPetWeight(pet.weightKg);
  const breed = fieldText(pet.breed);
  const allergies = fieldText(pet.allergies);
  const medicalNotes = fieldText(pet.medicalNotes);
  const hasDetails = Boolean(breed || age || weight || allergies || medicalNotes);
  return <article className="rounded-2xl border border-[#E1ECEC] bg-[#F9FCFC] p-3.5">
    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F2D162]/30 text-[#69550C]"><PawPrint className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-black text-[#152E4D]">{pet.name}</h4><div className="mt-1 flex flex-wrap items-center gap-1.5">{pet.species ? <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#315A67]">{speciesLabel(pet.species)}</span> : <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-400">סוג לא צוין</span>}</div></div></div>
    {hasDetails ? <>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        {breed && <div className="rounded-xl border border-[#E8EFF0] bg-white px-3 py-2"><dt className="text-[10px] font-extrabold text-slate-400">גזע</dt><dd className="mt-1 text-xs font-bold text-[#152E4D]">{breed}</dd></div>}
        {age && <div className="rounded-xl border border-[#E8EFF0] bg-white px-3 py-2"><dt className="text-[10px] font-extrabold text-slate-400">גיל מחושב</dt><dd className="mt-1 text-xs font-bold text-[#152E4D]">{age}</dd></div>}
        {weight && <div className="rounded-xl border border-[#E8EFF0] bg-white px-3 py-2"><dt className="text-[10px] font-extrabold text-slate-400">משקל</dt><dd className="mt-1 text-xs font-bold text-[#152E4D]">{weight}</dd></div>}
      </dl>
      {allergies && <div className="mt-2 flex items-start gap-2 rounded-xl border border-[#F2E2B9] bg-[#FFF9E9] px-3 py-2.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B18A2E]" /><div className="min-w-0"><p className="text-[10px] font-black text-[#80631C]">אלרגיות</p><p className="mt-1 whitespace-pre-wrap text-xs font-semibold leading-5 text-[#69550C]">{allergies}</p></div></div>}
      {medicalNotes && <div className="mt-2 rounded-xl border border-[#E8EFF0] bg-white px-3 py-2.5"><p className="text-[10px] font-black text-slate-400">הערות רפואיות</p><p className="mt-1 whitespace-pre-wrap text-xs font-medium leading-5 text-slate-600">{medicalNotes}</p></div>}
    </> : <p className="mt-3 rounded-xl border border-dashed border-[#C9DDDF] bg-white px-3 py-3 text-[11px] font-medium leading-5 text-slate-400">פרטי גזע, גיל, משקל ומידע רפואי עדיין לא מולאו.</p>}
  </article>;
}

function IdentityPanel({ row, onEdit, canEdit }: { row: ClientRow; onEdit: () => void; canEdit: boolean }) {
  const mobilePhone = fieldText(row.mobilePhone);
  const primaryPhone = fieldText(row.phone);
  const shownPhone = mobilePhone || primaryPhone;
  const hasDifferentPrimary = Boolean(mobilePhone && primaryPhone && mobilePhone !== primaryPhone);
  const homePhone = fieldText(row.homePhone);
  const email = fieldText(row.email);
  const nationalId = fieldText(row.nationalId);
  const address = fieldText(row.address);
  const city = fieldText(row.city);
  const postalCode = fieldText(row.postalCode);
  const additionalFields = (Array.isArray(row.additionalFields) ? row.additionalFields : []).filter((field) => fieldText(field.value));

  return <aside className="space-y-4" dir="rtl">
    <section className="rounded-2xl border border-[#DDE7E8] bg-white p-5 shadow-[0_14px_38px_-30px_rgba(21,46,77,0.55)]">
      <div className="flex items-start gap-3"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#152E4D] text-base font-black text-[#F2D162]">{initials(row.name)}</span><div className="min-w-0 flex-1"><h2 className="truncate text-lg font-black text-[#152E4D]">{row.name}</h2><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${statusTone(row)}`}>{statusLabel(row.status)}</span></div><EditButton onEdit={onEdit} disabled={!canEdit} compact /></div>
      <div className="mt-5 space-y-2">
        {shownPhone && <CopyField label={mobilePhone ? "טלפון סלולרי" : "טלפון ראשי"} value={shownPhone} icon={Phone} href={`tel:${shownPhone}`} />}
        {hasDifferentPrimary && <CopyField label="טלפון ראשי נוסף" value={primaryPhone} icon={Phone} href={`tel:${primaryPhone}`} />}
        {homePhone && <CopyField label="טלפון בבית" value={homePhone} icon={Phone} href={`tel:${homePhone}`} />}
        {email && <CopyField label="אימייל" value={email} icon={Mail} href={`mailto:${email}`} />}
      </div>
      {(nationalId || address || city || postalCode) && <div className="mt-4 grid gap-2 border-t border-[#E8EFF0] pt-4 sm:grid-cols-2">
        {nationalId && <ReadOnlyValue label="תעודת זהות" value={nationalId} dir="ltr" />}
        {postalCode && <ReadOnlyValue label="מיקוד" value={postalCode} dir="ltr" />}
        {address && <div className="sm:col-span-2"><ReadOnlyValue label="כתובת" value={address} /></div>}
        {city && <ReadOnlyValue label="עיר" value={city} />}
      </div>}
      {additionalFields.length > 0 && <section className="mt-4 rounded-2xl border border-[#D9E5F4] bg-[#F7F9FF] p-3.5" aria-labelledby="client-imported-fields-heading"><div><h3 id="client-imported-fields-heading" className="text-xs font-black text-[#152E4D]">פרטים נוספים מהייבוא</h3><p className="mt-1 text-[10px] font-medium leading-5 text-[#33447A]">עמודות נוספות שנשמרו בתיק הלקוח.</p></div><dl className="mt-3 space-y-2">{additionalFields.map((field, index) => <div key={`${field.key || field.label}-${index}`} className="rounded-xl border border-[#E8EFF0] bg-white px-3 py-2.5"><dt className="text-[10px] font-extrabold text-slate-400">{fieldText(field.label) || "עמודה נוספת"}</dt><dd dir="auto" className="mt-1 break-words text-xs font-bold leading-5 text-[#152E4D]">{fieldText(field.value)}</dd></div>)}</dl></section>}
      <dl className="mt-4 space-y-3 border-t border-[#E8EFF0] pt-4 text-xs"><div className="flex items-center justify-between gap-3"><dt className="font-bold text-slate-400">מקור הרשומה</dt><dd className="max-w-[65%] truncate text-left font-extrabold text-slate-500">{row.importSource || "תורים שנשמרו"}</dd></div><div className="flex items-center justify-between gap-3"><dt className="font-bold text-slate-400">הסכמת SMS</dt><dd className="font-extrabold text-slate-500">{row.smsConsent ? "נשמרה עם נוסח" : "לא נשמרה"}</dd></div></dl>
    </section>

    <section className="rounded-2xl border border-[#DDE7E8] bg-white p-5 shadow-[0_14px_38px_-30px_rgba(21,46,77,0.55)]">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black text-[#152E4D]">חיות מחמד ({row.pets.length})</h3><div className="flex items-center gap-2"><PawPrint className="h-4 w-4 text-slate-400" /><EditButton onEdit={onEdit} disabled={!canEdit} compact /></div></div>
      {row.pets.length ? <div className="mt-4 space-y-3">{row.pets.map((pet) => <PetProfileCard key={pet.key} pet={pet} />)}</div> : <p className="mt-4 rounded-xl bg-[#F8FBFB] px-3 py-4 text-xs font-semibold leading-5 text-slate-400">אין חיות מחמד שנשמרו ברשומות הקיימות. אפשר להוסיף אותן לעריכת התיק.</p>}
    </section>

    <section className="rounded-2xl border border-[#DDE7E8] bg-white p-5 shadow-[0_14px_38px_-30px_rgba(21,46,77,0.55)]"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><StickyNote className="h-4 w-4 text-[#5267A8]" /><h3 className="text-sm font-black text-[#152E4D]">הערה לתיק</h3></div><EditButton onEdit={onEdit} disabled={!canEdit} compact /></div>{row.notes ? <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[#F8FBFB] px-3 py-3 text-xs font-medium leading-5 text-slate-600">{row.notes}</p> : <div className="mt-3 rounded-xl border border-dashed border-[#C9DDDF] bg-[#F8FBFB] px-3 py-4"><p className="text-xs font-extrabold text-[#315A67]">אין עדיין הערה קבועה לתיק</p><p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">הוסיפי מידע קצר שיעזור לצוות להכיר את הלקוח בביקור הבא.</p></div>}</section>
  </aside>;
}

function ActivityCard({ record }: { record: CrmRecord }) {
  const date = appointmentDate(record) || storedDate(record.created_at);
  return <article className="rounded-2xl border border-[#E6EFF0] bg-[#F9FCFC] p-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F2D162]/30 text-[#69550C]"><Clock3 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="text-sm font-extrabold text-[#152E4D]">{fieldText(record.appointment_type) || "פגישה"}</h4><p className="mt-1 text-xs font-semibold text-slate-500">{fieldText(record.pet_name) ? `חיית מחמד: ${fieldText(record.pet_name)}` : "חיית מחמד לא צוינה"}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500">{appointmentStatus(record.status)}</span></div><p className="mt-3 text-[11px] font-bold text-slate-400">{formatDateTime(date, true)}</p>{fieldText(record.notes) && <p className="mt-2 rounded-xl border border-[#E6EFF0] bg-white px-3 py-2 text-xs font-medium leading-5 text-slate-600">{fieldText(record.notes)}</p>}</div></div></article>;
}

function InquiryCard({ record }: { record: CrmRecord }) {
  const created = storedDate(record.created_at);
  return <article className="rounded-2xl border border-[#E5E1F0] bg-[#FBFAFE] p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-extrabold text-[#152E4D]">פנייה מהאתר</h4><p className="mt-1 text-[11px] font-semibold text-slate-400">{formatDateTime(created, true)}</p></div><Mail className="h-4 w-4 text-[#5267A8]" /></div><p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-600">{fieldText(record.message) || "הפנייה נשמרה ללא תוכן."}</p></article>;
}

type TimelineItem = { kind: "appointment" | "inquiry"; record: CrmRecord; timestamp: number; index: number };

function timelineTimestamp(kind: TimelineItem["kind"], record: CrmRecord): number {
  if (kind === "inquiry") return storedDate(record.created_at)?.getTime() || 0;
  const scheduled = appointmentDate(record)?.getTime() || 0;
  const created = storedDate(record.created_at)?.getTime() || 0;
  return scheduled > 0 && scheduled <= Date.now() ? scheduled : created || scheduled;
}

function timelineItems(row: ClientRow): TimelineItem[] {
  return [
    ...row.appointments.map((record, index) => ({ kind: "appointment" as const, record, timestamp: timelineTimestamp("appointment", record), index })),
    ...row.inquiries.map((record, index) => ({ kind: "inquiry" as const, record, timestamp: timelineTimestamp("inquiry", record), index: row.appointments.length + index })),
  ].sort((first, second) => second.timestamp - first.timestamp || second.index - first.index);
}

function ActivityPanel({ row }: { row: ClientRow }) {
  const [tab, setTab] = useState<"activity" | "inquiries">("activity");
  const timeline = timelineItems(row);
  const panelId = tab === "activity" ? "client-activity-panel" : "client-inquiries-panel";
  return <main className="min-w-0 rounded-2xl border border-[#DDE7E8] bg-white p-4 shadow-[0_14px_38px_-30px_rgba(21,46,77,0.55)] sm:p-5" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-extrabold tracking-wide text-slate-400">פרטי לקוח</p><h1 className="mt-1 text-xl font-black text-[#152E4D]">פעילות של {row.name}</h1></div><span className="rounded-full bg-[#F4F7F7] px-3 py-1.5 text-[10px] font-black text-slate-500">{row.lastActivityLabel}</span></div>
    <div className="mt-5 flex gap-2 border-b border-[#E8EFF0]" role="tablist" aria-label="בחירת תוכן הלקוח">
      <button id="client-activity-tab" type="button" role="tab" aria-selected={tab === "activity"} aria-controls="client-activity-panel" onClick={() => setTab("activity")} className={`border-b-2 px-3 py-2 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${tab === "activity" ? "border-[#152E4D] text-[#152E4D]" : "border-transparent text-slate-400 hover:text-[#152E4D]"}`}>ציר פעילות ({row.appointments.length + row.inquiries.length})</button>
      <button id="client-inquiries-tab" type="button" role="tab" aria-selected={tab === "inquiries"} aria-controls="client-inquiries-panel" onClick={() => setTab("inquiries")} className={`border-b-2 px-3 py-2 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${tab === "inquiries" ? "border-[#152E4D] text-[#152E4D]" : "border-transparent text-slate-400 hover:text-[#152E4D]"}`}>פניות מהאתר ({row.inquiries.length})</button>
    </div>
    {tab === "activity" ? <div id={panelId} role="tabpanel" aria-labelledby="client-activity-tab" className="mt-5 space-y-3">{timeline.length ? timeline.map((item, index) => item.kind === "appointment" ? <ActivityCard key={`appointment-${String(item.record.id || index)}`} record={item.record} /> : <InquiryCard key={`inquiry-${String(item.record.id || index)}`} record={item.record} />) : <div className="rounded-2xl border border-dashed border-[#C9DDDF] bg-[#F9FCFC] px-5 py-12 text-center"><p className="text-sm font-extrabold text-[#152E4D]">אין פעילות מתועדת</p><p className="mt-2 text-xs font-medium leading-5 text-slate-500">תורים ופניות שנשמרו במערכת יופיעו כאן לפי סדר כרונולוגי.</p></div>}</div> : <div id={panelId} role="tabpanel" aria-labelledby="client-inquiries-tab" className="mt-5 space-y-3">{row.inquiries.length ? row.inquiries.map((record, index) => <InquiryCard key={String(record.id || `${record.created_at}-${index}`)} record={record} />) : <div className="rounded-2xl border border-dashed border-[#C9DDDF] bg-[#F9FCFC] px-5 py-12 text-center"><p className="text-sm font-extrabold text-[#152E4D]">אין פניות שמורות</p><p className="mt-2 text-xs font-medium leading-5 text-slate-500">המסך מציג רק מידע שנשמר בפועל במערכת.</p></div>}</div>}
  </main>;
}

function SummaryPanel({ row }: { row: ClientRow }) {
  const latest = row.lastAppointment ? appointmentDate(row.lastAppointment) : null;
  const next = row.futureAppointments[0] ? appointmentDate(row.futureAppointments[0]) : null;
  const metric = (label: string, value: string, muted = false) => <div className="rounded-xl border border-[#E8EFF0] bg-[#F9FCFC] p-3"><p className="text-[10px] font-extrabold text-slate-400">{label}</p><p className={`mt-2 text-sm font-black ${muted ? "text-slate-400" : "text-[#152E4D]"}`}>{value}</p></div>;
  return <aside className="space-y-4" dir="rtl"><section className="rounded-2xl border border-[#DDE7E8] bg-white p-5 shadow-[0_14px_38px_-30px_rgba(21,46,77,0.55)]"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-black text-[#152E4D]">סיכום פעילות</h2><button type="button" disabled title="עריכת סיכום תתחבר בשלב הבא" className="rounded-lg p-1.5 text-slate-300" aria-label="עריכת סיכום"><StickyNote className="h-4 w-4" /></button></div><div className="mt-4 space-y-2">{metric("תשלומים שהתקבלו", "לא מחובר", true)}{metric("תשלומים פתוחים ועתידיים", "לא מחובר", true)}{metric("פגישה אחרונה", latest ? formatDateTime(latest) : "אין תור")}{metric("פגישה עתידית", next ? formatDateTime(next, true) : "אין פגישות")}{metric("ביטולים", String(row.cancelledCount))}{metric("אי-הגעה ללא הודעה", String(row.noShowCount))}</div></section><section className="rounded-2xl border border-[#DDE7E8] bg-white p-5 shadow-[0_14px_38px_-30px_rgba(21,46,77,0.55)]"><h2 className="text-sm font-black text-[#152E4D]">נתונים שאינם מחוברים</h2><p className="mt-2 text-xs font-medium leading-5 text-slate-500">תשלומים, הצעות מחיר, צוות והיסטוריית אימיילים אינם נשמרים במקורות הנתונים הזמינים כרגע.</p></section></aside>;
}

type ReminderRecord = CrmRecord;
type ReminderFeedback = { kind: "success" | "error" | "info"; text: string };

function reminderDueDate(record: ReminderRecord): Date | null {
  const raw = fieldText(record.due_at);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function reminderDueLabel(date: Date | null): { text: string; tone: "overdue" | "today" | "future" | "invalid" } {
  if (!date) return { text: "מועד לא צוין", tone: "invalid" };
  const now = new Date();
  const todayKey = localDayKey(now);
  const dateKey = localDayKey(date);
  if (date.getTime() < now.getTime()) return { text: "באיחור", tone: "overdue" };
  if (dateKey === todayKey) return { text: "היום", tone: "today" };
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateKey === localDayKey(tomorrow)) return { text: "מחר", tone: "future" };
  return { text: "מועד עתידי", tone: "future" };
}

function reminderDateText(date: Date | null): string {
  if (!date) return "לא ניתן להציג את המועד";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function reminderSort(first: ReminderRecord, second: ReminderRecord): number {
  const firstDue = reminderDueDate(first)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const secondDue = reminderDueDate(second)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return firstDue - secondDue || fieldText(first.created_at).localeCompare(fieldText(second.created_at));
}

function ReminderCard({ record, onComplete, isCompleting }: { record: ReminderRecord; onComplete: () => void; isCompleting: boolean }) {
  const id = fieldText(record.id);
  const title = fieldText(record.title) || "תזכורת ללא כותרת";
  const notes = fieldText(record.notes);
  const due = reminderDueDate(record);
  const label = reminderDueLabel(due);
  const tone = label.tone === "overdue" ? "bg-[#FFF1F1] text-[#A63D3D]" : label.tone === "today" ? "bg-[#EAF7F5] text-[#236B68]" : label.tone === "invalid" ? "bg-[#F4F5F6] text-slate-500" : "bg-[#EEF2FB] text-[#5267A8]";
  return <article className="rounded-2xl border border-[#DCEBED] bg-[#F9FCFC] p-3.5 transition hover:border-[#B8DCD9] sm:p-4"><div className="flex items-start gap-3"><span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${label.tone === "overdue" ? "bg-[#FFF1F1] text-[#A63D3D]" : "bg-[#EAF7F5] text-[#236B68]"}`}><CalendarClock className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-sm font-black text-[#152E4D]">{title}</h3><div className="mt-2 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${tone}`}>{label.text}</span><span className="text-[11px] font-bold text-slate-500">{reminderDateText(due)}</span></div></div><button type="button" onClick={onComplete} disabled={!id || isCompleting} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#B8DCD9] bg-white px-3 text-[11px] font-extrabold text-[#236B68] transition hover:border-[#236B68] hover:bg-[#EAF7F5] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-wait disabled:opacity-50">{isCompleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}סימון כבוצע</button></div>{notes && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-[#E6EFF0] bg-white px-3 py-2.5 text-xs font-medium leading-5 text-slate-600">{notes}</p>}</div></div></article>;
}

function ClientRemindersSection({ reminders, isLoading, loadError, completingId, onRetry, onComplete }: { reminders: ReminderRecord[]; isLoading: boolean; loadError: string; completingId: string; onRetry: () => void; onComplete: (id: string) => void }) {
  const openReminders = useMemo(() => reminders.filter((record) => fieldText(record.status) === "open").sort(reminderSort), [reminders]);
  const completedReminders = useMemo(() => reminders.filter((record) => fieldText(record.status) === "completed").sort((first, second) => reminderSort(second, first)), [reminders]);
  return <section className="mb-5 rounded-2xl border border-[#DDE7E8] bg-white p-4 shadow-[0_14px_38px_-30px_rgba(21,46,77,0.55)] sm:p-5" dir="rtl" aria-labelledby="client-reminders-heading"><header className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF7F5] text-[#236B68]"><CalendarClock className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6D9998]">מעקב פנימי לצוות</p><span className="rounded-full bg-[#F7F9FF] px-2 py-1 text-[10px] font-black text-[#5267A8]">ללא שליחה אוטומטית</span></div><h2 id="client-reminders-heading" className="mt-1 text-lg font-black text-[#152E4D]">תזכורות ללקוח</h2><p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-slate-500">התזכורות נשמרות בתיק הלקוח ונראות לצוות המרפאה בלבד.</p></div></div>{!isLoading && <span className="rounded-full border border-[#E1ECEC] bg-[#F8FBFB] px-3 py-1.5 text-[10px] font-black text-slate-500">{openReminders.length} פתוחות</span>}</header>
    {isLoading && <div role="status" aria-live="polite" className="mt-4 flex items-center gap-2 rounded-xl border border-[#D9E5F4] bg-[#F7F9FF] px-3 py-2.5 text-xs font-bold text-[#33447A]"><Loader2 className="h-4 w-4 animate-spin" />טוענים את התזכורות השמורות...</div>}
    {loadError && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F3D0D0] bg-[#FFF8F8] px-3 py-2.5 text-xs font-bold text-red-700"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{loadError}</span><button type="button" onClick={onRetry} className="rounded-lg border border-[#E5CACA] bg-white px-3 py-1.5 text-[11px] font-extrabold text-red-700 focus:outline-none focus:ring-2 focus:ring-[#F2D162]">ניסיון נוסף</button></div>}
    {!isLoading && !loadError && openReminders.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-[#C9DDDF] bg-[#F9FCFC] px-4 py-6 text-center"><CalendarClock className="mx-auto h-5 w-5 text-[#6D9998]" /><p className="mt-2 text-sm font-extrabold text-[#152E4D]">אין תזכורות פתוחות</p><p className="mt-1 text-xs font-medium leading-5 text-slate-500">תזכורות פנימיות שתוסיפי לתיק יופיעו כאן. לא נשלחת הודעה ללקוח.</p></div>}
    {openReminders.length > 0 && <div className="mt-4 space-y-3">{openReminders.map((record, index) => <ReminderCard key={fieldText(record.id) || `open-reminder-${index}`} record={record} isCompleting={completingId === fieldText(record.id)} onComplete={() => onComplete(fieldText(record.id))} />)}</div>}
    {completedReminders.length > 0 && <div className="mt-5 border-t border-[#E8EFF0] pt-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">תזכורות שהושלמו · {completedReminders.length}</p><div className="mt-2 space-y-2">{completedReminders.map((record, index) => { const due = reminderDueDate(record); return <div key={fieldText(record.id) || `completed-reminder-${index}`} className="flex items-start gap-2 rounded-xl border border-[#E8EFF0] bg-[#FBFCFD] px-3 py-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2C6A3B]" /><div className="min-w-0"><p className="break-words text-xs font-extrabold text-slate-600">{fieldText(record.title) || "תזכורת ללא כותרת"}</p><p className="mt-1 text-[10px] font-medium text-slate-400">{due ? `מועד: ${reminderDateText(due)}` : "מועד לא צוין"}{fieldText(record.completed_at) ? ` · הושלמה ${reminderDateText(reminderDueDate({ due_at: record.completed_at }))}` : ""}</p></div></div>; })}</div></div>}
  </section>;
}

type ProfileFeedback = { kind: "success" | "error" | "info"; text: string };

function profileFeedbackTone(kind: ProfileFeedback["kind"]): string {
  if (kind === "success") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (kind === "info") return "border-[#D9E5F4] bg-[#F7F9FF] text-[#33447A]";
  return "border-red-100 bg-red-50 text-red-700";
}

export function ClientDetailsView({ row, businessClients, staffName, onBack, onSaved }: { row: ClientRow; businessClients: CrmRecord[]; staffName: string; onBack: () => void; onSaved: () => Promise<void> | void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFocusField, setEditorFocusField] = useState<"notes" | undefined>(undefined);
  const [reminderComposerOpen, setReminderComposerOpen] = useState(false);
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [isLoadingReminders, setIsLoadingReminders] = useState(false);
  const [reminderLoadError, setReminderLoadError] = useState("");
  const [completingReminderId, setCompletingReminderId] = useState("");
  const [feedback, setFeedback] = useState<ProfileFeedback | null>(null);
  const reminderRequestRef = useRef(0);
  const activeClientIdRef = useRef(row.id);
  const canEdit = row.status !== "lead" || row.businessClientIds.length > 0;
  const hasCustomerProfile = row.businessClientIds.length > 0;

  const loadReminders = useCallback(async (): Promise<boolean> => {
    const clientId = row.id;
    const requestId = ++reminderRequestRef.current;
    setIsLoadingReminders(true);
    setReminderLoadError("");
    try {
      const result = await ClientReminder.query().where("client_id", clientId).sort("due_at").limit(250).exec();
      if (requestId !== reminderRequestRef.current || activeClientIdRef.current !== clientId) return false;
      setReminders(Array.isArray(result) ? result.filter(Boolean) as ReminderRecord[] : []);
      return true;
    } catch (error) {
      console.error("Failed to load client reminders:", error);
      if (requestId !== reminderRequestRef.current || activeClientIdRef.current !== clientId) return false;
      setReminderLoadError("לא הצלחנו לטעון את התזכורות הפנימיות. בדקי את ההרשאה ונסי שוב.");
      return false;
    } finally {
      if (requestId === reminderRequestRef.current && activeClientIdRef.current === clientId) setIsLoadingReminders(false);
    }
  }, [row.id]);

  useEffect(() => {
    activeClientIdRef.current = row.id;
    reminderRequestRef.current += 1;
    setReminders([]);
    setReminderLoadError("");
    setCompletingReminderId("");
    setReminderComposerOpen(false);
    setEmailComposerOpen(false);
    void loadReminders();
    return () => { reminderRequestRef.current += 1; };
  }, [loadReminders, row.id]);

  const handleSave = async (draft: ClientProfileDraft) => {
    if (isSavingProfile) return;
    setIsSavingProfile(true);
    setFeedback(null);
    try {
      const result = await saveClientProfile(draft, row, businessClients);
      setEditorOpen(false);
      setEditorFocusField(undefined);
      try {
        await Promise.resolve(onSaved());
        setFeedback({ kind: "success", text: result.created ? "תיק הלקוח נוצר ונשמר בהצלחה. הנתונים התרעננו." : "תיק הלקוח נשמר בהצלחה. הנתונים התרעננו." });
      } catch (error) {
        console.error("Client profile saved, but CRM refresh failed:", error);
        setFeedback({ kind: "info", text: "תיק הלקוח נשמר, אבל הנתונים במסך לא התרעננו. לחצי על רענון או פתחי את התיק מחדש." });
      }
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message : "לא ניתן היה לשמור את תיק הלקוח. אפשר לנסות שוב.";
      setFeedback({ kind: "error", text: message });
      throw error;
    } finally {
      setIsSavingProfile(false);
    }
  };

  const openEditor = (focusField?: "notes") => {
    if (!canEdit) return;
    setFeedback(null);
    setEditorFocusField(focusField);
    setEditorOpen(true);
  };

  const handleCreateReminder = async ({ title, notes, dueAt }: ClientReminderCreatePayload) => {
    if (!row.id) throw new Error("missing-client-id");
    setFeedback(null);
    try {
      await ClientReminder.create({ client_id: row.id, client_name: row.name, title, notes, due_at: dueAt, status: "open", completed_at: "", author_name: fieldText(staffName) || "צוות המרפאה" });
      const refreshed = await loadReminders();
      setFeedback({ kind: refreshed ? "success" : "info", text: refreshed ? "התזכורת הפנימית נשמרה בתיק הלקוח." : "התזכורת נשמרה, אך הרשימה לא התרעננה. נסי לרענן את התיק." });
    } catch (error) {
      console.error("Failed to create client reminder:", error);
      setFeedback({ kind: "error", text: "לא הצלחנו לשמור את התזכורת הפנימית. בדקי את ההרשאה ונסי שוב." });
      throw error;
    }
  };

  const handleCompleteReminder = async (id: string) => {
    if (!id || completingReminderId) return;
    setCompletingReminderId(id);
    setFeedback(null);
    try {
      await ClientReminder.update(id, { status: "completed", completed_at: new Date().toISOString() });
      const refreshed = await loadReminders();
      setFeedback({ kind: refreshed ? "success" : "info", text: refreshed ? "התזכורת סומנה כבוצעה." : "התזכורת סומנה כבוצעה, אך הרשימה לא התרעננה." });
    } catch (error) {
      console.error("Failed to complete client reminder:", error);
      setFeedback({ kind: "error", text: "לא הצלחנו לסמן את התזכורת כבוצעה. בדקי את ההרשאה ונסי שוב." });
    } finally {
      setCompletingReminderId("");
    }
  };

  return <div dir="rtl">
    <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500"><button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[#5267A8] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><ChevronLeft className="h-4 w-4 rotate-180" />לקוחות</button><span>/</span><span className="truncate text-[#152E4D]">{row.name}</span></div>
    <div className="mb-5 flex flex-wrap items-center gap-2"><EditButton onEdit={openEditor} disabled={!canEdit} /><ActionButton onClick={() => { setFeedback(null); setReminderComposerOpen(true); }}><Plus className="h-4 w-4" />הוספת תזכורת</ActionButton><ActionButton onClick={() => openEditor("notes")} disabled={!canEdit} title={!canEdit ? "הערה לתיק זמינה לאחר יצירת רשומת לקוח" : "פתיחת הערה קבועה לתיק"}><StickyNote className="h-4 w-4" />הוספת הערה</ActionButton><SoonButton><CreditCard className="h-4 w-4" />חיוב לקוח</SoonButton><ActionButton onClick={() => { setFeedback(null); setEmailComposerOpen(true); }}><Send className="h-4 w-4" />שליחת הודעה</ActionButton><SoonButton><MoreHorizontal className="h-4 w-4" />אפשרויות נוספות</SoonButton><SoonButton primary><StickyNote className="h-4 w-4" />בחירת פעולה</SoonButton></div>
    {feedback && <div role={feedback.kind === "error" ? "alert" : "status"} aria-live="polite" className={`mb-5 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${profileFeedbackTone(feedback.kind)}`}><span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-current" /><p>{feedback.text}</p></div>}
    {!canEdit && <p role="note" className="mb-5 rounded-2xl border border-[#E6E9F3] bg-[#F7F8FF] px-4 py-3 text-xs font-bold leading-5 text-[#33447A]">זהו ליד שעדיין לא נשמר כרשומת לקוח. עריכת תיק הלקוח תיפתח לאחר יצירת רשומת לקוח.</p>}
    <ClientRemindersSection reminders={reminders} isLoading={isLoadingReminders} loadError={reminderLoadError} completingId={completingReminderId} onRetry={() => void loadReminders()} onComplete={(id) => void handleCompleteReminder(id)} />
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(230px,0.78fr)_minmax(0,1.45fr)_minmax(250px,0.88fr)]" dir="ltr"><SummaryPanel row={row} /><ActivityPanel row={row} /><IdentityPanel row={row} onEdit={openEditor} canEdit={canEdit} /></div>
    <PetMedicalJournal clientKey={row.id} pets={row.pets} editable={canEdit && hasCustomerProfile} hasCustomerProfile={hasCustomerProfile} staffName={staffName} />
    <ClientProfileEditor open={editorOpen} row={row} focusField={editorFocusField} isSaving={isSavingProfile} onClose={() => { setEditorOpen(false); setEditorFocusField(undefined); }} onSave={handleSave} />
    <ClientReminderComposer open={reminderComposerOpen} clientName={row.name} onClose={() => setReminderComposerOpen(false)} onCreate={handleCreateReminder} />
    <ClientEmailComposer open={emailComposerOpen} clientName={row.name} email={row.email} canEditProfile={canEdit} onEditProfile={() => { setEmailComposerOpen(false); openEditor(); }} onClose={() => setEmailComposerOpen(false)} onSent={() => setFeedback({ kind: "success", text: `האימייל נשלח ל-${fieldText(row.email)} בהצלחה.` })} />
  </div>;
}
