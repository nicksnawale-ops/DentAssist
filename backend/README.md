# DentAssist API (FastAPI + PostgreSQL)

Backend for VisionEdge DentAssist, implementing the first slice of `CONTRACT.md` / `ENDPOINTS.md`.

## What's included (phase 1)

| Module | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/change-password`, `GET /auth/me` |
| Dashboards | `GET /dashboard/{super_admin,dentist,receptionist,patient}` |
| Clinics | list, create, get, update, archive |
| Staff | list, create (returns a one-time temporary password), get, update, deactivate, reset password |
| Patients | list/search, check-duplicate, register, get, update, patient edit-request |
| Appointments | list (filters), book with double-booking check, update/reschedule, cancel, check-in |
| Waitlist | list, add, update status |
| Patient portal | own appointments, booking options, self-book, reschedule, cancel, records |
| Notifications | list, mark read, mark all read |
| Billing | procedure catalog, invoices (draft → issue → paid/overdue, void), payments, payment plans, insurance claims |
| Online payments | Razorpay orders, browser verification and signed webhook (UPI, cards, net banking) |
| Reports | revenue by month/method/clinic, outstanding balances with ageing |
| Dental chart | per-tooth conditions with full history, view as of any past date, periodontal exams |
| Treatment plans | build from the catalog, propose, approve, tick off procedures, turn into an invoice |
| Clinical notes | SOAP notes, editable by the author for 24 hours, then locked |
| Scheduling | free-slot search (day or "next available"), waitlist matches, alerts when a slot frees up |
| Public booking | `/book/<clinic id>` page: clinic info, free times, self-booking without an account |
| Settings | RBAC matrix, platform subscription, audit log |

All JSON is camelCase to match `src/types.ts`. Errors always look like
`{"message": "...", "code": "SOME_CODE", "fieldErrors": {...}}`.

**Not yet on the backend** (the frontend still uses mock data for these): documents, inventory,
purchase orders, suppliers, lab orders, WhatsApp.

## Scheduling rules

- A dentist is bookable when the clinic is open (clinic operating hours) **and** the dentist is working
  (their weekly hours; if none are set, the clinic's hours), and they have no active appointment at
  any clinic. Slots start every 15 minutes, in the clinic's time zone. Dentists on leave and clinic
  admins without a licence number aren't offered.
- Staff can still double-book on purpose (the UI warns first). Patients, online or in the portal,
  can only take a listed free slot, with at least 2 hours' notice.
- When an upcoming appointment is cancelled or moved, receptionists and admins at that clinic get a
  notification if anyone on the waitlist matches (same clinic, any dentist or the same one), and the
  calendar opens the matches so the slot can be filled in two taps.
- **Public booking page** (`/book/<clinic id>`, switch per clinic with `onlineBookingEnabled`):
  patients choose a visit type, a time and give name + mobile. An existing patient is matched by
  mobile number without revealing anything about them; otherwise a new record is created and tagged
  "Online booking". Protection: 5 bookings per hour per IP, a hidden honeypot field, at most 2
  upcoming online bookings per patient, and the time is re-checked against live availability.
  The in-memory rate limit is per process; mirror it on your reverse proxy if you run several.
- Lunch breaks and holidays aren't modelled yet: block them with an appointment for now.

## Clinical records rules

- Tooth numbers are FDI (11–48 adult, 51–85 milk teeth). Every change to a tooth is appended to its
  history, so the chart can be shown as it was on any earlier exam date.
- Plans move Draft → Proposed → Approved → In Progress → Completed. Prices are locked once a plan is
  approved; ticking a procedure done also writes "<procedure> completed" into that tooth's history,
  and the plan completes itself when every item is done.
- An approved plan can be invoiced once (a voided invoice can be replaced). GST follows the
  catalog: only cosmetic items are taxed.
- Clinical notes are medico-legal records: only the author can edit, and only for 24 hours. After
  that, corrections are made by adding a new note.
- Dentists and clinic admins write clinical records; super admins can read them; reception can see
  plans (for billing) but not the chart or notes; patients see their own chart and non-draft plans.

## Billing rules

- Totals are always calculated on the server. Invoice numbers run per year (`INV-2026-0001`) and
  are allocated under a row lock, so two people saving at once never clash.
- **GST**: most dental treatment by a clinical establishment is GST-exempt, cosmetic work is not.
  Each line has a `taxable` flag (pre-set from the procedure catalog: whitening and veneers are
  taxable in the demo data). Tax is `DEFAULT_GST_RATE` (18%) on taxable lines after the discount,
  split CGST/SGST, or IGST when `interState` is set. Check the rules with your accountant.
- Only drafts can have their amounts changed; issued invoices can be voided (admins, and only
  when no payment is recorded) and re-issued.
- Status moves Draft → Sent → Partially Paid / Paid, and to Overdue after the due date.
  A patient's outstanding balance is the sum of their issued, unpaid invoices.
- Marking an insurance claim **Paid** records the approved amount as an insurance payment.

## Online payments (Razorpay)

1. Create a Razorpay account and copy the API key id and secret into `RAZORPAY_KEY_ID` and
   `RAZORPAY_KEY_SECRET`.
2. In Razorpay → Webhooks, add `https://<your-api>/api/v1/webhooks/razorpay/payment-success`
   for the `payment.captured` event and put its secret in `RAZORPAY_WEBHOOK_SECRET`.
   (Locally, expose the API with ngrok or Cloudflare Tunnel.)
