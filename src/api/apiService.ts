/**
 * Data access layer.
 *
 * By default every call goes to the FastAPI backend (see /backend). Set
 * VITE_USE_MOCK_API=true to run on the in-memory mock data instead, e.g. for a
 * UI-only demo with no server.
 */
import {
  ApiResponse, Clinic, User, Notification, Role, Permission, PlatformSubscription, Appointment, Patient,
  WaitlistEntry,
} from '../types';
import { mockClinics, mockUsers } from '../data/mockData';
import { mockNotifications } from '../data/mockNotifications';
import { mockSuperAdminStats, mockDentistStats, mockReceptionistStats, mockPatientStats } from '../data/mockDashboardStats';
import { mockStaff } from '../data/mockStaff';
import { mockPermissions } from '../data/mockPermissions';
import { mockPlatformSubscription } from '../data/mockPlatformSubscription';
import { mockAppointments } from '../data/mockAppointments';
import { mockPatients } from '../data/mockPatients';
import { mockWaitlist } from '../data/mockWaitlist';
import { apiClient } from './apiClient';
import { http, USE_MOCK_API } from './http';

export { USE_MOCK_API };

// ---------- Clinics ----------

export async function getClinics(): Promise<ApiResponse<Clinic[]>> {
  if (!USE_MOCK_API) return http.get('/clinics');
  return apiClient(() => mockClinics);
}

export async function getClinicById(id: string): Promise<ApiResponse<Clinic>> {
  if (!USE_MOCK_API) return http.get(`/clinics/${encodeURIComponent(id)}`);
  return apiClient(() => {
    const clinic = mockClinics.find(c => c.id === id);
    if (!clinic) throw new Error("Clinic not found");
    return clinic;
  }, { errorMessage: "Clinic not found", errorCode: "CLINIC_NOT_FOUND" });
}

export async function createClinic(clinicData: Partial<Clinic>): Promise<ApiResponse<Clinic>> {
  if (!USE_MOCK_API) return http.post('/clinics', clinicData);
  return apiClient(() => {
    const newClinic = {
      ...clinicData,
      id: `c_${Date.now()}`,
      createdAt: new Date().toISOString()
    } as Clinic;
    mockClinics.push(newClinic);
    return newClinic;
  });
}

export async function updateClinic(id: string, clinicData: Partial<Clinic>): Promise<ApiResponse<Clinic>> {
  if (!USE_MOCK_API) {
    // Read-only aggregate fields are not part of the update payload.
    const { id: _id, createdAt, activeStaffCount, activePatientsCount, monthlyRevenue, ...payload } = clinicData;
    return http.patch(`/clinics/${encodeURIComponent(id)}`, payload);
  }
  return apiClient(() => {
    const index = mockClinics.findIndex(c => c.id === id);
    if (index === -1) throw new Error("Clinic not found");
    const updated = { ...mockClinics[index], ...clinicData };
    mockClinics[index] = updated;
    return updated;
  });
}

export async function deleteClinic(id: string): Promise<ApiResponse<boolean>> {
  if (!USE_MOCK_API) {
    const res = await http.delete<Clinic>(`/clinics/${encodeURIComponent(id)}`);
    return { ...res, data: res.error ? null : true };
  }
  return apiClient(() => {
    const index = mockClinics.findIndex(c => c.id === id);
    if (index === -1) throw new Error("Clinic not found");
    mockClinics.splice(index, 1);
    return true;
  });
}

// ---------- Users ----------

export async function getUserById(id: string): Promise<ApiResponse<User>> {
  if (!USE_MOCK_API) return http.get(`/staff/${encodeURIComponent(id)}`);
  return apiClient(() => {
    const user = mockUsers.find(u => u.id === id);
    if (!user) throw new Error("User not found");
    return user;
  }, { errorMessage: "User not found", errorCode: "USER_NOT_FOUND" });
}

// ---------- Notifications ----------

export async function getNotifications(): Promise<ApiResponse<Notification[]>> {
  if (!USE_MOCK_API) return http.get('/notifications');
  return apiClient(() => [...mockNotifications]);
}

