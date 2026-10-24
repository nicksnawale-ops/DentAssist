import { Appointment } from '../types';
import { addDays, setHours, setMinutes, startOfWeek, subDays } from 'date-fns';

const now = new Date();
const startOfCurrentWeek = startOfWeek(now, { weekStartsOn: 1 }); // Monday

export const mockAppointments: Appointment[] = [
  {
    id: 'appt_1',
    patientId: 'pat_1',
    dentistId: 's1', // Sarah Smith
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f', // Clinic 1
    startTime: setMinutes(setHours(addDays(startOfCurrentWeek, 0), 9), 0).toISOString(), // Mon 9:00
    endTime: setMinutes(setHours(addDays(startOfCurrentWeek, 0), 10), 0).toISOString(),
    status: 'completed',
    procedureType: 'Root Canal',
    notes: 'Patient reported minor pain'
  },
  {
    id: 'appt_2',
    patientId: 'pat_2',
    dentistId: 's1', // Sarah Smith
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    startTime: setMinutes(setHours(addDays(startOfCurrentWeek, 0), 11), 30).toISOString(), // Mon 11:30
    endTime: setMinutes(setHours(addDays(startOfCurrentWeek, 0), 12), 30).toISOString(),
    status: 'scheduled',
    procedureType: 'Teeth Cleaning',
  },
  {
    id: 'appt_3',
    patientId: 'pat_3',
    dentistId: 's3', // Anil Kumar
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    startTime: setMinutes(setHours(addDays(startOfCurrentWeek, 1), 10), 0).toISOString(), // Tue 10:00
    endTime: setMinutes(setHours(addDays(startOfCurrentWeek, 1), 11), 0).toISOString(),
    status: 'confirmed',
    procedureType: 'Checkup',
  },
  {
    id: 'appt_4',
    patientId: 'pat_4',
    dentistId: 's1', // Sarah Smith
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    startTime: setMinutes(setHours(addDays(startOfCurrentWeek, 2), 14), 0).toISOString(), // Wed 14:00
    endTime: setMinutes(setHours(addDays(startOfCurrentWeek, 2), 15), 30).toISOString(),
    status: 'in_progress',
    procedureType: 'Implants',
  },
  {
    id: 'appt_5',
    patientId: 'pat_1',
    dentistId: 's3', // Anil Kumar
    clinicId: 'dbbd4709-3224-4f01-b541-ef17621436dd', // Clinic 2
    startTime: setMinutes(setHours(addDays(startOfCurrentWeek, 3), 16), 0).toISOString(), // Thu 16:00
    endTime: setMinutes(setHours(addDays(startOfCurrentWeek, 3), 17), 0).toISOString(),
    status: 'cancelled',
    procedureType: 'Extraction',
  },
  {
    id: 'appt_6',
    patientId: 'pat_2',
    dentistId: 's1', // Sarah Smith
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    startTime: setMinutes(setHours(addDays(startOfCurrentWeek, 4), 10), 0).toISOString(), // Fri 10:00
    endTime: setMinutes(setHours(addDays(startOfCurrentWeek, 4), 10), 30).toISOString(),
    status: 'no_show',
    procedureType: 'Follow-up',
  }
];
