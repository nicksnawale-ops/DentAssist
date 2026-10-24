import { ApiResponse, Clinic, User, Notification, Role, Permission, PlatformSubscription, Appointment, Patient } from '../types';
import { mockClinics, mockUsers } from '../data/mockData';
import { mockNotifications } from '../data/mockNotifications';
import { mockSuperAdminStats, mockDentistStats, mockReceptionistStats, mockPatientStats } from '../data/mockDashboardStats';
import { mockStaff } from '../data/mockStaff';
import { mockPermissions } from '../data/mockPermissions';
import { mockPlatformSubscription } from '../data/mockPlatformSubscription';
import { mockAppointments } from '../data/mockAppointments';
import { mockPatients } from '../data/mockPatients';
import { apiClient } from './apiClient';

export async function getClinics(): Promise<ApiResponse<Clinic[]>> {
  return apiClient(() => mockClinics);
}

export async function getClinicById(id: string): Promise<ApiResponse<Clinic>> {
  return apiClient(() => {
    const clinic = mockClinics.find(c => c.id === id);
    if (!clinic) throw new Error("Clinic not found");
    return clinic;
  }, { errorMessage: "Clinic not found", errorCode: "CLINIC_NOT_FOUND" });
}

export async function createClinic(clinicData: Partial<Clinic>): Promise<ApiResponse<Clinic>> {
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
  return apiClient(() => {
    const index = mockClinics.findIndex(c => c.id === id);
    if (index === -1) throw new Error("Clinic not found");
    const updated = { ...mockClinics[index], ...clinicData };
    mockClinics[index] = updated;
    return updated;
  });
}

export async function deleteClinic(id: string): Promise<ApiResponse<boolean>> {
  return apiClient(() => {
    const index = mockClinics.findIndex(c => c.id === id);
    if (index === -1) throw new Error("Clinic not found");
    mockClinics.splice(index, 1);
    return true;
  });
}

export async function getUserById(id: string): Promise<ApiResponse<User>> {
  return apiClient(() => {
    const user = mockUsers.find(u => u.id === id);
    if (!user) throw new Error("User not found");
    return user;
  }, { errorMessage: "User not found", errorCode: "USER_NOT_FOUND" });
}

export async function getNotifications(): Promise<ApiResponse<Notification[]>> {
  return apiClient(() => [...mockNotifications]);
}

export async function markNotificationAsRead(id: string): Promise<ApiResponse<boolean>> {
  return apiClient(() => {
    const index = mockNotifications.findIndex(n => n.id === id);
    if (index !== -1) mockNotifications[index].isRead = true;
    return true;
  });
}

export async function getDashboardStats(role: Role): Promise<ApiResponse<any>> {
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

// Staff Modules
export async function getStaff(): Promise<ApiResponse<User[]>> {
  return apiClient(() => mockStaff);
}

export async function getStaffById(id: string): Promise<ApiResponse<User>> {
  return apiClient(() => {
    const staff = mockStaff.find(s => s.id === id);
    if (!staff) throw new Error("Staff member not found");
    return staff;
  }, { errorMessage: "Staff member not found", errorCode: "STAFF_NOT_FOUND" });
}

export async function createStaff(staffData: Partial<User>): Promise<ApiResponse<User>> {
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
  return apiClient(() => {
    const index = mockStaff.findIndex(s => s.id === id);
    if (index === -1) throw new Error("Staff member not found");
    const updated = { ...mockStaff[index], ...staffData };
    mockStaff[index] = updated;
    return updated;
  });
}

export async function deleteStaff(id: string): Promise<ApiResponse<boolean>> {
  return apiClient(() => {
    const index = mockStaff.findIndex(s => s.id === id);
    if (index === -1) throw new Error("Staff not found");
    // Soft delete logic can reside here
    mockStaff.splice(index, 1);
    return true;
  });
}

// Permissions Module
export async function getPermissions(): Promise<ApiResponse<Permission[]>> {
  return apiClient(() => mockPermissions);
}

// Subscription Module
export async function getPlatformSubscription(): Promise<ApiResponse<PlatformSubscription>> {
  return apiClient(() => mockPlatformSubscription);
}

// Appointments Module
export async function getAppointments(filters?: { clinicId?: string, dentistId?: string }): Promise<ApiResponse<Appointment[]>> {
  return apiClient(() => {
    let result = [...mockAppointments];
    if (filters?.clinicId && filters.clinicId !== 'all') {
      result = result.filter(a => a.clinicId === filters.clinicId);
    }
    if (filters?.dentistId) {
      result = result.filter(a => a.dentistId === filters.dentistId);
    }
    return result;
  });
}

export async function createAppointment(data: Partial<Appointment>): Promise<ApiResponse<Appointment>> {
  return apiClient(() => {
    // Conflict checking
    const hasConflict = mockAppointments.some(a => 
      a.dentistId === data.dentistId && 
      data.startTime && data.endTime &&
      ((new Date(data.startTime) >= new Date(a.startTime) && new Date(data.startTime) < new Date(a.endTime)) ||
      (new Date(data.endTime) > new Date(a.startTime) && new Date(data.endTime) <= new Date(a.endTime)))
    );

    // In a real backend, we'd block this or tag it. The frontend handles the warning and sends a param if overridden.
    // For mock, we'll just insert it.
    
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

export async function updateAppointment(id: string, data: Partial<Appointment>): Promise<ApiResponse<Appointment>> {
  return apiClient(() => {
    const index = mockAppointments.findIndex(a => a.id === id);
    if (index === -1) throw new Error("Appointment not found");
    const updated = { ...mockAppointments[index], ...data };
    mockAppointments[index] = updated;
    return updated;
  });
}

export async function cancelAppointment(id: string, reason?: string): Promise<ApiResponse<Appointment>> {
  return apiClient(() => {
    const index = mockAppointments.findIndex(a => a.id === id);
    if (index === -1) throw new Error("Appointment not found");
    const updated = { ...mockAppointments[index], status: 'cancelled' as const, notes: reason ? `${mockAppointments[index].notes || ''}\nCancellation Reason: ${reason}` : mockAppointments[index].notes } as Appointment;
    mockAppointments[index] = updated;
    return updated;
  });
}

export async function checkinAppointment(id: string): Promise<ApiResponse<Appointment>> {
  return apiClient(() => {
    const index = mockAppointments.findIndex(a => a.id === id);
    if (index === -1) throw new Error("Appointment not found");
    const updated = { ...mockAppointments[index], status: 'in_progress' as const } as Appointment;
    mockAppointments[index] = updated;
    return updated;
  });
}

// Patients Module
export async function getPatients(): Promise<ApiResponse<Patient[]>> {
  return apiClient(() => mockPatients);
}

export async function createPatient(data: Partial<Patient>): Promise<ApiResponse<Patient>> {
  return apiClient(() => {
    const newPatient = {
      ...data,
      id: `pat_${Date.now()}`
    } as Patient;
    mockPatients.push(newPatient);
    return newPatient;
  });
}

// Waitlist Module
import { mockWaitlist } from '../data/mockWaitlist';
import { WaitlistEntry } from '../types';

export async function getWaitlist(clinicId?: string): Promise<ApiResponse<WaitlistEntry[]>> {
  return apiClient(() => {
    let result = [...mockWaitlist];
    if (clinicId && clinicId !== 'all') {
      result = result.filter(w => w.clinicId === clinicId);
    }
    return result;
  });
}

export async function addToWaitlist(data: Partial<WaitlistEntry>): Promise<ApiResponse<WaitlistEntry>> {
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


