import React, { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Search, User, Phone, Mail, ChevronDown, ChevronUp, History, PawPrint, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface MobileClientsListProps {
  clients: any[];
  appointments: any[];
  isLoading: boolean;
}

const MobileClientsList: React.FC<MobileClientsListProps> = ({
  clients = [],
  appointments = [],
  isLoading,
}) => {
  const [search, setSearch] = useState("");
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const searchLower = search.toLowerCase();
      return (
        (client.full_name?.toLowerCase() || "").includes(searchLower) ||
        (client.phone || "").includes(searchLower) ||
        (client.email?.toLowerCase() || "").includes(searchLower) ||
        (client.pet_name?.toLowerCase() || "").includes(searchLower)
      );
    });
  }, [clients, search]);

  const getClientHistory = (clientEmail: string) => {
    return appointments
      .filter((app) => app.email === clientEmail)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] px-1.5 py-0">מאושר</Badge>;
      case "cancelled":
        return <Badge className="bg-red-50 text-red-700 border-red-100 text-[10px] px-1.5 py-0">מבוטל</Badge>;
      default:
        return <Badge className="bg-amber-50 text-amber-700 border-amber-100 text-[10px] px-1.5 py-0">ממתין</Badge>;
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <User className="w-5 h-5 text-blue-600" />
          לקוחות
        </h2>
        <Badge variant="secondary" className="bg-blue-50 text-blue-700 font-bold">
          {filteredClients.length} לקוחות
        </Badge>
      </div>

      {/* Search */}
      <div className="relative sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-2">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לקוח..."
          className="pr-10 h-12 rounded-2xl border-slate-200 bg-white shadow-sm"
          dir="rtl"
        />
      </div>

      {/* List */}
      <div className="space-y-3">
        {filteredClients.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
            <User className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-bold">אין לקוחות עדיין</p>
          </div>
        ) : (
          filteredClients.map((client, idx) => {
            const isExpanded = expandedClientId === client.id;
            const history = getClientHistory(client.email);
            const lastApp = history[0];

            return (
              <Card 
                key={client.id}
                className={cn(
                  "overflow-hidden border-slate-100 shadow-sm transition-all",
                  isExpanded ? "ring-2 ring-blue-500/20 border-blue-200" : ""
                )}
              >
                <div 
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-right">
                      <h3 className="font-black text-blue-950 text-lg leading-tight">
                        {client.full_name || "לקוח ללא שם"}
                      </h3>
                      {client.pet_name && (
                        <div className="flex items-center gap-1 mt-1">
                          <PawPrint className="w-3 h-3 text-blue-400" />
                          <span className="text-xs font-bold text-slate-500">{client.pet_name}</span>
                        </div>
                      )}
                    </div>
                    <Badge className="bg-blue-50 text-blue-700 border-blue-100 font-black">
                      {history.length} תורים
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2 mt-3">
                    {client.phone && (
                      <a 
                        href={`tel:${client.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span className="text-sm font-bold tracking-wider" dir="ltr">{client.phone}</span>
                      </a>
                    )}
                    {client.email && (
                      <a 
                        href={`mailto:${client.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium truncate max-w-[200px]">{client.email}</span>
                      </a>
                    )}
                  </div>

                  {lastApp && (
                    <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Calendar className="w-3 h-3" />
                        <span className="text-[10px] font-bold">תור אחרון: {format(parseISO(lastApp.date), "dd/MM/yyyy")}</span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-slate-50/50 border-t border-slate-100"
                    >
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2 text-slate-900 font-black text-sm mb-1">
                          <History className="w-4 h-4" />
                          היסטוריית תורים
                        </div>
                        {history.map((app) => (
                          <div 
                            key={app.id}
                            className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm flex items-center justify-between"
                          >
                            <div className="text-right">
                              <div className="text-xs font-black text-slate-900">{format(parseISO(app.date), "dd/MM/yyyy")} | {app.start_time}</div>
                              <div className="text-[10px] text-slate-500 font-medium">{app.appointment_type}</div>
                            </div>
                            {getStatusBadge(app.status)}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MobileClientsList;
