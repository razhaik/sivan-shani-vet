import { VetHeader } from "@/components/landing/VetHeader";
import { VetHeroSection } from "@/components/landing/VetHeroSection";
import { VetServicesSection } from "@/components/landing/VetServicesSection";
import { VetFAQSection } from "@/components/landing/VetFAQSection";
import { VetGallerySection } from "@/components/landing/VetGallerySection";
import { VetContactSection } from "@/components/landing/VetContactSection";
import { SEO } from "@/components/SEO";
import {
  optimizedImageSource,
  optimizedImageSrcSet,
  restoreOriginalImage,
} from "@/lib/optimizedImageUrl";

const INDEX_LOGO_URL =
  "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/1768587105801-2026-01-05-15.55.10-Nero-AI-Background-Remover.png";

const INDEX_SOCIAL_IMAGE_URL =
  "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/1768592510962-pasted-image-1768592469398.png";

const Index = () => {
  const logoImage = optimizedImageSource(INDEX_LOGO_URL, {
    width: 320,
    fallbackWidth: 160,
    quality: 68,
  });
  const logoImageSrcSet = optimizedImageSrcSet(INDEX_LOGO_URL, [160, 240, 320], {
    quality: 68,
  });

  return (
    <div dir="rtl" className="min-h-screen bg-white font-sans selection:bg-blue-100 selection:text-blue-900">
      <SEO
        title='ד"ר סיון שני – מרפאה וטרינרית'
        description='מרפאה וטרינרית של ד"ר סיון שני. שירותי וטרינריה מקצועיים לכלבים וחתולים – חיסונים, ניתוחים, בדיקות כלליות וניקוי שיניים. קביעת תור קלה ומהירה.'
        image={INDEX_SOCIAL_IMAGE_URL}
        imageAlt="וטרינרית מטפלת בכלב במרפאה"
        url="https://sivanshanivet.com/"
        siteName='ד"ר סיון שני – מרפאה וטרינרית'
      />
      {/* Background gradients and watermark are desktop-only decoration. */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-blue-50/50 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[50%] h-[50%] bg-purple-50/50 blur-[120px] rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="absolute bottom-20 left-10 w-64 h-64 opacity-[0.05] grayscale pointer-events-none">
          <img
            src={logoImage.src}
            srcSet={logoImageSrcSet}
            sizes="320px"
            alt=""
            loading="lazy"
            fetchPriority="low"
            decoding="async"
            onError={(event) => restoreOriginalImage(event, logoImage.fallbackSrc)}
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      <VetHeader />

      <main id="main-content" tabIndex={-1} className="scroll-mt-28 focus:outline-none">
        <VetHeroSection />

        <div className="space-y-0 relative">
          <VetServicesSection />
          <VetFAQSection />
          <VetGallerySection />
          <VetContactSection />
        </div>
      </main>

      <footer className="py-12 border-t border-blue-50 bg-white">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-8">
            <div className="flex flex-col items-center md:items-start">
              <span className="text-2xl font-black text-blue-950">ד"ר סיון שני</span>
              <span className="text-blue-700 font-medium">מרפאה וטרינרית</span>
            </div>

            <div className="flex flex-wrap justify-center gap-6">
              <a href="#services" className="rounded-sm text-blue-800 hover:text-blue-700 font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-4">שירותים</a>
              <a href="#contact" className="rounded-sm text-blue-800 hover:text-blue-700 font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-4">הצעות עסקיות</a>
              <a href="/accessibility" className="rounded-sm text-blue-800 hover:text-blue-700 font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-4">הצהרת נגישות</a>
            </div>
          </div>

          <div className="pt-8 border-t border-blue-50 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-blue-800 font-medium">
            <div>נבנה באהבה לבעלי חיים ע״י רז חאיק © 2026</div>
            <div className="flex items-center gap-1">
              כל הזכויות שמורות לד"ר סיון שני
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
