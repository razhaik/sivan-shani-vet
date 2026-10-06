import { useState, useMemo } from "react";
import { format, parseISO, isSameDay, addMonths, subMonths } from "date-fns";
import { he } from "date-fns/locale";
import { 
  Calendar as CalendarIcon, 
  ChevronRight, 
  ChevronLeft, 
  CalendarDays,
  PawPrint 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar } from "@/components/ui/calendar";
import MobileApptCard from "./MobileApptCard";
import { cn } from "@/lib/utils";

interface MobileScheduleViewProps {
  appointments: any[];
  onConfirm: (app: any) => void;
  onCancel: (app: any) => void;
  confirmingId: string | null;
  cancellingId: string | null;
}

export default function MobileScheduleView({
  appointments,
  onConfirm,
  onCancel,
  confirmingId,
  cancellingId
}: MobileScheduleViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  const datesWithAppointments = useMemo(() => {
    if (!Array.isArray(appointments)) return [];
    return appointments
      .filter(app => app?.date && app.status !== "cancelled")
      .map(app => {
        try {
          return parseISO(app.date);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean) as Date[];
  }, [appointments]);

  const dayAppointments = useMemo(() => {
    if (!selectedDate || !Array.isArray(appointments)) return [];
    return appointments
      .filter(app => {
        if (!app?.date) return false;
        try {
          return isSameDay(parseISO(app.date), selectedDate);
        } catch (e) {
          return false;
        }
      })
      .sort((a, b) => (a?.start_time || "").localeCompare(b?.start_time || ""));
  }, [appointments, selectedDate]);

  const handleMonthChange = (direction: 'next' | 'prev') => {
    setCurrentMonth(prev => direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1));
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Calendar Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-4 shadow-xl shadow-orange-100 border border-orange-100"
      >
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-black text-slate-900">
              {format(currentMonth, "MMMM yyyy", { locale: he })}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => handleMonthChange('next')}
              className="p-2 hover:bg-orange-50 rounded-xl transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-orange-600" />
            </button>
            <button 
              onClick={() => handleMonthChange('prev')}
              className="p-2 hover:bg-orange-50 rounded-xl transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-orange-600" />
            </button>
          </div>
        </div>

        <div className="pointer-events-auto">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            locale={he}
            dir="rtl"
            className="p-0 rounded-none w-full border-none"
            classNames={{
              month: "space-y-4",
              caption: "hidden",
              head_row: "flex w-full justify-around",
              head_cell: "text-slate-400 font-black text-[11px] uppercase w-10",
              row: "flex w-full mt-2 justify-around",
              cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 w-10 h-10",
              day: cn(
                "h-10 w-10 p-0 font-black rounded-xl transition-all flex items-center justify-center",
                "hover:bg-orange-50 hover:text-orange-600"
              ),
              day_selected: "bg-orange-600 text-white hover:bg-orange-600 hover:text-white shadow-lg shadow-orange-200",
              day_today: "text-orange-600 ring-2 ring-orange-100",
              day_outside: "text-slate-300 opacity-50",
              day_disabled: "text-slate-300 opacity-50",
              day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
              day_hidden: "invisible",
            }}
            modifiers={{
              hasAppointment: datesWithAppointments
            }}
            modifiersStyles={{
              hasAppointment: { 
                backgroundColor: '#fff7ed', 
                color: '#ea580c',
                border: '1px solid #ffedd5'
              }
            }}
          />
        </div>
      </motion.div>

      {/* Selected Day List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-black text-slate-900">
              {selectedDate ? format(selectedDate, "dd/MM/yyyy") : "בחר תאריך"}
            </h2>
          </div>
          <div className="bg-orange-600 text-white px-3 py-1 rounded-full text-xs font-black">
            {dayAppointments.length} תורים
          </div>
        </div>

        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {dayAppointments.length > 0 ? (
              dayAppointments.map((app, idx) => (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  layout
                >
                  <MobileApptCard
                    app={app}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                    isConfirming={confirmingId === app.id}
                    isCancelling={cancellingId === app.id}
                  />
                </motion.div>
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white/50 border-2 border-dashed border-orange-200 rounded-3xl p-10 flex flex-col items-center text-center gap-3"
              >
                <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <PawPrint className="w-7 h-7 text-orange-200" />
                </div>
                <div>
                  <p className="text-slate-900 font-black">אין תורים לתאריך זה</p>
                  <p className="text-slate-500 text-sm font-medium mt-1">אולי כדאי לנוח קצת?</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
