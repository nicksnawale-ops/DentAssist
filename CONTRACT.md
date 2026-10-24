# VisionEdge DentAssist Backend Specification

## 1. Overview & Tech Stack
- **Framework**: FastAPI (Python) for high performance, async support, and auto-generated OpenAPI documentation.
- **Database**: PostgreSQL (Relational DBMS)
- **ORM & Validation**: SQLAlchemy 2.0 (or SQLModel) for database interactions, Pydantic v2 for data validation and serialization.
- **Migrations**: Alembic for database schema version control.
- **Authentication**: JWT (JSON Web Tokens) with short-lived access tokens and longer-lived refresh tokens.
- **Background Jobs**: APScheduler for simple single-instance deployments, or Celery + Redis for horizontally scaled environments (used for WhatsApp reminders, low-stock checks, overdue invoice flags).
- **Recommended Folder Structure**:
  ```text
  /app
    /api        # FastAPI routers (grouped by module: patients, billing, etc.)
    /core       # Config, security, database setup
    /models     # SQLAlchemy models
    /schemas    # Pydantic schemas (requests/responses)
    /services   # Business logic
    /tasks      # Background jobs (APScheduler/Celery)
  ```

## 2. Database Schema
Organized in logical dependency order. IDs are UUIDv4. Dates/Times are UTC.

### Core & Users
**`clinics`**
- `id` (UUID, PK)
- `name` (String)
- `address` (JSONB)
- `phone` (String), `email` (String, Unique)
- `operating_hours` (JSONB), `timezone` (String)
- `status` (Enum: active, inactive)
- `created_at`, `updated_at` (Timestamp)

**`users`**
- `id` (UUID, PK)
- `email` (String, Unique), `password_hash` (String)
- `first_name`, `last_name` (String)
- `role` (Enum: super_admin, admin, dentist, receptionist, patient)
- `clinic_id` (UUID, FK -> clinics.id, Nullable)
- `created_at`, `updated_at` (Timestamp)

**`staff_profiles`** (Extends users, 1:1)
- `id` (UUID, FK -> users.id, PK)
- `clinic_ids` (UUID[])
- `status` (Enum: active, on_leave, inactive)
- `specializations` (String[])
- `license_number` (String, Nullable)
- `working_hours` (JSONB)

### Patients
**`patients`**
- `id` (UUID, PK)
- `clinic_id` (UUID, FK -> clinics.id)
- `first_name`, `last_name` (String)
- `dob` (Date), `gender` (String)
- `phone` (String), `email` (String, Nullable)
- `whatsapp_opt_in` (Boolean)
- `address` (JSONB), `emergency_contact` (JSONB)
- `allergies`, `medications`, `chronic_conditions` (String[])
- `created_at` (Timestamp)

### Appointments
**`appointments`**
- `id` (UUID, PK)
- `patient_id` (UUID, FK -> patients.id)
- `dentist_id` (UUID, FK -> users.id)
- `clinic_id` (UUID, FK -> clinics.id)
- `date` (Date)
- `start_time`, `end_time` (Time)
- `status` (Enum: scheduled, confirmed, in_progress, completed, cancelled, no_show)
- `type` (Enum: Consultation, Follow-up, Procedure, Emergency)
- `notes` (Text, Nullable)
- `created_at`, `updated_at` (Timestamp)

### Electronic Health Records (EHR)
**`procedures`** (Catalog)
- `id` (UUID, PK)
- `name`, `category` (String)
- `default_cost` (Numeric), `default_duration_minutes` (Integer)
- `clinic_id` (UUID, FK -> clinics.id, Nullable for chain-wide)

**`treatment_plans`**
- `id` (UUID, PK)
- `patient_id` (UUID, FK -> patients.id)
- `name` (String), `status` (Enum: Draft, Proposed, Approved, In Progress, Completed)
- `discount` (Numeric), `discount_type` (Enum: percentage, flat)
- `created_by_staff_id` (UUID, FK -> users.id)
- `created_at`, `approved_at` (Timestamp)

