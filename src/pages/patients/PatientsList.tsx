import { useCurrency } from '../../utils/currencyConfig';
import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { getPatients } from '../../api/apiService';
import { useAuth } from '../../context/AuthContext';
import { Search, Filter, Plus, AlertCircle, Phone, Calendar as CalendarIcon, User } from 'lucide-react';
import { format, parseISO, differenceInYears } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { PatientRegistrationForm } from '../../components/patients/PatientRegistrationForm';
import { Patient } from '../../types';

import { EmptyState } from '../../components/ui/EmptyState';

export function PatientsList() {
  const { formatCurrency } = useCurrency();
  const [searchTerm, setSearchTerm] = useState('');
  const [tagFilter, setTagFilter] = useState('All');
  const [showRegistration, setShowRegistration] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { selectedClinicId } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPatients({ clinicId: selectedClinicId }).then(res => {
      if (cancelled) return;
      setPatients(res.data || []);
      setLoadError(res.error?.message || null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedClinicId, reloadKey]);

  const handlePatientClick = (patientId: string) => {
    navigate(`/patients/${patientId}`);
  };

  const getAge = (dob?: string) => {
    if (!dob) return 'N/A';
    return differenceInYears(new Date(), parseISO(dob)) + 'y';
  };

  const hasMedicalAlert = (patient: Patient) => {
    const { allergies = [], chronicConditions = [] } = patient.medicalHistory || {};
    return allergies.length > 0 || chronicConditions.length > 0;
  };

  const [hasUpcoming, setHasUpcoming] = useState(false);
  const [dentistFilter, setDentistFilter] = useState('All');

  const filteredPatients = patients.filter(p => {
    const matchesSearch = p.firstName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.phone.includes(searchTerm);
    const matchesTag = tagFilter === 'All' || p.tags?.includes(tagFilter);
    const matchesUpcoming = !hasUpcoming || !!p.nextAppointment;
    // mock appointments mapping omitted for brevity, dummy match true for dentist
    const matchesDentist = dentistFilter === 'All' || true;
    
    return matchesSearch && matchesTag && matchesUpcoming && matchesDentist;
  });

  const allTags = Array.from(new Set(patients.flatMap(p => p.tags || [])));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-[22px] sm:text-[26px] font-semibold leading-tight text-text-main">Patient Directory</h1>
          <p className="text-sm text-text-muted mt-1">Manage patient records, medical histories, and appointments.</p>
        </div>
        <Button onClick={() => setShowRegistration(true)} className="gap-2 shadow-panel">
          <Plus className="w-4 h-4" /> New Patient
        </Button>
      </div>

      <div className="flex flex-col gap-4 bg-surface p-4 rounded-xl border border-line shadow-panel">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search by name or phone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-base border border-line rounded-lg py-2 pl-9 pr-4 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-all"
            />
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:w-40">
              <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <select 
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="w-full bg-base border border-line rounded-lg py-2 pl-9 pr-4 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-all appearance-none"
              >
                <option value="All">All Tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
            
            <div className="relative flex-1 md:w-40">
              <select 
                value={dentistFilter}
                onChange={(e) => setDentistFilter(e.target.value)}
                className="w-full bg-base border border-line rounded-lg py-2 px-4 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-all appearance-none"
              >
                <option value="All">All Dentists</option>
                <option value="dr_smith">Dr. Smith</option>
                <option value="dr_jones">Dr. Jones</option>
              </select>
            </div>
            
            <label className="flex items-center gap-2 text-sm text-text-main whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={hasUpcoming} onChange={e => setHasUpcoming(e.target.checked)} className="rounded border-text-muted/30 text-primary focus:ring-primary" />
              Has upcoming appt
            </label>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface-hover border-b border-line text-text-muted text-[13px] font-medium">
              <tr>
                <th className="px-6 py-4">Patient Name</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Age / Gender</th>
                <th className="px-6 py-4">Last Visit</th>
                <th className="px-6 py-4">Next Appointment</th>
                <th className="px-6 py-4">Balance</th>
                <th className="px-6 py-4">Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredPatients.map(patient => (
                <tr 
                  key={patient.id} 
                  onClick={() => handlePatientClick(patient.id)}
                  className="hover:bg-surface-hover cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-text-main">
                          {patient.firstName} {patient.lastName}
                        </span>
                        {hasMedicalAlert(patient) && (
                           <AlertCircle className="w-4 h-4 text-error" title="Medical Alert" />
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                       <span className="text-text-main flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-text-muted" /> {patient.phone}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-text-muted">
                    {getAge(patient.dob)} / {patient.gender ? patient.gender.charAt(0) : '-'}
                  </td>
                  <td className="px-6 py-4 text-text-muted">
                    {patient.lastVisit ? format(parseISO(patient.lastVisit), 'MMM d, yyyy') : '-'}
                  </td>
                  <td className="px-6 py-4 text-text-muted">
                     {patient.nextAppointment ? (
                        <div className="flex items-center gap-1.5 font-medium text-text-main">
                           <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                           {format(parseISO(patient.nextAppointment), 'MMM d, yyyy')}
                        </div>
                     ) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    {patient.outstandingBalance && patient.outstandingBalance > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-error/10 text-error">
                        {formatCurrency(patient.outstandingBalance)}
                      </span>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {patient.tags?.map(tag => (
                        <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-text-muted/10 text-text-muted">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-text-muted">Loading patients…</td></tr>
              )}
              {!loading && loadError && (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-error">{loadError}</td></tr>
              )}
              {!loading && !loadError && filteredPatients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12">
                     <EmptyState
                       icon={User}
                       title="No patients found"
                       description={patients.length === 0 ? "Add your first patient to get started." : "No patients found matching your search criteria."}
                       actionLabel={patients.length === 0 ? "Add Patient" : undefined}
                       onAction={patients.length === 0 ? () => setShowRegistration(true) : undefined}
                     />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showRegistration && (
         <PatientRegistrationForm 
           isOpen={showRegistration} 
           onClose={() => setShowRegistration(false)} 
           onSaved={(saved) => {
             setReloadKey(k => k + 1);
             navigate(`/patients/${saved.id}`);
           }}
         />
      )}
    </div>
  );
}