export async function markNotificationAsRead(id: string): Promise<ApiResponse<boolean>> {
  if (!USE_MOCK_API) {
    const res = await http.patch<Notification>(`/notifications/${encodeURIComponent(id)}/read`);
    return { ...res, data: res.error ? null : true };
  }
  return apiClient(() => {
    const index = mockNotifications.findIndex(n => n.id === id);
    if (index !== -1) mockNotifications[index].isRead = true;
    return true;
  });
}

// ---------- Dashboards ----------

export async function getDashboardStats(role: Role): Promise<ApiResponse<any>> {
  if (!USE_MOCK_API) {
    // Clinic admins use the receptionist (front-desk) dashboard.
    const path = role === 'admin' ? 'receptionist' : role;
    return http.get(`/dashboard/${path}`);
  }
  return apiClient(() => {
    switch (role) {
      case 'super_admin': return mockSuperAdminStats;
      case 'dentist': return mockDentistStats;
      case 'receptionist': return mockReceptionistStats;
      case 'patient': return mockPatientStats;
      default: throw new Error("Invalid role");
    }
  });
}

// ---------- Staff ----------

export async function getStaff(filters?: { role?: Role; clinicId?: string }): Promise<ApiResponse<User[]>> {
  if (!USE_MOCK_API) return http.get('/staff', { role: filters?.role, clinic_id: filters?.clinicId });
  return apiClient(() => mockStaff);
}

export async function getStaffById(id: string): Promise<ApiResponse<User>> {
  if (!USE_MOCK_API) return http.get(`/staff/${encodeURIComponent(id)}`);
  return apiClient(() => {
    const staff = mockStaff.find(s => s.id === id);
    if (!staff) throw new Error("Staff member not found");
    return staff;
  }, { errorMessage: "Staff member not found", errorCode: "STAFF_NOT_FOUND" });
}

/** In API mode the response may include `temporaryPassword` (shown once) when no password was supplied. */
export async function createStaff(staffData: Partial<User> & { password?: string }): Promise<ApiResponse<User & { temporaryPassword?: string }>> {
  if (!USE_MOCK_API) {
    const { id, createdAt, ...payload } = staffData;
    return http.post('/staff', payload);
  }
  return apiClient(() => {
    const newStaff = {
      ...staffData,
      id: `s_${Date.now()}`,
      createdAt: new Date().toISOString(),
      dateJoined: staffData.dateJoined || new Date().toISOString()
    } as User;
    mockStaff.push(newStaff);
    return newStaff;
  });
}

export async function updateStaff(id: string, staffData: Partial<User>): Promise<ApiResponse<User>> {
  if (!USE_MOCK_API) {
    const { id: _id, createdAt, ...payload } = staffData;
    return http.patch(`/staff/${encodeURIComponent(id)}`, payload);
  }
  return apiClient(() => {
    const index = mockStaff.findIndex(s => s.id === id);
    if (index === -1) throw new Error("Staff member not found");
    const updated = { ...mockStaff[index], ...staffData };
    mockStaff[index] = updated;
    return updated;
  });
}

export async function deleteStaff(id: string): Promise<ApiResponse<boolean>> {
  if (!USE_MOCK_API) {
    const res = await http.delete<User>(`/staff/${encodeURIComponent(id)}`);
    return { ...res, data: res.error ? null : true };
  }
  return apiClient(() => {
    const index = mockStaff.findIndex(s => s.id === id);
    if (index === -1) throw new Error("Staff not found");
    mockStaff.splice(index, 1);
    return true;
  });
}

export async function resetStaffPassword(id: string): Promise<ApiResponse<{ temporaryPassword: string }>> {
  if (!USE_MOCK_API) return http.post(`/staff/${encodeURIComponent(id)}/reset-password`);
  return apiClient(() => ({ temporaryPassword: 'mock-password' }));
}

// ---------- Settings ----------

export async function getPermissions(): Promise<ApiResponse<Permission[]>> {
  if (!USE_MOCK_API) return http.get('/permissions');
  return apiClient(() => mockPermissions);
}

