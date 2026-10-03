import { appointmentEmail } from "../src/appointment_notification";
import { infraiFromEnvironment } from "../src/infrai_client";

const email = appointmentEmail({
  appointmentId: "appt_2048",
  patientEmail: process.env.DEMO_PATIENT_EMAIL ?? "patient@example.com",
  state: "confirmed",
  startsAt: "2027-01-15T09:30:00Z",
});

if (!email) throw new Error("Expected a confirmed appointment notification");

const client = infraiFromEnvironment();
const sent = await client.sendAppointmentEmail(email.to, email.subject, email.text);
const delivery = await client.getEmailDelivery(sent.message_id);
console.log(JSON.stringify({ appointmentId: "appt_2048", messageId: sent.message_id, delivery }, null, 2));
