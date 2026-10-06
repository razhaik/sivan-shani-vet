import React, { useState, useMemo } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, ChevronRight, ChevronLeft } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import AppointmentCard from "./AppointmentCard";

interface MobileScheduleProps {
  appointments: any[];
  onConfirm: (app: any) => void;
  onCancel: (app: any) => void;
  confirmingId: string | null;
  cancellingId: string | null;
}

const MobileSchedule: React.FC<MobileScheduleProps> = ({
  appointments = [],
  onConfirm,
  onCancel,
  confirmingId,
  cancellingId,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const datesWithAppointments = useMemo(() => {
    const dates = appointments
      .filter(app => app.status !== 'cancelled')
      .map(app => app.date ? parseISO(app.date) : null)
      .filter(Boolean) as Date[];
    return dates;
  }, [appointments]);

  const selectedDateAppointments = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    return appointments
      .filter((app) => app.date === dateStr)
      .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  }, [appointments, selectedDate]);

  const formattedSelectedDate = selectedDate ? format(selectedDate, "dd/MM/yyyy") : "";

  return (
    <div className="space-y-6 pb-20">
      {/* Calendar Header */}
      <div className="px-1 flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-blue-600" />
          לוח זמנים
        </h2>
      </div>

      {/* Calendar Card */}
      <div className="bg-white rounded-3xl p-4 shadow-xl shadow-blue-900/5 border border-slate-100 overflow-hidden" dir="rtl">
        <div className="pointer-events-auto">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            locale={he}
            className="p-0 w-full"
            modifiers={{
              hasAppointment: datesWithAppointments,
            }}
            modifiersStyles={{
              hasAppointment: { 
                backgroundColor: '#dbeafe', 
                borderRadius: '50%', 
                fontWeight: 800,
                color: '#2563eb'
              },
            }}
          />
        </div>
      </div>

      {/* Selected Day View */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-slate-900">תורים ל-{formattedSelectedDate}</h3>
            {selectedDateAppointments.length > 0 && (
              <Badge className="bg-blue-600 text-white font-bold rounded-full">
                {selectedDateAppointments.length}
              </Badge>
            )}
          </div>
          <Clock className="w-4 h-4 text-slate-400" />
        </div>

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {selectedDateAppointments.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-50/50 rounded-2xl p-10 text-center border border-dashed border-slate-200"
              >
                <p className="text-slate-400 font-bold">אין תורים לתאריך זה</p>
              </motion.div>
            ) : (
              selectedDateAppointments.map((app, idx) => (
                <motion.div
                  key={app.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <AppointmentCard
                    app={app}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                    isConfirming={confirmingId === app.id}
                    isCancelling={cancellingId === app.id}
                  />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
};

export default MobileSchedule;
