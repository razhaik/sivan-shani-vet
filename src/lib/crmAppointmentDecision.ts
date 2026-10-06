import { Appointment } from "@/entities";
import { runAppointmentActionWithTimeout, runAppointmentSideEffects, type AppointmentActionResult, type AppointmentActionSnapshot } from "@/lib/crmAppointmentActions";

export type AppointmentDecisionSnapshot = AppointmentActionSnapshot;
export type AppointmentDecisionResult = AppointmentActionResult;
export type AppointmentDecisionAction = "approve" | "reject";

async function runDecision(snapshot: AppointmentDecisionSnapshot, action: AppointmentDecisionAction): Promise<AppointmentDecisionResult> {
  if (!snapshot.id) throw new Error("לבקשת התור חסר מזהה שמאפשר לשמור את ההחלטה.");
  if (snapshot.status && snapshot.status !== "requested") throw new Error("בקשת התור כבר טופלה או אינה ממתינה לאישור.");
  const updatePayload = action === "approve"
    ? { status: "confirmed", inbox_handled_at: new Date().toISOString() }
    : { status: "cancelled", cancelled_by: "admin", inbox_handled_at: new Date().toISOString() };
  try {
    await runAppointmentActionWithTimeout(() => Promise.resolve(Appointment.update(snapshot.id, updatePayload)), "שמירת החלטת הבקשה");
  } catch (error) {
    console.error("CRM appointment status update failed:", error);
    throw new Error("לא הצלחנו לשמור את החלטת הבקשה. נסי שוב.");
  }
  return runAppointmentSideEffects(snapshot, action);
}

export function approveAppointmentRequest(snapshot: AppointmentDecisionSnapshot) { return runDecision(snapshot, "approve"); }
export function rejectAppointmentRequest(snapshot: AppointmentDecisionSnapshot) { return runDecision(snapshot, "reject"); }
