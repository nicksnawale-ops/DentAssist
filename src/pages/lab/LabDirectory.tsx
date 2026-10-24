import React, { useState } from 'react';
import { mockSuppliers } from '../../data/mockSuppliers';
import { Search, Phone, Mail, MapPin, FlaskConical, Clock } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export function LabDirectory() {
  const [search, setSearch] = useState('');

  const labs = mockSuppliers.filter(s => s.isLab);
  const filteredLabs = labs.filter(lab => 
    lab.name.toLowerCase().includes(search.toLowerCase()) ||
    lab.contactPerson.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            placeholder="Search dental labs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-base border border-text-muted/20 rounded-lg text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredLabs.map(lab => (
          <div key={lab.id} className="bg-surface rounded-xl border border-text-muted/10 p-6 shadow-sm hover:border-primary/30 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-text-main mb-1 flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-blue-600" />
                  {lab.name}
                </h3>
                <p className="text-sm font-medium text-text-muted">{lab.contactPerson}</p>
              </div>
              <div className="bg-blue-500/10 text-blue-600 px-3 py-1.5 rounded-lg flex flex-col items-center">
                <span className="text-xs font-bold uppercase">Avg TAT</span>
                <div className="flex items-center gap-1 font-black">
                   <Clock className="w-3 h-3" /> {lab.averageTurnaroundDays}d
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-text-muted" />
                <span className="text-text-main">{lab.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-text-muted" />
                <span className="text-text-main">{lab.email}</span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                <span className="text-text-main">{lab.address}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-text-muted/10">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Specialties / Items</p>
              <div className="flex flex-wrap gap-2">
                {lab.itemsSupplied.map(cat => (
                  <span key={cat} className="px-2 py-1 rounded bg-blue-500/10 text-blue-700 text-xs font-medium border border-blue-500/20">
                    {cat}
                  </span>
                ))}
              </div>
              {lab.notes && (
                <p className="text-xs text-text-muted mt-4 italic">"{lab.notes}"</p>
              )}
            </div>
          </div>
        ))}
        {filteredLabs.length === 0 && (
          <div className="col-span-full py-12 text-center text-text-muted">
             No labs found matching your search.
          </div>
        )}
      </div>
    </div>
  );
}
