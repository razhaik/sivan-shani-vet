import { useState } from "react";
import {
  Accessibility,
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Keyboard,
  Loader2,
  Phone,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SEO } from "@/components/SEO";
import { VetHeader } from "@/components/landing/VetHeader";
import { ContactInquiry } from "@/entities";
import { notifyBrowserPush } from "@/lib/onesignalPush";

type AccessibilityField = "name" | "email" | "phone" | "message";
type AccessibilityFieldErrors = Partial<Record<AccessibilityField | "reply", string>>;
type SubmissionStatus = {
  type: "error" | "success";
  message: string;
};

const clinicPhone = "054-4345388";
const clinicPhoneLink = `tel:${clinicPhone}`;

const AccessibilityStatement = () => {
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AccessibilityFieldErrors>({});
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus | null>(null);

  const clearFieldError = (field: AccessibilityField) => {
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[field];
      if (field === "email" || field === "phone") delete next.reply;
      return next;
    });
    setSubmissionStatus(null);
  };

  const focusField = (field: AccessibilityField) => {
    window.requestAnimationFrame(() => {
      const fieldIds: Record<AccessibilityField, string> = {
        name: "accessibility-name",
        email: "accessibility-email",
        phone: "accessibility-phone",
        message: "accessibility-message",
      };
      const input = document.getElementById(fieldIds[field]);
      if (!input) return;

      const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      input.scrollIntoView({ behavior, block: "center" });
      input.focus({ preventScroll: true });
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();

    setSubmissionStatus(null);
    const nextErrors: AccessibilityFieldErrors = {};
    if (!name) nextErrors.name = "נא לציין שם כדי שנוכל להתייחס לפנייה.";
    if (!message) nextErrors.message = "נא לתאר בקצרה את הקושי באתר.";

    const emailInput = form.querySelector<HTMLInputElement>("#accessibility-email");
    if (email && emailInput && !emailInput.validity.valid) {
      nextErrors.email = "נא לבדוק שכתובת האימייל תקינה.";
    }

    const phoneDigits = phone.replace(/\D/g, "").length;
    if (phone && (!/^\+?[\d\s().-]+$/.test(phone) || phoneDigits < 7 || phoneDigits > 15)) {
      nextErrors.phone = "נא להזין מספר טלפון תקין, כולל קידומת אם מדובר במספר מחוץ לישראל.";
    }

    if (!email && !phone) {
      nextErrors.reply = "נא למלא כתובת אימייל או מספר טלפון אחד לפחות כדי שנוכל להשיב.";
    }

    const firstInvalidField: AccessibilityField | null = nextErrors.name
      ? "name"
      : nextErrors.email
        ? "email"
        : nextErrors.phone
          ? "phone"
          : nextErrors.reply
            ? "email"
            : nextErrors.message
              ? "message"
              : null;

    if (firstInvalidField) {
      setFieldErrors(nextErrors);
      focusField(firstInvalidField);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      const createdInquiry = await ContactInquiry.create({
        name,
        phone,
        email,
        message: `פניית נגישות: ${message}`,
      });
      void notifyBrowserPush("new_inquiry", String(createdInquiry?.id || ""));

      setSubmissionStatus({
        type: "success",
        message: "הפנייה נשלחה למרפאה. נוכל לחזור אליכם באמצעות פרטי הקשר שמסרתם.",
      });
      form.reset();
    } catch (error) {
      console.error("Error saving accessibility inquiry:", error);
      setSubmissionStatus({
        type: "error",
        message: "לא הצלחנו לשלוח את הפנייה כרגע. אפשר לנסות שוב או להתקשר למרפאה.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-blue-950 selection:bg-blue-100 selection:text-blue-950">
      <SEO
        title='הצהרת נגישות | ד"ר סיון שני'
        description='בהצהרת הנגישות של מרפאת ד״ר סיון שני תמצאו מידע על התאמות שבוצעו באתר ואפשרות לדווח בכתב על קושי, בטופס או בטלפון המרפאה.'
        url="https://sivanshanivet.com/accessibility"
        siteName='ד"ר סיון שני – מרפאה וטרינרית'
      />
      <VetHeader />

      <main
        id="main-content"
        tabIndex={-1}
        className="scroll-mt-28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700"
      >
        <section className="relative isolate overflow-hidden bg-gradient-to-br from-blue-50 via-white to-cyan-50">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-0 h-80 w-80 rounded-full bg-cyan-100/70 blur-3xl" />

          <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-32 sm:px-6 md:pb-20 md:pt-40 lg:px-8">
            <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
              <div className="max-w-3xl">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-4 py-2 text-sm font-bold text-blue-800 shadow-sm">
                  <Accessibility className="h-4 w-4" aria-hidden="true" />
                  ד"ר סיון שני · מרפאה וטרינרית
                </div>
                <h1 className="text-4xl font-black leading-tight tracking-tight text-blue-950 sm:text-5xl md:text-6xl">
                  הצהרת נגישות
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-blue-900 sm:text-xl">
                  אנחנו פועלים לשפר את האפשרות להתמצא באתר ולבצע בו פעולות. כאן אפשר לקרוא על ההתאמות שנעשו ולדווח לנו בכתב על קושי בשימוש.
                </p>
                <p className="mt-5 text-sm font-medium text-blue-800">
                  עודכן לאחרונה: <time dateTime="2026-10-04">4 באוקטובר 2026</time>
                </p>
                <a
                  href="#accessibility-request"
                  className="mt-8 inline-flex min-h-12 items-center gap-3 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white shadow-lg shadow-blue-900/20 transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2"
                >
                  שליחת פנייה בכתב
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>

              <aside
                aria-labelledby="accessibility-improvements-heading"
                className="relative overflow-hidden rounded-[2rem] border border-white bg-white/90 p-6 shadow-xl shadow-blue-900/10 backdrop-blur-sm sm:p-8"
              >
                <div aria-hidden="true" className="absolute -left-8 -top-8 h-28 w-28 rounded-full bg-blue-50" />
                <div className="relative">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-800">
                    <Keyboard className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h2 id="accessibility-improvements-heading" className="text-xl font-black text-blue-950 sm:text-2xl">
                    התאמות שבוצעו באתר
                  </h2>
                  <ul className="mt-6 space-y-4 text-base leading-7 text-blue-900">
                    <li className="flex items-start gap-3">
                      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span>קישור דילוג לתוכן הראשי, כדי להגיע לתוכן בלי לעבור על כל פריטי הניווט.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span>ניווט במקלדת בפקדים המרכזיים ובגלריית התמונות.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span>תוויות ברורות יותר לשדות והודעות שגיאה בטפסים.</span>
                    </li>
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
          <section
            aria-labelledby="accessibility-testing-heading"
            className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm sm:p-8"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-900">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="accessibility-testing-heading" className="text-lg font-black text-amber-950 sm:text-xl">
                  בדיקה ידנית לפי דיווח המרפאה
                </h2>
                <p className="mt-2 max-w-4xl leading-7 text-amber-950">
                  לפי דיווח המרפאה, ב־4 באוקטובר 2026 נערכו בדיקות ידניות של ניווט באמצעות מקלדת, שימוש בקורא מסך והגדלת התצוגה. הבדיקות דווחו כתקינות; לא דווח על בעיות במסלולים שנבדקו. בדיקות אלה אינן תחליף לבדיקה מקיפה של התאמה לתקן נגישות או לסקירה משפטית, ולכן המרפאה אינה מצהירה על התאמה מלאה לתקן נגישות מסוים.
                </p>
              </div>
            </div>
          </section>

          <section id="accessibility-request" aria-labelledby="accessibility-request-heading" className="mt-16 scroll-mt-28">
            <div className="mb-8 max-w-3xl">
              <p className="text-sm font-black uppercase tracking-wide text-blue-700">אפשר לפנות אלינו</p>
              <h2 id="accessibility-request-heading" className="mt-2 text-3xl font-black leading-tight text-blue-950 sm:text-4xl">
                נתקלתם בקושי באתר?
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-700 sm:text-lg">
                נשמח לקבל תיאור של הפעולה שלא הצלחתם לבצע או של התוכן שלא הצלחתם למצוא. אפשר לפנות בטלפון או לשלוח הודעה דרך הטופס.
              </p>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-8">
              <aside className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-700 to-blue-950 p-7 text-white shadow-xl shadow-blue-950/20 sm:p-9">
                <div aria-hidden="true" className="pointer-events-none absolute -left-14 -top-12 h-48 w-48 rounded-full border-[24px] border-white/10" />
                <div className="relative">
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-white">
                    <Phone className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="text-2xl font-black">מעדיפים לדבר?</h3>
                  <p className="mt-3 leading-7 text-blue-100">
                    אפשר להתקשר למרפאה. אם נוח לכם יותר לכתוב, השתמשו בטופס שבצד.
                  </p>
                  <a
                    href={clinicPhoneLink}
                    aria-label={`התקשרו למרפאה בטלפון ${clinicPhone}`}
                    className="mt-6 inline-flex min-h-12 items-center gap-3 rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-lg font-black text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-800"
                  >
                    <Phone className="h-5 w-5" aria-hidden="true" />
                    <span dir="ltr">{clinicPhone}</span>
                  </a>
                  <div className="my-7 border-t border-white/20" />
                  <p className="text-sm leading-6 text-blue-100">
                    לתיאור קושי בכתב, אפשר לציין באיזה עמוד או שלב באתר נתקלתם בו ומה ניסיתם לעשות.
                  </p>
                </div>
              </aside>

              <div className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-xl shadow-blue-900/5 sm:p-9">
                <div className="mb-7">
                  <h3 className="text-2xl font-black text-blue-950">שליחת פנייה בנושא נגישות</h3>
                  <p className="mt-2 leading-7 text-slate-700">
                    נדרש למלא שם, תיאור קצר ודרך אחת לפחות שבה נוכל להשיב: אימייל או טלפון.
                  </p>
                </div>

                <form onSubmit={handleSubmit} noValidate aria-busy={loading} className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="accessibility-name" className="mr-1 text-sm font-bold text-blue-950">
                      שם <span aria-hidden="true" className="text-red-700">*</span>
                    </label>
                    <Input
                      id="accessibility-name"
                      name="name"
                      required
                      autoComplete="name"
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={fieldErrors.name ? "accessibility-name-error" : undefined}
                      onChange={() => clearFieldError("name")}
                      className={`h-12 border-blue-200 bg-slate-50 text-right text-base text-blue-950 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 ${fieldErrors.name ? "border-red-700 focus-visible:ring-red-700" : ""}`}
                    />
                    {fieldErrors.name && (
                      <p id="accessibility-name-error" role="alert" className="text-sm font-semibold text-red-800">
                        {fieldErrors.name}
                      </p>
                    )}
                  </div>

                  <fieldset
                    aria-describedby={`accessibility-reply-help${fieldErrors.reply ? " accessibility-reply-error" : ""}`}
                    className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5"
                  >
                    <legend className="px-2 text-sm font-bold text-blue-950">
                      פרטי קשר לחזרה <span aria-hidden="true" className="text-red-700">*</span>
                      <span className="sr-only"> נדרש למלא לפחות אחת מהאפשרויות</span>
                    </legend>
                    <p id="accessibility-reply-help" className="text-sm leading-6 text-blue-900">
                      יש למלא כתובת אימייל או מספר טלפון אחד לפחות. כל שדה בנפרד אינו חובה.
                    </p>

                    <div className="space-y-2">
                      <label htmlFor="accessibility-email" className="mr-1 text-sm font-bold text-blue-950">כתובת אימייל</label>
                      <Input
                        id="accessibility-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        aria-invalid={Boolean(fieldErrors.email || fieldErrors.reply)}
                        aria-describedby={`accessibility-reply-help${fieldErrors.email ? " accessibility-email-error" : ""}${fieldErrors.reply ? " accessibility-reply-error" : ""}`}
                        onChange={() => clearFieldError("email")}
                        className={`h-12 border-blue-200 bg-white text-right text-base text-blue-950 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 ${fieldErrors.email || fieldErrors.reply ? "border-red-700 focus-visible:ring-red-700" : ""}`}
                      />
                      {fieldErrors.email && (
                        <p id="accessibility-email-error" role="alert" className="text-sm font-semibold text-red-800">
                          {fieldErrors.email}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="accessibility-phone" className="mr-1 text-sm font-bold text-blue-950">מספר טלפון</label>
                      <Input
                        id="accessibility-phone"
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        aria-invalid={Boolean(fieldErrors.phone || fieldErrors.reply)}
                        aria-describedby={`accessibility-reply-help${fieldErrors.phone ? " accessibility-phone-error" : ""}${fieldErrors.reply ? " accessibility-reply-error" : ""}`}
                        onChange={() => clearFieldError("phone")}
                        className={`h-12 border-blue-200 bg-white text-right text-base text-blue-950 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 ${fieldErrors.phone || fieldErrors.reply ? "border-red-700 focus-visible:ring-red-700" : ""}`}
                      />
                      {fieldErrors.phone && (
                        <p id="accessibility-phone-error" role="alert" className="text-sm font-semibold text-red-800">
                          {fieldErrors.phone}
                        </p>
                      )}
                    </div>
                    {fieldErrors.reply && (
                      <p id="accessibility-reply-error" role="alert" className="text-sm font-semibold text-red-800">
                        {fieldErrors.reply}
                      </p>
                    )}
                  </fieldset>

                  <div className="space-y-2">
                    <label htmlFor="accessibility-message" className="mr-1 text-sm font-bold text-blue-950">
                      תיאור הקושי באתר <span aria-hidden="true" className="text-red-700">*</span>
                    </label>
                    <p id="accessibility-message-help" className="text-sm leading-6 text-slate-600">
                      למשל: באיזה עמוד או שלב נתקלתם בקושי ומה ניסיתם לעשות.
                    </p>
                    <Textarea
                      id="accessibility-message"
                      name="message"
                      required
                      rows={5}
                      aria-invalid={Boolean(fieldErrors.message)}
                      aria-describedby={`accessibility-message-help${fieldErrors.message ? " accessibility-message-error" : ""}`}
                      onChange={() => clearFieldError("message")}
                      className={`min-h-32 border-blue-200 bg-slate-50 text-right text-base text-blue-950 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 ${fieldErrors.message ? "border-red-700 focus-visible:ring-red-700" : ""}`}
                    />
                    {fieldErrors.message && (
                      <p id="accessibility-message-error" role="alert" className="text-sm font-semibold text-red-800">
                        {fieldErrors.message}
                      </p>
                    )}
                  </div>

                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                    אין צורך לציין אבחנה או מידע רפואי רגיש. אנא תארו רק את הקושי בשימוש באתר.
                  </p>

                  {submissionStatus && (
                    <div
                      role={submissionStatus.type === "error" ? "alert" : "status"}
                      aria-live={submissionStatus.type === "error" ? "assertive" : "polite"}
                      aria-atomic="true"
                      className={`flex items-start gap-3 rounded-2xl border p-4 ${submissionStatus.type === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}
                    >
                      {submissionStatus.type === "error" ? (
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                      )}
                      <div>
                        <p className="font-semibold">{submissionStatus.message}</p>
                        {submissionStatus.type === "error" && (
                          <a href={clinicPhoneLink} className="mt-2 inline-block rounded-sm font-bold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-800 focus-visible:ring-offset-2">
                            התקשרו למרפאה: {clinicPhone}
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                    {loading ? "שולחים את הפנייה בנושא הנגישות..." : ""}
                  </p>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={loading}
                    aria-busy={loading}
                    className="h-14 w-full bg-blue-700 text-base font-black text-white shadow-lg shadow-blue-900/20 transition-colors hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 sm:text-lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="ml-2 h-5 w-5 animate-spin" aria-hidden="true" />
                        שולחים פנייה...
                      </>
                    ) : (
                      <>
                        <Send className="ml-2 h-5 w-5" aria-hidden="true" />
                        שליחת פנייה בנושא נגישות
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default AccessibilityStatement;
