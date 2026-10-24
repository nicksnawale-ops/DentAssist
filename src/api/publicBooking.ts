/** No-login endpoints behind the clinic's public booking page (/book/:clinicId). */
import { ApiResponse, Address, OperatingHours } from '../types';
import { request } from './http';
import { FreeSlot } from './apiService';

export interface VisitType { key: string; label: string; minutes: number }

export interface PublicClinic {
  id: string;
  name: string;
  address?: Address;
  phone?: string;
  timezone: string;
  operatingHours?: OperatingHours[];
  dentists: { id: string; name: string; specializations: string[] }[];
  visitTypes: VisitType[];
}

export interface BookingConfirmation {
  status: 'booked' | 'received';
  appointmentId?: string;
  startTime?: string;
  endTime?: string;
  dentistName?: string;
  visitType?: string;
  clinicName?: string;
  clinicPhone?: string;
}

const base = (clinicId: string) => `/public/clinics/${encodeURIComponent(clinicId)}`;

export const getPublicClinic = (clinicId: string): Promise<ApiResponse<PublicClinic>> =>
  request('GET', base(clinicId), { anonymous: true });

export const getPublicSlots = (clinicId: string, visitType: string, date?: string, dentistId?: string): Promise<ApiResponse<FreeSlot[]>> =>
  request('GET', `${base(clinicId)}/availability`, { anonymous: true, query: { visitType, date, dentistId } });

export const bookPublic = (clinicId: string, body: {
  name: string; phone: string; email?: string; visitType: string; dentistId?: string; startTime: string; notes?: string; website?: string;
}): Promise<ApiResponse<BookingConfirmation>> =>
  request('POST', `${base(clinicId)}/bookings`, { anonymous: true, body });
