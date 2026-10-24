# VisionEdge DentAssist

VisionEdge DentAssist is a premium, multi-tenant dental clinic management system designed for independent dentists and small clinic chains. It provides a complete, modern Electronic Health Record (EHR) and practice management suite, covering scheduling, charting, billing, inventory, lab tracking, and patient self-service.

## Project Status

**Current State**: Fully designed, interactive frontend prototype and comprehensive backend specification.
- The **frontend** is a fully clickable, responsive prototype built in React + Tailwind CSS. It uses mock data to demonstrate all workflows and states across four user roles (`super_admin`, `dentist`, `receptionist`, `patient`).
- The **backend** is fully designed and documented. The complete system architecture, database schema, and API contracts are available in `CONTRACT.md` and `ENDPOINTS.md`.

**Next Milestone**: Backend Implementation. The next step is to implement the FastAPI + PostgreSQL backend based on the provided specifications, replacing the frontend mock data with real API calls.

## Tech Stack

### Frontend (Current)
- **Framework**: React 18 with Vite
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

## Getting Started (Frontend)

To run the frontend prototype locally:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Login:**
   The application will start on `http://localhost:3000` (or another port if specified by Vite). Use the mock login screen to select a role and explore the interface.

## Backend Implementation Guide

If you are a developer looking to build the backend:

1. Read **`CONTRACT.md`**: Contains the full system architecture, database schema (tables, foreign keys), integration plans (WhatsApp, Razorpay), and deployment notes.
2. Read **`ENDPOINTS.md`**: A quick-reference table of all REST API endpoints required to power the frontend.
3. **Replace Mock Data**: Once the backend is running, update the frontend's API service layer to point to `localhost:8000/api/v1/...` instead of returning static arrays from `/src/data/`.
