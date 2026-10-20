import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { BarChart3, CalendarDays, Check, ChevronDown, Filter, MessageSquare, ReceiptText, Users, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StatusPill } from "@/components/business-crm/SettingsPrimitives";
import {
  formatSalesRange,
  type SalesCustomRange,
  type SalesFilters,
  type SalesPeriod,
  type SalesStatus,
} from "@/components/business-crm/salesData";

export type SalesReportTab = "overview" | "appointments" | "services" | "customers" | "inquiries";

export interface SalesServiceOption {
  id: string;
  name: string;
}

interface SalesTopBarProps {
  activeTab: SalesReportTab;
  onTabChange: (tab: SalesReportTab) => void;
  period: SalesPeriod;
  onPeriodChange: (period: SalesPeriod) => void;
  customRange: SalesCustomRange;
  onCustomRangeChange: (range: SalesCustomRange) => void;
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
  filters: SalesFilters;
  onFiltersChange: (filters: SalesFilters) => void;
  services: SalesServiceOption[];
  rangeLabel: string;
}

const periodOptions: Array<{ value: SalesPeriod; label: string }> = [
  { value: "today", label: "היום" },
  { value: "week", label: "השבוע" },
  { value: "month", label: "החודש" },
  { value: "quarter", label: "רבעון" },
  { value: "year", label: "השנה" },
  { value: "custom", label: "טווח מותאם" },
];

const statusOptions: Array<{ value: SalesStatus; label: string }> = [
  { value: "ממתין", label: "ממתין" },
  { value: "מאושר", label: "מאושר" },
  { value: "הושלם", label: "הושלם" },
  { value: "בוטל", label: "בוטל" },
  { value: "לא הגיע", label: "לא הגיע" },
  { value: "ממתין לעדכון", label: "ממתין לעדכון" },
  { value: "לא ידוע", label: "לא ידוע" },
];

const reportTabs: Array<{ value: SalesReportTab; label: string; icon: LucideIcon }> = [
  { value: "overview", label: "סקירה", icon: BarChart3 },
  { value: "appointments", label: "תורים", icon: CalendarDays },
  { value: "services", label: "שירותים", icon: ReceiptText },
  { value: "customers", label: "לקוחות", icon: Users },
  { value: "inquiries", label: "פניות", icon: MessageSquare },
];