3. Staff then see **Collect by UPI / card** on issued invoices, and patients see **Pay** on their bills.

Payments are confirmed twice (signature check after checkout, and the signed webhook) and recorded
once: each Razorpay payment id can only be stored one time. Without keys, online payment is simply
hidden and everything else works.

## WhatsApp reminders

Out of the box messages go to the **console provider**: nothing leaves your machine, and every
message shows up in *Communications* and in the server log, so the whole flow can be tried locally.

What gets sent (patients who have opted in to WhatsApp only):

- **Booking confirmation** when a patient books online or in the portal, or when staff tick
  "Send WhatsApp confirmation".
- **Reminders** 24 hours and 2 hours before each scheduled/confirmed appointment, by a background
  job (`REMINDERS_ENABLED=true`, every 5 minutes) or by cron with `python -m app.jobs run-reminders`.
  Each reminder has a unique key, so it is never sent twice even with several servers.
- **Invoice issued** when an invoice is sent, **payment received** after an online payment.
- **Waitlist offers**: when a slot opens, staff can offer it to waitlist patients; the first to
  reply YES is booked automatically (the slot is re-checked first).

- **Reminder from staff** ("Send WhatsApp reminder" on an appointment) uses its own wording
  with the date, so it reads correctly however far ahead the appointment is.

Messages go out in the language on the patient's profile: English, Hindi or Marathi, with dates
written in that language too. A Hindi or Marathi version can be switched off per message in
*Settings → WhatsApp*; those patients then get English. If Meta rejects a translation (usually
because it isn't approved yet), the message is re-sent in English automatically. Patients can
reply in their language too (for example हाँ / हो to confirm, रद्द to cancel).

Patients' replies are handled automatically: **CONFIRM** confirms, **CANCEL** cancels (and alerts
the front desk about the waitlist), **RESCHEDULE** asks the front desk to call. Anything else becomes
a notification for the front desk.

### Going live with Meta's WhatsApp Cloud API

1. In Meta for Developers create an app with the WhatsApp product and note the **phone number ID**,
   a **permanent access token** (System User) and the **app secret**.
2. In WhatsApp Manager create and get approval for the templates shown under *Settings → WhatsApp*
   (names and wording are editable there; keep the `{{1}}`… placeholders in the same order).
   Add the Hindi (`hi`) and Marathi (`mr`) versions as translations of the same template name.
