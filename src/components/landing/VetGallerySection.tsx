import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  optimizedImageSource,
  optimizedImageSrcSet,
  restoreOriginalImage,
} from "@/lib/optimizedImageUrl";

const CARD_IMAGE_WIDTHS = [320, 480, 720, 960];

type GalleryMoment = {
  title: string;
  subtitle: string;
  imageUrl: string;
  imageAlt: string;
};

export function VetGallerySection() {
  const [activeMoment, setActiveMoment] = useState<GalleryMoment | null>(null);
  const galleryTriggerRef = useRef<HTMLButtonElement | null>(null);

  const photos: GalleryMoment[] = [
    {
      title: "בדיקות מעבדה מדויקות",
      subtitle: "מבט קרוב כדי לדייק באבחנה",
      imageUrl: "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/1768592510961-pasted-image-1768592456849.png",
      imageAlt: "וטרינרית בוחנת דגימה במיקרוסקופ במעבדה וטרינרית",
    },
    {
      title: "זמן איכות עם המטופלים",
      subtitle: "חיבוקים, נשיקות והרבה דשא ירוק",
      imageUrl: "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/1768592510962-pasted-image-1768592463036.png",
      imageAlt: "אישה שוכבת על הדשא עם שני כלבים ומחבקת אותם באהבה",
    },
    {
      title: "בדיקה רגועה לכלב גדול",
      subtitle: "סבלנות ועדינות גם עם הענקים",
      imageUrl: "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/1768592510962-pasted-image-1768592469398.png",
      imageAlt: "וטרינרית בודקת כלב גדול שמושיט לה רגל במרפאה",
    },
    {
      title: "מפהקים מהשעה, לא מהיחס",
      subtitle: "מטופל עייף אבל רגוע אחרי טיפול",
      imageUrl: "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/1768592510962-pasted-image-1768592482313.png",
      imageAlt: "כלב קטן לבן מפהק על שולחן בדיקה במרפאה וטרינרית",
    },
    {
      title: "בדיקת עיניים מתקדמת",
      subtitle: "ציוד מתקדם לשמירה על הראייה של החברים על ארבע",
      imageUrl: "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/1768592510963-pasted-image-1768592509609.png",
      imageAlt: "וטרינרית בודקת עיניים של כלב באמצעות מכשיר בדיקה מיוחד",
    },
  ];

  const photoSources = photos.map((photo) =>
    optimizedImageSource(photo.imageUrl, {
      width: 480,
      fallbackWidth: 320,
      quality: 74,
    }),
  );
  const photoSrcSets = photos.map((photo) =>
    optimizedImageSrcSet(photo.imageUrl, CARD_IMAGE_WIDTHS, { quality: 74 }),
  );
  const lightboxImageSource = activeMoment
    ? optimizedImageSource(activeMoment.imageUrl, {
        width: 1200,
        fallbackWidth: 640,
        quality: 80,
      })
    : null;

  const closeGalleryDialog = () => {
    setActiveMoment(null);
    window.requestAnimationFrame(() => galleryTriggerRef.current?.focus());
  };

  return (
    <section id="gallery" className="bg-blue-50 py-24">
      <div className="container mx-auto px-4 md:px-8">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-4xl font-black text-blue-950">המרפאה שלנו</h2>
          <p className="font-medium text-blue-700">הצצה קטנה לרגעים מהיום יום במרפאה</p>
        </div>

        <div id="gallery-real-moments" className="mt-16 border-t border-blue-100 pt-10">
          <div className="mb-10 text-right">
            <h3 className="mb-2 text-2xl font-black text-blue-950">רגעים אמיתיים מהמרפאה</h3>
            <p className="font-medium text-blue-700">כך נראים היום־יום, החיבוקים והבדיקות אצלנו</p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo, index) => (
              <motion.div
                key={photo.imageUrl}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="overflow-hidden rounded-3xl border border-blue-50 bg-white shadow-md transition-all duration-300 hover:shadow-xl"
              >
                <button
                  type="button"
                  aria-label={`פתיחת תמונה: ${photo.title}. ${photo.subtitle}`}
                  onClick={(event) => {
                    galleryTriggerRef.current = event.currentTarget;
                    setActiveMoment(photo);
                  }}
                  className="group flex w-full flex-col items-center rounded-3xl text-right focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-700"
                >
                  <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-3xl bg-blue-50">
                    <img
                      src={photoSources[index].src}
                      srcSet={photoSrcSets[index]}
                      sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(50vw - 1.5rem), 33vw"
                      alt={photo.imageAlt}
                      width={600}
                      height={450}
                      loading="lazy"
                      fetchPriority="low"
                      decoding="async"
                      onError={(event) => restoreOriginalImage(event, photoSources[index].fallbackSrc)}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  </span>
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <Dialog
        open={!!activeMoment}
        onOpenChange={(open) => {
          if (!open) closeGalleryDialog();
        }}
      >
        <DialogContent className="sm:max-w-[800px] gap-0 overflow-hidden rounded-3xl border-none p-0">
          <div className="relative aspect-[4/3] w-full bg-blue-50">
            <img
              key={activeMoment?.imageUrl}
              src={lightboxImageSource?.src}
              alt={activeMoment?.imageAlt ?? ""}
              width={1200}
              height={900}
              loading="eager"
              decoding="async"
              onError={(event) => {
                if (lightboxImageSource) {
                  restoreOriginalImage(event, lightboxImageSource.fallbackSrc);
                }
              }}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="bg-white p-8 text-right">
            <DialogHeader>
              <DialogTitle className="mb-2 text-2xl font-black text-blue-950">
                {activeMoment?.title}
              </DialogTitle>
            </DialogHeader>
            <p className="font-medium text-blue-800">
              רגע אמיתי מתוך העבודה היומיומית במרפאה
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
