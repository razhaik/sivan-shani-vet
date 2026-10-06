import { useMemo } from "react";
import { Mail, PawPrint, Phone, Search, User, UserPlus, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AggregatedClient, PetSpecies } from "@/lib/clientAggregation";
import { PET_SPECIES_OPTIONS } from "@/pages/AppointmentBooking";
import type { ManagerBookingMode, ManagerCustomerDraft, ClientSelectionHandler } from "./adminAppointmentBookingTypes";

interface AdminCustomerPickerProps {
  clients: AggregatedClient[];
  mode: ManagerBookingMode;
  search: string;
  selectedClientKey: string | null;
  draft: ManagerCustomerDraft;
  onModeChange: (mode: ManagerBookingMode) => void;
  onSearchChange: (value: string) => void;
  onSelectClient: ClientSelectionHandler;
  onDraftChange: (field: keyof ManagerCustomerDraft, value: string) => void;
}

const speciesLabels: Record<PetSpecies, string> = { dog: "כלב", cat: "חתול", other: "אחר", "": "לא ידוע" };

export default function AdminCustomerPicker({
  clients,
  mode,
  search,
  selectedClientKey,
  draft,
  onModeChange,
  onSearchChange,
  onSelectClient,
  onDraftChange,
}: AdminCustomerPickerProps) {
  const matchingClients = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("he");
    const results = query
      ? clients.filter((client) => [client.name, client.phone, client.email].some((value) => value.toLocaleLowerCase("he").includes(query)))
      : clients;
    return results.slice(0, 6);
  }, [clients, search]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="manager-customer-title">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700"><Users className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 id="manager-customer-title" className="font-black text-slate-900">למי קובעים את התור?</h3>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">חפשי לקוח שכבר הופיע בתורים, או עברי להזנת לקוח חדש.</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="סוג לקוח">
        <button type="button" role="tab" aria-selected={mode === "existing"} onClick={() => onModeChange("existing")} className={cn("flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition", mode === "existing" ? "bg-white text-orange-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}><Users className="h-4 w-4" />לקוח קיים</button>
        <button type="button" role="tab" aria-selected={mode === "new"} onClick={() => onModeChange("new")} className={cn("flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition", mode === "new" ? "bg-white text-orange-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}><UserPlus className="h-4 w-4" />לקוח חדש</button>
      </div>

      {mode === "existing" && (
        <div className="mt-4 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="חיפוש לפי שם, טלפון או אימייל" className="h-11 rounded-xl border-slate-200 pr-10" aria-label="חיפוש לקוח" />
          </div>
          {selectedClientKey && <p className="text-xs font-bold text-emerald-700" aria-live="polite">הלקוח שנבחר מסומן בירוק. אפשר להחליף בחיפוש.</p>}
          <div className="grid gap-2">
            {matchingClients.map((client) => {
              const isSelected = selectedClientKey === client.key;
              return (
                <button key={client.key} type="button" onClick={() => onSelectClient(client)} className={cn("rounded-2xl border p-3 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500", isSelected ? "border-emerald-300 bg-emerald-50" : "border-slate-100 bg-slate-50/70 hover:border-orange-200 hover:bg-orange-50/50")} aria-pressed={isSelected}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{client.name}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">{client.phone && <span dir="ltr" className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{client.phone}</span>}{client.email && <span dir="ltr" className="inline-flex max-w-full items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" />{client.email}</span>}</div></div>
                    <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500">{client.appointmentCount} {client.appointmentCount === 1 ? "תור" : "תורים"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{client.pets.slice(0, 3).map((pet) => <span key={pet.key} className="inline-flex items-center gap-1 rounded-full border border-orange-100 bg-white px-2 py-1 text-[10px] font-black text-orange-800"><PawPrint className="h-3 w-3" />{pet.name} · {speciesLabels[pet.species]}</span>)}</div>
                </button>
              );
            })}
            {matchingClients.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs font-bold text-slate-400">לא נמצא לקוח מתאים. עברי ל״לקוח חדש״ כדי להזין פרטים.</p>}
          </div>
          {clients.length > matchingClients.length && <p className="text-[11px] font-medium text-slate-400">מוצגים עד 6 לקוחות. המשיכי להקליד כדי לצמצם את התוצאות.</p>}
        </div>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="mb-3 flex items-center gap-2"><User className="h-4 w-4 text-orange-600" /><h4 className="text-sm font-black text-slate-800">פרטי הלקוח וחיית המחמד</h4></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="text-xs font-black text-slate-600">שם מלא <b className="text-red-500">*</b></span><Input value={draft.name} onChange={(event) => onDraftChange("name", event.target.value)} placeholder="שם הלקוח" autoComplete="name" className="h-11 rounded-xl" /></label>
          <label className="space-y-1.5"><span className="text-xs font-black text-slate-600">טלפון <b className="text-red-500">*</b></span><Input value={draft.phone} onChange={(event) => onDraftChange("phone", event.target.value)} placeholder="05X-XXXXXXX" type="tel" dir="ltr" autoComplete="tel" className="h-11 rounded-xl text-right" /></label>
          <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-black text-slate-600">אימייל <span className="font-medium text-slate-400">(אופציונלי)</span></span><Input value={draft.email} onChange={(event) => onDraftChange("email", event.target.value)} placeholder="name@example.com" type="email" dir="ltr" autoComplete="email" className="h-11 rounded-xl text-right" /></label>
          <label className="space-y-1.5"><span className="text-xs font-black text-slate-600">שם חיית המחמד <b className="text-red-500">*</b></span><Input value={draft.petName} onChange={(event) => onDraftChange("petName", event.target.value)} placeholder="למשל: לוקי" className="h-11 rounded-xl" /></label>
          <fieldset className="space-y-1.5"><legend className="text-xs font-black text-slate-600">סוג חיית המחמד <b className="text-red-500">*</b></legend><div className="grid grid-cols-3 gap-1.5" role="group" aria-label="סוג חיית המחמד">{PET_SPECIES_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={draft.petSpecies === option.value} onClick={() => onDraftChange("petSpecies", option.value)} className={cn("rounded-xl border px-2 py-2.5 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500", draft.petSpecies === option.value ? "border-orange-500 bg-orange-50 text-orange-800" : "border-slate-200 bg-white text-slate-600 hover:border-orange-200")}>{option.label}</button>)}</div></fieldset>
        </div>
      </div>
    </section>
  );
}
