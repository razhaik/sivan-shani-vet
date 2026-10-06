import { Appointment, AppointmentRescheduleRequest, User } from "@/entities";
import {
  appointmentSnapshotFromRecord,
  managementUrlFor,
  runAppointmentActionWithTimeout,
  sendRescheduleRejectionEmail,
  syncUpdatedAppointment,
  type AppointmentActionResult,
  type AppointmentActionSnapshot,
  type SideEffectOutcome,
} from "@/lib/crmAppointmentActions";
import { localIsraelToInstant, validateRescheduleSlot } from "@/lib/publicAppointmentAvailability";

export type RescheduleDecisionAction = "approve" | "reject";
export type RescheduleDecisionStatus = "pending" | "processing" | "approved" | "rejected" | "invalidated" | "recovery-required";

export interface RescheduleDecisionResult {
  action: RescheduleDecisionAction;
  status: RescheduleDecisionStatus;
  isPartial: boolean;
  idempotent: boolean;
  summary: string;
  notification?: SideEffectOutcome;
}

type AnyRecord = Record<string, any>;

type ClaimedRequest = {
  record: AnyRecord;
  processingStartedAt: string;
};

const requestLocks = new Map<string, Promise<RescheduleDecisionResult>>();

const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const statusText = (record: AnyRecord | null) => text(record?.status).toLowerCase() as RescheduleDecisionStatus | "";
const nowIso = () => new Date().toISOString();
const safeError = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, " ").slice(0, 240);

function asRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as AnyRecord;
  if (candidate.data && typeof candidate.data === "object" && !Array.isArray(candidate.data)) return candidate.data as AnyRecord;
  return candidate;
}

function isNotFoundError(error: unknown) {
  const message = safeError(error).toLowerCase();
  return message.includes("404") || message.includes("not found") || message.includes("does not exist") || message.includes("לא נמצא") || message.includes("לא נמצאה");
}

async function requireCrmAccess() {
  let currentUser: AnyRecord | null = null;
  try {
    currentUser = asRecord(await User.me());
  } catch (error) {
    console.error("Could not load the current CRM user for a reschedule decision:", error);
    throw new Error("נדרש חיבור לחשבון עם גישה ל־CRM כדי לטפל בבקשת שינוי המועד.");
  }

  const role = text(currentUser?.role).toLowerCase();
  if (!currentUser || !["administrator", "user"].includes(role)) {
    throw new Error("רק משתמשים עם גישה ל־CRM יכולים לאשר או לדחות בקשת שינוי מועד.");
  }
  return text(currentUser.id) || text(currentUser.email) || "crm-user";
}

async function readRequest(requestId: string): Promise<AnyRecord> {
  try {
    const loaded = await runAppointmentActionWithTimeout(
      () => Promise.resolve(AppointmentRescheduleRequest.get(requestId)),
      "טעינת בקשת שינוי המועד",
    );
    const request = asRecord(loaded);
    if (!request) throw new Error("לא נמצאה בקשת שינוי המועד.");
    return request;
  } catch (error) {
    if (error instanceof Error && error.message === "לא נמצאה בקשת שינוי המועד.") throw error;
    console.error("Failed to load reschedule request:", error);
    throw new Error("לא הצלחנו לטעון את בקשת שינוי המועד. נסי לרענן את תיבת הדואר.");
  }
}

async function readAppointment(appointmentId: string): Promise<AnyRecord | null> {
  try {
    const loaded = await runAppointmentActionWithTimeout(
      () => Promise.resolve(Appointment.get(appointmentId)),
      "טעינת התור המקורי",
    );
    return asRecord(loaded);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    console.error("Failed to load appointment for reschedule decision:", error);
    throw new Error("לא הצלחנו לטעון את התור המקורי. נסי שוב לפני קבלת החלטה.");
  }
}

async function updateRequest(requestId: string, payload: AnyRecord, label: string) {
  return runAppointmentActionWithTimeout(
    () => Promise.resolve(AppointmentRescheduleRequest.update(requestId, payload)),
    label,
  );
}