export async function getPlatformSubscription(): Promise<ApiResponse<PlatformSubscription>> {
  if (!USE_MOCK_API) return http.get('/platform/subscription');
  return apiClient(() => mockPlatformSubscription);
}

// ---------- Appointments ----------

export interface AppointmentFilters {
  clinicId?: string;
  dentistId?: string;
  patientId?: string;
  from?: string;
  to?: string;
}

export async function getAppointments(filters?: AppointmentFilters): Promise<ApiResponse<Appointment[]>> {
  if (!USE_MOCK_API) {
    // Patients use the self-service endpoint, which only ever returns their own appointments.
    return http.get('/appointments', {
      clinicId: filters?.clinicId, dentistId: filters?.dentistId, patientId: filters?.patientId,
      from: filters?.from, to: filters?.to,
    });
  }
  return apiClient(() => {
    let result = [...mockAppointments];
    if (filters?.clinicId && filters.clinicId !== 'all') {
      result = result.filter(a => a.clinicId === filters.clinicId);
    }
    if (filters?.dentistId) {
      result = result.filter(a => a.dentistId === filters.dentistId);
    }
    if (filters?.patientId) {
      result = result.filter(a => a.patientId === filters.patientId);
    }
    return result;
  });
}

export async function getMyAppointments(): Promise<ApiResponse<Appointment[]>> {
  if (!USE_MOCK_API) return http.get('/patient-portal/appointments');
  return apiClient(() => mockAppointments.filter(a => a.patientId === 'pat_1'));
}

/**
 * Books an appointment. The backend rejects double-booking a dentist with
 * error code APPOINTMENT_CONFLICT; pass allowOverlap=true to book anyway.
 */
export async function createAppointment(data: Partial<Appointment> & { allowOverlap?: boolean; waitlistEntryId?: string }): Promise<ApiResponse<Appointment>> {
  if (!USE_MOCK_API) {
    const { id, createdAt, updatedAt, ...payload } = data;
    return http.post('/appointments', payload);
  }
  return apiClient(() => {
    const newAppointment = {
      ...data,
      id: `appt_${Date.now()}`,
      status: data.status || 'scheduled',
      createdAt: new Date().toISOString()
    } as Appointment;
    mockAppointments.push(newAppointment);
    return newAppointment;
  });
}

export async function updateAppointment(id: string, data: Partial<Appointment> & { allowOverlap?: boolean }): Promise<ApiResponse<Appointment>> {
  if (!USE_MOCK_API) {
    const { id: _id, createdAt, updatedAt, ...payload } = data;
    return http.patch(`/appointments/${encodeURIComponent(id)}`, payload);
  }
  return apiClient(() => {
    const index = mockAppointments.findIndex(a => a.id === id);
    if (index === -1) throw new Error("Appointment not found");
    const updated = { ...mockAppointments[index], ...data };
    mockAppointments[index] = updated;
    return updated;
  });
}

export async function cancelAppointment(id: string, reason?: string): Promise<ApiResponse<Appointment>> {
  if (!USE_MOCK_API) return http.post(`/appointments/${encodeURIComponent(id)}/cancel`, { reason });
  return apiClient(() => {
    const index = mockAppointments.findIndex(a => a.id === id);
    if (index === -1) throw new Error("Appointment not found");
    const updated = { ...mockAppointments[index], status: 'cancelled' as const, notes: reason ? `${mockAppointments[index].notes || ''}\nCancellation Reason: ${reason}` : mockAppointments[index].notes } as Appointment;
    mockAppointments[index] = updated;
    return updated;
  });
}

export async function checkinAppointment(id: string): Promise<ApiResponse<Appointment>> {
  if (!USE_MOCK_API) return http.post(`/appointments/${encodeURIComponent(id)}/check-in`);
  return apiClient(() => {
    const index = mockAppointments.findIndex(a => a.id === id);
    if (index === -1) throw new Error("Appointment not found");
    const updated = { ...mockAppointments[index], status: 'in_progress' as const } as Appointment;
    mockAppointments[index] = updated;
    return updated;
  });
}

// ---------- Patients ----------

