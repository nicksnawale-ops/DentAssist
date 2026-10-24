import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building } from 'lucide-react';
import { Clinic } from '../../types';
import { getClinics, createClinic } from '../../api/apiService';
import { Button } from '../../components/ui/Button';
import { DataTable, ColumnDef } from '../../components/ui/DataTable';
import { SearchBar } from '../../components/ui/SearchBar';
import { FilterPanel, FilterGroup } from '../../components/ui/FilterPanel';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ClinicFormModal } from '../../components/clinics/ClinicFormModal';
import { useToast } from '../../components/ui/useToast';
import { formatCurrency } from '../../utils/currencyConfig';

export function ClinicsList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetchClinics();
  }, []);

  const fetchClinics = async () => {
    setLoading(true);
    try {
      const response = await getClinics();
      if (response.data) {
        setClinics(response.data);
      }
    } catch (err) {
      console.error("Error fetching clinics");
    }
    setLoading(false);
  };

  const handleSave = async (newClinic: Partial<Clinic>) => {
    try {
      await createClinic(newClinic);
      toast({
        title: "Clinic Created",
        description: `${newClinic.name} has been added successfully.`,
        variant: "success"
      });
      setModalOpen(false);
      fetchClinics();
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to create clinic",
        variant: "error"
      });
    }
  };

  const filterGroups: FilterGroup[] = [
    {
      id: 'status',
      title: 'Status',
      type: 'multi-select',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' }
      ]
    }
  ];

  const filteredClinics = clinics.filter(clinic => {
    // Search
    const searchMatch = clinic.name.toLowerCase().includes(search.toLowerCase()) || 
                        (clinic.address?.city || '').toLowerCase().includes(search.toLowerCase());
    
    // Filters
    const statusFilters = activeFilters['status'] || [];
    const statusMatch = statusFilters.length === 0 || statusFilters.includes(clinic.status);

    return searchMatch && statusMatch;
  });

  const columns: ColumnDef<Clinic>[] = [
    {
      key: 'name',
      header: 'Clinic Name',
      cell: (row) => <div className="font-medium text-text-main">{row.name}</div>
    },
    {
      key: 'city',
      header: 'City',
      cell: (row) => <div className="text-text-muted">{row.address?.city || 'N/A'}</div>
    },
    {
      key: 'staff',
      header: 'Active Staff',
      cell: (row) => <div className="text-text-main">{row.activeStaffCount || 0}</div>
    },
    {
      key: 'patients',
      header: 'Active Patients',
      cell: (row) => <div className="text-text-main">{row.activePatientsCount || 0}</div>
    },
    {
      key: 'revenue',
      header: 'Monthly Revenue',
      cell: (row) => <div className="text-text-main">{formatCurrency((row.monthlyRevenue || 0))}</div>
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge variant={row.status === 'active' ? 'success' : 'secondary'}>
          {row.status === 'active' ? 'Active' : 'Inactive'}
        </Badge>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Clinics Management</h1>
          <p className="text-sm text-text-muted mt-1">Manage all clinic locations, view stats, and config.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Clinic
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <SearchBar 
            placeholder="Search by clinic name or city..." 
            value={search}
            onChange={setSearch}
          />
        </div>
        <FilterPanel 
          groups={filterGroups}
          activeFilters={activeFilters}
          onChange={setActiveFilters}
          resultCount={filteredClinics.length}
        />
      </div>

      <DataTable 
        columns={columns}
        data={filteredClinics}
        loading={loading}
        onRowClick={(row) => navigate(`/clinics/${row.id}`)}
        emptyState={
          <EmptyState 
            icon={Building}
            title="No clinics found"
            description="Try adjusting your search or filters, or add a new clinic."
          />
        }
      />

      <ClinicFormModal 
        open={modalOpen} 
        onOpenChange={setModalOpen} 
        onSave={handleSave} 
      />
    </div>
  );
}
