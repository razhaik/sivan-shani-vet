import React, { useState, useMemo } from "react";
import { Search, Filter, ClipboardList, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import AppointmentCard from "./AppointmentCard";
import { cn } from "@/lib/utils";

interface MobileAppointmentsListProps {
  appointments: any[];
  onConfirm: (app: any) => void;
  onCancel: (app: any) => void;
  confirmingId: string | null;
  cancellingId: string | null;
  isLoading: boolean;
}

const MobileAppointmentsList: React.FC<MobileAppointmentsListProps> = ({
  appointments = [],
  onConfirm,
  onCancel,
  confirmingId,
  cancellingId,
  isLoading,
}) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredAppointments = useMemo(() => {
    return appointments
      .filter((app) => {
        const matchesSearch = 
          (app.client_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
          (app.pet_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
          (app.phone || "").includes(search);
        
        const matchesStatus = 
          statusFilter === "all" || 
          (statusFilter === "pending" && app.status === "requested") ||
          (statusFilter === "confirmed" && app.status === "confirmed") ||
          (statusFilter === "cancelled" && app.status === "cancelled");

        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        // Sort by date desc, then start_time desc
        const dateCompare = (b.date || "").localeCompare(a.date || "");
        if (dateCompare !== 0) return dateCompare;
        return (b.start_time || "").localeCompare(a.start_time || "");
      });
  }, [appointments, search, statusFilter]);

  const filterOptions = [
    { id: "all", label: "הכל" },
    { id: "pending", label: "ממתינים" },
    { id: "confirmed", label: "מאושרים" },
    { id: "cancelled", label: "מבוטלים" },
  ];

  if (isLoading && appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-slate-500 font-medium">טוען תורים...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header & Stats */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-blue-600" />
          רשימת תורים
        </h2>
        <Badge variant="secondary" className="bg-blue-50 text-blue-700 font-bold px-3 py-1 rounded-full">
          {filteredAppointments.length} תורים
        </Badge>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3 sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, חיה, טלפון..."
            className="pr-10 h-12 rounded-2xl border-slate-200 bg-white shadow-sm focus-visible:ring-blue-500 transition-all"
            dir="rtl"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide no-scrollbar">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setStatusFilter(opt.id)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all border",
                statusFilter === opt.id
                  ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-200"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {filteredAppointments.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-2xl p-12 text-center border border-slate-100 space-y-3"
            >
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                <Filter className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-400 font-bold text-lg">לא נמצאו תורים</p>
              <Button 
                variant="link" 
                onClick={() => { setSearch(""); setStatusFilter("all"); }}
                className="text-blue-600 font-bold"
              >
                איפוס חיפוש
              </Button>
            </motion.div>
          ) : (
            filteredAppointments.map((app, idx) => (
              <motion.div
                key={app.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: Math.min(idx * 0.05, 0.5) }}
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
    </div>
  );
};

export default MobileAppointmentsList;