export async function getPatients(params?: { search?: string; clinicId?: string }): Promise<ApiResponse<Patient[]>> {
  if (!USE_MOCK_API) return http.get('/patients', { search: params?.search, clinicId: params?.clinicId });
  return apiClient(() => mockPatients);
}

export async function getPatientById(id: string): Promise<ApiResponse<Patient>> {
  if (!USE_MOCK_API) return http.get(`/patients/${encodeURIComponent(id)}`);
  return apiClient(() => {
    const patient = mockPatients.find(p => p.id === id);
    if (!patient) throw new Error("Patient not found");
    return patient;
  }, { errorMessage: "Patient not found", errorCode: "PATIENT_NOT_FOUND" });
}

/** The backend rejects a phone number that already exists (code DUPLICATE_PATIENT) unless allowDuplicate is true. */
export async function createPatient(data: Partial<Patient> & { clinicId?: string }, allowDuplicate = false): Promise<ApiResponse<Patient>> {
  if (!USE_MOCK_API) {
    const { id, createdAt, lastVisit, nextAppointment, outstandingBalance, ...payload } = data;
    return http.post('/patients', payload, { allowDuplicate: allowDuplicate || undefined });
  }
  return apiClient(() => {
    const newPatient = {
      ...data,
      id: `pat_${Date.now()}`
    } as Patient;
    mockPatients.push(newPatient);
    return newPatient;
  });
}

export async function updatePatient(id: string, data: Partial<Patient>): Promise<ApiResponse<Patient>> {
  if (!USE_MOCK_API) {
    const { id: _id, createdAt, lastVisit, nextAppointment, outstandingBalance, ...payload } = data;
    return http.patch(`/patients/${encodeURIComponent(id)}`, payload);
  }
  return apiClient(() => {
    const index = mockPatients.findIndex(p => p.id === id);
    if (index === -1) throw new Error("Patient not found");
    mockPatients[index] = { ...mockPatients[index], ...data };
    return mockPatients[index];
  });
}

export async function checkDuplicatePatient(phone: string, excludeId?: string): Promise<ApiResponse<{ isDuplicate: boolean; matches: Patient[] }>> {
  if (!USE_MOCK_API) return http.get('/patients/check-duplicate', { phone, excludeId });
  return apiClient(() => {
    const key = phone.replace(/\D/g, '').slice(-10);
    const matches = mockPatients.filter(p => p.id !== excludeId && p.phone.replace(/\D/g, '').slice(-10) === key);
    return { isDuplicate: matches.length > 0, matches };
  });
}

// ---------- Patient portal (logged-in patient) ----------

export interface BookingOption {
  id: string;
  name: string;
  address?: Clinic['address'];
  phone?: string;
  operatingHours?: Clinic['operatingHours'];
  dentists: { id: string; name: string; specializations: string[] }[];
}

/** Active clinics and the dentists at each, for the patient self-booking flow. */
export async function getBookingOptions(): Promise<ApiResponse<BookingOption[]>> {
  if (!USE_MOCK_API) return http.get('/patient-portal/booking-options');
  return apiClient(() => mockClinics.filter(c => c.status === 'active').map(c => ({
    id: c.id, name: c.name, address: c.address, phone: c.phone, operatingHours: c.operatingHours,
    dentists: mockStaff
      .filter(s => s.role === 'dentist' && (s.clinicId === c.id || s.clinicIds?.includes(c.id)))
      .map(s => ({ id: s.id, name: `Dr. ${s.firstName} ${s.lastName}`, specializations: s.specializations || [] })),
  })));
}

export async function bookMyAppointment(data: { dentistId: string; clinicId: string; startTime: string; endTime: string; procedureType: string; notes?: string }): Promise<ApiResponse<Appointment>> {
  if (!USE_MOCK_API) return http.post('/patient-portal/appointments/book', data);
  return createAppointment({ ...data, patientId: 'pat_1', status: 'scheduled' });
}

