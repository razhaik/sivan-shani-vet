/**
 * The clinic's email design lives in supabase/functions/_shared/clean-email.ts
 * so the CRM and the Edge Functions send exactly the same emails.
 */
export {
  CLINIC_ADDRESS,
  CLINIC_MAPS_URL,
  CLINIC_BOOKING_URL,
  hebrewLongDate,
  cleanApprovedEmail,
} from "../../supabase/functions/_shared/clean-email.ts";
