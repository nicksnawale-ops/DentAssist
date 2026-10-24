import { Permission } from '../types';

export const mockPermissions: Permission[] = [
  {
    id: 'p1',
    module: 'Clinics',
    roles: {
      super_admin: { view: true, edit: true, delete: true },
      admin: { view: true, edit: true, delete: false },
      dentist: { view: true, edit: false, delete: false },
      receptionist: { view: true, edit: false, delete: false },
      patient: { view: false, edit: false, delete: false }
    }
  },
  {
    id: 'p2',
    module: 'Staff Directory',
    roles: {
      super_admin: { view: true, edit: true, delete: true },
      admin: { view: true, edit: true, delete: false },
      dentist: { view: true, edit: false, delete: false },
      receptionist: { view: true, edit: false, delete: false },
      patient: { view: false, edit: false, delete: false }
    }
  },
  {
    id: 'p3',
    module: 'Appointments',
    roles: {
      super_admin: { view: true, edit: true, delete: true },
      admin: { view: true, edit: true, delete: true },
      dentist: { view: true, edit: true, delete: false },
      receptionist: { view: true, edit: true, delete: true },
      patient: { view: true, edit: true, delete: false }
    }
  },
  {
    id: 'p4',
    module: 'Billing',
    roles: {
      super_admin: { view: true, edit: true, delete: true },
      admin: { view: true, edit: true, delete: false },
      dentist: { view: true, edit: true, delete: false },
      receptionist: { view: true, edit: true, delete: false },
      patient: { view: true, edit: false, delete: false }
    }
  }
];
