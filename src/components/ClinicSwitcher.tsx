import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Clinic } from '../types';
import { getClinics } from '../api/apiService';
import { ChevronDown, Building2 } from 'lucide-react';

export function ClinicSwitcher() {
  const { selectedClinicId, setSelectedClinicId } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  
  useEffect(() => {
    const fetchClinics = async () => {
      try {
        const response = await getClinics();
        if (response.data) {
          setClinics(response.data);
        }
      } catch (error) {
        console.error("Failed to fetch clinics", error);
      }
    };
    fetchClinics();
  }, []);

  const handleSelect = (id: string | 'all') => {
    setSelectedClinicId(id);
    setIsOpen(false);
  };

  const selectedClinic = selectedClinicId === 'all' 
    ? { name: 'All Clinics' } 
    : clinics.find(c => c.id === selectedClinicId);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line hover:bg-surface-hover transition-colors text-sm font-medium text-text-main"
      >
        <Building2 className="w-4 h-4 text-primary" />
        {selectedClinic?.name || 'Loading...'}
        <ChevronDown className="w-4 h-4 text-text-muted" />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute top-full left-0 mt-1 w-56 bg-surface border border-line rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
            <button
              onClick={() => handleSelect('all')}
              className={`w-full text-left px-4 py-2 text-sm ${
                selectedClinicId === 'all' ? 'bg-primary/5 text-primary font-medium' : 'text-text-main hover:bg-surface-hover'
              }`}
            >
              All Clinics
            </button>
            <div className="h-px bg-text-muted/10 my-1 line-clamp-1" />
            {clinics.map(clinic => (
              <button
                key={clinic.id}
                onClick={() => handleSelect(clinic.id)}
                className={`w-full text-left px-4 py-2 text-sm ${
                  selectedClinicId === clinic.id ? 'bg-primary/5 text-primary font-medium' : 'text-text-main hover:bg-surface-hover'
                }`}
              >
                {clinic.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
