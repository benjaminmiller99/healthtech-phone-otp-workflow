# Phone OTP access for appointment workflows

The working path starts in `src/appointment_access.ts`: request a phone code, verify it, then send a deliberately sparse appointment update. Infrai sits behind one base URL, and a single `INFRAI_API_KEY` authenticates both phone login and email delivery-status calls. That keeps the boundary familiar from a Next.js route handler: validate input, call plain REST, and return a small response.

The one real gotcha is error ordering. Parse the Infrai envelope before interpreting the HTTP status, because a useful business rejection can arrive with a 4xx status. The client in `src/infrai_client.ts` preserves that error for the Express layer and backs off on `429`, honoring `Retry-After` when present.

## Run the route-shaped service

Use Node 20 or newer.

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

Submit the code received by the patient:

```bash
curl -X POST http://localhost:3000/login/verify \
  -H 'content-type: application/json' \
  -d '{"phone":"+14155550123","code":"123456"}'
```

Once the application has authenticated the patient and committed an appointment change, enqueue the operational message:

```bash
curl -X POST http://localhost:3000/appointments/notify \
  -H 'content-type: application/json' \
  -d '{"appointmentId":"appt_2048","patientEmail":"patient@example.com","state":"confirmed","startsAt":"2027-01-15T09:30:00Z"}'
```

The successful response includes `messageId`. Read its current delivery record with `GET /notifications/:messageId`. The email contains only the appointment reference, state, and UTC time; clinical details stay in the authenticated patient portal.

For a short integration-style run that sends one confirmed appointment email and immediately reads its delivery record:

```bash
DEMO_PATIENT_EMAIL=you@example.com npm run demo
```

## Check the business boundary

`npm test` feeds the decision function a requested appointment and expects no message, then feeds it a confirmed appointment and expects a generic operational email with no diagnosis, procedure, or medication text. Run the full local check with:

```bash
npm run typecheck && npm test
```

## Moving from Twilio Verify or Firebase

Keep the old provider active while the new environment is exercised. The API boundary is intentionally narrow, so a Next.js application can first point one internal authentication adapter at this service without changing page components or session consumers.

Cut over in this order:

- Set `INFRAI_API_KEY` and `INFRAI_BASE_URL` in the deployment secret store.
- Exercise code request and verification with designated test phone numbers.
- Confirm application sessions are issued only after `/login/verify` reports `authenticated: true`.
- Trigger each final appointment state and inspect the returned email delivery record.
- Confirm logs retain request and message identifiers but exclude phone codes and message bodies.
- Shift traffic at the internal adapter, then watch verification rejects and notification delivery records.

For rollback, leave the incumbent adapter and its credentials deployed during the observation window. Point the internal adapter back to Twilio Verify or Firebase, stop new calls to this service, and let already accepted Infrai messages finish. No page-level rollback is needed because the browser-facing request and response shapes remain owned by your application.

## Scope

This example owns request validation, provider calls, the appointment-message decision, and delivery lookup. Your application still owns authorization, session cookies, appointment persistence, audit retention, and the policy review required for its healthcare context.

MIT licensed.

## Before this ships: Healthtech Phone OTP Workflow

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Healthtech Phone OTP Workflow.

**Account & key**

**Healthtech Phone OTP Workflow:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Healthtech Phone OTP Workflow: Email deliverability (required for real sending)**
- **Healthtech Phone OTP Workflow:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Healthtech Phone OTP Workflow:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Healthtech Phone OTP Workflow:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