3. Set `WHATSAPP_PROVIDER=meta`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_APP_SECRET` and a `WHATSAPP_VERIFY_TOKEN` of your choice.
4. Set the webhook URL to `https://<your api>/api/v1/webhooks/whatsapp` with that verify token and
   subscribe to **messages**. Webhook bodies are checked against `X-Hub-Signature-256`.
5. Use *Send test message* in settings (sends Meta's `hello_world` template).

## Recalls and Google reviews

*Recalls* lists patients who should come back:

- **Checkups**: the last completed visit is older than the checkup interval (6 months by default).
  They appear two weeks before they fall due.
- **Unfinished treatment**: an approved or in-progress treatment plan still has steps left, nothing is
  booked and nothing has happened for 14 days.

Staff send recalls on WhatsApp one at a time or all at once; patients without WhatsApp are marked
"call instead". A recall closes itself as **booked** as soon as the patient has an upcoming
appointment, however it was booked. A patient replying BOOK alerts the front desk.

**Google reviews**: set each clinic's review link (Recalls → Settings). A couple of hours after a
completed visit the patient is asked for a review on WhatsApp, at most once every 180 days.

Both run in the same background job as reminders (`REMINDERS_ENABLED=true`), or by cron with
`python -m app.jobs run-recalls`. Automatic recall sending is off until an admin switches it on.

## Prescriptions and consent forms

**Prescriptions** are written by dentists from a starter list of common dental medicines (dentists
can add their own). Each medicine has a default dose, frequency (1-0-1 style), duration and timing.
Before issuing, the prescription is checked against the patient's record:

- **Allergies**, including related drugs (a penicillin allergy flags amoxicillin and Augmentin;
  an ibuprofen allergy flags other NSAIDs)
- **Conditions and medicines** such as pregnancy, blood thinners, kidney disease, asthma, ulcers
- **Duplicates** in the same prescription

Warnings must be accepted before the prescription can be issued, and the accepted warnings are kept
with it. Prescriptions get a number (RX-2026-0001), print on the clinic letterhead with the dentist's
registration number, can be sent on WhatsApp, and appear in the patient portal. They can't be edited,
only cancelled with a reason.

**Consent forms** start from editable templates (general treatment, extraction, root canal, implant,
whitening). Staff prepare one for a patient, then either:

- hand over a tablet or phone to **sign in the clinic** (the staff member is recorded as witness), or
- **send a link** on WhatsApp; it works once, for 3 days, and a new link cancels the old one.

Patients can also sign pending forms in the portal. The signed text, risks, signature image and time
are sealed with a SHA-256 hash, shown as "Unchanged since signing" when viewed. Editing a template
creates a new version; signed forms keep the exact wording the patient saw. Forms can be withdrawn
with a reason; nothing is deleted.

## Inventory and lab cases

**Stock**: each item has a reorder level, a usual order quantity, a cost, a supplier and an optional
expiry date. Every change is a recorded movement (used, received, stock count, thrown away) with who
and why, and stock can never go below zero. When an item drops to its reorder level the front desk
gets one alert; it re-arms once stock is back up. Dentists can record usage; receiving and counts are
for the front desk and admins.

**Reordering**: low items that aren't already on an open order are grouped by supplier, and one tap
creates a draft purchase order with the usual quantities. Orders go Draft → Sent → (Partially)
Received; receiving books the stock in immediately and can set the new batch's expiry date.

**Lab cases** move through Ordered → In progress → Quality check → Ready for pickup → Arrived at clinic
→ Fitted, never backwards. The due date defaults to the lab's usual turnaround, late cases are
flagged, and when work arrives the dentist is notified and the patient gets a WhatsApp message to book
the fitting (they can reply BOOK). Work that comes back wrong is sent for a **remake**, which links the
cases. Each lab shows its average turnaround, on-time rate, remake rate and spend over the last year.

## Analytics

*Analytics* (admins and the platform admin; dentists see "My performance" with their own numbers)
shows a period of your choice against the period just before it:

- **Collected** (payments received), billed, completed visits, new patients, collected per visit
- **Revenue per dentist**: each invoice is credited to a dentist, by default the treatment plan's
  dentist or the patient's most recent dentist at that clinic
- **Chair utilisation**: booked minutes over each dentist's available minutes (clinic hours
  overlapping their working hours), counted up to today
