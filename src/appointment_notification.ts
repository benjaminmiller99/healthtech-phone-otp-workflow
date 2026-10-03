export type AppointmentState = "requested" | "confirmed" | "rescheduled" | "cancelled";

export type AppointmentChange = {
  appointmentId: string;
  patientEmail: string;
  state: AppointmentState;
  startsAt: string;
};

export type OperationalEmail = {
  to: string;
  subject: string;
  text: string;
};

export function appointmentEmail(change: AppointmentChange): OperationalEmail | null {
  if (change.state === "requested") return null;

  const date = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(change.startsAt));
  const action = change.state === "confirmed"
    ? "confirmed"
    : change.state === "rescheduled"
      ? "rescheduled"
      : "cancelled";

  return {
    to: change.patientEmail,
    subject: `Appointment ${action}`,
    text: `Your appointment ${change.appointmentId} is ${action} for ${date} UTC. Sign in to the patient portal for details.`,
  };
}