function sameSlot(request: AnyRecord, appointment: AnyRecord) {
  const oldDate = text(request.old_appointment_date);
  const oldStart = text(request.old_start_time).slice(0, 5);
  const oldEnd = text(request.old_end_time).slice(0, 5);
  const currentDate = text(appointment.date);
  const currentStart = text(appointment.start_time).slice(0, 5);
  const currentEnd = text(appointment.end_time).slice(0, 5);
  return Boolean(oldDate && oldStart && oldEnd && oldDate === currentDate && oldStart === currentStart && oldEnd === currentEnd);
}

function parentEligibilityError(appointment: AnyRecord) {
  const status = text(appointment.status).toLowerCase();
  if (!["confirmed", "active", "future"].includes(status)) return "התור המקורי כבר אינו תור מאושר ופעיל, ולכן אי אפשר לשנות את מועדו.";
  const start = localIsraelToInstant(appointment.date, text(appointment.start_time).slice(0, 5));
  if (!start || start.getTime() <= Date.now()) return "המועד המקורי כבר עבר או שאינו תקין, ולכן אי אפשר לאשר את שינוי המועד.";
  return "";
}

function decisionResult(action: RescheduleDecisionAction, request: AnyRecord): RescheduleDecisionResult | null {
  const status = statusText(request);
  if (!status || status === "pending") return null;
  if (status === "processing") throw new Error("בקשת שינוי המועד כבר נמצאת בטיפול. המתיני לרענון תיבת הדואר לפני ניסיון נוסף.");

  if (status === "approved") {
    return { action, status, isPartial: action !== "approve", idempotent: true, summary: action === "approve" ? "בקשת שינוי המועד כבר אושרה. התור נשמר במועד החדש." : "בקשת שינוי המועד כבר אושרה, ולכן אי אפשר לדחות אותה כעת." };
  }
  if (status === "rejected") {
    return { action, status, isPartial: action !== "reject", idempotent: true, summary: action === "reject" ? "בקשת שינוי המועד כבר נדחתה. התור המקורי נשאר בתוקף." : "בקשת שינוי המועד כבר נדחתה, ולכן אי אפשר לאשר אותה כעת." };
  }
  if (status === "invalidated") {
    return { action, status, isPartial: true, idempotent: true, summary: text(request.decision_note) || "בקשת שינוי המועד כבר סומנה כלא תקפה. התור המקורי לא שונה." };
  }
  if (status === "recovery-required") {
    return { action, status, isPartial: true, idempotent: true, summary: text(request.recovery_detail) || "בקשת שינוי המועד כבר עובדה, אך נדרשת בדיקה ידנית של התור וההודעות." };
  }
  throw new Error("סטטוס בקשת שינוי המועד אינו מוכר, ולכן לא בוצע שינוי.");
}

async function claimRequest(request: AnyRecord, decisionUserId: string): Promise<ClaimedRequest> {
  const requestId = text(request.id);
  if (!requestId) throw new Error("לבקשת שינוי המועד חסר מזהה שמאפשר לטפל בה.");
  const attemptCount = Number(request.processing_attempts);
  const attempts = Number.isInteger(attemptCount) && attemptCount >= 0 ? Math.min(attemptCount + 1, 100) : 1;
  const processingStartedAt = nowIso();
  try {
    await updateRequest(requestId, {
      status: "processing",
      processing_started_at: processingStartedAt,
      processing_attempts: attempts,
      decision_by_user_id: decisionUserId,
      last_error: "",
      last_error_at: "",
    }, "נעילת בקשת שינוי המועד");
  } catch (error) {
    console.error("Failed to claim reschedule request:", error);
    throw new Error("לא הצלחנו להתחיל את הטיפול בבקשת שינוי המועד. נסי שוב.");
  }

  const claimed = await readRequest(requestId);
  if (statusText(claimed) !== "processing" || text(claimed.processing_started_at) !== processingStartedAt || text(claimed.decision_by_user_id) !== decisionUserId) {
    throw new Error("בקשת שינוי המועד נתפסה לטיפול על ידי משתמש אחר. רענני את תיבת הדואר.");
  }
  return { record: claimed, processingStartedAt };
}