- **No-show rate** (no-shows out of completed + no-shows) and cancellation rate, over time
- **Treatment plan acceptance** (proposed → accepted → completed, with values) and **recall success**
  (due → contacted → booked)
- Top treatments, payment methods, review requests and lab spend

Weekly points for periods up to two months, monthly beyond that. Export to CSV from the page.

## X-rays and documents

Files are stored on disk under `UPLOAD_DIR` (`/data/uploads`, a Docker volume, in `docker-compose.yml`).
**Back this folder up together with the database.**

- Accepted: JPEG, PNG, WebP, PDF and DICOM, up to `MAX_UPLOAD_MB` (25 MB). The type is checked from the
  file's content, not its name. Images get a thumbnail (Pillow).
- Files are never public. The app gets 15-minute signed links (HMAC with `JWT_SECRET_KEY`), so images
  work in `<img>` tags without exposing the login token.
- Tag X-rays with teeth (FDI) and the view (IOPA, bitewing, OPG, CBCT, ceph). Tagged images show in the
  dental chart's tooth panel.
- The viewer has zoom and pan, brightness, contrast and invert for X-rays, marks (circle, arrow, label),
  and before/after comparison of two images with synced zoom.
- Staff choose what patients see in the portal. Patients can upload insurance papers and outside reports,
  and remove only their own uploads. Front desk can't remove X-rays, photos or consent forms.
- Removing a document hides it from the record; the file and the audit entry are kept.

## AI assistant

Off by default (`AI_PROVIDER=disabled`). Two things, both producing **drafts a clinician reviews**:

- **Dictate a note**: in Clinical notes, the dentist speaks (or types) a summary of the visit in English,
  Hindi or Marathi. The browser turns speech into text on the device; the text is sent to Claude and comes
  back as Subjective / Objective / Assessment / Plan, the teeth mentioned and a "please check" list
  (for example a medicine without a dose). Nothing is saved until the dentist saves the note.
