import React from 'react';
import { useAuth } from '../context/AuthContext';
import { SuperAdminDashboard } from './dashboards/SuperAdminDashboard';
import { DentistDashboard } from './dashboards/DentistDashboard';
import { ReceptionistDashboard } from './dashboards/ReceptionistDashboard';
import { PatientDashboard } from './dashboards/PatientDashboard';

export function DashboardDispatcher() {
  const { user } = useAuth();

  if (!user) return null;

  switch (user.role) {
    case 'super_admin': return <SuperAdminDashboard />;
    case 'admin': return <SuperAdminDashboard />;
    case 'dentist': return <DentistDashboard />;
    case 'receptionist': return <ReceptionistDashboard />;
    case 'patient': return <PatientDashboard />;
    default: return <div>Unknown Role</div>;
  }
}
