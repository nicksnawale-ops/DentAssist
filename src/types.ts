export type Role = 'super_admin' | 'admin' | 'dentist' | 'receptionist' | 'patient';

export type StaffStatus = 'active' | 'on_leave' | 'inactive';

export interface WorkingHours {
  day: string;
  isWorking: boolean;
  startTime: string;
  endTime: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  clinicId: string | null;
  clinicIds?: string[]; // For multi-clinic assignments
  /** For patient logins: their patient record. */
  patientId?: string | null;
  avatarUrl?: string;
  phone?: string;
  createdAt: string;
  status?: StaffStatus;
  dateJoined?: string;
  specializations?: string[];
  licenseNumber?: string;
  workingHours?: WorkingHours[];
}

export type ClinicStatus = 'active' | 'inactive';

export interface OperatingHours {
  day: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface Clinic {
  id: string;
  name: string;
  address?: Address;
  phone?: string;
  email?: string;
  timezone?: string;
  operatingHours?: OperatingHours[];
  logoUrl?: string;
  status: ClinicStatus;
  createdAt: string;
  // Mock aggregated stats
  activeStaffCount?: number;
  activePatientsCount?: number;
  monthlyRevenue?: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ApiError {
  message: string;
  code: string;
  fieldErrors?: Record<string, string>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Permission {
  id: string;
  module: string;
  roles: Record<Role, { view: boolean; edit: boolean; delete: boolean }>;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  dob?: string;
  gender?: string;
  address?: string | Address;
  communicationPrefs?: {
    whatsappOptIn: boolean;
    language: 'English' | 'Hindi' | 'Marathi' | string;
  };
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
  };
  medicalHistory?: {
    allergies: string[];
    medications: string[];
    chronicConditions: string[];
    pastSurgeries: string;
  };
  dentalHistory?: {
    reasonForVisit: string;
    lastDentalVisit: string;
    ongoingIssues: string;
    smokingTobaccoUse: boolean;
  };
  insurance?: {
    provider: string;
    policyNumber: string;
    notes: string;
  };
  referralSource?: string;
  tags?: string[];
  lastVisit?: string;
  nextAppointment?: string;
  outstandingBalance?: number;
  createdAt?: string;
}

export type ToothConditionType = 'Healthy' | 'Cavity' | 'Filled' | 'Crown' | 'Root Canal' | 'Missing' | 'Implant' | 'Extraction Planned';

export interface ToothHistoryEntry {
  id: string;
  date: string;
  action: string;
  dentist: string;
}

export interface ToothRecord {
  id: string;
  patientId: string;
  toothNumber: string; // Internal standard: use FDI string (e.g., '18', '21', '55')
  conditions: ToothConditionType[];
  notes: string;
  history: ToothHistoryEntry[];
  recordedByStaffId: string;
  recordedAt: string;
}

export interface PeriodontalReading {
  id: string;
  patientId: string;
  toothNumber: string;
  measurementPoints: {
    buccal: [number, number, number];
    lingual: [number, number, number];
  };
  bleedingOnProbing: boolean;
  recordedAt: string;
}

export type TreatmentPlanStatus = 'Draft' | 'Proposed' | 'Approved' | 'In Progress' | 'Completed';

export interface Procedure {
  id: string;
  name: string;
  category: string;
  defaultCost: number;
  defaultDurationMinutes: number;
  gstApplicable?: boolean;
  isActive?: boolean;
  clinicId?: string | null;
}

export interface TreatmentPlanItem {
  id: string;
  procedureId?: string;
  procedureName?: string;
  toothNumber?: string;
  cost: number;
  taxable?: boolean;
  status: 'Pending' | 'Scheduled' | 'Completed';
  linkedAppointmentId?: string;
  completedAt?: string;
}

export interface TreatmentPlan {
  id: string;
  patientId: string;
  name: string;
  status: TreatmentPlanStatus;
  discount: number; // percentage or flat
  discountType: 'percentage' | 'flat';
  discountReason?: string;
  taxPercentage: number;
  items: TreatmentPlanItem[];
  createdByStaffId: string;
  createdAt: string;
  approvedAt?: string;
  // Calculated by the server
  patientName?: string;
  clinicId?: string;
  notes?: string;
  subtotal?: number;
  discountAmount?: number;
  estimatedTax?: number;
  estimatedTotal?: number;
  completedCount?: number;
  createdByName?: string;
  invoiceId?: string;
}

export interface ClinicalNote {
  id: string;
  patientId: string;
  appointmentId?: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  authorStaffId: string;
  createdAt: string;
  authorName?: string;
  updatedAt?: string;
  /** The author can still edit it (within 24 hours of writing). */
  editable?: boolean;
}

export type DocumentType = 'X-Ray' | 'Intraoral Photo' | 'Lab Report' | 'Consent Form' | 'Insurance Document' | 'Other';

export interface PatientDocument {
  id: string;
  patientId: string;
  type: DocumentType;
  fileName: string;
  fileUrl: string;
  thumbnailUrl?: string;
  taggedTeeth?: string[];
  linkedTreatmentPlanItemId?: string;
  linkedClinicalNoteId?: string;
  tags: string[];
  uploadedByStaffId: string;
  uploadedAt: string;
  sizeBytes?: number;
}

export interface Annotation {
  id: string;
  documentId: string;
  annotationData: any; // JSON representation of canvas drawing
  createdByStaffId: string;
  createdAt: string;
}

export interface ConsentForm {
  id: string;
  patientId: string;
  templateType: string;
  signedDocumentId?: string;
  status: 'Pending' | 'Signed';
  signedAt?: string;
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Void';

export interface InvoiceLineItem {
  id: string;
  procedureId?: string;
  procedureName: string;
  /** GST applies to this line (cosmetic work). Most dental treatment is exempt. */
  taxable?: boolean;
  toothNumber?: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface Invoice {
  id: string;
  patientId: string;
  clinicId: string;
  invoiceNumber: string;
  treatmentPlanId?: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  discount: number;
  discountType: 'percentage' | 'flat';
  taxBreakdown: { cgst: number; sgst: number; igst: number }; // percentages or absolute? let's assume absolute amounts for simplicity, but we will store percentages in UI and calculate. Let's store calculated absolute tax here.
  totalTax: number;
  total: number;
  status: InvoiceStatus;
  dueDate: string;
  notes?: string;
  createdAt: string;
  sentAt?: string;
  // Calculated by the server
  patientName?: string;
  patientPhone?: string;
  discountAmount?: number;
  taxRate?: number;
  interState?: boolean;
  amountPaid?: number;
  balanceDue?: number;
  hasInstallments?: boolean;
  voidedAt?: string;
  voidReason?: string;
}

export interface InvoiceDetail extends Invoice {
  payments: Payment[];
  installments: InstallmentPlan[];
  claims: InsuranceClaim[];
}

export interface InstallmentPlan {
  id: string;
  invoiceId: string; // or treatmentPlanId, let's link to invoice
  installmentNumber: number;
  amount: number;
  dueDate: string;
  status: 'Pending' | 'Paid' | 'Overdue';
}

export type PaymentMethod = 'Cash' | 'Card' | 'UPI' | 'Bank Transfer' | 'Cheque' | 'Insurance' | 'Online';

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  recordedByStaffId?: string;
  paidAt: string;
  source?: 'manual' | 'razorpay' | 'insurance';
}

export type InsuranceClaimStatus = 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Paid';

export interface InsuranceClaim {
  id: string;
  invoiceId: string;
  invoiceNumber?: string;
  patientId: string;
  patientName?: string;
  policyNumber?: string;
  providerName: string;
  claimAmount: number;
  approvedAmount?: number;
  status: InsuranceClaimStatus;
  notes?: string;
  submittedAt: string;
}

export interface WaitlistEntry {
  id: string;
  patientId: string;
  preferredDentistId?: string;
  preferredDateRange: string;
  clinicId: string;
  status: 'waiting' | 'scheduled' | 'cancelled';
  createdAt: string;
}

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export interface Appointment {
  id: string;
  patientId: string;
  dentistId: string;
  clinicId: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  status: AppointmentStatus;
  procedureType: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlatformSubscription {
  id: string;
  planName: string;
  status: 'active' | 'past_due' | 'canceled';
  clinicLimit: number;
  monthlyFee: number;
  nextBillingDate: string;
  usageChartData: { month: string; clinics: number }[];
  invoiceHistory: { id: string; date: string; amount: number; status: 'paid' | 'pending' | 'failed'; pdfUrl: string }[];
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
}

export type LabItemType = 'Crown' | 'Bridge' | 'Denture' | 'Aligner' | 'Night Guard' | 'Veneer' | 'Implant Component';
export type LabOrderStatus = 'Ordered' | 'In Progress' | 'Quality Check' | 'Ready for Pickup' | 'Delivered to Clinic' | 'Fitted/Completed';

export interface LabOrderStatusUpdate {
  id: string;
  labOrderId: string;
  status: LabOrderStatus;
  note: string;
  updatedBy: string;
  updatedAt: string;
}

export interface LabOrder {
  id: string;
  patientId: string;
  clinicId: string;
  labId: string;
  itemType: LabItemType;
  toothNumbers: string[];
  shadeMaterialSpec?: string;
  specialInstructions?: string;
  status: LabOrderStatus;
  orderDate: string;
  expectedDeliveryDate: string;
  deliveredDate?: string;
  linkedTreatmentPlanItemId?: string;
  updates: LabOrderStatusUpdate[];
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes?: string;
  itemsSupplied: string[];
  isLab?: boolean;
  averageTurnaroundDays?: number;
}

export type InventoryCategory = 'Consumables' | 'Instruments' | 'PPE' | 'Medications' | 'Equipment';

export interface StockMovement {
  id: string;
  itemId: string;
  changeAmount: number;
  type: 'addition' | 'usage' | 'adjustment' | 'received';
  reason: string;
  relatedAppointmentId?: string;
  recordedBy: string;
  recordedAt: string;
}

export interface InventoryItem {
  id: string;
  clinicId: string;
  name: string;
  category: InventoryCategory;
  currentStock: number;
  unit: string;
  reorderThreshold: number;
  expiryDate?: string;
  supplierId: string;
  lastRestockedDate?: string;
  movements?: StockMovement[];
}

export type POStatus = 'Draft' | 'Sent' | 'Partially Received' | 'Received';

export interface PurchaseOrderItem {
  itemId: string;
  quantity: number;
  unitPrice?: number;
  receivedQuantity: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  clinicId: string;
  supplierId: string;
  status: POStatus;
  items: PurchaseOrderItem[];
  totalAmount?: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