async function assertClaim(requestId: string, processingStartedAt: string, decisionUserId: string) {
  const current = await readRequest(requestId);
  if (statusText(current) !== "processing" || text(current.processing_started_at) !== processingStartedAt || text(current.decision_by_user_id) !== decisionUserId) {
    throw new Error("הבקשה השתנתה בזמן הטיפול, ולכן לא בוצע שינוי נוסף.");
  }
  return current;
}

async function releaseClaim(requestId: string, processingStartedAt: string, decisionUserId: string, detail: string) {
  try {
    const current = await readRequest(requestId);
    if (statusText(current) !== "processing" || text(current.processing_started_at) !== processingStartedAt || text(current.decision_by_user_id) !== decisionUserId) return;
    await updateRequest(requestId, {
      status: "pending",
      processing_started_at: "",
      last_error: detail,
      last_error_at: nowIso(),
    }, "שחרור בקשת שינוי המועד");
  } catch (error) {
    console.error("Failed to release a reschedule request after a temporary validation failure:", error);
  }
}

async function invalidateClaimedRequest(requestId: string, processingStartedAt: string, decisionUserId: string, detail: string): Promise<RescheduleDecisionResult> {
  const decidedAt = nowIso();
  try {
    await assertClaim(requestId, processingStartedAt, decisionUserId);
    await updateRequest(requestId, {
      status: "invalidated",
      processing_started_at: "",
      decision_at: decidedAt,
      decision_by_user_id: decisionUserId,
      decision_note: detail,
      inbox_handled_at: decidedAt,
      last_error: detail,
      last_error_at: decidedAt,
    }, "סימון בקשת שינוי המועד כלא תקפה");
  } catch (error) {
    console.error("Failed to invalidate an unsafe reschedule request:", error);
    throw new Error("לא הצלחנו לסמן את בקשת שינוי המועד כלא תקפה. התור לא שונה, נסי לרענן ולבדוק שוב.");
  }
  return { action: "approve", status: "invalidated", isPartial: true, idempotent: false, summary: `${detail} התור המקורי לא שונה.` };
}

async function markRecoveryRequired(requestId: string, processingStartedAt: string, decisionUserId: string, detail: string) {
  const decidedAt = nowIso();
  try {
    const current = await readRequest(requestId);
    if (statusText(current) !== "processing" || text(current.processing_started_at) !== processingStartedAt || text(current.decision_by_user_id) !== decisionUserId) return;
    await updateRequest(requestId, {
      status: "recovery-required",
      processing_started_at: "",
      decision_at: decidedAt,
      decision_by_user_id: decisionUserId,
      decision_note: detail,
      inbox_handled_at: decidedAt,
      recovery_required_at: decidedAt,
      recovery_detail: detail,
      last_error: detail,
      last_error_at: decidedAt,
    }, "שמירת מצב התאוששות לבקשת שינוי המועד");
  } catch (error) {
    console.error("Failed to record reschedule recovery state:", error);
  }
}

function snapshotForRecord(record: AnyRecord): AppointmentActionSnapshot {
  return appointmentSnapshotFromRecord(record);
}

function recoveryResult(action: RescheduleDecisionAction, summary: string, notification?: SideEffectOutcome): RescheduleDecisionResult {
  return { action, status: "recovery-required", isPartial: true, idempotent: false, summary, ...(notification ? { notification } : {}) };
}

