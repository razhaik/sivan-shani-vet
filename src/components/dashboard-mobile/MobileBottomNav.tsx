import { 
  CalendarDays, 
  ClipboardList, 
  CalendarRange, 
  Users, 
  Settings 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: "today", icon: CalendarDays, label: "היום" },
  { id: "appointments", icon: ClipboardList, label: "תורים" },
  { id: "schedule", icon: CalendarRange, label: "לוח" },
  { id: "clients", icon: Users, label: "לקוחות" },
  { id: "settings", icon: Settings, label: "הגדרות" },
];

export default function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 pb-safe shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.05)]"
      dir="rtl"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full relative transition-all duration-200",
                isActive ? "text-orange-600" : "text-slate-400"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute top-0 w-1.5 h-1.5 rounded-full bg-orange-600 -translate-y-1"
                />
              )}
              <Icon 
                className={cn(
                  "w-6 h-6 transition-transform duration-200",
                  isActive ? "scale-110 stroke-[2.5px]" : "scale-100 stroke-[2px]"
                )} 
              />
              <span className="text-[10px] font-black mt-1 leading-none">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
