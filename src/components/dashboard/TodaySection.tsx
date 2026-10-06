import React, { useMemo } from "react";
import { format, isToday, parseISO } from "date-fns";
import { CalendarDays, AlertCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import AppointmentCard from "./AppointmentCard";

interface TodaySectionProps {
  appointments: any[];
  onConfirm: (app: any) => void;
  onCancel: (app: any) => void;
  confirmingId: string | null;
  cancellingId: string | null;
  isLoading: boolean;
}

const TodaySection: React.FC<TodaySectionProps> = ({
  appointments = [],
  onConfirm,
  onCancel,
  confirmingId,
  cancellingId,
  isLoading,
}) => {
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const todayAppointments = useMemo(() => {
    return appointments
      .filter((app) => app.date === todayStr && app.status !== "cancelled")
      .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  }, [appointments, todayStr]);

  const pendingAppointments = useMemo(() => {
    return appointments
      .filter((app) => app.status === "requested")
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [appointments]);

  const stats = {
    todayCount: todayAppointments.filter(app => app.status === "confirmed").length,
    pendingTotal: pendingAppointments.length,
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-slate-500 font-medium">טוען נתונים להיום...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      {/* Summary Stats */}
      <div className="flex gap-3">
        <div className="flex-1 bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-600/20">
          <p className="text-[11px] font-bold opacity-80 mb-1">תורים מאושרים היום</p>
          <p className="text-2xl font-black">{stats.todayCount}</p>
        </div>
        <div className="flex-1 bg-amber-500 rounded-2xl p-4 text-white shadow-lg shadow-amber-500/20">
          <p className="text-[11px] font-bold opacity-80 mb-1">ממתינים לאישור</p>
          <p className="text-2xl font-black">{stats.pendingTotal}</p>
        </div>
      </div>

      {/* Today's Appointments */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xl font-black text-slate-900">תורים להיום</h2>
          <span className="text-xs font-bold text-slate-400">{format(new Date(), "dd/MM/yyyy")}</span>
        </div>
        
        {todayAppointments.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-100 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
              <CalendarDays className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-slate-400 font-bold">אין תורים להיום</p>
          </div>
        ) : (
          <div className="space-y-4">
            {todayAppointments.map((app, idx) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
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
            ))}
          </div>
        )}
      </section>

      {/* Pending Appointments (Any Date) */}
      {pendingAppointments.length > 0 && (
        <section className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 px-1 text-amber-700">
            <AlertCircle className="w-5 h-5" />
            <h2 className="text-xl font-black">ממתינים לאישור</h2>
          </div>
          
          <div className="space-y-4">
            {pendingAppointments.map((app, idx) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
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
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default TodaySection;