async function finalizeApproval(
  requestId: string,
  processingStartedAt: string,
  decisionUserId: string,
  sideEffects: AppointmentActionResult | null,
  sideEffectError: string,
): Promise<RescheduleDecisionResult> {
  const decisionAt = nowIso();
  const summary = sideEffectError || sideEffects?.summary || "התור עודכן, אך לא התקבל סיכום של פעולות ההמשך.";
  const isPartial = Boolean(sideEffectError || sideEffects?.isPartial);
  const hasHardFailure = Boolean(
    sideEffectError
      || !sideEffects
      || sideEffects.calendar.status === "failed"
      || sideEffects.email.status === "failed"
      || sideEffects.sms.status === "failed",
  );
  const status: RescheduleDecisionStatus = hasHardFailure ? "recovery-required" : "approved";
  const notificationError = sideEffects && sideEffects.email.status !== "success"
    ? sideEffects.email.detail
    : sideEffectError;
  const payload: AnyRecord = {
    status,
    processing_started_at: "",
    decision_at: decisionAt,
    decision_by_user_id: decisionUserId,
    decision_note: summary,
    inbox_handled_at: decisionAt,
    customer_notification_error: notificationError || "",
    last_error: isPartial ? summary : "",
    last_error_at: isPartial ? decisionAt : "",
    ...(sideEffects?.email.status === "success" ? { customer_notification_sent_at: decisionAt } : {}),
    ...(hasHardFailure
      ? { recovery_required_at: decisionAt, recovery_detail: summary }
      : { recovery_required_at: "", recovery_detail: "" }),
  };

  try {
    await assertClaim(requestId, processingStartedAt, decisionUserId);
    await updateRequest(requestId, payload, "שמירת החלטת שינוי המועד");
  } catch (error) {
    const detail = `${summary} לא הצלחנו לשמור את סיום ההחלטה בבקשת השינוי, ולכן נדרשת בדיקה ידנית.`;
    await markRecoveryRequired(requestId, processingStartedAt, decisionUserId, detail);
    return recoveryResult("approve", detail, sideEffects?.email);
  }

  return {
    action: "approve",
    status,
    isPartial,
    idempotent: false,
    summary,
    ...(sideEffects?.email ? { notification: sideEffects.email } : {}),
  };
}

function rejectionSnapshot(request: AnyRecord, appointment: AnyRecord | null): AppointmentActionSnapshot {
  const fallback = {
    id: text(request.appointment_id),
    status: "confirmed",
    date: text(request.old_appointment_date),
    start_time: text(request.old_start_time),
    end_time: text(request.old_end_time),
    appointment_type: text(request.service_identifier),
  };
  return snapshotForRecord({ ...fallback, ...(appointment || {}) });
}

