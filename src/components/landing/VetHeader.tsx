import { superdevClient } from "@/lib/superdev/client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function VetHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  const currentPath = encodeURIComponent(window.location.href);
  const requiresAuth = superdevClient.auth.client.options.requiresAuth;
  const loginUrl = (superdevClient.auth.client.options.loginUrl + "&from_url=" + currentPath).replace("/api", "");
  const signupUrl = (loginUrl.includes("app-login")
    ? loginUrl.replace("app-login", "app-signup")
    : loginUrl);
  const isHomePage = window.location.pathname === "/";

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);

    async function checkIsAuth() {
      try {
        const isAuthenticated = await superdevClient.isAuthenticated();
        setIsAuth(isAuthenticated);
      } catch (error) {
        console.error("Auth check failed", error);
      }
    }
    checkIsAuth();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileMenuOpen]);

  const sectionHref = (sectionId: string) =>
    isHomePage ? `#${sectionId}` : `/#${sectionId}`;

  const navLinks = [
    { name: "שירותי המרפאה", href: sectionHref("services") },
    { name: "שאלות נפוצות", href: sectionHref("faq") },
    { name: "גלריה", href: sectionHref("gallery-real-moments") },
    { name: "השאירו פרטים", href: sectionHref("contact") },
    { name: "הצהרת נגישות", href: "/accessibility" },
  ];

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b px-4 transition-all duration-300 md:px-8",
        isScrolled
          ? "py-3 border-blue-100 bg-white/95 shadow-sm backdrop-blur-md"
          : "py-4 border-blue-100/70 bg-white/95 backdrop-blur-md md:py-6"
      )}
    >
      <a
        href="#main-content"
        className="absolute right-4 top-2 z-[60] -translate-y-full rounded-lg bg-white px-4 py-3 font-bold text-blue-950 shadow-lg transition-transform focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
      >
        דלגו לתוכן הראשי
      </a>

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <a
          href={isHomePage ? "#hero" : "/#hero"}
          className="group flex min-w-0 flex-col items-start rounded-md text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
        >
          <span className="text-xl font-bold leading-tight text-blue-950 transition-colors group-hover:text-blue-700 md:text-2xl">
            ד"ר סיון שני
          </span>
          <span className="text-sm font-medium text-blue-800">
            מרפאה וטרינרית
          </span>
        </a>

        <nav aria-label="ניווט ראשי" className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-sm text-sm font-medium text-blue-950 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-4"
            >
              {link.name}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 md:gap-4">
          {requiresAuth && !isAuth ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Button asChild variant="ghost" size="sm" className="text-blue-950 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-blue-700">
                <a href={loginUrl}>התחברות</a>
              </Button>
              <Button asChild size="sm" className="bg-blue-600 shadow-lg shadow-blue-200 hover:bg-blue-700 focus-visible:ring-blue-700">
                <a href={signupUrl}>הרשמה</a>
              </Button>
            </div>
          ) : null}

          <a
            href="tel:054-4345388"
            aria-label="התקשרו למרפאה בטלפון 054-4345388"
            className="group flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 focus-visible:ring-offset-2 focus-visible:ring-offset-white md:h-auto md:w-auto md:gap-3 md:rounded-none"
          >
            <span className="hidden flex-col items-end text-right md:flex">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                שיחת ייעוץ?
              </span>
              <span className="text-sm font-bold text-blue-950 transition-colors group-hover:text-blue-700">
                054-4345388
              </span>
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-black/20 transition-all group-hover:scale-105 group-hover:bg-blue-700">
              <Phone className="h-5 w-5" aria-hidden="true" />
            </span>
          </a>

          <button
            ref={menuButtonRef}
            type="button"
            aria-label={mobileMenuOpen ? "סגירת תפריט ניווט" : "פתיחת תפריט ניווט"}
            aria-expanded={mobileMenuOpen}
            aria-controls="public-navigation-mobile"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-blue-100 bg-white text-blue-900 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 lg:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <nav
        id="public-navigation-mobile"
        aria-label="ניווט ראשי לנייד"
        className={cn(
          "mx-auto mt-3 max-w-7xl rounded-2xl border border-blue-100 bg-white p-2 shadow-xl lg:hidden",
          mobileMenuOpen ? "block" : "hidden",
        )}
      >
        <ul className="grid gap-1">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-11 items-center rounded-xl px-4 text-right font-bold text-blue-950 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700"
              >
                {link.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
