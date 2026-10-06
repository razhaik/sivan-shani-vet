import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Phone, Clock, MapPin } from "lucide-react";
import { ContactInquiry } from "@/entities";
import { notifyBrowserPush } from "@/lib/onesignalPush";

type ContactField = "name" | "phone" | "email";
type ContactFieldErrors = Partial<Record<ContactField, string>>;

const clinicAddress = "צה\"ל 48 א׳, נס ציונה";
const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(clinicAddress)}&output=embed`;

export function VetContactSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [submissionStatus, setSubmissionStatus] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);

  const clearFieldError = (field: ContactField) => {
    setFieldErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const focusField = (field: ContactField) => {
    window.requestAnimationFrame(() => {
      const input = document.getElementById(`contact-${field}`);
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus();
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const name = (formData.get("name") as string) || "";
    const phone = (formData.get("phone") as string) || "";
    const email = (formData.get("email") as string) || "";
    const message = (formData.get("message") as string) || "";

    setSubmissionStatus(null);
    const nextErrors: ContactFieldErrors = {};
    if (!name.trim()) nextErrors.name = "נא למלא שם מלא.";
    if (!phone.trim()) nextErrors.phone = "נא למלא מספר טלפון.";

    const emailInput = form.querySelector<HTMLInputElement>("#contact-email");
    if (email.trim() && emailInput && !emailInput.validity.valid) {
      nextErrors.email = "נא להזין כתובת אימייל תקינה.";
    }

    const firstInvalidField = (["name", "phone", "email"] as ContactField[])
      .find((field) => Boolean(nextErrors[field]));

    if (firstInvalidField) {
      setFieldErrors(nextErrors);
      toast({
        variant: "destructive",
        title: "חסרים פרטים",
        description: "אנא תקנו את הפרטים המסומנים בטופס.",
      });
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
        message,
      });
      void notifyBrowserPush("new_inquiry", String(createdInquiry?.id || ""));

      const successMessage = "ההצעה נשלחה בהצלחה. אבחן את הפרטים ואחזור אליכם בהקדם.";
      setSubmissionStatus({ type: "success", message: successMessage });
      toast({
        title: "ההצעה נשלחה בהצלחה!",
        description: "אבחן את ההצעה ואחזור אליכם בהקדם.",
      });
      form.reset();
    } catch (error) {
      console.error("Error saving contact inquiry:", error);
      const errorMessage = "אירעה שגיאה בשמירת ההצעה. נסו שוב או פנו למרפאה בטלפון.";
      setSubmissionStatus({ type: "error", message: errorMessage });
      toast({
        variant: "destructive",
        title: "שגיאה בשליחת ההצעה",
        description: "אירעה שגיאה בשמירת ההצעה העסקית. נסו שוב או פנו אליי בטלפון.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="contact" className="bg-white py-24">
      <div className="container mx-auto px-4 md:px-8">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[3rem] border border-blue-50 bg-white shadow-2xl shadow-blue-900/10">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-10 text-right md:p-16">
              <h2 className="mb-2 text-3xl font-black text-blue-950">יש לכם הצעה עסקית או רעיון לשיתוף פעולה?</h2>
              <p className="mb-10 font-medium text-blue-700">יש לכם שירות, שיתוף פעולה או יוזמה עסקית שמתאימים למרפאה? כתבו לי כמה פרטים, ואבחן את ההצעה ואחזור אליכם בהקדם.</p>

              <form onSubmit={handleSubmit} noValidate className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="contact-name" className="mr-1 text-sm font-bold text-blue-900">שם מלא *</label>
                  <Input
                    id="contact-name"
                    name="name"
                    required
                    autoComplete="name"
                    placeholder="ישראל ישראלי"
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
                    onChange={() => clearFieldError("name")}
                    className={`h-12 bg-blue-50/50 text-right ${fieldErrors.name ? "border-red-700 focus-visible:ring-red-700" : "border-blue-100"}`}
                  />
                  {fieldErrors.name && <p id="contact-name-error" role="alert" className="text-sm font-semibold text-red-800">{fieldErrors.name}</p>}
                </div>

                <div className="space-y-2">
                  <label htmlFor="contact-phone" className="mr-1 text-sm font-bold text-blue-900">טלפון *</label>
                  <Input
                    id="contact-phone"
                    name="phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="050-0000000"
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? "contact-phone-error" : undefined}
                    onChange={() => clearFieldError("phone")}
                    className={`h-12 bg-blue-50/50 text-right ${fieldErrors.phone ? "border-red-700 focus-visible:ring-red-700" : "border-blue-100"}`}
                  />
                  {fieldErrors.phone && <p id="contact-phone-error" role="alert" className="text-sm font-semibold text-red-800">{fieldErrors.phone}</p>}
                </div>

                <div className="space-y-2">
                  <label htmlFor="contact-email" className="mr-1 text-sm font-bold text-blue-900">אימייל (לא חובה)</label>
                  <Input
                    id="contact-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="example@mail.com"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "contact-email-error" : undefined}
                    onChange={() => clearFieldError("email")}
                    className={`h-12 bg-blue-50/50 text-right ${fieldErrors.email ? "border-red-700 focus-visible:ring-red-700" : "border-blue-100"}`}
                  />
                  {fieldErrors.email && <p id="contact-email-error" role="alert" className="text-sm font-semibold text-red-800">{fieldErrors.email}</p>}
                </div>

                <div className="space-y-2">
                  <label htmlFor="contact-message" className="mr-1 text-sm font-bold text-blue-900">פרטי ההצעה העסקית</label>
                  <Textarea
                    id="contact-message"
                    name="message"
                    placeholder="ספרו בקצרה על ההצעה, השירות או שיתוף הפעולה..."
                    className="min-h-[120px] bg-blue-50/50 text-right"
                  />
                </div>

                {submissionStatus && (
                  <p
                    role={submissionStatus.type === "error" ? "alert" : "status"}
                    aria-live={submissionStatus.type === "error" ? "assertive" : "polite"}
                    aria-atomic="true"
                    className="sr-only"
                  >
                    {submissionStatus.message}
                  </p>
                )}
                <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                  {loading ? "שולחים את ההצעה..." : ""}
                </p>

                <Button type="submit" size="lg" disabled={loading} aria-busy={loading} className="h-14 w-full bg-blue-600 text-lg font-black text-white shadow-lg shadow-blue-200 hover:bg-blue-700 focus-visible:ring-blue-800">
                  {loading ? "שולח את ההצעה..." : "שליחת הצעה עסקית"}
                </Button>
              </form>
            </div>

            <div className="flex flex-col justify-center bg-gradient-to-br from-blue-600 to-indigo-800 p-10 text-white md:p-16">
              <div className="space-y-12">
                <div className="grid grid-cols-[auto,1fr] items-start gap-6 text-right">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                    <Phone className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="mb-1 text-xl font-bold">התקשרו אליי</h3>
                    <p className="text-lg text-blue-100">054-4345388</p>
                  </div>
                </div>

                <div className="grid grid-cols-[auto,1fr] items-start gap-6 text-right">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                    <Clock className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="mb-3 text-xl font-bold">שעות פעילות</h3>
                    <div className="space-y-1.5 text-sm text-blue-50 md:text-base">
                      <div className="flex flex-col md:flex-row md:gap-2"><span className="min-w-[80px] font-bold">יום ראשון:</span><span>16:00–19:30</span></div>
                      <div className="flex flex-col md:flex-row md:gap-2"><span className="min-w-[80px] font-bold">יום שני:</span><span>9:00–14:30, 16:00–19:30</span></div>
                      <div className="flex flex-col md:flex-row md:gap-2"><span className="min-w-[80px] font-bold">יום שלישי:</span><span>9:00–14:30, 16:00–19:30</span></div>
                      <div className="flex flex-col md:flex-row md:gap-2"><span className="min-w-[80px] font-bold">יום רביעי:</span><span>16:00–19:30</span></div>
                      <div className="flex flex-col md:flex-row md:gap-2"><span className="min-w-[80px] font-bold">יום חמישי:</span><span>9:00–14:30, 16:00–19:30</span></div>
                      <div className="flex flex-col md:flex-row md:gap-2"><span className="min-w-[80px] font-bold">יום שישי:</span><span>8:30–14:30</span></div>
                      <div className="flex flex-col md:flex-row md:gap-2 text-blue-100"><span className="min-w-[80px] font-bold">יום שבת:</span><span>סגור</span></div>
                    </div>
                    <p className="mt-3 text-xs font-medium italic text-white/90">* בתיאום מראש בלבד</p>
                  </div>
                </div>

                <div className="grid grid-cols-[auto,1fr] items-start gap-6 text-right">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                    <MapPin className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-col items-stretch gap-4 lg:flex-row">
                      <div className="min-w-0 flex-1">
                        <h3 className="mb-1 text-xl font-bold">כתובת</h3>
                        <p className="text-blue-100">{clinicAddress}</p>
                      </div>
                      <div className="w-full shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-lg lg:w-56">
                        <iframe
                          title="מפת הגעה למרפאה"
                          src={mapEmbedUrl}
                          loading="lazy"
                          allowFullScreen
                          referrerPolicy="no-referrer-when-downgrade"
                          className="block h-36 w-full border-0 lg:h-32"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
