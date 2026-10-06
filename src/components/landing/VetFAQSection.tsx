import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  optimizedImageSource,
  optimizedImageSrcSet,
  restoreOriginalImage,
} from "@/lib/optimizedImageUrl";

const FAQ_LOGO_URL =
  "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/files/chat-generated-images/project-lczgvu3wjuxaqpny3stm/0c5631c6-2917-43c3-b498-84223ca8787c.png";

export function VetFAQSection() {
  const logoImage = optimizedImageSource(FAQ_LOGO_URL, {
    width: 480,
    fallbackWidth: 192,
    quality: 68,
  });
  const logoImageSrcSet = optimizedImageSrcSet(FAQ_LOGO_URL, [192, 320, 480], {
    quality: 68,
  });
  const faqs = [
    {
      question: "אילו שירותים ניתנים במרפאה?",
      answer: "במרפאה ניתנים כל השירותים השוטפים, הכוללים בדיקות, חיסונים, ייעוץ, שיבוב שבב אלקטרוני, רישוי עירוני, ניתוחים תחת הרדמה כללית (כולל סירוס ועיקור), ניתוחים על ידי מומחים, בדיקות מעבדה, בדיקות דם, אולטרסונוגרפיה, צילומי רנטגן ועוד. המרפאה נעזרת גם בשירותי מומחים חיצוניים בהתאם לצורך.",
    },
    {
      question: "מתי צריך לחסן את הכלב?",
      answer: "כלב צריך להתחיל חיסונים מגיל 6 שבועות. סדרת החיסונים ניתנת בהפרשים של כ־2–4 שבועות, ולאחר מכן יש לחזור על חיסון אחת לשנה. קיימים חיסונים נוספים בהתאם לגיל, אזור מגורים ומצב בריאותי.",
    },
    {
      question: "מה לגבי חיסון כלבת?",
      answer: "חיסון כלבת יש לבצע החל מגיל 3 חודשים על פי חוק, ולחזור עליו אחת לשנה. החיסון כולל גם הסדרת רישיון עירוני ומתבצע בשילוב שיבוב.",
    },
    {
      question: "איך אדע שהגיע הזמן לחיסון?",
      answer: "בכל טיפול נרשם מהו הטיפול הבא ומתי יש לבצעו, והמידע מתועד גם בפנקס החיסונים. בנוסף, המרפאה שולחת תזכורות לטיפולים שגרתיים באמצעות אימייל.",
    },
    {
      question: "אילו עוד טיפולים מומלץ לבצע לכלב שלי?",
      answer: "מומלץ לבצע טיפולים נגד תולעים, נגד תולעת הוושט (הפארק), נגד טפילים חיצוניים, וכן בדיקות תקופתיות. מאחר וכל כלב שונה, מומלץ לקבל תוכנית טיפולים מותאמת אישית הכוללת גם ניקוי שיניים ומעקב רפואי בהתאם לגיל ולמצב הבריאותי.",
    },
    {
      question: "מתי מחסנים חתולים?",
      answer: "מומלץ לחסן חתול בחיסון מרובע או משולש החל מגיל חודשיים, ולחזור על החיסון לאחר חודש. ניתן גם לחסן נגד כלבת, אך בניגוד לכלבים חיסון זה אינו מחויב על פי חוק.",
    },
    {
      question: "האם שמים שבב לחתולים?",
      answer: "מומלץ להשתיל שבב אלקטרוני גם לחתולים. השבב מאפשר זיהוי בעל החיים ושיוכו לבעלים, במיוחד בחתולים המסתובבים מחוץ לבית. לאחר השיבוב יש לעדכן את מאגר השבבים הארצי של משרד החקלאות בפרטי הבעלים.",
    },
  ];

  return (
    <section id="faq" className="py-24 bg-gradient-to-r from-purple-600 to-indigo-700 relative overflow-hidden">
      {/* Large decorative details are reserved for larger screens. */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 text-[30rem] font-black text-white/5 select-none pointer-events-none hidden sm:block">
        ?
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-xl opacity-[0.04] pointer-events-none hidden sm:block">
        <img
          src={logoImage.src}
          srcSet={logoImageSrcSet}
          sizes="(max-width: 1023px) 480px, 576px"
          alt=""
          loading="lazy"
          fetchPriority="low"
          decoding="async"
          onError={(event) => restoreOriginalImage(event, logoImage.fallbackSrc)}
          className="w-full h-full object-contain"
        />
      </div>

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl font-black text-white mb-4"
          >
            שאלות נפוצות
          </motion.h2>
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
            viewport={{ once: true }}
            className="h-1.5 w-24 bg-purple-300 mx-auto rounded-full"
          />
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <AccordionItem
                  value={`item-${index}`}
                  className="bg-white/10 backdrop-blur-0 sm:backdrop-blur-md border border-white/20 rounded-2xl px-6 overflow-hidden"
                >
                  <AccordionTrigger className="text-white hover:no-underline text-right text-lg font-bold py-6">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-purple-100 text-right text-base leading-relaxed pb-6">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