- **Explain to patient**: on a treatment plan, write a plain-language explanation in English, Hindi or
  Marathi (what's wrong, each step, what to expect, aftercare, questions to ask). The dentist edits it and
  shares it; the patient then sees it on the plan in their portal. It can also be printed.

What is sent: the dictation with the patient's name and phone numbers removed, the plan's procedures and
teeth, and an age band, sex, allergies, conditions and current medicines. Never names, phone numbers,
addresses or IDs. Each request is logged in the audit trail (that it happened, not the content), and each
user is limited to `AI_REQUESTS_PER_HOUR` (60).

To switch it on, set `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and optionally `AI_MODEL` (default
`claude-sonnet-5-5`). Before you do, tell patients that clinical details may be processed by an AI service
and check your data-processing agreement covers it (India's DPDP Act). `AI_PROVIDER=mock` returns labelled
demo text so the screens can be tried without a key; don't use it in production.

## Dentist pay and attendance

**Pay rules** per dentist (per clinic, or for all clinics): associate, visiting consultant or salaried;
a percentage of what patients paid (collections) or of what was billed; the dentist's share of lab bills;
a fixed monthly amount; a minimum guarantee; and TDS (10% by default, section 194J).

**Monthly statements** (Team & pay → Payouts):

    base       = collections (or billing) credited to the dentist − their share of lab bills that month
    commission = base × percentage
    gross      = fixed + commission + bonuses/deductions, topped up to the minimum guarantee
    net        = gross − TDS

Payments count by the date they were received, and lab bills by the date the work arrived. Statements stay
as drafts (recalculated on demand) until an admin approves them; approval freezes the figures and shows the
statement to the dentist. Then mark it paid with the transfer reference. Only the platform admin can reopen
an approved statement, and paid ones never reopen; correct them with an adjustment the next month.
Every change is in the audit log. This is a calculation aid, not tax advice.

**Attendance**: staff tap *Check in* and *Check out* in the top bar. Lateness is measured against their
working hours (or clinic hours) with a 10-minute grace. Admins see a month grid for the clinic, mark
leave, absence or holidays, and correct times; edits are recorded as admin changes.

## Family accounts and QR check-in

**Families**: on a patient's profile, *Add member* links relatives (spouse, child, parent…). One member is
the account holder. The holder's portal login sees every member's appointments, plans, prescriptions,
consents and bills, and can book for any of them (*Who is the appointment for?*). Other members still see
only their own records. Patients who share a mobile number are suggested automatically.
*Family payment* takes one amount and applies it to the family's oldest unpaid bills first, with a
receipt per invoice; more than the total due is refused.

**Self check-in**: the receptionist dashboard shows a QR code with a *Print poster* button. Patients scan
it, enter the mobile number they booked with, pick their appointment (names are masked) and tap
*I'm here*. This works from 2 hours before the start until the appointment ends. The queue shows them as
arrived with how long they have waited, and the dentist and front desk get a notification. Without a
smartphone, the desk taps *Arrived* in the queue. Admins can make a new code if a poster photo was shared
(old posters stop working). The public endpoints are rate limited and need the clinic's secret key.

## Security model

- Passwords hashed with bcrypt; JWT access tokens (30 min) + refresh tokens (7 days).
- Logout, password change/reset and deactivation bump `token_version`, which revokes all of
  that user's outstanding tokens.
- Role checks on every route, plus **clinic scoping**: admins, dentists and receptionists only see
  clinics, patients and appointments in the clinics they are assigned to. Patients only ever see
  their own record through `/patient-portal`.
- Every create/update/cancel is written to `audit_logs` (passwords are never logged).
- In `ENVIRONMENT=production` the API refuses to start without a strong `JWT_SECRET_KEY`.

## Run with Docker (recommended)

From the repository root:

```bash
docker compose up -d --build
docker compose exec api python -m app.seed     # demo data, first run only
```

API: http://localhost:8000 · interactive docs: http://localhost:8000/docs

## Run without Docker

Needs Python 3.11+ and PostgreSQL 14+.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then edit DATABASE_URL / JWT_SECRET_KEY
alembic upgrade head               # create tables
python -m app.seed                 # optional demo data
uvicorn app.main:app --reload --port 8000
```

## Demo logins (after seeding)

Password for all: `Demo@1234` (override with `DEMO_PASSWORD`).

| Role | Email |
|---|---|
| Super admin | admin@visionedge.com |
| Dentist | dr.smith@visionedge.com |
| Receptionist | john.reception@visionedge.com |
| Clinic admin (Westside) | priya.admin@visionedge.com |
| Patient | patient@example.com |

Never run the seed script against a database holding real patient data.

## Tests

```bash
cd backend
pytest
```

Tests run against an in-memory SQLite database, so PostgreSQL isn't needed for them.

## Database migrations

`alembic/versions/0001_initial_schema.py` creates the current tables. After changing models:

```bash
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

## Notes and deviations from CONTRACT.md

- IDs are strings. New rows get UUIDv4 values; seeded rows keep the mock IDs (`pat_1`, `s1`, ...) so
  existing links in the UI keep working.
- Appointments store full `start_time`/`end_time` timestamps (UTC) instead of separate date and
  time columns, matching what the frontend sends.
- Nested patient data (medical history, insurance, emergency contact) is stored as JSONB in the
  same shape as the frontend types.
- `appointments` overlap check ignores cancelled/completed/no-show slots; staff can override with
  `allowOverlap: true` (the UI already warns first). Patients can't override and need 2 hours' notice.
