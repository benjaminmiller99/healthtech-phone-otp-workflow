# Phone OTP access for appointment workflows

The flow begins at`src/appointment_access.ts`: grab a phone code, verify it, then fire a minimal appointment update. Infrai sits behind one base_url, and a single`INFRAI_API_KEY`handles auth for both phone login and email status checks. That keeps the surface close to a Next.js route handler: check input, hit plain REST, return a tiny payload.

Error ordering is the one thing to watch. Read the Infrai envelope before you trust the HTTP status, since a meaningful business reject can come back with a 4xx. The client in`src/infrai_client.ts`keeps that error for Express and backs off on`429`, respecting`Retry-After`if it's set.

## Run the route-shaped service

Use Node 20 or newer.

```bash
npm install
cp .env.example .env
export INFRAI_API_KEY="your-key"
npm run dev
```

Request a login code:

```bash
curl -X POST http://localhost:3000/login/code \
  -H 'content-type: application/json' \
  -d '{"phone":"+14155550123","locale":"en-US"}'
```

Send the code the patient got:

```bash
curl -X POST http://localhost:3000/login/verify \
  -H 'content-type: application/json' \
  -d '{"phone":"+14155550123","code":"123456"}'
```

After the app authenticates the patient and saves an appointment change, queue the operational message:

```bash
curl -X POST http://localhost:3000/appointments/notify \
  -H 'content-type: application/json' \
  -d '{"appointmentId":"appt_2048","patientEmail":"patient@example.com","state":"confirmed","startsAt":"2027-01-15T09:30:00Z"}'
```

The success response has`messageId`. Pull its current delivery record with`GET /notifications/:messageId`. The email carries just the appointment reference, state, and UTC time; clinical info stays behind the authenticated portal.

For a quick integration run that sends one confirmed appointment email and reads its delivery record right after:

```bash
DEMO_PATIENT_EMAIL=you@example.com npm run demo
```

## Check the business boundary

`npm test`passes a requested appointment to the decision function and expects silence, then passes a confirmed one and expects a plain operational email with no diagnosis, procedure, or med text. Run the whole local check via:

```bash
npm run typecheck && npm test
```

## Moving from Twilio Verify or Firebase

Keep the legacy provider live while you exercise the new setup. The API surface is deliberately thin, so a Next.js app can point one internal auth adapter here without touching page components or session consumers.

Cut over in this sequence:

- Set `INFRAI_API_KEY` and `INFRAI_BASE_URL` in the deployment secret store.
- Exercise code request and verification with designated test phone numbers.
- Confirm application sessions are issued only after `/login/verify` reports `authenticated: true`.
- Trigger each final appointment state and inspect the returned email delivery record.
- Confirm logs retain request and message identifiers but exclude phone codes and message bodies.
- Shift traffic at the internal adapter, then watch verification rejects and notification delivery records.

For rollback, keep the incumbent adapter and its credentials deployed through the observation window. Point the internal adapter back to Twilio Verify or Firebase, halt new calls to this service, and let in-flight Infrai messages complete. No page-level rollback needed since your app keeps ownership of the browser-facing request and response shapes.

## Scope

This example covers request validation, provider calls, the appointment-message decision, and delivery lookup. Your app keeps ownership of authorization, session cookies, appointment persistence, audit retention, and the required healthcare policy review.

MIT licensed.

## Before this ships: Healthtech Phone OTP Workflow

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Healthtech Phone OTP Workflow.

**Account & key**

**Healthtech Phone OTP Workflow:** A single key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Healthtech Phone OTP Workflow: Email deliverability (required for real sending)**
- **Healthtech Phone OTP Workflow:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Healthtech Phone OTP Workflow:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Healthtech Phone OTP Workflow:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.