async function performApproval(requestId: string, decisionUserId: string): Promise<RescheduleDecisionResult> {
  const request = await readRequest(requestId);
  const existing = decisionResult("approve", request);
  if (existing) return existing;
  if (statusText(request) !== "pending") throw new Error("בקשת שינוי המועד כבר אינה ממתינה להחלטה.");

  const claim = await claimRequest(request, decisionUserId);
  const claimed = claim.record;
  const appointmentId = text(claimed.appointment_id);
  if (!appointmentId) return invalidateClaimedRequest(requestId, claim.processingStartedAt, decisionUserId, "לבקשת שינוי המועד חסר התור המקורי.");

  const appointment = await readAppointment(appointmentId);
  if (!appointment) return invalidateClaimedRequest(requestId, claim.processingStartedAt, decisionUserId, "התור המקורי לא נמצא, ולכן אי אפשר לשנות את מועדו.");
  const eligibilityError = parentEligibilityError(appointment);
  if (eligibilityError) return invalidateClaimedRequest(requestId, claim.processingStartedAt, decisionUserId, eligibilityError);
  if (!sameSlot(claimed, appointment)) return invalidateClaimedRequest(requestId, claim.processingStartedAt, decisionUserId, "התור המקורי השתנה מאז שהבקשה נשלחה, ולכן הבקשה אינה תקפה.");

  const validation = await validateRescheduleSlot(claimed, appointment);
  if (validation.kind === "unavailable") {
    await releaseClaim(requestId, claim.processingStartedAt, decisionUserId, validation.message);
    throw new Error(validation.message);
  }
  if (!validation.ok) return invalidateClaimedRequest(requestId, claim.processingStartedAt, decisionUserId, validation.message);

  const latestRequest = await assertClaim(requestId, claim.processingStartedAt, decisionUserId);
  const latestAppointment = await readAppointment(appointmentId);
  if (!latestAppointment) return invalidateClaimedRequest(requestId, claim.processingStartedAt, decisionUserId, "התור המקורי לא נמצא בבדיקה האחרונה, ולכן הבקשה אינה תקפה.");
  const latestEligibilityError = parentEligibilityError(latestAppointment);
  if (latestEligibilityError) return invalidateClaimedRequest(requestId, claim.processingStartedAt, decisionUserId, latestEligibilityError);
  if (!sameSlot(latestRequest, latestAppointment)) return invalidateClaimedRequest(requestId, claim.processingStartedAt, decisionUserId, "התור המקורי השתנה בזמן בדיקת הזמינות, ולכן לא בוצע שינוי.");

  const proposedDate = text(latestRequest.proposed_appointment_date);
  const proposedStart = text(latestRequest.proposed_start_time).slice(0, 5);
  const proposedEnd = text(latestRequest.proposed_end_time).slice(0, 5);
  const appointmentChanges = {
    date: proposedDate,
    start_time: proposedStart,
    end_time: proposedEnd,
    day_before_reminder_sent_at: "",
    hour_before_reminder_sent_at: "",
  };

  let savedAppointment: AnyRecord;
  try {
    const updated = await runAppointmentActionWithTimeout(
      () => Promise.resolve(Appointment.update(appointmentId, appointmentChanges)),
      "שמירת מועד התור החדש",
    );
    savedAppointment = { ...latestAppointment, ...appointmentChanges, ...(asRecord(updated) || {}) };
  } catch (error) {
    const detail = `לא הצלחנו לשמור את מועד התור החדש. ייתכן שהשמירה נכשלה, ולכן נדרשת בדיקה ידנית לפני ניסיון נוסף. (${safeError(error)})`;
    await markRecoveryRequired(requestId, claim.processingStartedAt, decisionUserId, detail);
    throw new Error(detail);
  }

  let sideEffects: AppointmentActionResult | null = null;
  let sideEffectError = "";
  try {
    sideEffects = await syncUpdatedAppointment(snapshotForRecord(savedAppointment));
  } catch (error) {
    console.error("Approved reschedule saved, but appointment side effects failed:", error);
    sideEffectError = `מועד התור עודכן, אך לא הצלחנו להשלים את הסנכרון ביומן ובהודעות. (${safeError(error)})`;
  }
  return finalizeApproval(requestId, claim.processingStartedAt, decisionUserId, sideEffects, sideEffectError);
}

async function recordRejectedNotificationFailure(requestId: string, detail: string) {
  const timestamp = nowIso();
  try {
    await updateRequest(requestId, {
      status: "rejected",
      customer_notification_error: detail,
      recovery_required_at: timestamp,
      recovery_detail: detail,
      last_error: detail,
      last_error_at: timestamp,
      processing_started_at: "",
    }, "שמירת תקלה בשליחת הודעת דחיית שינוי מועד");
  } catch (error) {
    console.error("Failed to record reschedule rejection notification failure:", error);
  }
}

