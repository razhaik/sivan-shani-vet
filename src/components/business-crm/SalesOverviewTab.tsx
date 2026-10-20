import { useMemo } from "react";
import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Globe2,
  ReceiptText,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, EmptyState } from "@/components/business-crm/CrmCardPrimitives";
import { StatusPill } from "@/components/business-crm/SettingsPrimitives";
import {
  buildSalesTrend,
  buildServiceBreakdown,
  calculatePeriodMetrics,
  formatSalesRange,
  getComparisonChange,
  type NormalizedSalesAppointment,
  type SalesDateRange,
  type SalesTrendPoint,
} from "@/components/business-crm/salesData";

interface SalesOverviewTabProps {
  appointments: NormalizedSalesAppointment[];
  previousAppointments: NormalizedSalesAppointment[];
  currentRange: SalesDateRange;
  previousRange: SalesDateRange;
  compare: boolean;
  firstVisitDates: ReadonlyMap<string, string>;
  weeklyAvailability: unknown;
  hoursAvailable: boolean;
  now: Date;
  settingsUnavailable?: boolean;
}

const numberFormatter = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });
const oneDecimalFormatter = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 });

function countText(value: number) {
  return numberFormatter.format(value);
}

function percentText(value: number) {
  return `${oneDecimalFormatter.format(value)}%`;
}

function averageText(value: number) {
  return oneDecimalFormatter.format(value);
}

function MetricCard({
  title,
  icon,
  value,
  description,
  comparison,
  compare,
  empty,
}: {
  title: string;
  icon: typeof CalendarDays;
  value: string;
  description: string;
  comparison: ReturnType<typeof getComparisonChange>;
  compare: boolean;
  empty: boolean;
}) {
  const Icon = icon;
  return (
    <Card title={title} icon={Icon} mode="compact">
      {empty ? (
        <EmptyState
          mode="compact"
          icon={CalendarDays}
          title="אין תורים בתקופה"
          body="תורים שיוזמנו במועד הנבחר יוצגו כאן."
        />
      ) : (
        <div className="flex h-full min-w-0 flex-col justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <p className="text-3xl font-black tracking-tight text-[#1A1A3E]">{value}</p>
            {compare && <StatusPill label={comparison.label} tone={comparison.tone} />}
          </div>
          <p className="text-xs font-semibold leading-5 text-slate-500">{description}</p>
        </div>
      )}
    </Card>
  );
}

function trendTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ payload?: SalesTrendPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div dir="rtl" className="min-w-[170px] rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-2 font-extrabold text-[#1A1A3E]">{point.tooltipLabel}</p>
      <div className="space-y-1.5 font-semibold text-slate-600">
        <p className="flex items-center justify-between gap-4"><span>תורים</span><strong className="text-[#5267A8]">{countText(point.appointments)}</strong></p>
        <p className="flex items-center justify-between gap-4"><span>ביטולים</span><strong className="text-slate-700">{countText(point.cancellations)}</strong></p>
        {point.previousAppointments !== null && <p className="flex items-center justify-between gap-4"><span>תקופה קודמת</span><strong className="text-[#1A1A3E]">{countText(point.previousAppointments)}</strong></p>}
      </div>
    </div>
  );
}

