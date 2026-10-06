import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Stethoscope, HeartPulse, Syringe } from "lucide-react";

export function VetServicesSection() {
  const services = [
    {
      title: "הביקור השגרתי",
      subtitle: "בדיקות כלליות, חיסונים, ניקוי שיניים",
      description: "חיסונים, ניקוי שיניים ובדיקה שנתית. רוב הביקורים האלה נגמרים בעשרים דקות ואפשר לקבוע אותם לשבוע הקרוב.",
      icon: Stethoscope,
      color: "bg-blue-100 text-blue-600",
    },
    {
      title: "בדיקות ואבחון",
      subtitle: "מעבדה, הדמיות וייעוץ מומחים",
      description: "אבחון מדויק מציל חיים. המרפאה מצוידת במכשור מתקדם לבדיקות דם מהירות, צילומי רנטגן ושיתוף פעולה עם המעבדות המובילות בארץ.",
      icon: HeartPulse,
      color: "bg-purple-100 text-purple-600",
    },
    {
      title: "טיפולים מתקדמים",
      subtitle: "כירורגיה, אשפוז יום וטיפול חירום",
      description: "חדר ניתוח מאובזר לניתוחי רקמות רכות ועיקורים/סירוסים, כולל אשפוז יום תחת השגחה צמודה.",
      icon: Syringe,
      color: "bg-teal-100 text-teal-600",
    },
  ];

  return (
    <section id="services" className="py-24 bg-white relative overflow-hidden">
      {/* Subtle patterns */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-50 rounded-full blur-3xl opacity-50 translate-y-1/2 -translate-x-1/2" />

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl font-black text-blue-950 mb-4"
          >
            שירותי המרפאה
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-xl text-blue-800 font-medium italic leading-relaxed"
          >
            "המרפאה בה כולם מכשכשים בזנב"
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="h-full border-none shadow-xl shadow-blue-900/5 hover:shadow-2xl hover:shadow-blue-900/10 transition-all duration-300 group rounded-[2rem]">
                <CardContent className="p-8 text-right">
                  <div className={`w-16 h-16 rounded-2xl ${service.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <service.icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-blue-900 mb-2">{service.title}</h3>
                  <p className="text-blue-700 font-semibold mb-4 text-sm">{service.subtitle}</p>
                  <p className="text-blue-900 leading-relaxed">
                    {service.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
