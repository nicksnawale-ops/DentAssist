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
