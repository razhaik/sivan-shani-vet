
import React, { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { format, isBefore, startOfDay, addMonths } from "date-fns";
import { he } from "date-fns/locale";
import html2canvas from "html2canvas";
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { publicAppointmentBooking } from "@/functions";
import { ClinicService } from "@/entities";
import { 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Phone, 
  Mail,
  PawPrint, 
  FileText,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { VetHeader } from "@/components/landing/VetHeader";
import {
  DEFAULT_WEEKLY_AVAILABILITY,
  getClinicHours,
  minutesToTime as clinicMinutesToTime,
  timeToMinutes as clinicTimeToMinutes,
} from "@/lib/clinicAvailability";

const normalizePhoneForSms = (raw?: string | null) => {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // If already in international format, keep as is
  if (trimmed.startsWith("+")) return trimmed;
  // Basic Israeli mobile normalization: 05XXXXXXXX -> +9725XXXXXXX
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return "+972" + digits.slice(1);
  }
  // Fallback: return as-is, Twilio will validate
  return trimmed;
};

const SMS_CONSENT_LANGUAGE = "אני מסכימ/ה לקבל מהמרפאה הודעות SMS בנוגע לתורים ולעדכונים חשובים. ניתן לבטל את ההסכמה בכל עת.";

export const PET_SPECIES_OPTIONS = [
  { value: "dog", label: "כלב" },
  { value: "cat", label: "חתול" },
  { value: "other", label: "אחר" },
] as const;

export type PetSpecies = (typeof PET_SPECIES_OPTIONS)[number]["value"];

export const isPetSpecies = (value: unknown): value is PetSpecies =>
  typeof value === "string" && PET_SPECIES_OPTIONS.some((option) => option.value === value);

const isValidSmsPhone = (value: string | null): value is string =>
  Boolean(value && /^\+[1-9]\d{7,14}$/.test(value));

type PublicBookingPayload = {
  status?: string | number;
  success?: boolean;
  found?: boolean;
  error?: string;
  message?: string;
  name?: string;
  phone?: string;
  email?: string;
  petName?: string;
  petSpecies?: string;
  available_start_times?: unknown;
  service?: {
    name?: unknown;
    booking_note?: unknown;
  };
  sms_consent_sync_warning?: boolean;
};

type CustomerFlow = "choice" | "new" | "existing";
type CustomerLookupStatus = "idle" | "loading" | "success" | "not_found" | "error";
type BookingField = "name" | "phone" | "email" | "petName" | "petSpecies";
type BookingFieldErrors = Partial<Record<BookingField, string>>;

function parsePublicBookingPayload(value: unknown): PublicBookingPayload | null {
  if (typeof value === "string") {
    try {
      return parsePublicBookingPayload(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, any>;
  if (record.data) return parsePublicBookingPayload(record.data);
  if (record.body) return parsePublicBookingPayload(record.body);
  return {
    status: typeof record.status === "string" || typeof record.status === "number" ? record.status : undefined,
    success: typeof record.success === "boolean" ? record.success : undefined,
    found: typeof record.found === "boolean" ? record.found : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
    name: typeof record.name === "string" ? record.name : undefined,
    phone: typeof record.phone === "string" ? record.phone : undefined,
    email: typeof record.email === "string" ? record.email : undefined,
    petName: typeof record.petName === "string" ? record.petName : undefined,
    petSpecies: typeof record.petSpecies === "string" ? record.petSpecies : undefined,
    available_start_times: record.available_start_times,
    service: record.service && typeof record.service === "object" ? record.service : undefined,
    sms_consent_sync_warning: record.sms_consent_sync_warning === true,
  };
}

function publicBookingErrorPayload(error: unknown): PublicBookingPayload | null {
  const direct = parsePublicBookingPayload(error);
  if (direct?.status || direct?.error || direct?.message) return direct;
  if (error && typeof error === "object" && "response" in error) {
    const responsePayload = parsePublicBookingPayload((error as Record<string, any>).response);
    if (responsePayload?.status || responsePayload?.error || responsePayload?.message) return responsePayload;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  const jsonStart = message.indexOf("{");
  return jsonStart >= 0 ? parsePublicBookingPayload(message.slice(jsonStart)) : null;
}

const CALENDAR_UNAVAILABLE_MESSAGE = "לא ניתן לאמת את זמינות היומן כרגע. נסו שוב בעוד רגע.";
const CALENDAR_UNAVAILABLE_BOOKING_DESCRIPTION = "המועד לא נקבע. הפרטים שמילאתם נשמרו בטופס, וחזרו לבחירת תאריך ושעה כדי לנסות שוב בעוד רגע.";

function isCalendarUnavailablePayload(payload: PublicBookingPayload | null) {
  if (!payload) return false;
  const error = typeof payload.error === "string" ? payload.error.trim().toLowerCase() : "";
  const status = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : payload.status;
  return error === "calendar_unavailable" || status === "calendar_unavailable" || status === 503 || status === "503";
}

function isCalendarUnavailableError(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as Record<string, any>;
    const response = value.response && typeof value.response === "object" ? value.response as Record<string, any> : null;
    const statuses = [value.status, value.statusCode, response?.status, response?.statusCode];
    if (statuses.some((status) => Number(status) === 503)) return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("503");
}

export const APPOINTMENT_TYPES = [
  { id: "vaccine", label: "חיסון וטיפולים שגרתיים", duration: 20, description: "טיפול שגרתי, חיסונים שנתיים ובדיקה תקופתית" },
  { id: "general", label: "בדיקה כללית / לקוח חדש", duration: 30, description: "בדיקה רפואית מקיפה לבעיות ספציפיות או היכרות ראשונה" },
  { id: "surgery", label: "עיקור / סירוס / פרוצדורה אחרת", duration: 90, description: "ניתוחים ופרוצדורות מורכבות (נא לפרט בהערות)" },
  { id: "dental", label: "ניקוי שיניים בהרדמה", duration: 90, description: "טיפול שיניים יסודי תחת הרדמה מלאה" },
];

type ClinicServiceRecord = {
  id?: unknown;
  name?: unknown;
  duration_minutes?: unknown;
  description?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
};

type PublicBookingService = {
  id: string;
  name: string;
  duration: number;
  description: string;
};

const legacyPublicBookingServices: PublicBookingService[] = APPOINTMENT_TYPES.map((type) => ({
  id: type.id,
  name: type.label,
  duration: type.duration,
  description: type.description,
}));

function publicServiceNameKey(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").toLocaleLowerCase("he");
}

function publicServiceId(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim();
}

function publicServiceIsActive(value: unknown) {
  return value !== false && value !== 0 && value !== "false";
}

function normalizePublicCatalogServices(records: ClinicServiceRecord[]) {
  const normalized = records
    .map((record, index) => {
      const id = publicServiceId(record.id);
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const duration = typeof record.duration_minutes === "number" ? record.duration_minutes : Number(record.duration_minutes);
      if (!id || !name || !publicServiceIsActive(record.is_active) || !Number.isInteger(duration) || duration <= 0 || duration > 720) return null;

      const legacy = APPOINTMENT_TYPES.find((type) => type.id === id || publicServiceNameKey(type.label) === publicServiceNameKey(name));
      const description = typeof record.description === "string" ? record.description.trim() : "";
      const rawSortOrder = typeof record.sort_order === "number" ? record.sort_order : Number(record.sort_order);
      const sortOrder = Number.isInteger(rawSortOrder) && rawSortOrder >= 0 ? rawSortOrder : Number.MAX_SAFE_INTEGER;

      return {
        service: {
          id,
          name,
          duration,
          description: description || legacy?.description || "",
        },
        sortOrder,
        index,
      };
    })
    .filter((item): item is { service: PublicBookingService; sortOrder: number; index: number } => Boolean(item))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.index - right.index);

  return normalized.map(({ service }) => service);
}

async function fetchPublicClinicServices(): Promise<ClinicServiceRecord[]> {
  const result = await ClinicService.list("sort_order", 500);
  return Array.isArray(result) ? result as ClinicServiceRecord[] : [];
}

// Kept as compatibility exports for existing booking consumers. Public runtime
// availability is calculated by the secure booking boundary.
export const CLINIC_HOURS = getClinicHours(DEFAULT_WEEKLY_AVAILABILITY);
export const timeToMinutes = clinicTimeToMinutes;
export const minutesToTime = clinicMinutesToTime;

export default function AppointmentBooking() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<PublicBookingService | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientData, setClientData] = useState({
    name: "",
    phone: "",
    email: "",
    petName: "",
    petSpecies: "",
    notes: "",
    smsConsent: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [availabilityErrorMessage, setAvailabilityErrorMessage] = useState("");
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);
  const [selectedTypeNote, setSelectedTypeNote] = useState("");
  const [smsConsentSyncWarning, setSmsConsentSyncWarning] = useState(false);
  const [bookingFieldErrors, setBookingFieldErrors] = useState<BookingFieldErrors>({});
  const [customerFlow, setCustomerFlow] = useState<CustomerFlow>("choice");
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupStatus, setLookupStatus] = useState<CustomerLookupStatus>("idle");
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookupPhoneError, setLookupPhoneError] = useState(false);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const speciesFieldRef = useRef<HTMLFieldSetElement | null>(null);
  const previousStepRef = useRef(step);

  type FeedbackType = "error" | "success" | "info";
  const [feedback, setFeedback] = useState<{
    type: FeedbackType;
    title: string;
    description?: string;
  } | null>(null);

  const clearBookingFieldError = (field: BookingField) => {
    setBookingFieldErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const focusBookingField = (field: BookingField) => {
    window.requestAnimationFrame(() => {
      if (field === "petSpecies") {
        const speciesField = speciesFieldRef.current;
        if (!speciesField) return;
        speciesField.scrollIntoView({ behavior: "smooth", block: "center" });
        speciesField.querySelector<HTMLButtonElement>("button")?.focus();
        return;
      }

      const input = document.getElementById(field);
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus();
    });
  };

  const showFeedback = (type: FeedbackType, title: string, description?: string) => {
    setFeedback({ type, title, description });
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (_) {}
  };

  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    const timeout = window.setTimeout(() => {
      document.querySelector<HTMLElement>("[data-booking-step-heading]")?.focus();
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [step]);

  const location = useLocation();
  const servicesQuery = useQuery<ClinicServiceRecord[]>({
    queryKey: ["public-booking", "clinic-services"],
    queryFn: fetchPublicClinicServices,
  });
  const bookingServices = servicesQuery.isError
    ? legacyPublicBookingServices
    : servicesQuery.isSuccess
      ? normalizePublicCatalogServices(servicesQuery.data || [])
      : [];

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const name = params.get("name") || "";
    const phone = params.get("phone") || "";
    const email = params.get("email") || "";
    const petName = params.get("petName") || "";
    const petSpecies = params.get("petSpecies") || "";

    if (name || phone || email || petName || petSpecies) {
      setCustomerFlow("new");
      setClientData((prev) => ({
        ...prev,
        name: name || prev.name,
        phone: phone || prev.phone,
        email: email || prev.email,
        petName: petName || prev.petName,
        petSpecies: isPetSpecies(petSpecies) ? petSpecies : prev.petSpecies,
      }));
    }
  }, [location.search]);

  const handleChooseExistingCustomer = () => {
    setCustomerFlow("existing");
    setLookupStatus("idle");
    setLookupPhoneError(false);
    setLookupMessage("");
    setLookupPhone((current) => current || clientData.phone);
  };

  const handleChooseNewCustomer = (preserveLookupPhone = false) => {
    const phoneToKeep = preserveLookupPhone ? lookupPhone.trim() : "";
    setCustomerFlow("new");
    setLookupStatus("idle");
    setLookupPhoneError(false);
    setLookupMessage("");
    setClientData((prev) => ({
      ...prev,
      name: "",
      phone: phoneToKeep,
      email: "",
      petName: "",
      petSpecies: "",
      notes: "",
      smsConsent: false,
    }));
  };

  const handleBackToCustomerChoice = () => {
    setCustomerFlow("choice");
    setLookupStatus("idle");
    setLookupPhoneError(false);
    setLookupMessage("");
  };

  const handleSearchAgain = () => {
    const phoneToSearch = clientData.phone.trim() || lookupPhone.trim();
    setLookupPhone(phoneToSearch);
    setLookupStatus("idle");
    setLookupPhoneError(false);
    setLookupMessage("");
    setCustomerFlow("existing");
    setClientData((prev) => ({
      ...prev,
      name: "",
      phone: phoneToSearch || prev.phone,
      email: "",
      petName: "",
      petSpecies: "",
      notes: "",
      smsConsent: false,
    }));
  };

  const handleCustomerLookup = async () => {
    const phoneToSearch = lookupPhone.trim();
    const digitCount = phoneToSearch.replace(/\D/g, "").length;
    if (!phoneToSearch || phoneToSearch.length > 40 || digitCount < 7) {
      setLookupStatus("error");
      setLookupPhoneError(true);
      setLookupMessage("נא להזין מספר טלפון תקין, כולל קידומת אזור או קידומת בינלאומית.");
      window.requestAnimationFrame(() => document.getElementById("customer-lookup-phone")?.focus());
      return;
    }

    setLookupPhoneError(false);
    setLookupStatus("loading");
    setLookupMessage("");
    setClientData((prev) => ({
      ...prev,
      name: "",
      phone: phoneToSearch,
      email: "",
      petName: "",
      petSpecies: "",
    }));

    try {
      const response = await publicAppointmentBooking({
        action: "lookup_customer",
        phone: phoneToSearch,
      });
      const payload = parsePublicBookingPayload(response);
      if (!payload) throw new Error("lookup_failed");

      if (payload.found === false || payload.status === "not_found") {
        setLookupStatus("not_found");
        setLookupMessage(payload.message || "לא מצאנו לקוח עם מספר הטלפון הזה.");
        return;
      }

      if (payload.status !== "ok" || payload.found !== true) {
        throw new Error("lookup_failed");
      }

      setClientData((prev) => ({
        ...prev,
        name: payload.name || "",
        phone: payload.phone || phoneToSearch,
        email: payload.email || "",
        petName: payload.petName || "",
        petSpecies: isPetSpecies(payload.petSpecies) ? payload.petSpecies : "",
      }));
      setLookupPhoneError(false);
      setLookupStatus("success");
      setLookupMessage("");
      window.requestAnimationFrame(() => document.getElementById("name")?.focus());
    } catch (error) {
      const payload = publicBookingErrorPayload(error);
      setLookupPhoneError(false);
      setLookupStatus("error");
      setLookupMessage(payload?.message || "לא הצלחנו לחפש את הפרטים כרגע. נסו שוב בעוד רגע.");
      console.error("[Booking] Customer lookup failed");
    }
  };

  const handleGlobalBack = () => {
    if (step === 1) {
      navigate("/");
    } else {
      setStep((prev) => Math.max(1, prev - 1));
    }
  };

  const handleTypeSelection = (type: PublicBookingService) => {
    setSelectedType(type);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setAvailableSlots([]);
    setAvailabilityError(false);
    setAvailabilityErrorMessage("");
    setSelectedTypeNote("");
    setStep(2);
  };

  const formattedDate = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";

  useEffect(() => {
    let cancelled = false;

    if (!formattedDate || !selectedType) {
      setAvailableSlots([]);
      setAvailabilityError(false);
      setAvailabilityErrorMessage("");
      setIsLoadingAvailability(false);
      setSelectedTypeNote("");
      return () => {
        cancelled = true;
      };
    }

    setAvailableSlots([]);
    setSelectedTime(null);
    setAvailabilityError(false);
    setAvailabilityErrorMessage("");
    setIsLoadingAvailability(true);

    publicAppointmentBooking({
      action: "availability",
      service_id: selectedType.id,
      service_name: selectedType.name,
      service_duration_minutes: selectedType.duration,
      date: formattedDate,
    })
      .then((response) => {
        const payload = parsePublicBookingPayload(response);
        if (isCalendarUnavailablePayload(payload)) {
          if (cancelled) return;
          setAvailableSlots([]);
          setSelectedTime(null);
          setSelectedTypeNote("");
          setAvailabilityError(true);
          setAvailabilityErrorMessage(CALENDAR_UNAVAILABLE_MESSAGE);
          return;
        }
        const rawAvailableTimes = payload?.available_start_times;
        const availableTimes = Array.isArray(rawAvailableTimes)
          ? rawAvailableTimes.filter(
              (time): time is string => typeof time === "string" && /^\d{2}:\d{2}$/.test(time),
            )
          : null;

        if (!payload || payload.status !== "ok" || payload.error || !availableTimes) {
          throw new Error(payload?.message || "לא הצלחנו לטעון את השעות הפנויות.");
        }

        if (cancelled) return;
        setAvailableSlots([...new Set(availableTimes)]);
        setAvailabilityErrorMessage("");
        setSelectedTypeNote(
          typeof payload.service?.booking_note === "string" ? payload.service.booking_note : "",
        );
      })
      .catch((error) => {
        if (cancelled) return;
        const payload = publicBookingErrorPayload(error);
        const calendarUnavailable = isCalendarUnavailablePayload(payload) || isCalendarUnavailableError(error);
        console.error("[Booking] Availability lookup failed:", error);
        setAvailableSlots([]);
        setSelectedTime(null);
        setSelectedTypeNote("");
        setAvailabilityError(true);
        setAvailabilityErrorMessage(calendarUnavailable ? CALENDAR_UNAVAILABLE_MESSAGE : "");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAvailability(false);
      });

    return () => {
      cancelled = true;
    };
  }, [formattedDate, selectedType, availabilityRefresh]);

  const displaySlots = availableSlots.map((time) => ({ time, isTaken: false }));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedType || !selectedDate || !selectedTime) return;

    const emailTrimmed = clientData.email.trim();
    const petNameTrimmed = clientData.petName.trim();
    const petSpecies = isPetSpecies(clientData.petSpecies) ? clientData.petSpecies : "";
    const normalizedPhone = normalizePhoneForSms(clientData.phone);
    const errors: BookingFieldErrors = {};

    if (!clientData.name.trim()) errors.name = "נא למלא שם מלא.";
    if (clientData.phone.trim().length < 9) errors.phone = "נא להזין מספר טלפון תקין.";
    if (!emailTrimmed) {
      errors.email = "נא למלא כתובת אימייל כדי שנוכל לשלוח אישור תור ותזכורות.";
    } else if (!emailTrimmed.includes("@")) {
      errors.email = "נא להזין כתובת אימייל תקינה, למשל name@example.com.";
    }
    if (!petNameTrimmed) errors.petName = "נא למלא את שם חיית המחמד כדי שנוכל לזהות את התור.";
    if (!petSpecies) errors.petSpecies = "נא לבחור סוג חיית מחמד לפני שליחת הבקשה.";
    if (clientData.smsConsent && !isValidSmsPhone(normalizedPhone)) {
      errors.phone = errors.phone || "כדי לקבל הודעות SMS, הזינו מספר נייד תקין או בטלו את הסימון.";
    }

    setBookingFieldErrors(errors);
    const firstInvalidField = (["name", "phone", "email", "petName", "petSpecies"] as BookingField[])
      .find((field) => Boolean(errors[field]));
    if (firstInvalidField) {
      focusBookingField(firstInvalidField);
      return;
    }

    setBookingFieldErrors({});

    const returnToTimeSelection = (title: string, description: string) => {
      setSelectedTime(null);
      setAvailableSlots([]);
      setAvailabilityError(false);
      setAvailabilityErrorMessage("");
      setStep(2);
      setAvailabilityRefresh((value) => value + 1);
      showFeedback("error", title, description);
    };

    const handleSlotIssue = (payload: PublicBookingPayload | null, error?: unknown) => {
      if (isCalendarUnavailablePayload(payload) || isCalendarUnavailableError(error)) {
        returnToTimeSelection("לא ניתן לאמת את זמינות היומן", CALENDAR_UNAVAILABLE_BOOKING_DESCRIPTION);
        return true;
      }
      if (!payload) return false;
      if (payload.status === "conflict" || payload.error === "slot_unavailable") {
        returnToTimeSelection(
          "המועד שבחרתם כבר לא פנוי",
          payload.message || "השעה נתפסה בינתיים. בחרו שעה אחרת ונסו שוב.",
        );
        return true;
      }
      if (payload.status === "too_soon" || payload.error === "too_soon") {
        returnToTimeSelection(
          "מוקדם מדי לקביעת תור",
          payload.message || "לא ניתן לקבוע את המועד שבחרתם. בחרו מועד מאוחר יותר.",
        );
        return true;
      }
      return false;
    };

    setSmsConsentSyncWarning(false);
    setIsSubmitting(true);
    try {
      const response = await publicAppointmentBooking({
        action: "create",
        service_id: selectedType.id,
        service_name: selectedType.name,
        service_duration_minutes: selectedType.duration,
        date: formattedDate,
        start_time: selectedTime,
        client_name: clientData.name.trim(),
        phone: clientData.phone.trim(),
        email: emailTrimmed,
        pet_name: petNameTrimmed,
        pet_species: petSpecies,
        notes: clientData.notes.trim(),
        sms_consent: clientData.smsConsent,
        ...(clientData.smsConsent ? { sms_consent_language: SMS_CONSENT_LANGUAGE } : {}),
      });
      const payload = parsePublicBookingPayload(response);

      if (handleSlotIssue(payload, response)) return;
      if (!payload || payload.success !== true || payload.status !== "success") {
        throw new Error(payload?.message || "לא הצלחנו להשלים את בקשת התור.");
      }

      setSmsConsentSyncWarning(payload.sms_consent_sync_warning === true);
      setStep(4);
    } catch (error) {
      const payload = publicBookingErrorPayload(error);
      if (handleSlotIssue(payload, error)) return;
      console.error("Booking error:", error);
      showFeedback("error", "שגיאה בקביעת התור", payload?.message || "משהו השתבש, אנא נסה שוב או צור איתנו קשר טלפונית.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPrintWindowWithSummary = () => {
    if (!summaryRef.current) return;
    const printContents = summaryRef.current.innerHTML;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    win.document.open();
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="he">
        <head>
          <meta charset="utf-8" />
          <title>סיכום תור - ד"ר סיון שני</title>
          <style>
            body { 
              font-family: 'Assistant', sans-serif; 
              padding: 40px 20px; 
              direction: rtl; 
              text-align: right; 
              background: #f8fafc; 
              color: #1e293b;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white; 
              border-radius: 24px; 
              padding: 40px; 
              box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
              border: 1px solid #e2e8f0;
            }
            h1 { color: #0f172a; margin-bottom: 8px; font-size: 24px; }
            p { color: #64748b; margin-bottom: 24px; line-height: 1.6; }
            .details { background: #f1f5f9; padding: 24px; border-radius: 16px; }
            .row { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
            .label { font-weight: bold; color: #334155; }
            .value { color: #2563eb; font-weight: bold; }
            @media print {
              body { background: white; padding: 0; }
              .container { box-shadow: none; border: none; max-width: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="container">${printContents}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    // Give images/styles a moment to load
    setTimeout(() => {
      win.print();
    }, 500);
  };

  const handleMobileShare = async () => {
    if (!summaryRef.current) return;

    try {
      const canvas = await html2canvas(summaryRef.current, {
        scale: window.devicePixelRatio || 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const dataUrl = canvas.toDataURL("image/png");
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], "appointment-summary.png", { type: "image/png" });

      const shareDataWithFile: any = {
        files: [file],
        title: "סיכום תור – ד\"ר סיון שני",
        text: "סיכום פרטי התור שביקשת במרפאה.",
      };

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share(shareDataWithFile);
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title: shareDataWithFile.title,
          text: shareDataWithFile.text,
        });
        return;
      }

      // Fallback
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "appointment-summary.png";
      link.click();
    } catch (error) {
      console.error("Error during mobile share:", error);
      showFeedback("error", "לא הצלחנו לשתף", "אפשר לנסות שוב או לבצע צילום מסך ידני.");
    }
  };

  const handleShare = async () => {
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      await handleMobileShare();
    } else {
      openPrintWindowWithSummary();
    }
  };

  const showCustomerForm = customerFlow === "new" || (customerFlow === "existing" && lookupStatus === "success");

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 font-sans">
      <VetHeader />
      
      <main id="main-content" tabIndex={-1} className="container mx-auto max-w-4xl scroll-mt-28 px-4 pb-20 pt-32 focus:outline-none">
        {feedback && (
          <Alert
            variant={feedback.type === "error" ? "destructive" : "default"}
            role={feedback.type === "error" ? "alert" : "status"}
            aria-live={feedback.type === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            className="mb-6 text-right"
          >
            <AlertTitle className="font-bold">{feedback.title}</AlertTitle>
            {feedback.description && (
              <AlertDescription className="mt-1 whitespace-pre-line text-sm">
                {feedback.description}
              </AlertDescription>
            )}
          </Alert>
        )}

        {/* Clinic Note - shown only after choosing type */}
        {selectedTypeNote && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mb-8 flex items-start gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5"
          >
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-blue-900 text-sm">חשוב לדעת לגבי הטיפול שבחרת:</h3>
              <p className="text-blue-800 text-sm leading-relaxed whitespace-pre-line">{selectedTypeNote}</p>
            </div>
          </motion.div>
        )}
        
        {/* Booking progress */}
        <nav aria-label="שלבי קביעת התור" className="mb-12">
          <ol className="mb-4 flex items-center justify-center gap-4 sm:gap-8">
            {[1, 2, 3].map((s) => {
              const label = s === 1 ? "בחירת טיפול" : s === 2 ? "תאריך ושעה" : "פרטים אישיים";
              const isComplete = step > s;
              const stepContent = (
                <>
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 font-bold transition-colors ${
                      step === s
                        ? "border-blue-600 bg-blue-600 text-white"
                        : isComplete
                          ? "border-blue-100 bg-blue-100 text-blue-700"
                          : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    {isComplete ? <CheckCircle2 className="h-5 w-5" /> : s}
                  </span>
                  <span className="hidden font-bold sm:inline">{label}</span>
                  <span className="sr-only sm:hidden">שלב {s} מתוך 3: {label}</span>
                </>
              );
              const toneClass = step >= s ? "text-blue-700" : "text-slate-500";

              return (
                <li key={s}>
                  {s < step ? (
                    <button
                      type="button"
                      aria-label={`חזרה לשלב ${s}: ${label}`}
                      onClick={() => setStep(s)}
                      className={`flex items-center gap-2 rounded-md transition-colors hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-4 ${toneClass}`}
                    >
                      {stepContent}
                    </button>
                  ) : (
                    <span
                      aria-current={step === s ? "step" : undefined}
                      className={`flex items-center gap-2 ${toneClass}`}
                    >
                      {stepContent}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
            <motion.div
              className="h-full bg-blue-600"
              initial={{ width: "0%" }}
              animate={{ width: `${(Math.min(step, 3) / 3) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </nav>

        <AnimatePresence mode="wait">
          {/* STEP 1: SELECT APPOINTMENT TYPE */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid gap-6"
            >
              <div className="text-center mb-4">
                <h1 tabIndex={-1} data-booking-step-heading className="mb-2 text-3xl font-black text-slate-900">בחירת טיפול</h1>
                <p className="text-slate-500">בחרו את סוג הטיפול שמתאים לכם ונעבור אוטומטית לבחירת תאריך ושעה</p>
              </div>
              
              {servicesQuery.isError && (
                <Alert className="border-amber-200 bg-amber-50 text-right">
                  <AlertCircle className="h-4 w-4 text-amber-700" />
                  <AlertTitle className="font-bold text-amber-950">לא הצלחנו לטעון את רשימת הטיפולים</AlertTitle>
                  <AlertDescription className="mt-1 text-amber-900">
                    מציגים את אפשרויות הטיפול הקיימות כדי שתוכלו להמשיך בבקשת התור.
                  </AlertDescription>
                </Alert>
              )}

              {servicesQuery.isLoading ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center" role="status" aria-live="polite">
                  <div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" aria-hidden="true" />
                  <p className="font-bold text-slate-600">טוענים את רשימת הטיפולים...</p>
                </div>
              ) : bookingServices.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center" role="status" aria-live="polite">
                  <AlertCircle className="h-10 w-10 text-slate-300" aria-hidden="true" />
                  <h2 className="text-lg font-black text-slate-800">אין כרגע טיפולים זמינים להזמנה</h2>
                  <p className="max-w-md text-sm leading-6 text-slate-500">כל השירותים בקטלוג כבויים או שפרטי השירותים אינם תקינים כרגע. אפשר לפנות למרפאה כדי לבדוק את האפשרויות.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {bookingServices.map((type) => (
                    <Card
                      key={type.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedType?.id === type.id}
                      className={`cursor-pointer transition-all hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                        selectedType?.id === type.id ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500" : "bg-white"
                      }`}
                      onClick={() => handleTypeSelection(type)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleTypeSelection(type);
                        }
                      }}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-3">
                          <CardTitle className="text-lg font-bold">{type.name}</CardTitle>
                          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">
                            {type.duration} דקות
                          </span>
                        </div>
                        {type.description && <CardDescription className="text-sm whitespace-pre-line">{type.description}</CardDescription>}
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}

              <div className="flex justify-start items-center mt-6">
                <Button 
                  variant="ghost" 
                  onClick={handleGlobalBack}
                  className="gap-2"
                >
                  <ChevronRight className="w-4 h-4" />
                  חזרה
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: SELECT DATE & TIME */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid gap-8"
            >
              <div className="text-center mb-4">
                <h1 tabIndex={-1} data-booking-step-heading className="mb-2 text-3xl font-black text-slate-900">מתי הכי נח לכם?</h1>
                <p className="text-slate-500">בחרו יום ושעה פנויים מהלוח</p>
              </div>

              <div className="grid lg:grid-cols-[1fr_350px] gap-8">
                {/* Calendar Card */}
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="pb-0">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CalendarIcon className="w-5 h-5 text-blue-600" />
                      בחירת תאריך
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 flex justify-center">
                    <div className="pointer-events-auto">
                      <BookingCalendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          setSelectedDate(date);
                          setSelectedTime(null);
                        }}
                        locale={he}
                        fromMonth={startOfDay(new Date())}
                        toMonth={addMonths(startOfDay(new Date()), 12)}
                        disabled={(date) => isBefore(date, startOfDay(new Date()))}
                        className="rounded-md border-none"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Time Slots Card */}
                <Card className="shadow-sm border-slate-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Clock className="w-5 h-5 text-blue-600" />
                      שעות פנויות
                    </CardTitle>
                    {selectedDate && (
                      <CardDescription>
                        {format(selectedDate, "EEEE, d בMMMM", { locale: he })}
                      </CardDescription>
                    )}
                    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                      {selectedDate && !isLoadingAvailability && !availabilityError && displaySlots.length > 0
                        ? `נמצאו ${displaySlots.length} שעות פנויות ל${format(selectedDate, "EEEE d בMMMM", { locale: he })}.`
                        : ""}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {!selectedDate ? (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                        <CalendarIcon className="w-12 h-12 opacity-20" />
                        <p>אנא בחרו תאריך תחילה</p>
                      </div>
                    ) : isLoadingAvailability ? (
                      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center" role="status" aria-live="polite" aria-atomic="true">
                        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" aria-hidden="true" />
                        <p className="text-sm font-semibold text-slate-600">טוענים שעות פנויות...</p>
                      </div>
                    ) : availabilityError ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-slate-600" role="alert" aria-live="assertive" aria-atomic="true">
                        <AlertCircle className="h-12 w-12 text-amber-600" aria-hidden="true" />
                        <p>{availabilityErrorMessage || <>לא הצלחנו לטעון את השעות הפנויות<br />נסו שוב בעוד רגע</>}</p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setAvailabilityRefresh((value) => value + 1)}
                          className="font-bold"
                        >
                          ניסיון נוסף
                        </Button>
                      </div>
                    ) : displaySlots.length > 0 ? (
                      <>
                        <div
                          role="group"
                          aria-label={`שעות פנויות ליום ${format(selectedDate, "EEEE d בMMMM", { locale: he })}`}
                          className="grid grid-cols-3 gap-2"
                        >
                          {displaySlots.map(({ time, isTaken }) => (
                          <Button
                            key={time}
                            type="button"
                            disabled={isTaken}
                            variant={!isTaken && selectedTime === time ? "default" : "outline"}
                            className={`h-12 font-bold text-sm ${
                              isTaken
                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed hover:bg-slate-100 hover:border-slate-200"
                                : selectedTime === time
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "hover:border-blue-400 hover:bg-blue-50"
                            }`}
                            onClick={() => {
                              if (!isTaken) {
                                setSelectedTime(time);
                                setStep(3);
                              }
                            }}
                          >
                            {time}
                          </Button>
                          ))}
                        </div>
                        <div
                          role="group"
                          aria-label="מקרא זמינות השעות"
                          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500"
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              className="h-3 w-5 rounded-sm border border-slate-300 bg-white"
                            />
                            <span>השעות המוצגות זמינות לבחירה</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-slate-600" role="status" aria-live="polite" aria-atomic="true">
                        <AlertCircle className="h-12 w-12 text-slate-500" aria-hidden="true" />
                        <p>אין שעות פנויות בתאריך זה<br />אנא בחרו יום אחר</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-start items-center mt-4">
                <Button variant="ghost" onClick={() => setStep(1)} className="gap-2">
                  <ChevronRight className="w-4 h-4" />
                  חזרה
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: CLIENT DETAILS */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <Card className="shadow-lg border-slate-200 overflow-hidden">
                <div className="bg-blue-600 p-6 text-white text-center">
                  <h1 tabIndex={-1} data-booking-step-heading className="mb-1 text-2xl font-bold">כמעט סיימנו!</h1>
                  <p className="opacity-90">רק כמה פרטים אחרונים להשלמת התור</p>
                </div>
                
                {!showCustomerForm ? (
                  customerFlow === "choice" ? (
                    <CardContent className="p-6 sm:p-8">
                      <div className="mb-7 text-center">
                        <p className="text-sm font-bold text-blue-700">איך נמשיך?</p>
                        <h2 className="mt-1 text-xl font-black text-slate-900">בחרו את סוג הלקוח</h2>
                        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
                          לקוח קיים יכול לאתר את הפרטים השמורים לפי מספר הטלפון. לקוח חדש ימלא את הפרטים ידנית.
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={handleChooseExistingCustomer}
                          className="group min-h-[164px] rounded-3xl border-2 border-blue-100 bg-blue-50/40 p-6 text-right transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                          aria-label="לקוח קיים, חיפוש לפי מספר טלפון"
                        >
                          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-200 transition-transform group-hover:scale-105">
                            <User className="h-6 w-6" aria-hidden="true" />
                          </span>
                          <span className="block text-lg font-black text-slate-900">לקוח קיים</span>
                          <span className="mt-1 block text-sm leading-relaxed text-slate-600">נאתר את הפרטים שלכם לפי מספר הטלפון.</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleChooseNewCustomer()}
                          className="group min-h-[164px] rounded-3xl border-2 border-slate-200 bg-white p-6 text-right transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/30 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                          aria-label="לקוח חדש, מילוי פרטים ידני"
                        >
                          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-blue-700 transition-transform group-hover:scale-105">
                            <PawPrint className="h-6 w-6" aria-hidden="true" />
                          </span>
                          <span className="block text-lg font-black text-slate-900">לקוח חדש</span>
                          <span className="mt-1 block text-sm leading-relaxed text-slate-600">נמלא את הפרטים יחד, שלב אחר שלב.</span>
                        </button>
                      </div>

                      <div className="mt-7 flex justify-start">
                        <Button type="button" variant="ghost" onClick={() => setStep(2)} className="h-12 gap-2 px-4">
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          חזרה לתאריך ולשעה
                        </Button>
                      </div>
                    </CardContent>
                  ) : (
                    <CardContent className="p-6 sm:p-8">
                      <div className="mb-7 text-center">
                        <p className="text-sm font-bold text-blue-700">איתור לקוח קיים</p>
                        <h2 className="mt-1 text-xl font-black text-slate-900">מה מספר הטלפון שלכם?</h2>
                        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
                          נשתמש במספר רק כדי למצוא את פרטי הלקוח השמורים במרפאה. תוכלו לבדוק ולעדכן אותם לפני שליחת הבקשה.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <Label htmlFor="customer-lookup-phone" className="flex items-center gap-2 font-bold">
                          <Phone className="h-4 w-4 text-blue-600" aria-hidden="true" />
                          מספר טלפון
                        </Label>
                        <Input
                          id="customer-lookup-phone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          required
                          placeholder="05X-XXXXXXX"
                          value={lookupPhone}
                          onChange={(event) => {
                            setLookupPhoneError(false);
                            setLookupPhone(event.target.value);
                            if (lookupStatus !== "idle" && lookupStatus !== "loading") {
                              setLookupStatus("idle");
                              setLookupMessage("");
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleCustomerLookup();
                            }
                          }}
                          className="h-14 text-lg"
                          aria-describedby={lookupPhoneError ? "customer-lookup-help customer-lookup-error" : "customer-lookup-help"}
                          aria-invalid={lookupPhoneError}
                        />
                        <p id="customer-lookup-help" className="text-xs leading-relaxed text-slate-500">
                          אפשר לכתוב עם רווחים או מקפים, לדוגמה 05X-XXXXXXX או ‎+972 5X XXXXXXX.
                        </p>
                      </div>

                      {(lookupStatus === "not_found" || lookupStatus === "error") && (
                        <div
                          role="alert"
                          aria-live="assertive"
                          className={`mt-5 rounded-2xl border p-4 text-sm leading-relaxed ${
                            lookupStatus === "not_found"
                              ? "border-amber-200 bg-amber-50 text-amber-900"
                              : "border-red-200 bg-red-50 text-red-800"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            <div className="flex-1">
                              <p className="font-black">{lookupStatus === "not_found" ? "לא מצאנו את הפרטים" : "החיפוש לא הושלם"}</p>
                              <p id="customer-lookup-error" className="mt-1">{lookupMessage}</p>
                              {lookupStatus === "not_found" && (
                                <Button
                                  type="button"
                                  onClick={() => handleChooseNewCustomer(true)}
                                  className="mt-4 h-11 bg-blue-600 px-5 font-bold hover:bg-blue-700"
                                >
                                  המשיכו כלקוח חדש
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
                        <Button
                          type="button"
                          onClick={() => void handleCustomerLookup()}
                          disabled={lookupStatus === "loading"}
                          className="h-14 flex-1 bg-blue-600 text-base font-bold shadow-lg shadow-blue-200 hover:bg-blue-700"
                        >
                          {lookupStatus === "loading" ? (
                            <span className="flex items-center justify-center gap-2" role="status" aria-live="polite">
                              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                              מחפשים את הפרטים...
                            </span>
                          ) : "חיפוש ומילוי הפרטים"}
                        </Button>
                        <Button type="button" variant="ghost" onClick={handleBackToCustomerChoice} className="h-14 px-5 font-bold">
                          בחירת סוג לקוח
                        </Button>
                      </div>

                      <div className="mt-3 flex justify-start">
                        <Button type="button" variant="ghost" onClick={() => setStep(2)} className="h-11 gap-2 px-4 text-slate-500">
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          חזרה לתאריך ולשעה
                        </Button>
                      </div>
                    </CardContent>
                  )
                ) : (
                  <>
                    {customerFlow === "existing" && lookupStatus === "success" && (
                      <div className="mx-6 mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-right" role="status" aria-live="polite">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                          <div className="flex-1">
                            <p className="font-black text-emerald-900">מצאנו את הפרטים השמורים שלכם</p>
                            <p className="mt-1 text-sm leading-relaxed text-emerald-800">בדקו את הפרטים, השלימו שדות חסרים ועדכנו אותם אם צריך.</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" onClick={handleSearchAgain} className="rounded-lg px-3 py-2 text-sm font-bold text-emerald-900 underline decoration-emerald-300 underline-offset-4 transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                                חיפוש לפי מספר אחר
                              </button>
                              <button type="button" onClick={handleBackToCustomerChoice} className="rounded-lg px-3 py-2 text-sm font-bold text-emerald-900 underline decoration-emerald-300 underline-offset-4 transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                                חזרה לבחירת לקוח
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
                      <CardContent className="p-8 space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="flex items-center gap-2 font-bold">
                        <User className="h-4 w-4 text-blue-600" aria-hidden="true" />
                        שם מלא *
                      </Label>
                      <Input
                        id="name"
                        required
                        autoComplete="name"
                        placeholder="ישראל ישראלי"
                        value={clientData.name}
                        aria-invalid={Boolean(bookingFieldErrors.name)}
                        aria-describedby={bookingFieldErrors.name ? "name-error" : undefined}
                        onChange={(event) => {
                          clearBookingFieldError("name");
                          setClientData((previous) => ({ ...previous, name: event.target.value }));
                        }}
                        className={`h-12 ${bookingFieldErrors.name ? "border-red-700 focus-visible:ring-red-700" : ""}`}
                      />
                      {bookingFieldErrors.name && <p id="name-error" className="text-sm font-semibold text-red-800">{bookingFieldErrors.name}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="flex items-center gap-2 font-bold">
                        <Phone className="h-4 w-4 text-blue-600" aria-hidden="true" />
                        טלפון נייד *
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        required
                        placeholder="05X-XXXXXXX"
                        value={clientData.phone}
                        aria-invalid={Boolean(bookingFieldErrors.phone)}
                        aria-describedby={bookingFieldErrors.phone ? "phone-error" : undefined}
                        onChange={(event) => {
                          clearBookingFieldError("phone");
                          setClientData((previous) => ({ ...previous, phone: event.target.value }));
                        }}
                        className={`h-12 ${bookingFieldErrors.phone ? "border-red-700 focus-visible:ring-red-700" : ""}`}
                      />
                      {bookingFieldErrors.phone && <p id="phone-error" className="text-sm font-semibold text-red-800">{bookingFieldErrors.phone}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2 font-bold">
                      <Mail className="h-4 w-4 text-blue-600" aria-hidden="true" />
                      אימייל *
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="your@email.com"
                      value={clientData.email}
                      aria-invalid={Boolean(bookingFieldErrors.email)}
                      aria-describedby={bookingFieldErrors.email ? "email-error" : undefined}
                      onChange={(event) => {
                        clearBookingFieldError("email");
                        setClientData((previous) => ({ ...previous, email: event.target.value }));
                      }}
                      className={`h-12 ${bookingFieldErrors.email ? "border-red-700 focus-visible:ring-red-700" : ""}`}
                    />
                    {bookingFieldErrors.email && <p id="email-error" className="text-sm font-semibold text-red-800">{bookingFieldErrors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="petName" className="flex items-center gap-2 font-bold">
                      <PawPrint className="h-4 w-4 text-blue-600" aria-hidden="true" />
                      שם חיית המחמד *
                    </Label>
                    <Input
                      id="petName"
                      required
                      placeholder="לוקי, בלה, טובי..."
                      value={clientData.petName}
                      aria-invalid={Boolean(bookingFieldErrors.petName)}
                      aria-describedby={bookingFieldErrors.petName ? "pet-name-error" : undefined}
                      onChange={(event) => {
                        clearBookingFieldError("petName");
                        setClientData((previous) => ({ ...previous, petName: event.target.value }));
                      }}
                      className={`h-12 ${bookingFieldErrors.petName ? "border-red-700 focus-visible:ring-red-700" : ""}`}
                    />
                    {bookingFieldErrors.petName && <p id="pet-name-error" className="text-sm font-semibold text-red-800">{bookingFieldErrors.petName}</p>}
                  </div>

                  <fieldset
                    ref={speciesFieldRef}
                    aria-required="true"
                    aria-invalid={Boolean(bookingFieldErrors.petSpecies)}
                    aria-describedby={bookingFieldErrors.petSpecies ? "pet-species-help pet-species-error" : "pet-species-help"}
                    className={`space-y-3 rounded-2xl border p-4 transition-colors ${
                      bookingFieldErrors.petSpecies ? "border-red-300 bg-red-50/40" : "border-transparent"
                    }`}
                  >
                    <legend className="flex items-center gap-2 font-bold">
                      <PawPrint className="w-4 h-4 text-blue-600" />
                      סוג חיית המחמד *
                    </legend>
                    <div className="grid grid-cols-3 gap-2" role="group" aria-label="בחירת סוג חיית המחמד">
                      {PET_SPECIES_OPTIONS.map((option) => {
                        const isSelected = clientData.petSpecies === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => {
                              clearBookingFieldError("petSpecies");
                              setClientData((previous) => ({ ...previous, petSpecies: option.value }));
                            }}
                            className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                              isSelected
                                ? "border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600"
                                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50/50"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <p id="pet-species-help" className="text-xs leading-relaxed text-slate-500">יש לבחור סוג חיית מחמד אחד כדי שנוכל להכין את התור כראוי.</p>
                    {bookingFieldErrors.petSpecies && (
                      <p id="pet-species-error" role="alert" className="flex items-center gap-1.5 text-sm font-bold text-red-800">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {bookingFieldErrors.petSpecies}
                      </p>
                    )}
                  </fieldset>

                  <div className="space-y-2">
                    <Label htmlFor="notes" className="flex items-center gap-2 font-bold">
                      <FileText className="w-4 h-4 text-blue-600" />
                      הערות נוספות (אופציונלי)
                    </Label>
                    <Textarea 
                      id="notes" 
                      placeholder="למשל: סובל מהקאות, צולע ברגל שמאל..." 
                      rows={3}
                      value={clientData.notes}
                      onChange={(e) => setClientData({...clientData, notes: e.target.value})}
                    />
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                    <label htmlFor="sms-consent" className="flex cursor-pointer items-start gap-3 text-sm font-bold leading-relaxed text-slate-700">
                      <input
                        id="sms-consent"
                        type="checkbox"
                        checked={clientData.smsConsent}
                        onChange={(event) => {
                          clearBookingFieldError("phone");
                          setClientData((previous) => ({ ...previous, smsConsent: event.target.checked }));
                        }}
                        className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                      />
                      <span>{SMS_CONSENT_LANGUAGE}</span>
                    </label>
                    <p className="mt-2 pr-8 text-xs font-medium leading-relaxed text-slate-500">הסכמה זו היא לבחירתכם ואינה תנאי לקביעת התור.</p>
                  </div>

                  {/* Summary Box */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mt-8">
                    <h3 className="font-bold text-slate-900 mb-3 text-sm uppercase tracking-wider">סיכום התור:</h3>
                    <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                      <div className="flex items-center gap-2 text-slate-600">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="font-bold">{selectedType?.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <CalendarIcon className="w-4 h-4 text-blue-500" />
                        <span>{selectedDate ? format(selectedDate, "dd/MM/yyyy") : ""}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span>בשעה {selectedTime}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>

                    <div className="px-8 pb-8 flex flex-col sm:flex-row-reverse gap-4">
                      <Button
                        type="submit"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 h-14 text-lg font-bold shadow-lg shadow-blue-200"
                        disabled={isSubmitting}
                        aria-busy={isSubmitting}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center gap-2" role="status" aria-live="polite" aria-atomic="true">
                            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" aria-hidden="true" />
                            שולח בקשה...
                          </span>
                        ) : "קבע תור עכשיו"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setStep(2)} className="h-14 px-8" disabled={isSubmitting}>
                        חזרה
                      </Button>
                    </div>
                    </form>
                  </>
                )}
              </Card>
            </motion.div>
          )}

          {/* STEP 4: SUCCESS */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-xl mx-auto text-center py-12"
            >
              <div ref={summaryRef} className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 mb-8">
                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Clock className="w-10 h-10 text-amber-600" />
                </div>
                <h1 tabIndex={-1} data-booking-step-heading className="mb-4 text-3xl font-black text-slate-900">הבקשה לתור נשלחה!</h1>
                <p className="text-slate-600 text-lg mb-8 leading-relaxed">
                  תודה, {clientData.name}! <br />
                  בקשתך לתור עבור <strong>{clientData.petName || "חיית המחמד שלך"}</strong> התקבלה. המועד שבחרת נשמר עבורך וממתין לאישור סופי:
                </p>

                <div className="bg-slate-50 rounded-2xl p-6 text-right space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-black rounded-full">ממתין לאישור</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-700">
                    <CalendarIcon className="w-5 h-5 text-blue-600" />
                    <span className="font-bold">תאריך:</span>
                    <span>{selectedDate ? format(selectedDate, "dd/MM/yyyy") : ""}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-700">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <span className="font-bold">שעה:</span>
                    <span>{selectedTime}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                    <span className="font-bold">סוג טיפול:</span>
                    <span>{selectedType?.name}</span>
                  </div>
                </div>
              </div>

              <p className="text-slate-400 text-sm mb-8">
                ניצור איתך קשר לאישור סופי של המועד או לתיאום זמן חלופי במידת הצורך.
              </p>

              {smsConsentSyncWarning && (
                <Alert className="mb-8 border-amber-200 bg-amber-50 text-right">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="font-bold text-amber-900">התור נשמר, אך ההסכמה ל-SMS לא נרשמה</AlertTitle>
                  <AlertDescription className="mt-1 text-amber-800">ההסכמה לקבלת הודעות SMS לא נרשמה במערכת. נא לפנות למרפאה כדי לעדכן את ההסכמה.</AlertDescription>
                </Alert>
              )}
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  onClick={handleShare} 
                  variant="outline"
                  className="h-12 px-8 font-bold gap-2"
                >
                  <FileText className="w-4 h-4" />
                  שיתוף / הדפסה
                </Button>
                <Button 
                  onClick={() => navigate("/")} 
                  className="bg-blue-600 hover:bg-blue-700 h-12 px-8 font-bold"
                >
                  חזרה לדף הבית
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="py-8 text-center text-slate-400 text-sm border-t border-slate-200">
        <p>© 2026 ד"ר סיון שני - מרפאה וטרינרית</p>
      </footer>
    </div>
  );
}