**`treatment_plan_items`**
- `id` (UUID, PK)
- `plan_id` (UUID, FK -> treatment_plans.id)
- `procedure_id` (UUID, FK -> procedures.id)
- `tooth_number` (String, Nullable)
- `cost` (Numeric), `status` (Enum: Pending, Scheduled, Completed)
- `linked_appointment_id` (UUID, FK -> appointments.id, Nullable)

**`tooth_records`**
- `id` (UUID, PK)
- `patient_id` (UUID, FK -> patients.id)
- `tooth_number` (String, FDI standard)
- `conditions` (String[])
- `notes` (Text)
- `recorded_at` (Timestamp)

**`periodontal_readings`**
- `id` (UUID, PK)
- `patient_id` (UUID, FK -> patients.id)
- `tooth_number` (String)
- `measurement_points` (JSONB: {buccal: [n,n,n], lingual: [n,n,n]})
- `recorded_at` (Timestamp)

**`clinical_notes`**
- `id` (UUID, PK)
- `patient_id` (UUID, FK -> patients.id)
- `appointment_id` (UUID, FK -> appointments.id)
- `subjective`, `objective`, `assessment`, `plan` (Text)
- `author_staff_id` (UUID, FK -> users.id)
- `created_at` (Timestamp)

**`documents`**
- `id` (UUID, PK)
- `patient_id` (UUID, FK -> patients.id)
- `type` (Enum: X-Ray, Intraoral Photo, Consent Form, etc.)
- `file_url` (String, pointer to object storage)
- `uploaded_at` (Timestamp)

### Billing & Invoicing
**`invoices`**
- `id` (UUID, PK)
- `patient_id` (UUID, FK -> patients.id)
- `invoice_number` (String, Unique)
- `treatment_plan_id` (UUID, FK -> treatment_plans.id, Nullable)
- `line_items` (JSONB)
- `subtotal`, `discount`, `total_tax`, `total` (Numeric)
- `status` (Enum: Draft, Sent, Partially Paid, Paid, Overdue)
- `due_date`, `created_at` (Timestamp)

**`payments`**
- `id` (UUID, PK)
- `invoice_id` (UUID, FK -> invoices.id)
- `amount` (Numeric), `method` (String), `reference_number` (String)
- `paid_at` (Timestamp)

### Inventory & Lab
**`supplier`**
- `id` (UUID, PK)
- `name`, `contact_person`, `phone`, `email`, `address` (String)

**`inventory_item`**
- `id` (UUID, PK)
- `clinic_id` (UUID, FK -> clinics.id)
- `name`, `category`, `unit` (String)
- `current_stock`, `reorder_threshold` (Integer)
- `supplier_id` (UUID, FK -> supplier.id)

**`stock_movement`**
- `id` (UUID, PK)
- `item_id` (UUID, FK -> inventory_item.id)
- `change_amount` (Integer), `reason` (String)
- `recorded_at` (Timestamp)

**`lab_order`**
- `id` (UUID, PK)
- `patient_id` (UUID, FK -> patients.id)
- `lab_supplier_id` (UUID, FK -> supplier.id)
- `item_type` (Enum: Crown, Bridge, Aligner, etc.)
- `status` (Enum: Ordered, In Progress, Quality Check, Delivered, Fitted)
- `expected_delivery_date` (Date)

### Notifications, Patient Portal, & Audit
**`notification_log`**
- `id` (UUID, PK)
- `patient_id` (UUID, FK -> patients.id)
- `channel` (Enum: whatsapp, sms, email)
- `template_name`, `status` (String)
- `provider_message_id` (String)
- `sent_at` (Timestamp)

**`audit_log`**
- `id` (UUID, PK)
- `actor_staff_id` (UUID, FK -> users.id, Nullable)
- `action`, `entity_type` (String)
- `entity_id` (UUID)
- `before_state`, `after_state` (JSONB)
- `timestamp` (Timestamp)

