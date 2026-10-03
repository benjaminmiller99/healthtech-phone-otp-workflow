import assert from "node:assert/strict";
import test from "node:test";
import { appointmentEmail } from "../src/appointment_notification";

test("requested appointments stay quiet and confirmed messages omit clinical context", () => {
  const requested = appointmentEmail({
    appointmentId: "appt_91",
    patientEmail: "patient@example.com",
    state: "requested",
    startsAt: "2027-01-15T09:30:00Z",
  });
  assert.equal(requested, null);

  const confirmed = appointmentEmail({
    appointmentId: "appt_91",
    patientEmail: "patient@example.com",
    state: "confirmed",
    startsAt: "2027-01-15T09:30:00Z",
  });
  assert.deepEqual(confirmed, {
    to: "patient@example.com",
    subject: "Appointment confirmed",
    text: "Your appointment appt_91 is confirmed for Jan 15, 2027, 9:30 AM UTC. Sign in to the patient portal for details.",
  });
  assert.doesNotMatch(confirmed.text, /diagnosis|procedure|medication/i);
});
