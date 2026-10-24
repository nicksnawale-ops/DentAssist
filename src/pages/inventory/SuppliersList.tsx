import React, { useState } from 'react';
import { mockSuppliers } from '../../data/mockSuppliers';
import { Search, Plus, Phone, Mail, MapPin } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export function SuppliersList() {
  const [search, setSearch] = useState('');

  const filteredSuppliers = mockSuppliers.filter(supplier => 
    supplier.name.toLowerCase().includes(search.toLowerCase()) ||
    supplier.contactPerson.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-base border border-text-muted/20 rounded-lg text-sm focus:outline-none focus:border-primary"
          />
        </div>
        
        <Button className="gap-2">
          <Plus className="w-4 h-4" /> Add Supplier
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSuppliers.map(supplier => (
          <div key={supplier.id} className="bg-surface rounded-xl border border-text-muted/10 p-6 shadow-sm hover:border-primary/30 transition-colors">
            <h3 className="text-xl font-bold text-text-main mb-1">{supplier.name}</h3>
            <p className="text-sm font-medium text-text-muted mb-4">{supplier.contactPerson}</p>

            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-text-muted" />
                <span className="text-text-main">{supplier.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-text-muted" />
                <span className="text-text-main">{supplier.email}</span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                <span className="text-text-main">{supplier.address}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-text-muted/10">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Items Supplied</p>
              <div className="flex flex-wrap gap-2">
                {supplier.itemsSupplied.map(cat => (
                  <span key={cat} className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-medium">
                    {cat}
                  </span>
                ))}
              </div>
              {supplier.notes && (
                <p className="text-xs text-text-muted mt-4 italic">"{supplier.notes}"</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
