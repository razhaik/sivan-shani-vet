import { superdevClient } from "@/lib/superdev/client";

export const createCalendarEvent = superdevClient.functions["create-calendar-event"];
export const syncClinicAppointments = superdevClient.functions["sync-clinic-appointments"];
export const cancelAppointmentByToken = superdevClient.functions["cancel-appointment-by-token"];
export const manageAppointmentByToken = superdevClient.functions["manage-appointment-by-token"];
export const getCalendarBusy = superdevClient.functions["get-calendar-busy"];
export const getCalendarEvents = superdevClient.functions["get-calendar-events"];
export const publicAppointmentBooking = superdevClient.functions["public-appointment-booking"];
export const sendSms = superdevClient.functions["send-sms"];
export const sendBulkClientSms = superdevClient.functions["send-bulk-client-sms"];
export const sendOneSignalNotification = superdevClient.functions["send-onesignal-notification"];
export const sendBusinessNotification = superdevClient.functions["send-business-notification"];
export const testBusinessPush = superdevClient.functions["test-business-push"];
