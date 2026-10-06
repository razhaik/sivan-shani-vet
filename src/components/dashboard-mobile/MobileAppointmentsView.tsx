import { useState, useMemo } from "react";
import { 
  Search, 
  Filter, 
  ClipboardList, 
  XCircle, 
  CheckCircle2, 
  Clock, 
  CalendarDays
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import MobileApptCard from "./MobileApptCard";
import { cn } from "@/lib/utils";

interface MobileAppointmentsViewProps {
  appointments: any[];
  onConfirm: (app: any) => void;
  onCancel: (app: any) => void;
  confirmingId: string | null;
  cancellingId: string | null;
  isLoading: boolean;
}

const statusFilters = [
  { id: "all", label: "הכל", icon: ClipboardList },
  { id: "requested", label: "ממתינים", icon: Clock },
  { id: "confirmed", label: "מאושרים", icon: CheckCircle2 },
  { id: "cancelled", label: "מבוטלים", icon: XCircle },
];

export default function MobileAppointmentsView({
  appointments,
  onConfirm,
  onCancel,
  confirmingId,
  cancellingId,
  isLoading
}: MobileAppointmentsViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredAppointments = useMemo(() => {
    return appointments
      .filter((app) => {
        const matchesSearch = 
          (app.client_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (app.pet_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (app.phone || "").includes(searchTerm);
        
        const matchesStatus = statusFilter === "all" || app.status === statusFilter;
        
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        // Sort by date desc, then by start_time desc
        const dateA = a.date || "";
        const dateB = b.date || "";
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return (b.start_time || "").localeCompare(a.start_time || "");
      });
  }, [appointments, searchTerm, statusFilter]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Search & Filter Header */}
      <div className="sticky top-[80px] z-30 bg-orange-50/95 backdrop-blur-md pt-2 pb-4 space-y-3 -mx-4 px-4 shadow-sm shadow-orange-100/50">
        <div className="relative group">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-400 transition-colors group-focus-within:text-orange-600" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חיפוש לפי שם, חיה, טלפון..."
            className="h-14 pr-12 pl-4 bg-white border-orange-100 rounded-2xl shadow-sm focus:ring-orange-500 focus:border-orange-500 font-bold"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {statusFilters.map((filter) => {
            const isActive = statusFilter === filter.id;
            const Icon = filter.icon;
            return (
              <button
                key={filter.id}
                onClick={() => setStatusFilter(filter.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 rounded-full whitespace-nowrap text-sm font-black transition-all",
                  isActive 
                    ? "bg-orange-600 text-white shadow-md shadow-orange-200" 
                    : "bg-white text-slate-600 border border-slate-200 hover:border-orange-200"
                )}
              >
                <Icon className={cn("w-4 h-4", isActive ? "text-white" : "text-orange-400")} />
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider">
          {filteredAppointments.length} תורים נמצאו
        </p>
      </div>

      {/* List */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {filteredAppointments.length > 0 ? (
            filteredAppointments.map((app, idx) => (
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
              className="bg-white/50 border-2 border-dashed border-orange-200 rounded-3xl p-12 flex flex-col items-center text-center gap-4 mt-8"
            >
              <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center">
                <Search className="w-8 h-8 text-orange-200" />
              </div>
              <div>
                <p className="text-slate-900 font-black">לא נמצאו תורים</p>
                <p className="text-slate-500 text-sm mt-1 font-medium">נסו לשנות את החיפוש או הסינון</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
