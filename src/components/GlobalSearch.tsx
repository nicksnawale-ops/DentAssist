import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Search, User, CalendarDays, FileText, Settings, Building2 } from 'lucide-react';
import { mockPatients } from '../data/mockPatients';
import { mockAppointments } from '../data/mockAppointments';
import { mockInvoices } from '../data/mockInvoices';
import { mockUsers } from '../data/mockData';
import { useAuth } from '../context/AuthContext';

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { user } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results: any[] = [];

  if (query.trim().length > 1) {
    const lowerQuery = query.toLowerCase();

    // 1. Patients (All roles except patient)
    if (user?.role !== 'patient') {
      const matchedPatients = mockPatients.filter(p => 
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerQuery) ||
        p.phone.includes(lowerQuery)
      ).slice(0, 3);
      matchedPatients.forEach(p => {
        results.push({
          id: `p-${p.id}`,
          type: 'Patient',
          title: `${p.firstName} ${p.lastName}`,
          subtitle: p.phone,
          icon: User,
          onClick: () => navigate(`/patients/${p.id}`)
        });
      });
    }

    // 2. Appointments (Depends on role)
    if (user?.role !== 'patient') {
      const matchedAppointments = mockAppointments.filter(a => {
        const p = mockPatients.find(pat => pat.id === a.patientId);
        const nameMatch = p ? `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerQuery) : false;
        const dateStr = format(parseISO(a.startTime), 'MMM d, yyyy').toLowerCase();
        const dateMatch = dateStr.includes(lowerQuery);
        return nameMatch || dateMatch;
      }).slice(0, 3);
      
      matchedAppointments.forEach(a => {
        const p = mockPatients.find(pat => pat.id === a.patientId);
        results.push({
          id: `a-${a.id}`,
          type: 'Appointment',
          title: `${p?.firstName} ${p?.lastName}`,
          subtitle: `${format(parseISO(a.startTime), 'MMM d, yyyy')} at ${format(parseISO(a.startTime), 'h:mm a')}`,
          icon: CalendarDays,
          onClick: () => {
            // Depending on architecture, might open a modal or go to appointments list
            navigate(`/appointments`); 
          }
        });
      });
    }

    // 3. Invoices (Depends on role)
    if (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'receptionist' || user?.role === 'dentist') {
       const matchedInvoices = mockInvoices.filter(i => 
         i.invoiceNumber?.toLowerCase().includes(lowerQuery) || i.id.toLowerCase().includes(lowerQuery)
       ).slice(0, 2);
       matchedInvoices.forEach(i => {
         const p = mockPatients.find(pat => pat.id === i.patientId);
         results.push({
           id: `i-${i.id}`,
           type: 'Invoice',
           title: `Invoice #${i.invoiceNumber || i.id}`,
           subtitle: p ? `For ${p.firstName} ${p.lastName}` : '',
           icon: FileText,
           onClick: () => navigate(`/billing`)
         });
       });
    }

    // 4. Staff (Super Admin / Admin)
    if (user?.role === 'super_admin' || user?.role === 'admin') {
      const matchedStaff = mockUsers.filter(u => 
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(lowerQuery)
      ).slice(0, 2);
      matchedStaff.forEach(u => {
         results.push({
           id: `s-${u.id}`,
           type: 'Staff',
           title: `Dr. ${u.firstName} ${u.lastName}`,
           subtitle: u.role,
           icon: Building2,
           onClick: () => navigate(`/staff`)
         });
      });
    }
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        results[selectedIndex].onClick();
        setIsOpen(false);
        setQuery('');
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  return (
    <div className="hidden md:flex items-center relative max-w-md w-full" ref={dropdownRef}>
      <Search className="w-4 h-4 absolute left-3 text-text-muted" aria-hidden="true" />
      <input 
        ref={inputRef}
        type="text" 
        placeholder="Search patients, appointments..." 
        className="w-full bg-base border-none rounded-full py-2 pl-10 pr-4 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-text-muted"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        aria-label="Global Search"
      />

      {isOpen && query.trim().length > 1 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-surface rounded-xl border border-text-muted/10 shadow-xl overflow-hidden z-50 max-h-96 overflow-y-auto">
          {results.length > 0 ? (
            <div className="py-2">
              {results.map((result, index) => {
                const Icon = result.icon;
                return (
                  <button
                    key={result.id}
                    onClick={() => {
                      result.onClick();
                      setIsOpen(false);
                      setQuery('');
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                      index === selectedIndex ? 'bg-primary/5' : 'hover:bg-primary/5'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${index === selectedIndex ? 'bg-primary/10 text-primary' : 'bg-base text-text-muted'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-text-main">{result.title}</div>
                      <div className="text-xs text-text-muted flex gap-2">
                        <span className="font-medium text-primary/70">{result.type}</span>
                        <span>&bull;</span>
                        <span>{result.subtitle}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-text-muted">
              No results found for "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
