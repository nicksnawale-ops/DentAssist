import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { User, Clinic } from '../../types';
import { getStaff, getClinics, createStaff } from '../../api/apiService';
import { Button } from '../../components/ui/Button';
import { DataTable, ColumnDef } from '../../components/ui/DataTable';
import { SearchBar } from '../../components/ui/SearchBar';
import { FilterPanel, FilterGroup } from '../../components/ui/FilterPanel';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { StaffFormModal } from '../../components/staff/StaffFormModal';
import { useToast } from '../../components/ui/useToast';

export function StaffList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedClinicId } = useAuth();
  
  const [staffList, setStaffList] = useState<User[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [staffRes, clinicsRes] = await Promise.all([getStaff(), getClinics()]);
      if (staffRes.data) setStaffList(staffRes.data);
      if (clinicsRes.data) setClinics(clinicsRes.data);
    } catch (err) {
      console.error("Error fetching data");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (newStaff: Partial<User>) => {
    try {
      const res = await createStaff(newStaff);
      if (res.error) throw new Error(res.error.message);
      const tempPassword = res.data?.temporaryPassword;
      toast({
        title: "Staff Member Created",
        description: tempPassword
          ? `${newStaff.firstName} ${newStaff.lastName} added. Temporary password: ${tempPassword} (share it securely; shown only once).`
          : `${newStaff.firstName} ${newStaff.lastName} added successfully.`,
        variant: "success"
      });
      setModalOpen(false);
      fetchData();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error && err.message ? err.message : "Failed to create staff member",
        variant: "error"
      });
    }
  };

  const getClinicNames = (ids?: string[]) => {
    if (!ids || ids.length === 0) return 'Unassigned';
    return ids.map(id => clinics.find(c => c.id === id)?.name || 'Unknown').join(', ');
  };

  const filterGroups: FilterGroup[] = [
    {
      id: 'role',
      title: 'Role',
      type: 'multi-select',
      options: [
        { label: 'Dentist', value: 'dentist' },
        { label: 'Receptionist', value: 'receptionist' },
        { label: 'Admin', value: 'admin' }
      ]
    },
    {
      id: 'status',
      title: 'Status',
      type: 'multi-select',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'On Leave', value: 'on_leave' },
        { label: 'Inactive', value: 'inactive' }
      ]
    }
  ];

  const filteredStaff = staffList.filter(staff => {
    // 1. Context Clinic Filter
    if (selectedClinicId !== 'all') {
      if (!staff.clinicIds?.includes(selectedClinicId)) return false;
    }

    // 2. Search
    const searchMatch = `${staff.firstName} ${staff.lastName}`.toLowerCase().includes(search.toLowerCase()) || 
                        staff.email.toLowerCase().includes(search.toLowerCase());
    
    // 3. UI Filters
    const roleFilters = activeFilters['role'] || [];
    const roleMatch = roleFilters.length === 0 || roleFilters.includes(staff.role);
    
    const statusFilters = activeFilters['status'] || [];
    const statusMatch = statusFilters.length === 0 || statusFilters.includes(staff.status || 'active');

    return searchMatch && roleMatch && statusMatch;
  });

  const columns: ColumnDef<User>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (row) => (
        <div className="font-medium text-text-main">
          {row.firstName} {row.lastName}
        </div>
      )
    },
    {
      key: 'role',
      header: 'Role',
      cell: (row) => <div className="text-text-muted capitalize">{row.role.replace('_', ' ')}</div>
    },
    {
      key: 'clinics',
      header: 'Clinics',
      cell: (row) => (
        <div className="text-text-muted text-sm truncate max-w-[200px]" title={getClinicNames(row.clinicIds)}>
          {getClinicNames(row.clinicIds)}
        </div>
      )
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (row) => (
        <div className="text-sm">
           <div className="text-text-main">{row.phone || 'N/A'}</div>
           <div className="text-text-muted truncate max-w-[150px]">{row.email}</div>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => {
        let variant: 'success' | 'warning' | 'secondary' = 'success';
        if (row.status === 'on_leave') variant = 'warning';
        if (row.status === 'inactive') variant = 'secondary';
        
        return (
          <Badge variant={variant} className="capitalize">
            {row.status ? row.status.replace('_', ' ') : 'Active'}
          </Badge>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Staff Directory</h1>
          <p className="text-sm text-text-muted mt-1">Manage employees, roles, and clinic assignments.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Staff
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <SearchBar 
            placeholder="Search by name or email..." 
            value={search}
            onChange={setSearch}
          />
        </div>
        <FilterPanel 
          groups={filterGroups}
          activeFilters={activeFilters}
          onChange={setActiveFilters}
          resultCount={filteredStaff.length}
        />
      </div>

      <DataTable 
        columns={columns}
        data={filteredStaff}
        loading={loading}
        onRowClick={(row) => navigate(`/staff/${row.id}`)}
        emptyState={
          <EmptyState 
            icon={Users}
            title="No staff found"
            description="Try adjusting your search or filters, or add a new staff member."
          />
        }
      />

      <StaffFormModal 
        open={modalOpen} 
        onOpenChange={setModalOpen} 
        onSave={handleSave} 
      />
    </div>
  );
}
