# VisionEdge DentAssist

VisionEdge DentAssist is a premium, multi-tenant dental clinic management system designed for independent dentists and small clinic chains. It provides a complete, modern Electronic Health Record (EHR) and practice management suite, covering scheduling, charting, billing, inventory, lab tracking, and patient self-service.

## Project Status

- **Frontend**: React + Tailwind app for four roles (`super_admin`, `dentist`, `receptionist`, `patient`).
- **Backend (phase 1, in `/backend`)**: FastAPI + PostgreSQL with JWT login, role-based access and clinic
  scoping. Live today: authentication, dashboards, clinics, staff, patients, appointments, waitlist,
  patient portal, notifications, permissions, audit log.
- **Still on mock data**: dental chart, treatment plans, clinical notes, documents, billing, inventory,
  suppliers, lab orders, reports and WhatsApp templates. These move to the backend in the next phases,
  following `CONTRACT.md` and `ENDPOINTS.md`.

## Tech Stack

### Frontend (Current)
- **Framework**: React 19 with Vite
- **Styling**: Tailwind CSS (Utility-first CSS)
- **Icons**: Lucide React
- **Routing**: React Router DOM
- **Charts**: Recharts
- **State Management**: Context API (Auth) + Local State

### Backend Specification (To be implemented)
- **Framework**: FastAPI (Python)
- **Database**: PostgreSQL
- **ORM**: SQLAlchemy / SQLModel
- **Auth**: JWT (Role-Based Access Control)
- **Background Jobs**: APScheduler or Celery (for WhatsApp reminders)

## Features by Role

The system is designed with strict role-based access control (RBAC):

1. **Super Admin**: Multi-clinic oversight, revenue analytics, global staff management, platform settings, and audit logs.
2. **Dentist**: Interactive 32-tooth dental charting, clinical notes, treatment planning, and daily schedule management.
3. **Receptionist**: Patient registration, appointment booking, queue management, invoicing, payment collection, and basic inventory tracking.
4. **Patient**: Self-service portal to book/reschedule appointments, view treatment history, check outstanding balances, and update profile information.

## Getting Started

### 1. Start the backend

```bash
docker compose up -d --build
docker compose exec api python -m app.seed   # demo data, first run only
```

No Docker? See [`backend/README.md`](backend/README.md) for a manual setup.

### 2. Start the frontend

```bash
npm install
npm run dev
```

Open http://localhost:3000. The dev server forwards `/api` calls to the backend on port 8000.
Sign in with a demo account (password `Demo@1234`), e.g. `admin@visionedge.com`,
`dr.smith@visionedge.com`, `john.reception@visionedge.com` or `patient@example.com`.
In development builds the login page has one-click buttons for these.

### UI-only demo (no backend)

Create `.env.local` with `VITE_USE_MOCK_API=true` and run `npm run dev`. The app then uses the
mock data in `src/data/` and the old role picker on the login screen.

## Backend Implementation Guide

If you are a developer looking to build the backend:

1. Read **`CONTRACT.md`**: Contains the full system architecture, database schema (tables, foreign keys), integration plans (WhatsApp, Razorpay), and deployment notes.
2. Read **`ENDPOINTS.md`**: A quick-reference table of all REST API endpoints required to power the frontend.
3. **Replace Mock Data**: add the endpoint in `backend/app/api/`, then switch the matching function in
   `src/api/apiService.ts` to call it (each function already has an `if (!USE_MOCK_API)` branch pattern
   to follow). Pages that still import from `src/data/` directly need to load through `apiService` first.
