import { useState } from "react";
import { 
  MessageSquare, 
  Settings, 
  Bell, 
  Smartphone, 
  ChevronDown, 
  ChevronUp, 
  Save, 
  Phone, 
  Calendar,
  Info,
  Clock,
  Loader2
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MobileSettingsViewProps {
  inquiries: any[];
  isLoadingInquiries: boolean;
  clinicSetting: any;
  minHoursBeforeBooking: number;
  setMinHoursBeforeBooking: (val: number) => void;
  vaccineBookingNote: string;
  setVaccineBookingNote: (val: string) => void;
  generalBookingNote: string;
  setGeneralBookingNote: (val: string) => void;
  surgeryBookingNote: string;
  setSurgeryBookingNote: (val: string) => void;
  dentalBookingNote: string;
  setDentalBookingNote: (val: string) => void;
  enableReminders: boolean;
  setEnableReminders: (val: boolean) => void;
  enableSmsReminders: boolean;
  setEnableSmsReminders: (val: boolean) => void;
  dayBeforeHours: number;
  setDayBeforeHours: (val: number) => void;
  hourBeforeHours: number;
  setHourBeforeHours: (val: number) => void;
  smsDayBeforeTemplate: string;
  setSmsDayBeforeTemplate: (val: string) => void;
  smsHourBeforeTemplate: string;
  setSmsHourBeforeTemplate: (val: string) => void;
  handleSaveSettings: () => void;
  isSavingSettings: boolean;
}

export default function MobileSettingsView({
  inquiries,
  isLoadingInquiries,
  clinicSetting,
  minHoursBeforeBooking,
  setMinHoursBeforeBooking,
  vaccineBookingNote,
  setVaccineBookingNote,
  generalBookingNote,
  setGeneralBookingNote,
  surgeryBookingNote,
  setSurgeryBookingNote,
  dentalBookingNote,
  setDentalBookingNote,
  enableReminders,
  setEnableReminders,
  enableSmsReminders,
  setEnableSmsReminders,
  dayBeforeHours,
  setDayBeforeHours,
  hourBeforeHours,
  setHourBeforeHours,
  smsDayBeforeTemplate,
  setSmsDayBeforeTemplate,
  smsHourBeforeTemplate,
  setSmsHourBeforeTemplate,
  handleSaveSettings,
  isSavingSettings,
}: MobileSettingsViewProps) {
  const [activeAccordion, setActiveAccordion] = useState<string | null>("inquiries");

  const toggleAccordion = (id: string) => {
    setActiveAccordion(activeAccordion === id ? null : id);
  };

  const sections = [
    {
      id: "inquiries",
      label: "פניות יצירת קשר",
      icon: MessageSquare,
      badge: inquiries.length > 0 ? inquiries.length : null,
      content: (
        <div className="space-y-4">
          {inquiries.length > 0 ? (
            inquiries.map((inq) => (
              <div key={inq.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-slate-900">{inq.full_name}</h4>
                    <p className="text-[10px] text-slate-400 font-bold">{format(parseISO(inq.created_at), "dd/MM/yyyy HH:mm")}</p>
                  </div>
                  <a href={`tel:${inq.phone}`} className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                    <Phone className="w-5 h-5" />
                  </a>
                </div>
                <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 italic leading-relaxed">
                  "{inq.message}"
                </p>
              </div>
            ))
          ) : (
            <div className="py-10 text-center space-y-2">
              <MessageSquare className="w-12 h-12 text-slate-200 mx-auto" />
              <p className="text-slate-400 font-bold">אין פניות כרגע</p>
            </div>
          )}
        </div>
      )
    },
    {
      id: "general",
      label: "הגדרות כלליות",
      icon: Settings,
      content: (
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-600" />
              מינימום שעות להזמנה מראש
            </Label>
            <Input
              type="number"
              value={minHoursBeforeBooking}
              onChange={(e) => setMinHoursBeforeBooking(Number(e.target.value))}
              className="h-12 rounded-xl border-orange-100 font-bold"
            />
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">הערות לסוגי טיפול</h4>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600">חיסונים וטיפולים שגרתיים</Label>
              <Textarea
                value={vaccineBookingNote}
                onChange={(e) => setVaccineBookingNote(e.target.value)}
                className="rounded-xl border-orange-100 min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600">בדיקה כללית / לקוח חדש</Label>
              <Textarea
                value={generalBookingNote}
                onChange={(e) => setGeneralBookingNote(e.target.value)}
                className="rounded-xl border-orange-100 min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600">פרוצדורות וניתוחים</Label>
              <Textarea
                value={surgeryBookingNote}
                onChange={(e) => setSurgeryBookingNote(e.target.value)}
                className="rounded-xl border-orange-100 min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600">טיפולי שיניים</Label>
              <Textarea
                value={dentalBookingNote}
                onChange={(e) => setDentalBookingNote(e.target.value)}
                className="rounded-xl border-orange-100 min-h-[80px]"
              />
            </div>
          </div>
        </div>
      )
    },
    {
      id: "email",
      label: "תזכורות מייל",
      icon: Bell,
      content: (
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-orange-50 rounded-2xl border border-orange-100">
            <div>
              <p className="font-black text-slate-900">הפעל תזכורות במייל</p>
              <p className="text-xs text-slate-500 font-bold">שליחה אוטומטית ללקוחות</p>
            </div>
            <Switch
              checked={enableReminders}
              onCheckedChange={setEnableReminders}
              className="data-[state=checked]:bg-orange-600"
            />
          </div>

          <AnimatePresence>
            {enableReminders && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600">שליחת תזכורת (שעות לפני התור)</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase">תזכורת 1</p>
                      <Input
                        type="number"
                        value={dayBeforeHours}
                        onChange={(e) => setDayBeforeHours(Number(e.target.value))}
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase">תזכורת 2</p>
                      <Input
                        type="number"
                        value={hourBeforeHours}
                        onChange={(e) => setHourBeforeHours(Number(e.target.value))}
                        className="rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )
    },
    {
      id: "sms",
      label: "תזכורות SMS",
      icon: Smartphone,
      content: (
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-orange-50 rounded-2xl border border-orange-100">
            <div>
              <p className="font-black text-slate-900">הפעל תזכורות ב-SMS</p>
              <p className="text-xs text-slate-500 font-bold">שירות הודעות אוטומטי</p>
            </div>
            <Switch
              checked={enableSmsReminders}
              onCheckedChange={setEnableSmsReminders}
              className="data-[state=checked]:bg-orange-600"
            />
          </div>

          <AnimatePresence>
            {enableSmsReminders && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-4"
              >
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] text-amber-800 font-bold leading-relaxed">
                    ניתן להשתמש במשתנים: <span className="font-black">{"{CLIENT_NAME}"}</span>, <span className="font-black">{"{PET_NAME}"}</span>, <span className="font-black">{"{DATE}"}</span>, <span className="font-black">{"{TIME}"}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600">תבנית הודעה (תזכורת 1)</Label>
                  <Textarea
                    value={smsDayBeforeTemplate}
                    onChange={(e) => setSmsDayBeforeTemplate(e.target.value)}
                    className="rounded-xl border-orange-100 min-h-[100px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600">תבנית הודעה (תזכורת 2)</Label>
                  <Textarea
                    value={smsHourBeforeTemplate}
                    onChange={(e) => setSmsHourBeforeTemplate(e.target.value)}
                    className="rounded-xl border-orange-100 min-h-[100px]"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4 pb-32" dir="rtl">
      {sections.map((section) => {
        const isActive = activeAccordion === section.id;
        const Icon = section.icon;

        return (
          <div
            key={section.id}
            className={cn(
              "bg-white rounded-3xl border border-slate-100 transition-all duration-300 overflow-hidden",
              isActive ? "shadow-xl shadow-orange-100 ring-1 ring-orange-200" : "shadow-sm"
            )}
          >
            <button
              onClick={() => toggleAccordion(section.id)}
              className="w-full p-5 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center transition-colors",
                  isActive ? "bg-orange-600 text-white shadow-lg shadow-orange-200" : "bg-orange-50 text-orange-600"
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-right">
                  <h3 className="font-black text-slate-900 leading-none">{section.label}</h3>
                  {section.badge && (
                    <Badge className="bg-red-500 text-white text-[8px] h-4 mt-1 px-1.5 font-black">
                      {section.badge} פניות חדשות
                    </Badge>
                  )}
                </div>
              </div>
              {isActive ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-300" />
              )}
            </button>

            <AnimatePresence>
              {isActive && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <div className="p-5 pt-0 border-t border-slate-50">
                    <div className="mt-4">
                      {section.content}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Sticky Save Button */}
      <div className="fixed bottom-[74px] left-0 right-0 z-40 p-4 bg-white/60 backdrop-blur-md border-t border-white/20">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={handleSaveSettings}
            disabled={isSavingSettings}
            className="w-full h-14 bg-gradient-to-l from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-orange-200 transition-all active:scale-[0.98]"
          >
            {isSavingSettings ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <div className="flex items-center gap-2">
                <Save className="w-6 h-6" />
                שמור שינויים
              </div>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