## 3. Authentication & Authorization
- **Mechanism**: JWT (JSON Web Tokens). Endpoints are secured via FastAPI `Depends(oauth2_scheme)`.
- **Password Hashing**: `bcrypt` (via `passlib`).
- **Roles**: Super Admin, Admin, Dentist, Receptionist, Patient.
- **Enforcement**: Role-based access control implemented as a FastAPI dependency (e.g., `Depends(RoleChecker(['super_admin', 'dentist']))`).

## 4. Full REST API Endpoint Reference
*(See `ENDPOINTS.md` for the complete tabular reference of all API endpoints across all modules).*

## 5. WhatsApp Integration Spec
- **Integration Options**: Meta Cloud API (WhatsApp Business API) or Twilio WhatsApp API.
- **Webhooks**: 
  - `POST /api/v1/webhooks/whatsapp/status` (Delivery receipts).
  - `POST /api/v1/webhooks/whatsapp/inbound` (Patient replies like "CONFIRM" or "CANCEL").
- **Requirement**: Webhooks require a publicly accessible HTTPS endpoint (see Local Desktop Deployment notes).

## 6. Payment Gateway Integration Spec (Razorpay)
1. **Order Creation (Server-Side)**: Frontend calls `/invoices/{id}/create-payment-order`. Backend securely calls Razorpay Orders API, returns `order_id`.
2. **Checkout (Client-Side)**: Frontend uses `order_id` in Razorpay widget.
3. **Webhook Verification (Server-Side)**: Razorpay fires webhook to `POST /api/v1/webhooks/razorpay/payment-success`. Backend **must** verify the cryptographic signature using the Razorpay secret before marking the invoice as Paid in the database. Never trust client-side success callbacks alone.

## 7. File Storage Strategy
- **Requirement**: Real file contents (X-Rays, documents) MUST NOT be stored as binary blobs in PostgreSQL.
- **Local/Desktop Deployment**: Store on a secure local filesystem path or use a lightweight object storage container like **MinIO**.
- **Cloud Deployment**: AWS S3 or Google Cloud Storage.
- **Database**: The `documents.file_url` column only stores the relative path or secure URL to the file.

## 8. Background Jobs & Scheduling
- **Reminders**: 24-hour and 2-hour appointment reminders.
- **Inventory**: Daily checks for `current_stock <= reorder_threshold`.
- **Billing**: Daily checks to flag unpaid invoices past their `due_date` as Overdue.
- **Implementation**: APScheduler running in the FastAPI event loop (for single-instance setups), or Celery+Redis (for distributed setups).

## 9. Local Desktop Deployment Notes
For a single clinic hosting the backend on a local desktop machine:
- **Docker Compose (Recommended)**: Create a `docker-compose.yml` with two services:
  1. `postgres:16` (Official PostgreSQL image with a bound volume for persistent data).
  2. `api` (The FastAPI application).
  This avoids manual DB installation issues and ensures environment consistency.
- **Direct Installation**: Install PostgreSQL via the official installer, create a database, and run FastAPI via `uvicorn app.main:app --host 0.0.0.0 --port 8000` using a `.env` file for `DATABASE_URL`.
- **Webhooks (WhatsApp/Razorpay)**: To receive webhooks locally, use **ngrok** (`ngrok http 8000`) or **Cloudflare Tunnels** to expose the local API to the public internet securely.
- **Backups**: Configure a daily automated task (e.g., Windows Task Scheduler or cron) to run `pg_dump` and back up the database to an external drive or cloud sync folder.

## 10. Compliance Notes
**India DPDP Act (Digital Personal Data Protection Act) Considerations**:
- **Consent**: Ensure explicit consent is captured (via physical or digital forms) before processing health data.
- **Data Minimization**: Only collect data necessary for dental treatment.
- **Security**: Implement encryption at rest for databases and document volumes.
- **Breach Notification**: The system's Audit Log supports forensic investigation in case of unauthorized access.
- *Disclaimer*: This is engineering guidance, not legal advice. Consult a compliance professional before launching with real patient data.