function ServiceBreakdown({ appointments }: { appointments: NormalizedSalesAppointment[] }) {
  const services = useMemo(() => buildServiceBreakdown(appointments), [appointments]);
  return (
    <Card title="פילוח לפי שירות" icon={ReceiptText} mode="medium">
      {services.length === 0 ? (
        <EmptyState mode="medium" icon={ReceiptText} title="אין תורים לפילוח" body="כשיהיו תורים בתקופה הנבחרת, הם יתחלקו כאן לפי שם השירות שנשמר בכל תור." />
      ) : (
        <div className="max-h-[300px] space-y-4 overflow-y-auto pl-1">
          {services.map((service) => (
            <div key={service.serviceName} className="min-w-0">
              <div className="mb-1.5 flex min-w-0 items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate font-extrabold text-[#1A1A3E]">{service.serviceName}</span>
                <span className="shrink-0 font-bold text-slate-500">{countText(service.count)} · {percentText(service.percentage)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#EEF0F3]" aria-label={`${service.serviceName}: ${percentText(service.percentage)} מהתורים`}>
                <div className="h-full rounded-full bg-[#5267A8] transition-[width] duration-500" style={{ width: `${Math.max(2, service.percentage)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function SalesOverviewTab({
  appointments,
  previousAppointments,
  currentRange,
  previousRange,
  compare,
  firstVisitDates,
  weeklyAvailability,
  hoursAvailable,
  now,
  settingsUnavailable = false,
}: SalesOverviewTabProps) {
  const currentMetrics = useMemo(
    () => calculatePeriodMetrics(appointments, currentRange, firstVisitDates, weeklyAvailability, { hoursAvailable, now }),
    [appointments, currentRange, firstVisitDates, hoursAvailable, now, weeklyAvailability],
  );
  const previousMetrics = useMemo(
    () => calculatePeriodMetrics(previousAppointments, previousRange, firstVisitDates, weeklyAvailability, { hoursAvailable, now }),
    [firstVisitDates, hoursAvailable, now, previousAppointments, previousRange, weeklyAvailability],
  );
  const trend = useMemo(
    () => buildSalesTrend(appointments, previousAppointments, currentRange, previousRange, compare),
    [appointments, compare, currentRange, previousAppointments, previousRange],
  );
  const hasAppointments = appointments.length > 0;
  const identifiableClients = appointments.some((appointment) => Boolean(appointment.clientId));
  const rangeDescription = formatSalesRange(currentRange);

  const metricCards = [
    {
      title: "סה״כ תורים",
      icon: CalendarDays,
      value: countText(currentMetrics.totalAppointments),
      description: `תורים שנקבעו בין ${rangeDescription}.`,
      comparison: getComparisonChange(currentMetrics.totalAppointments, previousMetrics.totalAppointments),
    },
    {
      title: "ממוצע ליום פעילות",
      icon: Clock3,
      value: currentMetrics.averagePerWorkingDay === null ? "—" : averageText(currentMetrics.averagePerWorkingDay),
      description: currentMetrics.averagePerWorkingDay === null
        ? settingsUnavailable
          ? "שעות הפעילות לא נטענו, לכן לא ניתן לחשב ממוצע ליום עבודה."
          : !hoursAvailable
            ? "לא נשמרו שעות פעילות מלאות במערכת, לכן הממוצע אינו זמין."
            : "לא היו ימי פעילות בתקופה שנבחרה."
        : `מתוך ${countText(currentMetrics.workingDays || 0)} ימי פעילות לפי שעות המרפאה.`,
      comparison: getComparisonChange(currentMetrics.averagePerWorkingDay, previousMetrics.averagePerWorkingDay),
    },
    {
      title: "שיעור הגעה",
      icon: CheckCircle2,
      value: currentMetrics.attendanceRate === null ? "—" : percentText(currentMetrics.attendanceRate),
      description: currentMetrics.attendanceDenominator > 0
        ? `${countText(currentMetrics.attendanceCompleted)} הושלמו מתוך ${countText(currentMetrics.attendanceDenominator)} תורים שמועדם עבר.`
        : "אין עדיין תורים שמועדם עבר עם עדכון הגעה.",
      comparison: getComparisonChange(currentMetrics.attendanceRate, previousMetrics.attendanceRate),
    },
    {
      title: "ביטולים",
      icon: XCircle,
      value: currentMetrics.cancelledRate === null ? "—" : percentText(currentMetrics.cancelledRate),
      description: `${countText(currentMetrics.cancelledCount)} תורים בוטלו מתוך ${countText(currentMetrics.totalAppointments)} בתקופה.`,
      comparison: getComparisonChange(currentMetrics.cancelledRate, previousMetrics.cancelledRate, true),
    },
    {
      title: "לא הגיעו",
      icon: Users,
      value: currentMetrics.noShowRate === null ? "—" : percentText(currentMetrics.noShowRate),
      description: `${countText(currentMetrics.noShowCount)} תורים סומנו כאי-הגעה מתוך ${countText(currentMetrics.totalAppointments)} בתקופה.`,
      comparison: getComparisonChange(currentMetrics.noShowRate, previousMetrics.noShowRate, true),
    },
    {
      title: "לקוחות חדשים",
      icon: UserPlus,
      value: identifiableClients ? countText(currentMetrics.newClients) : "—",
      description: identifiableClients
        ? "לקוחות מזוהים שהתור הראשון שלהם במערכת חל בתקופה."
        : "פרטי הזיהוי בתורים אינם מספיקים כדי לזהות לקוחות חדשים.",
      comparison: getComparisonChange(identifiableClients ? currentMetrics.newClients : null, previousMetrics.newClients),
    },
  ];

  return (
    <div dir="rtl" className="mt-5 min-w-0 space-y-5">
      <section aria-label="מדדי תקופה" className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {metricCards.map((metric) => (
          <MetricCard key={metric.title} {...metric} compare={compare} empty={!hasAppointments} />
        ))}
        <Card title="בקשות תור מהאתר" icon={Globe2} mode="compact">
          <EmptyState
            mode="compact"
            icon={Globe2}
            title="אין נתוני מקור לתורים"
            body="רשומות התורים אינן שומרות אם התור הגיע מהאתר, מהטלפון או מקביעה ידנית. לכן לא ניתן לחשב בקשות מהאתר או שיעור המרה."
          />
          <p className="mt-2 text-center text-[11px] font-semibold leading-5 text-slate-500">המערכת עדיין לא שומרת מקור קביעה, ולכן לא תוצג כאן ספירה או המרה.</p>
        </Card>
      </section>

      <Card title="תורים לאורך זמן" icon={CalendarDays} mode="expanded" className="min-h-[360px]">
        {!hasAppointments ? (
          <EmptyState mode="expanded" icon={CalendarDays} title="אין תורים להצגה בתקופה הזו" body="שינוי התקופה או הסרת מסננים יציגו כאן את מספר התורים והביטולים לאורך זמן." />
        ) : (
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500">קיבוץ לפי {trend.grouping === "day" ? "יום" : trend.grouping === "week" ? "שבוע" : "חודש"} · {rangeDescription}</p>
              {compare && <span className="text-[11px] font-bold text-slate-500">הקו המקווקו מציג את התקופה הקודמת</span>}
            </div>
            <div dir="ltr" className="h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend.points} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#EEF0F3" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#D9DEE5" }} minTickGap={16} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} width={32} tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={trendTooltipContent} cursor={{ fill: "#EEF0F3", opacity: 0.55 }} />
                  <Legend align="right" verticalAlign="top" height={30} wrapperStyle={{ fontSize: 11, color: "#64748B" }} />
                  <Bar dataKey="appointments" name="תורים" fill="#5267A8" maxBarSize={26} radius={[5, 5, 0, 0]} />
                  <Bar dataKey="cancellations" name="ביטולים" fill="#94A3B8" maxBarSize={26} radius={[5, 5, 0, 0]} />
                  {compare && <Line dataKey="previousAppointments" name="תקופה קודמת" type="monotone" stroke="#1A1A3E" strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} connectNulls />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Card>

      <section aria-label="פילוח תורים" className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <ServiceBreakdown appointments={appointments} />
        <Card title="הכנסה משוערת" icon={BadgeDollarSign} mode="medium">
          <div className="mb-3 inline-flex rounded-full border border-[#EEF0F3] bg-[#FBFCFD] px-3 py-1 text-[11px] font-extrabold text-slate-600">משוער · לפי מחירון</div>
          <EmptyState mode="medium" icon={BadgeDollarSign} title="אין מחיר מספרי במחירון" body="המערכת שומרת אם שירות בתשלום והערות תשלום, אך לא סכום בשקלים. לכן לא ניתן לחשב הכנסה משוערת לפי תורים שהושלמו." />
        </Card>
      </section>
    </div>
  );
}
