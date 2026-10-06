import { useMemo } from "react";
import { format, isToday, parseISO } from "date-fns";
import { 
  CalendarDays, 
  AlertCircle, 
  Loader2, 
  PawPrint 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import MobileApptCard from "./MobileApptCard";

interface MobileTodayViewProps {
  appointments: any[];
  onConfirm: (app: any) => void;
  onCancel: (app: any) => void;
  confirmingId: string | null;
  cancellingId: string | null;
  isLoading: boolean;
}

export default function MobileTodayView({
  appointments,
  onConfirm,
  onCancel,
  confirmingId,
  cancellingId,
  isLoading
}: MobileTodayViewProps) {
  
  const todayAppointments = useMemo(() => {
    if (!Array.isArray(appointments)) return [];
    return appointments
      .filter(app => {
        if (!app?.date) return false;
        try {
          return isToday(parseISO(app.date)) && app.status !== "cancelled";
        } catch (e) {
          return false;
        }
      })
      .sort((a, b) => (a?.start_time || "").localeCompare(b?.start_time || ""));
  }, [appointments]);

  const pendingAppointments = useMemo(() => {
    if (!Array.isArray(appointments)) return [];
    return appointments
      .filter(app => app?.status === "requested")
      .sort((a, b) => (a?.date || "").localeCompare(b?.date || ""));
  }, [appointments]);

  const stats = {
    todayCount: todayAppointments.length,
    pendingCount: pendingAppointments.length
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
        <p className="text-slate-500 font-bold">טוען נתונים...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-gradient-to-br from-orange-600 to-red-600 p-4 rounded-2xl text-white shadow-md shadow-orange-200"
        >
          <div className="text-3xl font-black mb-1">{stats.todayCount}</div>
          <div className="text-[11px] font-black opacity-90 uppercase tracking-wide">תורים היום</div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-amber-500 p-4 rounded-2xl text-white shadow-md shadow-amber-100"
        >
          <div className="text-3xl font-black mb-1">{stats.pendingCount}</div>
          <div className="text-[11px] font-black opacity-90 uppercase tracking-wide">ממתינים לאישור</div>
        </motion.div>
      </div>

      {/* Today's Schedule */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-5 h-5 text-orange-600" />
          <h2 className="text-lg font-black text-slate-900">תורים להיום</h2>
        </div>
        
        <div className="space-y-3">
          {todayAppointments.length > 0 ? (
            <AnimatePresence mode="popLayout">
              {todayAppointments.map((app, idx) => (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <MobileApptCard
                    app={app}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                    isConfirming={confirmingId === app.id}
                    isCancelling={cancellingId === app.id}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-orange-50/50 rounded-3xl border-2 border-dashed border-orange-200 p-10 flex flex-col items-center text-center gap-3"
            >
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm">
                <PawPrint className="w-8 h-8 text-orange-200" />
              </div>
              <div>
                <p className="text-slate-900 font-black">אין תורים להיום</p>
                <p className="text-slate-500 text-sm font-medium mt-1">יום שקט במרפאה... בינתיים</p>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* Pending Requests */}
      {pendingAppointments.length > 0 && (
        <section className="pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-black text-slate-900">ממתינים לאישור</h2>
          </div>
          
          <div className="space-y-3">
            {pendingAppointments.map((app, idx) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (todayAppointments.length + idx) * 0.05 }}
              >
                <MobileApptCard
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
}
