# VisionEdge DentAssist API Endpoints Reference

This document provides a quick-reference summary of all REST API endpoints for the VisionEdge DentAssist backend.

| Method | Path | Description | Roles Allowed |
|--------|------|-------------|---------------|
| **Auth** | | | |
| POST | `/api/v1/auth/login` | Authenticate user and receive JWT tokens | Public |
| POST | `/api/v1/auth/refresh` | Refresh access token | All |
| POST | `/api/v1/auth/logout` | Invalidate current token | All |
| **Dashboards** | | | |
| GET | `/api/v1/dashboard/super_admin` | Aggregated stats across all clinics | `super_admin` |
| GET | `/api/v1/dashboard/dentist` | Schedule, queue, stats for logged-in dentist | `dentist` |
| GET | `/api/v1/dashboard/receptionist` | Clinic queue, pending payments, inventory alerts | `receptionist`, `admin` |
| GET | `/api/v1/dashboard/patient` | Upcoming appointments, records summary | `patient` |
| **Clinics & Staff** | | | |
| GET | `/api/v1/clinics` | List all clinics | `super_admin` |
| POST | `/api/v1/clinics` | Create a new clinic | `super_admin` |
| GET | `/api/v1/clinics/{id}` | Get clinic profile and stats | `super_admin`, `admin`, `receptionist`, `dentist` |
| PATCH | `/api/v1/clinics/{id}` | Update clinic details | `super_admin` |
| DELETE | `/api/v1/clinics/{id}` | Archive clinic | `super_admin` |
| GET | `/api/v1/staff` | List staff members | `super_admin`, `admin` |
| POST | `/api/v1/staff` | Create staff profile + user account | `super_admin`, `admin` |
| GET | `/api/v1/staff/{id}` | Get staff profile | All staff |
| PATCH | `/api/v1/staff/{id}` | Update staff details | `super_admin`, `admin` |
| DELETE | `/api/v1/staff/{id}` | Soft delete staff profile | `super_admin` |
| POST | `/api/v1/staff/{id}/reset-password` | Reset staff password | `super_admin` |
| **Patients** | | | |
| GET | `/api/v1/patients` | List patients (paginated, searchable) | All staff |
| POST | `/api/v1/patients` | Register a new patient | `receptionist`, `admin`, `super_admin` |
| GET | `/api/v1/patients/{id}` | Get full patient profile | All staff |
| PATCH | `/api/v1/patients/{id}` | Update patient profile | All staff |
| GET | `/api/v1/patients/check-duplicate` | Check for existing patient by phone/name | All staff |
| PATCH | `/api/v1/patients/{id}/request-edit` | Patient requests profile edit | `patient` |
| **Appointments** | | | |
| GET | `/api/v1/appointments` | List appointments (filtered by date, clinic, dentist) | All staff |
| POST | `/api/v1/appointments` | Book a new appointment | All staff |
| GET | `/api/v1/appointments/{id}` | Get appointment details | All staff |
| PATCH | `/api/v1/appointments/{id}` | Update/reschedule/change status | All staff |
| DELETE | `/api/v1/appointments/{id}` | Cancel appointment | All staff |
| **Patient Portal (Self-Service)** | | | |
| GET | `/api/v1/patient-portal/appointments` | Get patient's own appointments | `patient` |
| POST | `/api/v1/patient-portal/appointments/book` | Self-book appointment | `patient` |
| POST | `/api/v1/patient-portal/appointments/{id}/reschedule`| Self-reschedule appointment | `patient` |
| POST | `/api/v1/patient-portal/appointments/{id}/cancel` | Self-cancel appointment | `patient` |
| GET | `/api/v1/patient-portal/records` | Read-only view of patient's EHR and documents | `patient` |
| **EHR & Clinical** | | | |
| GET | `/api/v1/patients/{id}/dental-chart` | Get current tooth records & perio readings | `dentist`, `admin` |
| POST | `/api/v1/patients/{id}/dental-chart` | Add tooth record or perio reading | `dentist` |
| PATCH | `/api/v1/patients/{id}/dental-chart` | Update tooth record or perio reading | `dentist` |
| GET | `/api/v1/patients/{id}/dental-chart/history` | Get historical dental chart snapshots | `dentist` |
| GET | `/api/v1/patients/{id}/treatment-plans` | List treatment plans | `dentist`, `admin`, `receptionist` |
| POST | `/api/v1/patients/{id}/treatment-plans` | Create a new treatment plan | `dentist` |
| PATCH | `/api/v1/treatment-plans/{id}` | Update treatment plan (items, status) | `dentist`, `admin` |
| GET | `/api/v1/patients/{id}/clinical-notes` | List clinical notes | `dentist`, `admin` |
| POST | `/api/v1/patients/{id}/clinical-notes` | Add new clinical note | `dentist` |
| GET | `/api/v1/procedures` | List procedure catalog | All staff |
| **Billing & Invoicing** | | | |
| GET | `/api/v1/invoices` | List invoices | All staff |
| POST | `/api/v1/invoices` | Create invoice | `receptionist`, `admin`, `super_admin` |
| GET | `/api/v1/invoices/{id}` | Get invoice details | All staff, `patient` (own) |
| POST | `/api/v1/invoices/{id}/send` | Send invoice via WhatsApp | `receptionist`, `admin` |
| POST | `/api/v1/invoices/{id}/payments` | Record manual payment | `receptionist`, `admin` |
| POST | `/api/v1/invoices/{id}/create-payment-order` | Generate Razorpay order ID | `patient`, All staff |
| POST | `/api/v1/webhooks/razorpay/payment-success` | Webhook for payment verification | Public (Webhook) |
| GET | `/api/v1/reports/revenue` | Get revenue analytics | `super_admin`, `admin` |
| GET | `/api/v1/reports/outstanding` | Get outstanding balances | All staff |
| **Inventory & Suppliers** | | | |
| GET | `/api/v1/inventory` | List inventory items | `receptionist`, `admin`, `super_admin` |
| POST | `/api/v1/inventory` | Add new inventory item | `admin`, `super_admin` |
| GET | `/api/v1/inventory/{id}` | Get item details and movement history | `receptionist`, `admin`, `super_admin` |
| POST | `/api/v1/inventory/{id}/adjust` | Record stock movement | `receptionist`, `admin`, `super_admin` |
| GET | `/api/v1/inventory/low-stock` | Get low stock alerts | All staff |
| GET | `/api/v1/inventory/expiring-soon`| Get expiring items alerts | All staff |
| GET | `/api/v1/suppliers` | List suppliers | `admin`, `super_admin` |
| GET | `/api/v1/purchase-orders` | List purchase orders | `admin`, `super_admin` |
| POST | `/api/v1/purchase-orders` | Create purchase order | `admin`, `super_admin` |
| POST | `/api/v1/purchase-orders/{id}/receive`| Mark PO as received (updates stock) | `receptionist`, `admin`, `super_admin` |
| **Lab Orders** | | | |
| GET | `/api/v1/lab-orders` | List lab orders | `dentist`, `receptionist`, `admin` |
| GET | `/api/v1/lab-orders/{id}` | Get lab order details & status history | `dentist`, `receptionist`, `admin` |
| POST | `/api/v1/lab-orders` | Create new lab order | `dentist`, `admin` |
| POST | `/api/v1/lab-orders/{id}/status`| Update lab order status | `receptionist`, `dentist`, `admin` |
| GET | `/api/v1/lab-orders/overdue` | Get overdue lab orders | `dentist`, `receptionist`, `admin` |
| **Notifications & Comms** | | | |
| GET | `/api/v1/notifications` | Get user notifications | All |
| PATCH | `/api/v1/notifications/{id}/read` | Mark notification read | All |
| POST | `/api/v1/notifications/send` | Trigger manual notification (Internal) | `system`, All staff |
| GET | `/api/v1/notifications/log` | Get communication logs | `admin`, `super_admin` |
| POST | `/api/v1/webhooks/whatsapp/status` | Webhook for delivery status | Public (Webhook) |
| POST | `/api/v1/webhooks/whatsapp/inbound`| Webhook for patient replies | Public (Webhook) |
| **Reviews** | | | |
| GET | `/api/v1/reviews` | List reviews | `admin`, `super_admin` |
| POST | `/api/v1/reviews` | Submit appointment review | `patient` |
| **Settings & Audit** | | | |
| GET | `/api/v1/permissions` | Get RBAC matrix | All staff |
| GET | `/api/v1/platform/subscription` | Get platform subscription details | `super_admin` |
| GET | `/api/v1/audit-logs` | Get system audit logs | `super_admin` |