function localDateFromKey(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function dateKeyFromLocalDate(value: Date): string {
  return format(value, "yyyy-MM-dd", { locale: he });
}

function freshFilters(): SalesFilters {
  return { serviceNames: [], status: "all", clientType: "all", species: "all" };
}

function filterHelperText(tab: SalesReportTab): string {
  if (tab === "overview") return "המסננים מעדכנים יחד את מדדי התורים ואת התרשים.";
  if (tab === "appointments") return "המסננים חלים על התורים שמוצגים ברשימה.";
  if (tab === "services") return "המסננים קובעים אילו תורים נכללים בפילוח השירותים.";
  return "מסנני התורים מעדכנים את ספירת התורים בלבד. פניות ורשומות לקוח מוצגות לפי התקופה.";
}

function rangeBasis(tab: SalesReportTab): string {
  if (tab === "inquiries") return "לפי מועד יצירת הפנייה";
  if (tab === "customers") return "לפי הפעילות המתועדת";
  return "לפי מועד התור";
}

export function SalesTopBar({
  activeTab,
  onTabChange,
  period,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
  compare,
  onCompareChange,
  filters,
  onFiltersChange,
  services,
  rangeLabel,
}: SalesTopBarProps) {
  const [customCalendarOpen, setCustomCalendarOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeFilterCount = useMemo(() => [
    filters.serviceNames.length > 0,
    filters.status !== "all",
    filters.clientType !== "all",
    filters.species !== "all",
  ].filter(Boolean).length, [filters]);
  const selectedRange = useMemo<DateRange | undefined>(() => ({
    from: localDateFromKey(customRange.start),
    to: localDateFromKey(customRange.end),
  }), [customRange.end, customRange.start]);
  const showCompare = activeTab === "overview";
  const showAppointmentFilters = activeTab !== "inquiries";

  function handlePeriodChange(value: string) {
    const next = value as SalesPeriod;
    onPeriodChange(next);
    if (next === "custom") setCustomCalendarOpen(true);
  }

  function handleCustomRangeSelect(nextRange: DateRange | undefined) {
    const start = nextRange?.from ? dateKeyFromLocalDate(nextRange.from) : null;
    const end = nextRange?.to ? dateKeyFromLocalDate(nextRange.to) : start;
    if (!start) return;
    onCustomRangeChange({ start, end });
    onPeriodChange("custom");
    if (nextRange?.from && nextRange?.to) setCustomCalendarOpen(false);
  }

  function toggleService(name: string, checked: boolean) {
    const nextNames = checked
      ? Array.from(new Set([...filters.serviceNames, name]))
      : filters.serviceNames.filter((item) => item !== name);
    onFiltersChange({ ...filters, serviceNames: nextNames });
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft") nextIndex = (index + 1) % reportTabs.length;
    else if (event.key === "ArrowRight") nextIndex = (index - 1 + reportTabs.length) % reportTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = reportTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    onTabChange(reportTabs[nextIndex].value);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <section dir="rtl" className="min-w-0 space-y-4" aria-labelledby="sales-title">
      <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 id="sales-title" className="text-3xl font-black tracking-tight text-[#1A1A3E] sm:text-4xl">מכירות ונתונים</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">תמונת מצב של התורים, השירותים, הלקוחות והפניות במרפאה</p>
        </div>
      </header>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div role="tablist" aria-label="דוחות מכירות ונתונים" aria-orientation="horizontal" className="flex min-w-max gap-2">
          {reportTabs.map(({ value, label, icon: Icon }, index) => {
            const selected = activeTab === value;
            return (
              <button
                key={value}
                ref={(element) => { tabRefs.current[index] = element; }}
                id={`sales-tab-${value}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`sales-panel-${value}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onTabChange(value)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D162] focus-visible:ring-offset-2 ${selected ? "border-[#1A1A3E] bg-[#1A1A3E] text-white shadow-sm" : "border-[#E5E7EB] bg-white text-slate-600 hover:border-[#C8CFDA] hover:bg-[#FBFCFD] hover:text-[#1A1A3E]"}`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-[#F2D162]" : "text-[#5267A8]"}`} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 rounded-[14px] border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_24px_-22px_rgba(26,26,62,0.55)] sm:p-4">
        <div className={`grid min-w-0 grid-cols-1 gap-3 ${showCompare ? "lg:grid-cols-[minmax(0,1fr)_auto_auto]" : "lg:grid-cols-[minmax(0,1fr)_auto]"} lg:items-center`}>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <span className="shrink-0 text-xs font-extrabold text-slate-500">תקופה</span>
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
              <Select value={period} onValueChange={handlePeriodChange}>
                <SelectTrigger aria-label="בחירת תקופה" className="h-10 w-full rounded-xl border-[#D9DEE5] bg-white text-xs font-extrabold text-[#1A1A3E] focus:ring-[#5267A8] sm:w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {periodOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {period === "custom" && (
                <Popover open={customCalendarOpen} onOpenChange={setCustomCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="min-h-10 min-w-0 justify-start gap-2 rounded-xl border-[#D9DEE5] bg-white px-3 text-xs font-extrabold text-[#1A1A3E] hover:border-[#5267A8] hover:bg-[#FBFCFD]">
                      <CalendarDays className="h-4 w-4 shrink-0 text-[#5267A8]" aria-hidden="true" />
                      <span className="truncate">{customRange.start && customRange.end ? formatSalesRange({ start: customRange.start, end: customRange.end }) : "בחירת תאריכים"}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] rounded-2xl border-[#E5E7EB] bg-white p-3 shadow-lg">
                    <div className="pointer-events-auto">
                      <Calendar
                        mode="range"
                        selected={selectedRange}
                        onSelect={handleCustomRangeSelect}
                        locale={he}
                        weekStartsOn={0}
                        numberOfMonths={1}
                        className="pointer-events-auto"
                      />
                    </div>
                    <p className="px-3 pb-2 text-[11px] font-semibold leading-5 text-slate-500">בחרי תאריך התחלה ותאריך סיום. הנתונים יתעדכנו אחרי בחירת הטווח.</p>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          {showCompare && (
            <div className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] px-3 py-2 sm:justify-start">
              <label htmlFor="sales-compare-switch" className="min-w-0 text-xs font-extrabold leading-5 text-[#1A1A3E]">השוואה לתקופה הקודמת</label>
              <Switch id="sales-compare-switch" checked={compare} onCheckedChange={onCompareChange} aria-label="השוואה לתקופה הקודמת" />
            </div>
          )}

          {showAppointmentFilters && (
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" aria-expanded={filtersOpen} aria-label={activeFilterCount ? `סינון תורים, ${activeFilterCount} מסננים פעילים` : "סינון נתוני התורים"} className="min-h-10 justify-center gap-2 rounded-xl border-[#D9DEE5] bg-white px-4 text-xs font-extrabold text-[#1A1A3E] hover:border-[#5267A8] hover:bg-[#FBFCFD] lg:min-w-[120px]">
                  <Filter className="h-4 w-4 text-[#5267A8]" aria-hidden="true" />
                  סינון תורים
                  {activeFilterCount > 0 && <StatusPill label={String(activeFilterCount)} tone="neutral" className="px-2 py-0.5" />}
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-4 rounded-2xl border-[#E5E7EB] bg-white p-4 shadow-lg">
                <div className="flex items-center justify-between gap-3 border-b border-[#EEF0F3] pb-3">
                  <div>
                    <p className="text-sm font-extrabold text-[#1A1A3E]">סינון התורים</p>
                    <p className="mt-0.5 text-[11px] font-medium leading-5 text-slate-500">{filterHelperText(activeTab)}</p>
                  </div>
                  {activeFilterCount > 0 && <Button type="button" variant="ghost" onClick={() => onFiltersChange(freshFilters())} className="h-8 shrink-0 gap-1 rounded-lg px-2 text-xs font-extrabold text-[#5267A8] hover:bg-[#FBFCFD]">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />נקה
                  </Button>}
                </div>

                <fieldset className="space-y-2">
                  <legend className="mb-2 text-xs font-extrabold text-[#1A1A3E]">שירות</legend>
                  {services.length === 0 ? <p className="rounded-xl bg-[#FBFCFD] px-3 py-3 text-xs font-semibold leading-5 text-slate-500">לא נמצאו שירותים בקטלוג או בתורים.</p> : <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] p-2">
                    {services.map((service) => {
                      const checked = filters.serviceNames.includes(service.name);
                      return <label key={`${service.id}-${service.name}`} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-bold text-slate-700 transition hover:bg-white">
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleService(service.name, value === true)} aria-label={`סינון לפי ${service.name}`} />
                        <span className="min-w-0 flex-1 truncate">{service.name}</span>
                        {checked && <Check className="h-3.5 w-3.5 shrink-0 text-[#5267A8]" aria-hidden="true" />}
                      </label>;
                    })}
                  </div>}
                  <p className="text-[10px] font-medium leading-4 text-slate-500">הסינון משתמש בשם השירות שנשמר בכל תור.</p>
                </fieldset>

                <label className="block space-y-1.5">
                  <span className="text-xs font-extrabold text-[#1A1A3E]">סטטוס</span>
                  <Select value={filters.status} onValueChange={(value) => onFiltersChange({ ...filters, status: value as SalesFilters["status"] })}>
                    <SelectTrigger className="h-10 w-full rounded-xl border-[#D9DEE5] bg-white text-xs font-extrabold text-[#1A1A3E] focus:ring-[#5267A8]"><SelectValue /></SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="all">כל הסטטוסים</SelectItem>
                      {statusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-extrabold text-[#1A1A3E]">סוג לקוח</span>
                  <Select value={filters.clientType} onValueChange={(value) => onFiltersChange({ ...filters, clientType: value as SalesFilters["clientType"] })}>
                    <SelectTrigger className="h-10 w-full rounded-xl border-[#D9DEE5] bg-white text-xs font-extrabold text-[#1A1A3E] focus:ring-[#5267A8]"><SelectValue /></SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="all">לקוחות חדשים וחוזרים</SelectItem>
                      <SelectItem value="new">לקוחות חדשים</SelectItem>
                      <SelectItem value="returning">לקוחות חוזרים</SelectItem>
                    </SelectContent>
                  </Select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-extrabold text-[#1A1A3E]">סוג חיה</span>
                  <Select value={filters.species} onValueChange={(value) => onFiltersChange({ ...filters, species: value as SalesFilters["species"] })}>
                    <SelectTrigger className="h-10 w-full rounded-xl border-[#D9DEE5] bg-white text-xs font-extrabold text-[#1A1A3E] focus:ring-[#5267A8]"><SelectValue /></SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="all">כל סוגי החיות</SelectItem>
                      <SelectItem value="dog">כלבים</SelectItem>
                      <SelectItem value="cat">חתולים</SelectItem>
                      <SelectItem value="other">אחר</SelectItem>
                      <SelectItem value="unknown">לא ידוע</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#EEF0F3] pt-3 text-[11px] font-semibold text-slate-500">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#5267A8]" aria-hidden="true" />
          <span className="min-w-0">התקופה הנבחרת: {rangeLabel}</span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>{rangeBasis(activeTab)}</span>
          {activeTab === "inquiries" && <span className="mr-auto inline-flex items-center gap-1 text-[10px] font-bold text-slate-400"><MessageSquare className="h-3 w-3" aria-hidden="true" />מסנני התורים אינם חלים כאן</span>}
        </div>
      </div>
    </section>
  );
}
