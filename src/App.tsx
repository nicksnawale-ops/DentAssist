import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { BillingDashboard } from './pages/billing/BillingDashboard';
import { PatientBills } from './pages/billing/PatientBills';
import { InventoryDashboard } from './pages/inventory/InventoryDashboard';
import { ReportsDashboard } from './pages/reports/ReportsDashboard';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { TreatmentPlansPage } from './pages/treatments/TreatmentPlansPage';
import { BookOnline } from './pages/public/BookOnline';
import { BarChart3, CalendarDays, ClipboardList } from 'lucide-react';
import { RoleRoute } from './components/RoleRoute';
import { AccessDenied } from './pages/AccessDenied';
import { DashboardDispatcher } from './pages/DashboardDispatcher';
import { Settings } from './pages/Settings';
import { Toaster } from './components/ui/Toaster';

// Clinics Module
import { ClinicsList } from './pages/clinics/ClinicsList';
import { ClinicProfile } from './pages/clinics/ClinicProfile';

// Staff Module
import { StaffList } from './pages/staff/StaffList';
import { StaffProfile } from './pages/staff/StaffProfile';

// Appointments Module
import { AppointmentsList } from './pages/appointments/AppointmentsList';

// Patients Module
import { PatientsList } from './pages/patients/PatientsList';
import { PatientProfile } from './pages/patients/PatientProfile';
import { PatientAppointmentsList } from './pages/patients/PatientAppointmentsList';
import { PatientRecordsView } from './pages/patients/PatientRecordsView';
import { PatientProfileSettings } from './pages/patients/PatientProfileSettings';

// Communications
import { CommunicationLog } from './pages/communications/CommunicationLog';
import { RecallsPage } from './pages/recalls/RecallsPage';
import { SignConsent } from './pages/public/SignConsent';
import { TeamPage } from './pages/team/TeamPage';
import { SelfCheckIn } from './pages/public/SelfCheckIn';
import { Enquire } from './pages/public/Enquire';
import { LeadsPage } from './pages/leads/LeadsPage';

const AppointmentsDispatcher = () => {
  const { user } = useAuth();
  if (user?.role === 'patient') return <PatientAppointmentsList />;
  return <AppointmentsList />;
};

const SettingsDispatcher = () => {
  const { user } = useAuth();
  if (user?.role === 'patient') return <PatientProfileSettings />;
  return <Settings />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/book/:clinicId" element={<BookOnline />} />
      <Route path="/consent/:token" element={<SignConsent />} />
      <Route path="/checkin/:clinicId" element={<SelfCheckIn />} />
      <Route path="/enquire/:clinicId" element={<Enquire />} />
      <Route path="/access-denied" element={<AccessDenied />} />
      
      <Route path="/" element={<RoleRoute allowedRoles={['super_admin', 'admin', 'dentist', 'receptionist', 'patient']}><AppShell /></RoleRoute>}>
        {/* Dynamic Dispatcher Dashboard */}
        <Route index element={<DashboardDispatcher />} />
        
        {/* Protected Routes by Role */}
        <Route path="clinics">
          <Route index element={<RoleRoute allowedRoles={['super_admin']}><ClinicsList /></RoleRoute>} />
          <Route path=":id" element={<RoleRoute allowedRoles={['super_admin']}><ClinicProfile /></RoleRoute>} />
        </Route>
        
        <Route path="staff">
          <Route index element={<RoleRoute allowedRoles={['super_admin', 'admin']}><StaffList /></RoleRoute>} />
          <Route path=":id" element={<RoleRoute allowedRoles={['super_admin', 'admin']}><StaffProfile /></RoleRoute>} />
        </Route>
        
        <Route path="reports" element={<RoleRoute allowedRoles={['super_admin', 'admin', 'dentist']}><ReportsDashboard /></RoleRoute>} />
        
        <Route path="schedule" element={<RoleRoute allowedRoles={['dentist']}><AppointmentsList mySchedule /></RoleRoute>} />
        <Route path="treatments" element={<RoleRoute allowedRoles={['dentist', 'admin', 'super_admin']}><TreatmentPlansPage /></RoleRoute>} />
        
        <Route path="appointments" element={<RoleRoute allowedRoles={['super_admin', 'admin', 'receptionist', 'patient']}><AppointmentsDispatcher /></RoleRoute>} />
        
        <Route path="team" element={<RoleRoute allowedRoles={['super_admin', 'admin', 'dentist', 'receptionist']}><TeamPage /></RoleRoute>} />
        <Route path="leads" element={<RoleRoute allowedRoles={['super_admin', 'admin', 'receptionist']}><LeadsPage /></RoleRoute>} />
        <Route path="recalls" element={<RoleRoute allowedRoles={['super_admin', 'admin', 'receptionist']}><RecallsPage /></RoleRoute>} />
        <Route path="communications" element={<RoleRoute allowedRoles={['super_admin', 'admin', 'dentist', 'receptionist']}><CommunicationLog /></RoleRoute>} />
        
        <Route path="patients">
          <Route index element={<RoleRoute allowedRoles={['super_admin', 'admin', 'dentist', 'receptionist']}><PatientsList /></RoleRoute>} />
          <Route path=":id" element={<RoleRoute allowedRoles={['super_admin', 'admin', 'dentist', 'receptionist']}><PatientProfile /></RoleRoute>} />
        </Route>
        <Route path="billing" element={<RoleRoute allowedRoles={['super_admin', 'admin', 'dentist', 'receptionist']}><BillingDashboard /></RoleRoute>} />
        <Route path="inventory" element={<RoleRoute allowedRoles={['super_admin', 'admin', 'dentist', 'receptionist']}><InventoryDashboard /></RoleRoute>} />
        
        <Route path="records" element={<RoleRoute allowedRoles={['patient']}><PatientRecordsView /></RoleRoute>} />
        <Route path="bills" element={<RoleRoute allowedRoles={['patient']}><PatientBills /></RoleRoute>} />
        
        <Route path="settings" element={<RoleRoute allowedRoles={['super_admin', 'admin', 'dentist', 'receptionist', 'patient']}><SettingsDispatcher /></RoleRoute>} />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Toaster />
      </Router>
    </AuthProvider>
  );
}
