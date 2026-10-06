import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";
import {
  optimizedImageSource,
  optimizedImageSrcSet,
  restoreOriginalImage,
} from "@/lib/optimizedImageUrl";

const HERO_IMAGE_URL =
  "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/files/chat-generated-images/project-lczgvu3wjuxaqpny3stm/7ef8dc11-9254-485d-a555-2585c4035fb0.png";
const LOGO_IMAGE_URL =
  "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/1768587105801-2026-01-05-15.55.10-Nero-AI-Background-Remover.png";

export function VetHeroSection() {
  const heroImage = optimizedImageSource(HERO_IMAGE_URL, {
    width: 768,
    fallbackWidth: 360,
    quality: 78,
  });
  const heroImageSrcSet = optimizedImageSrcSet(
    HERO_IMAGE_URL,
    [360, 640, 960, 1280],
    { quality: 78 },
  );
  const logoImage = optimizedImageSource(LOGO_IMAGE_URL, {
    width: 480,
    fallbackWidth: 192,
    quality: 70,
  });
  const logoImageSrcSet = optimizedImageSrcSet(
    LOGO_IMAGE_URL,
    [192, 320, 480],
    { quality: 70 },
  );

  return (
    <section
      id="hero"
      className="relative min-h-[90vh] flex items-center pt-32 pb-20 overflow-hidden"
      style={{
        backgroundImage:
          "linear-gradient(to bottom right, #1D4ED8 0%, #1E40AF 50%, #4338CA 100%)",
      }}
    >
      {/* Background patterns stay off narrow screens to keep the first paint light. */}
      <div className="absolute inset-0 opacity-10 pointer-events-none hidden sm:block">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-400 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
      </div>

      {/* Elegant logo watermark, decorative and deferred below the main hero image. */}
      <img
        src={logoImage.src}
        srcSet={logoImageSrcSet}
        sizes="(max-width: 1023px) 280px, 480px"
        alt=""
        loading="lazy"
        fetchPriority="low"
        decoding="async"
        onError={(event) => restoreOriginalImage(event, logoImage.fallbackSrc)}
        className="absolute pointer-events-none select-none opacity-[0.07] md:opacity-[0.1] mix-blend-screen z-0 hidden sm:block right-[-3rem] bottom-[-4rem] md:right-12 md:bottom-0 h-[280px] md:h-[400px] lg:h-[480px] w-auto transition-opacity duration-700"
      />

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text Content */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-right"
          >
            <h1 className="text-4xl md:text-6xl font-black text-white leading-tight mb-6 text-center lg:text-right">
              ד"ר סיון שני&nbsp;
              <br />
              מרפאה וטרינרית
            </h1>
            <p className="text-xl text-white mb-10 max-w-2xl ml-auto leading-relaxed text-center lg:text-right">
              מרפאה וטרינרית בנס ציונה לכלבים ולחתולים.
              <br />
              קובעים תור באתר, גם בשתיים בלילה, ומגיעים בשעה שנקבעה.
            </p>

            <div className="flex flex-col sm:flex-row-reverse gap-6 items-center justify-center lg:justify-start">
              <Button
                asChild
                size="lg"
                className="relative bg-white text-blue-700 hover:bg-blue-50 text-xl font-extrabold h-16 px-10 shadow-2xl shadow-blue-900/30 rounded-full border-2 border-white/80 transition-transform duration-200 hover:-translate-y-0.5"
              >
                <a href="/appointments">קביעת תור</a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border border-white bg-blue-950/10 text-white hover:bg-blue-950 hover:text-white text-base font-semibold h-12 px-7 backdrop-blur-sm rounded-full"
              >
                <a href="tel:054-4345388" className="flex items-center gap-2">
                  שיחת ייעוץ טלפונית
                  <Phone className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </motion.div>

          {/* Hero image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="relative z-10 aspect-[175/128] rounded-[2.5rem] overflow-hidden bg-white/10 shadow-2xl border-8 border-white/10 sm:backdrop-blur-md">
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
              <img
                src={heroImage.src}
                srcSet={heroImageSrcSet}
                sizes="(max-width: 1023px) calc(100vw - 2rem), 50vw"
                alt="וטרינרית עם כלב וחתול במרפאה"
                width={1400}
                height={1024}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                onError={(event) => restoreOriginalImage(event, heroImage.fallbackSrc)}
                className="relative z-10 w-full h-full object-cover"
              />
            </div>
            {/* Decorative circle */}
            <div className="absolute -z-10 -bottom-10 -left-10 w-64 h-64 bg-yellow-400 rounded-full blur-2xl opacity-20 animate-pulse hidden sm:block" />
          </motion.div>
        </div>
      </div>

      {/* Bottom Wave Divider */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-white rounded-t-[3rem] translate-y-12" />
    </section>
  );
}
