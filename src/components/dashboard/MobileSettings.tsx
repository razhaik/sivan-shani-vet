import React, { useState } from "react";
import { 
  Settings as SettingsIcon, 
  MessageSquare, 
  Clock, 
  Bell, 
  Smartphone, 
  Save, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface MobileSettingsProps {
  inquiries: any[];
  clinicSetting: any;
  isLoadingInquiries: boolean;
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

const MobileSettings: React.FC<MobileSettingsProps> = (props) => {
  const [activeSection, setActiveSection] = useState<string | null>("inquiries");

  const toggleSection = (id: string) => {
    setActiveSection(activeSection === id ? null : id);
  };

  const sections = [
    { id: "inquiries", label: "פניות יצירת קשר", icon: MessageSquare, count: props.inquiries.length },
    { id: "general", label: "הגדרות כלליות", icon: SettingsIcon },
    { id: "email", label: "תזכורות מייל", icon: Bell },
    { id: "sms", label: "תזכורות SMS", icon: Smartphone },
  ];

  return (
    <div className="space-y-4 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-blue-600" />
          הגדרות וניהול
        </h2>
      </div>

      <div className="space-y-4">
        {sections.map((section) => {
          const Icon = section.icon;
          const isOpen = activeSection === section.id;

          return (
            <div 
              key={section.id} 
              className={cn(
                "bg-white rounded-2xl border border-slate-100 overflow-hidden transition-all",
                isOpen ? "shadow-lg shadow-blue-900/5 ring-1 ring-blue-500/10" : "shadow-sm"
              )}
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                    isOpen ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <span className="font-black text-slate-900 block">{section.label}</span>
                    {section.count !== undefined && (
                      <span className="text-[10px] font-bold text-slate-400">{section.count} פניות חדשות</span>
                    )}
                  </div>
                </div>
                {isOpen ? <ChevronUp className="w-5 h-5 text-blue-600" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-slate-50"
                  >
                    <div className="p-4 space-y-4 bg-slate-50/30">
                      
                      {/* INQUIRIES CONTENT */}
                      {section.id === "inquiries" && (
                        <div className="space-y-3">
                          {props.inquiries.length === 0 ? (
                            <div className="text-center py-8">
                              <p className="text-slate-400 font-bold">אין פניות כרגע</p>
                            </div>
                          ) : (
                            props.inquiries.map((inq) => (
                              <div key={inq.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-3">
                                <div className="flex justify-between items-start">
                                  <div className="text-right">
                                    <h4 className="font-black text-blue-950 flex items-center gap-2">
                                      <User className="w-3.5 h-3.5 text-blue-400" />
                                      {inq.name}
                                    </h4>
                                    <p className="text-[10px] text-slate-400 font-bold">{format(parseISO(inq.created_at), "dd/MM/yyyy HH:mm")}</p>
                                  </div>
                                  <a href={`tel:${inq.phone}`} className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
                                    <Smartphone className="w-4 h-4" />
                                  </a>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600 leading-relaxed italic border-r-2 border-blue-200">
                                  "{inq.message}"
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* GENERAL SETTINGS */}
                      {section.id === "general" && (
                        <div className="space-y-6">
                          <div className="space-y-3">
                            <Label className="font-black text-slate-900 text-base">טווח מינימלי להזמנה (שעות)</Label>
                            <Input 
                              type="number" 
                              value={props.minHoursBeforeBooking} 
                              onChange={(e) => props.setMinHoursBeforeBooking(Number(e.target.value))}
                              className="h-12 rounded-xl"
                            />
                            <p className="text-xs text-slate-400 font-medium italic">הלקוח לא יוכל לקבוע תור שמתחיל בפחות מהזמן הזה מעכשיו.</p>
                          </div>

                          <div className="space-y-4">
                            <Label className="font-black text-slate-900 text-base">הערות לסוגי תורים</Label>
                            
                            <div className="space-y-2">
                              <Label className="text-sm font-bold text-slate-700">חיסונים / שגרתי</Label>
                              <Textarea 
                                value={props.vaccineBookingNote} 
                                onChange={(e) => props.setVaccineBookingNote(e.target.value)}
                                className="min-h-[80px] rounded-xl text-sm"
                                placeholder="הערה שתוצג בבחירת סוג זה..."
                              />
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-bold text-slate-700">בדיקה כללית</Label>
                              <Textarea 
                                value={props.generalBookingNote} 
                                onChange={(e) => props.setGeneralBookingNote(e.target.value)}
                                className="min-h-[80px] rounded-xl text-sm"
                                placeholder="הערה שתוצג בבחירת סוג זה..."
                              />
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-bold text-slate-700">כירורגיה</Label>
                              <Textarea 
                                value={props.surgeryBookingNote} 
                                onChange={(e) => props.setSurgeryBookingNote(e.target.value)}
                                className="min-h-[80px] rounded-xl text-sm"
                                placeholder="הערה שתוצג בבחירת סוג זה..."
                              />
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-bold text-slate-700">טיפולי שיניים</Label>
                              <Textarea 
                                value={props.dentalBookingNote} 
                                onChange={(e) => props.setDentalBookingNote(e.target.value)}
                                className="min-h-[80px] rounded-xl text-sm"
                                placeholder="הערה שתוצג בבחירת סוג זה..."
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* EMAIL REMINDERS */}
                      {section.id === "email" && (
                        <div className="space-y-6">
                          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-100">
                            <div className="text-right">
                              <span className="font-black text-slate-900 block">הפעל תזכורות מייל</span>
                              <span className="text-xs text-slate-400 font-medium">המערכת תשלח מייל אוטומטי ללקוחות</span>
                            </div>
                            <Switch 
                              checked={props.enableReminders} 
                              onCheckedChange={props.setEnableReminders}
                              className="data-[state=checked]:bg-blue-600"
                            />
                          </div>

                          <div className={cn("space-y-4", !props.enableReminders && "opacity-50 pointer-events-none")}>
                            <div className="space-y-2">
                              <Label className="text-sm font-bold">שליחה יום לפני (שעות)</Label>
                              <Input 
                                type="number" 
                                value={props.dayBeforeHours} 
                                onChange={(e) => props.setDayBeforeHours(Number(e.target.value))}
                                className="h-11 rounded-xl"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-bold">שליחה שעה לפני (שעות)</Label>
                              <Input 
                                type="number" 
                                value={props.hourBeforeHours} 
                                onChange={(e) => props.setHourBeforeHours(Number(e.target.value))}
                                className="h-11 rounded-xl"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* SMS REMINDERS */}
                      {section.id === "sms" && (
                        <div className="space-y-6">
                          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-100">
                            <div className="text-right">
                              <span className="font-black text-slate-900 block">הפעל תזכורות SMS</span>
                              <span className="text-xs text-slate-400 font-medium">שליחת הודעות טקסט אוטומטיות</span>
                            </div>
                            <Switch 
                              checked={props.enableSmsReminders} 
                              onCheckedChange={props.setEnableSmsReminders}
                              className="data-[state=checked]:bg-blue-600"
                            />
                          </div>

                          <div className={cn("space-y-4", !props.enableSmsReminders && "opacity-50 pointer-events-none")}>
                            <div className="space-y-2">
                              <Label className="text-sm font-bold">תבנית SMS יום לפני</Label>
                              <Textarea 
                                value={props.smsDayBeforeTemplate} 
                                onChange={(e) => props.setSmsDayBeforeTemplate(e.target.value)}
                                className="min-h-[100px] rounded-xl text-sm leading-relaxed"
                              />
                              <p className="text-[10px] text-slate-400 font-bold">משתנים: {'{CLIENT_NAME}'}, {'{PET_NAME}'}, {'{DATE}'}, {'{TIME}'}</p>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-bold">תבנית SMS שעה לפני</Label>
                              <Textarea 
                                value={props.smsHourBeforeTemplate} 
                                onChange={(e) => props.setSmsHourBeforeTemplate(e.target.value)}
                                className="min-h-[100px] rounded-xl text-sm leading-relaxed"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Sticky Save Button */}
      <div className="fixed bottom-[4.5rem] left-0 right-0 p-4 bg-background/80 backdrop-blur-md z-30">
        <Button 
          onClick={props.handleSaveSettings} 
          disabled={props.isSavingSettings}
          className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2"
        >
          {props.isSavingSettings ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
              <Save className="w-5 h-5" />
            </motion.div>
          ) : <Save className="w-5 h-5" />}
          שמור הגדרות
        </Button>
      </div>
    </div>
  );
};

export default MobileSettings;