async function performRejection(requestId: string, decisionUserId: string): Promise<RescheduleDecisionResult> {
  const request = await readRequest(requestId);
  const existing = decisionResult("reject", request);
  if (existing) return existing;
  if (statusText(request) !== "pending") throw new Error("בקשת שינוי המועד כבר אינה ממתינה להחלטה.");

  const claim = await claimRequest(request, decisionUserId);
  const claimed = claim.record;
  const appointmentId = text(claimed.appointment_id);
  let appointment: AnyRecord | null = null;
  let appointmentReadFailure = "";
  if (appointmentId) {
    try {
      appointment = await readAppointment(appointmentId);
    } catch (error) {
      appointmentReadFailure = safeError(error);
      console.error("Could not load appointment while rejecting reschedule request; request will remain appointment-safe:", error);
    }
  }
  const snapshot = rejectionSnapshot(claimed, appointment);
  const rejectionDetails = {
    requested_date: text(claimed.proposed_appointment_date),
    requested_start_time: text(claimed.proposed_start_time).slice(0, 5),
    requested_end_time: text(claimed.proposed_end_time).slice(0, 5),
  };
  const decisionAt = nowIso();
  const appointmentReadWarning = appointmentReadFailure
    ? `לא ניתן היה לטעון את התור המקורי בזמן הדחייה; נעשה שימוש בפרטי הבקשה שנשמרו. (${appointmentReadFailure})`
    : "";
  const decisionNote = "בקשת שינוי המועד נדחתה. התור המקורי נשאר בתוקף.";

  try {
    await assertClaim(requestId, claim.processingStartedAt, decisionUserId);
    await updateRequest(requestId, {
      status: "rejected",
      processing_started_at: "",
      decision_at: decisionAt,
      decision_by_user_id: decisionUserId,
      decision_note: decisionNote,
      inbox_handled_at: decisionAt,
      customer_notification_error: "",
      last_error: appointmentReadWarning,
      last_error_at: appointmentReadWarning ? decisionAt : "",
    }, "שמירת דחיית בקשת שינוי המועד");
  } catch (error) {
    console.error("Failed to reject reschedule request:", error);
    throw new Error("לא הצלחנו לשמור את דחיית בקשת שינוי המועד. התור המקורי לא שונה, נסי שוב.");
  }

  let managementUrl = "";
  try {
    managementUrl = await managementUrlFor(snapshot);
  } catch (error) {
    console.error("Could not resolve the appointment management URL for reschedule rejection:", error);
  }
  const notification = await sendRescheduleRejectionEmail(snapshot, rejectionDetails, managementUrl);
  if (notification.status === "success") {
    try {
      await updateRequest(requestId, {
        customer_notification_sent_at: nowIso(),
        customer_notification_error: "",
        recovery_required_at: "",
        recovery_detail: "",
        last_error: appointmentReadWarning,
        last_error_at: appointmentReadWarning ? decisionAt : "",
      }, "שמירת שליחת הודעת דחיית שינוי מועד");
    } catch (error) {
      const detail = "הבקשה נדחתה, אך לא הצלחנו לשמור את סימון שליחת הודעת הלקוח. נדרשת בדיקה ידנית.";
      await recordRejectedNotificationFailure(requestId, detail);
      return { action: "reject", status: "rejected", isPartial: true, idempotent: false, summary: `${decisionNote} ${detail}`, notification };
    }
    return { action: "reject", status: "rejected", isPartial: false, idempotent: false, summary: `${decisionNote} ${notification.detail}.`, notification };
  }

  const detail = `הבקשה נדחתה והתור המקורי נשאר בתוקף, אך הודעת הלקוח ${notification.detail}. נדרשת בדיקה ידנית לפני שליחה חוזרת.`;
  await recordRejectedNotificationFailure(requestId, detail);
  return { action: "reject", status: "rejected", isPartial: true, idempotent: false, summary: detail, notification };
}

function withRequestLock(requestId: string, work: () => Promise<RescheduleDecisionResult>) {
  const existing = requestLocks.get(requestId);
  if (existing) return existing;
  const operation = Promise.resolve().then(work);
  let tracked: Promise<RescheduleDecisionResult> | null = null;
  const completed = operation.finally(() => {
    if (tracked && requestLocks.get(requestId) === tracked) requestLocks.delete(requestId);
  });
  tracked = completed;
  requestLocks.set(requestId, completed);
  return completed;
}

export async function approveRescheduleRequest(requestId: string): Promise<RescheduleDecisionResult> {
  const normalizedId = text(requestId);
  if (!normalizedId) throw new Error("לבקשת שינוי המועד חסר מזהה תקין.");
  const decisionUserId = await requireCrmAccess();
  return withRequestLock(normalizedId, () => performApproval(normalizedId, decisionUserId));
}

export async function rejectRescheduleRequest(requestId: string): Promise<RescheduleDecisionResult> {
  const normalizedId = text(requestId);
  if (!normalizedId) throw new Error("לבקשת שינוי המועד חסר מזהה תקין.");
  const decisionUserId = await requireCrmAccess();
  return withRequestLock(normalizedId, () => performRejection(normalizedId, decisionUserId));
}
