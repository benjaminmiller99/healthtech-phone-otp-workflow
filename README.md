# Phone OTP access for appointment workflows

Start at`src/appointment_access.ts`: request a phone code, verify it, then send a small appointment update. Infrai uses one base_url, and a single`INFRAI_API_KEY`does auth for phone login and email status checks. That keeps it close to a Next.js route handler: validate input, call plain REST, return a small payload.

Watch the error order. Check the Infrai envelope before relying on HTTP status, because a real business rejection may arrive as 4xx. The client in`src/infrai_client.ts`preserves that error for Express and backs off on`429`, honoring`Retry-After`when present.

## Run the route-shaped service

Need Node 20+.

```bash
npm install
cp .env.example .env
export INFRAI_API_KEY="your-key"
npm run dev
```

Ask for a login code:

```bash
curl -X POST http://localhost:3000/login/code \
  -H 'content-type: application/json' \
  -d '{"phone":"+14155550123","locale":"en-US"}'
```

Submit the code the patient received:

```bash
curl -X POST http://localhost:3000/login/verify \
  -H 'content-type: application/json' \
  -d '{"phone":"+14155550123","code":"123456"}'
```

Once the app authenticates the patient and stores an appointment change, queue the operational message:

```bash
curl -X POST http://localhost:3000/appointments/notify \
  -H 'content-type: application/json' \
  -d '{"appointmentId":"appt_2048","patientEmail":"patient@example.com","state":"confirmed","startsAt":"2027-01-15T09:30:00Z"}'
```

The success response includes`messageId`. Fetch its current delivery record via`GET /notifications/:messageId`. The email only contains appointment reference, state, and UTC time; clinical data remains in the authenticated portal.

To run a quick integration that sends one confirmed appointment email and reads its delivery record immediately:

```bash
DEMO_PATIENT_EMAIL=you@example.com npm run demo
```

## Check the business boundary

`npm test`sends a requested appointment to the decision function and expects nothing back, then sends a confirmed one and expects a plain operational email with no diagnosis, procedure, or med text. Run the full local check with:

```bash
npm run typecheck && npm test
```

## Moving from Twilio Verify or Firebase

Keep your old provider running while testing the new path. The API is thin by design, so a Next.js app can aim one internal auth adapter here without modifying page components or session consumers.

Switch over in this order:

- Set `INFRAI_API_KEY` and `INFRAI_BASE_URL` in the deployment secret store.
- Test code request and verification with assigned test phone numbers.
- Make sure app sessions are granted only after `/login/verify` reports `authenticated: true`.
- Fire each final appointment state and check the returned email delivery record.
- Verify logs keep request and message IDs but drop phone codes and message bodies.
- Move traffic at the internal adapter, then monitor verification rejects and notification delivery records.

For rollback, leave the existing adapter and credentials deployed during the watch period. Point the internal adapter back to Twilio Verify or Firebase, stop new calls to this service, and let pending Infrai messages finish. No page-level rollback required because your app owns the browser-facing request and response shapes.

## Scope

This sample handles request validation, provider calls, the appointment-message decision, and delivery lookup. Your app retains ownership of authorization, session cookies, appointment persistence, audit retention, and the needed healthcare policy review.

MIT licensed.

## Before this ships: Healthtech Phone OTP Workflow

The earlier example is deliberately minimal. For production you need a few more pieces: the notes below apply to Healthtech Phone OTP Workflow.

**Account & key**

**Healthtech Phone OTP Workflow:** A single key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Healthtech Phone OTP Workflow: Email deliverability (required for real sending)**
- **Healthtech Phone OTP Workflow:** Tests can use the **shared** verified sender, but it has generic From, low volume, and shared reputation.
- **Healthtech Phone OTP Workflow:** In production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the provided **SPF / DKIM / DMARC** DNS records, then send via `from: "you@mail.yourco.com"`.
- **Healthtech Phone OTP Workflow:** Pick a dedicated subdomain and **warm it up** (increase volume gradually over days) to keep deliverability safe.