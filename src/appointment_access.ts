import express from "express";
import { z } from "zod";
import { appointmentEmail, type AppointmentChange } from "./appointment_notification";
import { InfraiError, infraiFromEnvironment } from "./infrai_client";

const app = express();
app.use(express.json({ limit: "16kb" }));

const phoneCodeRequest = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default("en-US"),
}).strict();

const phoneCodeVerification = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  code: z.string().regex(/^\d{4,8}$/),
}).strict();

const appointmentChange = z.object({
  appointmentId: z.string().min(1).max(80),
  patientEmail: z.string().email(),
  state: z.enum(["requested", "confirmed", "rescheduled", "cancelled"]),
  startsAt: z.string().datetime({ offset: true }),
}).strict();

const deliveryLookup = z.object({ messageId: z.string().min(1).max(200) }).strict();

function clientErrorStatus(error: InfraiError): number {
  if (error.status === 429) return 429;
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}

app.post("/login/code", async (req, res, next) => {
  try {
    const input = phoneCodeRequest.parse(req.body);
    const result = await infraiFromEnvironment().sendPhoneCode(input.phone, input.locale);
    res.status(202).json({ accepted: true, requestId: result.id ?? null });
  } catch (error) {
    next(error);
  }
});

app.post("/login/verify", async (req, res, next) => {
  try {
    const input = phoneCodeVerification.parse(req.body);
    const result = await infraiFromEnvironment().verifyPhoneCode(input.phone, input.code);
    res.json({ authenticated: true, userId: result.user_id ?? null, sessionId: result.session_id ?? null });
  } catch (error) {
    next(error);
  }
});

app.post("/appointments/notify", async (req, res, next) => {
  try {
    const input = appointmentChange.parse(req.body) as AppointmentChange;
    const email = appointmentEmail(input);
    if (!email) {
      res.json({ sent: false, reason: "appointment_not_final" });
      return;
    }
    const result = await infraiFromEnvironment().sendAppointmentEmail(email.to, email.subject, email.text);
    res.status(202).json({ sent: true, messageId: result.message_id });
  } catch (error) {
    next(error);
  }
});

app.get("/notifications/:messageId", async (req, res, next) => {
  try {
    const { messageId } = deliveryLookup.parse(req.params);
    const delivery = await infraiFromEnvironment().getEmailDelivery(messageId);
    res.json({ messageId, delivery });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "invalid_request", issues: error.flatten().fieldErrors });
    return;
  }
  if (error instanceof InfraiError) {
    res.status(clientErrorStatus(error)).json({ error: error.code, message: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "internal_error" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Appointment access service listening on http://localhost:${port}`));
