import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, MapPin, Phone, Mail, Clock, ShieldCheck, Users, Activity, Database } from 'lucide-react';
import { Clinic, User } from '../../types';
import { getClinicById, updateClinic } from '../../api/apiService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { DataTable, ColumnDef } from '../../components/ui/DataTable';
import { ClinicFormModal } from '../../components/clinics/ClinicFormModal';
import { useToast } from '../../components/ui/useToast';
import { formatCurrency } from '../../utils/currencyConfig';

// Mock staff list just for this page. Real staff list would come from API.
const mockStaff: User[] = [
  {
    id: 'u2-dentist',
    email: 'dr.smith@visionedge.com',
    firstName: 'Sarah',
    lastName: 'Smith',
    role: 'dentist',
    createdAt: '2023-02-15T00:00:00.000Z',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f' // Matches first clinic
  },
  {
    id: 'u3-reception',
    email: 'desk@visionedge.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'receptionist',
    createdAt: '2023-03-10T00:00:00.000Z',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f'
  }
];

export function ClinicProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'staff'>('overview');
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchClinic = async () => {
      setLoading(true);
      try {
        const response = await getClinicById(id);
        if (response.data) {
          setClinic(response.data);
        }
      } catch (err) {
        console.error("Failed to load clinic");
      }
      setLoading(false);
    };
    fetchClinic();
  }, [id]);

  const handleSave = async (updatedClinic: Partial<Clinic>) => {
    if (!id) return;
    try {
      const res = await updateClinic(id, updatedClinic);
      if (res.error || !res.data) throw new Error(res.error?.message);
      setClinic(res.data);
      toast({
        title: "Clinic Updated",
        description: "Changes have been saved successfully.",
        variant: "success"
      });
      setEditModalOpen(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error && err.message ? err.message : "Failed to update clinic",
        variant: "error"
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Card className="p-6 space-y-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-xl font-semibold text-text-main">Clinic Not Found</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/clinics')}>Back to Clinics</Button>
      </div>
    );
  }

  const staffCols: ColumnDef<User>[] = [
    {
      key: 'name',
      header: 'Staff Name',
      cell: (row) => <div className="font-medium text-text-main">{row.firstName} {row.lastName}</div>
    },
    {
      key: 'role',
      header: 'Role',
      cell: (row) => (
        <Badge variant="secondary" className="capitalize">
          {row.role.replace('_', ' ')}
        </Badge>
      )
    },
    {
      key: 'email',
      header: 'Email',
      cell: (row) => <div className="text-text-muted">{row.email}</div>
    }
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/clinics')}
            className="p-2 hover:bg-surface-hover rounded-full transition-colors text-text-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-main tracking-tight">{clinic.name}</h1>
              <Badge variant={clinic.status === 'active' ? 'success' : 'secondary'}>
                {clinic.status === 'active' ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-sm text-text-muted mt-1">{clinic.address?.city}, {clinic.address?.state}</p>
          </div>
        </div>
        <Button className="gap-2" onClick={() => setEditModalOpen(true)}>
          <Edit className="w-4 h-4" />
          Edit Details
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-text-muted/10">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'overview' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('staff')}
          className={`py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'staff' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          Staff & Roles
        </button>
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4 flex flex-col items-center justify-center text-center">
                <Users className="w-6 h-6 text-primary mb-2" />
                <span className="text-2xl font-bold text-text-main">{clinic.activePatientsCount || 0}</span>
                <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Active Patients</span>
              </Card>
              <Card className="p-4 flex flex-col items-center justify-center text-center">
                <ShieldCheck className="w-6 h-6 text-primary mb-2" />
                <span className="text-2xl font-bold text-text-main">{clinic.activeStaffCount || 0}</span>
                <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Active Staff</span>
              </Card>
              <Card className="p-4 flex flex-col items-center justify-center text-center">
                <Activity className="w-6 h-6 text-primary mb-2" />
                <span className="text-2xl font-bold text-text-main">{formatCurrency((clinic.monthlyRevenue || 0))}</span>
                <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Monthly Revenue</span>
              </Card>
            </div>

            {/* Address */}
            <Card className="p-6">
              <h3 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Location
              </h3>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-3 text-sm text-text-main">
                  <p>{clinic.address?.street}</p>
                  <p>{clinic.address?.city}, {clinic.address?.state} {clinic.address?.pincode}</p>
                  <p>{clinic.address?.country}</p>
                  <div className="pt-4 space-y-2 border-t border-text-muted/10 mt-4">
                    <div className="flex items-center gap-2 text-text-muted">
                      <Phone className="w-4 h-4" />
                      <span>{clinic.phone || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-text-muted">
                      <Mail className="w-4 h-4" />
                      <span>{clinic.email || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                {/* Map Placeholder */}
                <div className="flex-1 bg-base min-h-[200px] rounded-xl flex items-center justify-center border border-text-muted/10 relative overflow-hidden">
                   {/* In a real app, an iframe or google map component would go here */}
                   <div className="absolute inset-0 bg-primary/5 pattern-grid-lg" />
                   <div className="relative flex flex-col items-center text-text-muted">
                     <MapPin className="w-8 h-8 mb-2" />
                     <span className="text-sm font-medium">Map View</span>
                   </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
             {/* Operating Hours */}
             <Card className="p-6">
              <h3 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Operating Hours
              </h3>
              <div className="space-y-3">
                {clinic.operatingHours?.map(hour => (
                  <div key={hour.day} className="flex items-center justify-between text-sm">
                    <span className="text-text-muted font-medium">{hour.day.substring(0, 3)}</span>
                    {hour.isOpen ? (
                      <span className="text-text-main font-medium">{hour.openTime} - {hour.closeTime}</span>
                    ) : (
                      <span className="text-error font-medium">Closed</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-text-muted/10 flex items-center justify-between text-sm">
                <span className="text-text-muted">Timezone</span>
                <span className="text-text-main font-medium">{clinic.timezone}</span>
              </div>
             </Card>

             {/* Storage Usage (Mock for Enterprise feel) */}
             <Card className="p-6">
              <h3 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                Storage Usage
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-medium text-text-main">Files & X-Rays</span>
                    <span className="text-xs text-text-muted">14.2 GB / 50 GB</span>
                  </div>
                  <div className="w-full bg-text-muted/10 rounded-full h-2 overflow-hidden">
                    <div className="bg-primary h-2 rounded-full" style={{ width: '28.4%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-medium text-text-main">Database Records</span>
                    <span className="text-xs text-text-muted">1.8 GB / 10 GB</span>
                  </div>
                  <div className="w-full bg-text-muted/10 rounded-full h-2 overflow-hidden">
                    <div className="bg-teal-500 h-2 rounded-full" style={{ width: '18%' }}></div>
                  </div>
                </div>
                <div className="pt-4 border-t border-text-muted/10 flex justify-between items-center text-sm">
                  <span className="text-text-muted">Current Plan:</span>
                  <span className="font-bold text-primary">Enterprise</span>
                </div>
              </div>
             </Card>
          </div>
        </div>
      )}

      {activeTab === 'staff' && (
        <div>
          <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-bold text-text-main">Assigned Staff</h3>
             <Button variant="outline" onClick={() => navigate('/staff')}>Manage All Staff</Button>
          </div>
          <DataTable 
            columns={staffCols}
            data={mockStaff} // In real app, filter by clinic.id
          />
        </div>
      )}

      {editModalOpen && clinic && (
        <ClinicFormModal 
          open={editModalOpen} 
          onOpenChange={setEditModalOpen}
          clinic={clinic}
          onSave={handleSave} 
        />
      )}
    </div>
  );
}
