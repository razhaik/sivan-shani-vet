import { format } from "date-fns";
import { 
  CalendarDays, 
  Clock, 
  User, 
  Phone, 
  Check, 
  X, 
  AlertCircle,
  FileText
} from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MobileApptCardProps {
  app: any;
  onConfirm: (app: any) => void;
  onCancel: (app: any) => void;
  isConfirming: boolean;
  isCancelling: boolean;
}

export default function MobileApptCard({ 
  app, 
  onConfirm, 
  onCancel, 
  isConfirming, 
  isCancelling 
}: MobileApptCardProps) {
  const status = app.status || "requested";
  
  const getStatusConfig = () => {
    switch (status) {
      case "confirmed":
        return {
          label: "מאושר",
          className: "bg-green-100 text-green-700 border-green-200",
          icon: Check
        };
      case "cancelled":
        return {
          label: "בוטל",
          className: "bg-red-100 text-red-700 border-red-200 line-through",
          icon: X
        };
      default:
        return {
          label: "ממתין",
          className: "bg-amber-100 text-amber-700 border-amber-200",
          icon: AlertCircle
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  const formattedDate = (() => {
    if (!app.date) return "-";
    try {
      const d = new Date(app.date);
      if (isNaN(d.getTime())) return app.date;
      return format(d, "dd/MM/yyyy");
    } catch {
      return app.date || "-";
    }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-sm border border-orange-100/50 p-4 relative overflow-hidden group active:scale-[0.98] transition-transform"
      dir="rtl"
    >
      {/* Status Badge */}
      <div className="flex justify-between items-start mb-3">
        <div className="text-right">
          <h3 className="text-xl font-black text-slate-900 leading-tight">
            {app.pet_name || "חיית מחמד"}
          </h3>
          <p className="text-sm text-slate-500 font-bold">
            {app.appointment_type || "בדיקה כללית"}
          </p>
        </div>
        <Badge className={cn("rounded-full px-2 py-0.5 text-[10px] font-black border", config.className)}>
          <StatusIcon className="w-3 h-3 ml-1" />
          {config.label}
        </Badge>
      </div>

      {/* Date & Time Pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-xl text-xs font-black">
          <CalendarDays className="w-3.5 h-3.5" />
          {formattedDate}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-xl text-xs font-black">
          <Clock className="w-3.5 h-3.5" />
          {app.start_time} - {app.end_time}
        </div>
      </div>

      {/* Client Info */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-slate-600">
          <User className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-bold">{app.client_name || "לקוח ללא שם"}</span>
        </div>
        {app.phone && (
          <a 
            href={`tel:${app.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 text-orange-600 active:text-orange-700"
          >
            <Phone className="w-4 h-4" />
            <span className="text-sm font-black underline underline-offset-4">{app.phone}</span>
          </a>
        )}
      </div>

      {/* Notes */}
      {app.notes && (
        <div className="mb-4 p-3 bg-orange-50/50 rounded-xl border border-orange-100/30">
          <div className="flex items-start gap-2">
            <FileText className="w-3.5 h-3.5 text-orange-400 mt-0.5" />
            <p className="text-xs text-slate-600 font-medium italic leading-relaxed">
              {app.notes}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {status === "requested" && (
          <>
            <Button
              onClick={() => onConfirm(app)}
              disabled={isConfirming || isCancelling}
              className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-sm shadow-sm"
            >
              {isConfirming ? "מאשר..." : "אשר תור"}
            </Button>
            <Button
              onClick={() => onCancel(app)}
              disabled={isConfirming || isCancelling}
              variant="outline"
              className="px-4 h-12 border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-black text-sm"
            >
              {isCancelling ? "מבטל..." : "בטל"}
            </Button>
          </>
        )}
        {status === "confirmed" && (
          <Button
            onClick={() => onCancel(app)}
            disabled={isConfirming || isCancelling}
            variant="outline"
            className="w-full h-12 border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-black text-sm"
          >
            {isCancelling ? "מבטל תור..." : "ביטול התור"}
          </Button>
        )}
        {status === "cancelled" && (
          <div className="w-full text-center py-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            התור מבוטל
          </div>
        )}
      </div>
    </motion.div>
  );
}