export async function rescheduleMyAppointment(id: string, startTime: string, endTime: string): Promise<ApiResponse<Appointment>> {
  if (!USE_MOCK_API) return http.post(`/patient-portal/appointments/${encodeURIComponent(id)}/reschedule`, { startTime, endTime });
  return updateAppointment(id, { startTime, endTime, status: 'scheduled' });
}

export async function cancelMyAppointment(id: string, reason?: string): Promise<ApiResponse<Appointment>> {
  if (!USE_MOCK_API) return http.post(`/patient-portal/appointments/${encodeURIComponent(id)}/cancel`, { reason });
  return cancelAppointment(id, reason);
}

// ---------- Waitlist ----------

export async function getWaitlist(clinicId?: string): Promise<ApiResponse<WaitlistEntry[]>> {
  if (!USE_MOCK_API) return http.get('/waitlist', { clinicId });
  return apiClient(() => {
    let result = [...mockWaitlist];
    if (clinicId && clinicId !== 'all') {
      result = result.filter(w => w.clinicId === clinicId);
    }
    return result;
  });
}

export async function addToWaitlist(data: Partial<WaitlistEntry>): Promise<ApiResponse<WaitlistEntry>> {
  if (!USE_MOCK_API) {
    const { id, status, createdAt, ...payload } = data;
    return http.post('/waitlist', payload);
  }
  return apiClient(() => {
    const entry = {
      ...data,
      id: `wl_${Date.now()}`,
      status: 'waiting',
      createdAt: new Date().toISOString()
    } as WaitlistEntry;
    mockWaitlist.push(entry);
    return entry;
  });
}

// ---------- Smart scheduling ----------

export interface FreeSlot {
  dentistId: string;
  dentistName: string;
  startTime: string;
  endTime: string;
}

/** Free times for one day (clinic hours ∩ dentist hours, minus bookings). */
export async function getAvailability(params: { clinicId: string; date: string; duration: number; dentistId?: string }): Promise<ApiResponse<FreeSlot[]>> {
  if (!USE_MOCK_API) return http.get('/availability', { ...params });
  return apiClient(() => mockSlots(params.date, params.duration, params.dentistId));
}

/** The earliest free times over the next few weeks. */
export async function getNextAvailable(params: { clinicId: string; duration: number; dentistId?: string; limit?: number }): Promise<ApiResponse<FreeSlot[]>> {
  if (!USE_MOCK_API) return http.get('/availability/next', { ...params });
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return apiClient(() => mockSlots(d.toISOString().slice(0, 10), params.duration, params.dentistId).filter((_, i) => i % 4 === 0).slice(0, params.limit || 6));
}

function mockSlots(date: string, duration: number, dentistId?: string): FreeSlot[] {
  const out: FreeSlot[] = [];
  for (let m = 9 * 60; m + duration <= 17 * 60; m += 30) {
    const start = new Date(`${date}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`);
    if (start.getTime() < Date.now()) continue;
    out.push({ dentistId: dentistId || 's1', dentistName: 'Dr. Sarah Smith', startTime: start.toISOString(), endTime: new Date(start.getTime() + duration * 60000).toISOString() });
  }
  return out;
}

export interface WaitlistMatch {
  entryId: string;
  patientId: string;
  patientName: string;
  phone: string;
  preferredDateRange: string;
  preferredDentistId?: string;
  waitingSince: string;
}

export async function getWaitlistMatches(appointmentId: string): Promise<ApiResponse<WaitlistMatch[]>> {
  if (!USE_MOCK_API) return http.get(`/appointments/${encodeURIComponent(appointmentId)}/waitlist-matches`);
  return apiClient(() => mockWaitlist.filter(w => w.status === 'waiting').map(w => {
    const p = mockPatients.find(x => x.id === w.patientId);
    return { entryId: w.id, patientId: w.patientId, patientName: p ? `${p.firstName} ${p.lastName}` : 'Patient', phone: p?.phone || '', preferredDateRange: w.preferredDateRange, preferredDentistId: w.preferredDentistId, waitingSince: w.createdAt };
  }));
}

/** Fired after an appointment is cancelled, so the calendar can offer the slot to the waitlist. */
export const SLOT_FREED_EVENT = 'dentassist:slot-freed';
