/**
 * Replaceable identity source for the reusable veterinary-clinic dashboard.
 *
 * When exporting this dashboard for another clinic, replace the values in this
 * file only. The profile is intentionally static, so shell, page, email, and
 * marketing UI code can use it without loading business records.
 */
export interface VeterinaryClinicProfile {
  /** Full name shown in SEO, email headers, and identity surfaces. */
  businessName: string;
  /** Short name used where a compact clinic label reads better. */
  shortName: string;
  /** Customer-facing business category. */
  categoryLabel: string;
  /** Brand tagline used in dashboard marketing prompts and email headers. */
  tagline: string;
  /** Public clinic phone number, kept as display text for clinic CTAs. */
  phone: string;
  /** Public website origin, including protocol and no trailing slash. */
  publicOrigin: string;
  /** Internal dashboard route used when constructing private CRM links. */
  crmBasePath: string;
  /** Logo used by the CRM shell. Leave empty to use the text fallback. */
  logoUrl: string;
  /** Existing email watermark, kept separate from the shell logo to preserve email design. */
  emailLogoUrl: string;
  /** Public Google Reviews destination used by marketing CTAs. */
  googleReviewsUrl: string;
  /** IANA timezone used by clinic-facing date and calendar behavior. */
  timezone: string;
  /** Default locale for clinic-facing formatting. */
  locale: string;
  /** Name displayed by the embedded CRM assistant. */
  assistantDisplayName: string;
}

/**
 * Current clinic defaults. Replace these fields after exporting the dashboard
 * for another veterinary clinic. No entity or external connection is read here.
 */
export const VETERINARY_CLINIC_PROFILE: VeterinaryClinicProfile = {
  businessName: 'ד"ר סיון שני – מרפאה וטרינרית',
  shortName: 'ד"ר סיון שני',
  categoryLabel: "מרפאה וטרינרית",
  tagline: "טיפול באהבה לבעלי חיים",
  phone: "054-4345388",
  publicOrigin: "https://sivanshanivet.com",
  crmBasePath: "/business-crm",
  logoUrl:
    "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/1768587105801-2026-01-05-15.55.10-Nero-AI-Background-Remover.png",
  emailLogoUrl:
    "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/f4527f39-6b5f-4fae-b77d-5735fe1452b8-pasted-image-1789671955012.png",
  googleReviewsUrl:
    "https://www.google.com/search?q=%D7%A1%D7%99%D7%95%D7%9F+%D7%A9%D7%A0%D7%99&oq=%D7%A1%D7%99%D7%95%D7%9F+&gs_lcrp=EgZjaHJvbWUqCAgAEEUYJxg7MggIABBFGCcYOzIGCAEQRRg5MgYIAhAjGCcyBwgDEC4YgAQyDQgEEC4YrwEYxwEYgAQyBggFEEUYPTIGCAYQRRg9MgYIBxFGD3SAQgxMjc1ajBqNKgCALACAQ&sourceid=chrome&ie=UTF-8#lrd=0x1502b69024c904f3:0xd0cc3abadd287849,3,,,,",
  timezone: "Asia/Jerusalem",
  locale: "he-IL",
  assistantDisplayName: "העוזר של ד״ר סיון שני",
};

export function clinicDisplayLabel(profile: VeterinaryClinicProfile = VETERINARY_CLINIC_PROFILE): string {
  const shortName = profile.shortName.trim() || profile.businessName.trim();
  const category = profile.categoryLabel.trim();
  return category ? `${shortName} · ${category}` : shortName;
}

function normalizedOrigin(value: unknown, fallback: string): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  try {
    const parsed = new URL(candidate || fallback);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin;
  } catch {
    // Use the known profile origin below when a copied profile contains a typo.
  }
  return fallback.replace(/\/$/, "");
}

function publicHostname(profile: VeterinaryClinicProfile): string {
  const origin = normalizedOrigin(profile.publicOrigin, VETERINARY_CLINIC_PROFILE.publicOrigin);
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Return the approved public destination for an email action, or an empty
 * string when the destination is external or malformed.
 */
export function safePublicLink(value: unknown, profile: VeterinaryClinicProfile = VETERINARY_CLINIC_PROFILE): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 2048) return "";

  const origin = normalizedOrigin(profile.publicOrigin, VETERINARY_CLINIC_PROFILE.publicOrigin);
  try {
    const parsed = new URL(raw, origin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";

    const hostname = parsed.hostname.toLowerCase();
    const clinicHostname = publicHostname(profile);
    const isClinicLink = Boolean(clinicHostname) && (hostname === clinicHostname || hostname.endsWith(`.${clinicHostname}`));
    const isCalendarLink = hostname === "calendar.google.com" || hostname === "www.google.com";
    return isClinicLink || isCalendarLink ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function isSafePublicLink(value: unknown, profile: VeterinaryClinicProfile = VETERINARY_CLINIC_PROFILE): boolean {
  return Boolean(safePublicLink(value, profile));
}

/**
 * Shared footer text for direct emails. The current year keeps the existing
 * live output current while the clinic name and public domain come from this profile.
 */
export function clinicEmailFooter(
  profile: VeterinaryClinicProfile = VETERINARY_CLINIC_PROFILE,
  style: "marketing" | "appointment" = "marketing",
  year = new Date().getFullYear(),
): string {
  if (style === "appointment") return `© ${year} ${clinicDisplayLabel(profile)} | כל הזכויות שמורות`;

  const origin = normalizedOrigin(profile.publicOrigin, VETERINARY_CLINIC_PROFILE.publicOrigin);
  let host = profile.publicOrigin.trim();
  try {
    host = new URL(origin).hostname;
  } catch {
    host = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  return `${host} · כל הזכויות שמורות © ${year}`;
}
