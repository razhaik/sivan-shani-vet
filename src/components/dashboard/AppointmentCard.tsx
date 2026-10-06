import React from "react";
import { format } from "date-fns";
import { Calendar, Clock, User, Phone, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AppointmentCardProps {
  app: any;
  onConfirm: (app: any) => void;
  onCancel: (app: any) => void;
  isConfirming: boolean;
  isCancelling: boolean;
}

const AppointmentCard: React.FC<AppointmentCardProps> = ({
  app,
  onConfirm,
  onCancel,
  isConfirming,
  isCancelling,
}) => {
  const status = app.status || "requested";
  const isCancelled = status === "cancelled";
  const isRequested = status === "requested";
  const isConfirmed = status === "confirmed";

  const getStatusBadge = () => {
    switch (status) {
      case "confirmed":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold px-2 py-0.5 rounded-full">
            מאושר
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-50 text-red-700 border-red-100 font-bold px-2 py-0.5 rounded-full">
            מבוטל
          </Badge>
        );
      default:
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-100 font-bold px-2 py-0.5 rounded-full">
            ממתין
          </Badge>
        );
    }
  };

  const formattedDate = app.date ? format(new Date(app.date), "dd/MM/yyyy") : "---";

  return (
    <Card className={cn(
      "p-4 rounded-2xl shadow-sm border border-slate-100 bg-white transition-all",
      isCancelled && "opacity-75 grayscale-[0.5]"
    )}>
      {/* Top Row: Pet & Status */}
      <div className="flex justify-between items-start mb-3">
        <div className="text-right">
          <h3 className={cn("text-lg font-black text-blue-950", isCancelled && "line-through")}>
            {app.pet_name || "ללא שם"}
          </h3>
          <p className="text-xs text-slate-500 font-medium">{app.appointment_type}</p>
        </div>
        {getStatusBadge()}
      </div>

      {/* Middle Row: Date & Time */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="flex items-center gap-2 text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100/50">
          <Calendar className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-xs font-bold">{formattedDate}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100/50">
          <Clock className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-xs font-bold">{app.start_time}</span>
        </div>
      </div>

      {/* Info Row: Client & Phone */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-slate-700">
          <User className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-bold">{app.client_name}</span>
        </div>
        {app.phone && (
          <a 
            href={`tel:${app.phone}`} 
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors"
          >
            <Phone className="w-4 h-4" />
            <span className="text-sm font-black" dir="ltr">{app.phone}</span>
          </a>
        )}
      </div>

      {/* Notes */}
      {app.notes && (
        <div className="mb-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100/30">
          <p className="text-xs text-slate-600 font-medium leading-relaxed">{app.notes}</p>
        </div>
      )}

      {/* Action Row */}
      {!isCancelled && (
        <div className="flex gap-2">
          {isRequested && (
            <Button
              variant="default"
              className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/20"
              onClick={() => onConfirm(app)}
              disabled={isConfirming}
            >
              {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : "אשר תור"}
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1 h-11 border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl font-bold"
            onClick={() => onCancel(app)}
            disabled={isCancelling}
          >
            {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : "בטל תור"}
          </Button>
        </div>
      )}
    </Card>
  );
};

export default AppointmentCard;
