import { useCurrency } from '../../utils/currencyConfig';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, MapPin, Phone, Mail, Clock, Calendar, TrendingUp, Star } from 'lucide-react';
import { User, Clinic } from '../../types';
import { getStaffById, getClinics, updateStaff } from '../../api/apiService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/useToast';
import { StaffFormModal } from '../../components/staff/StaffFormModal';

export function StaffProfile() {
  const { formatCurrency, symbol } = useCurrency();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [staff, setStaff] = useState<User | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule' | 'performance'>('overview');
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [staffRes, clinicsRes] = await Promise.all([getStaffById(id), getClinics()]);
        if (staffRes.data) setStaff(staffRes.data);
        if (clinicsRes.data) setClinics(clinicsRes.data);
      } catch (err) {
        console.error("Failed to load staff data");
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const handleSave = async (updatedStaff: Partial<User>) => {
    if (!id) return;
    try {
      await updateStaff(id, updatedStaff);
      setStaff(prev => prev ? { ...prev, ...updatedStaff } as User : null);
      toast({
        title: "Staff Updated",
        description: "Changes have been saved successfully.",
        variant: "success"
      });
      setEditModalOpen(false);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update staff member",
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
        </Card>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-xl font-semibold text-text-main">Staff Member Not Found</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/staff')}>Back to Directory</Button>
      </div>
    );
  }

  const assignedClinics = clinics.filter(c => staff.clinicIds?.includes(c.id));

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/staff')}
            className="p-2 hover:bg-surface-hover rounded-full transition-colors text-text-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-main tracking-tight">
                {staff.firstName} {staff.lastName}
              </h1>
              <Badge variant={
                staff.status === 'on_leave' ? 'warning' :
                staff.status === 'inactive' ? 'secondary' : 'success'
              } className="capitalize">
                {staff.status ? staff.status.replace('_', ' ') : 'Active'}
              </Badge>
            </div>
            <p className="text-sm text-text-muted mt-1 capitalize">{staff.role.replace('_', ' ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => {/* Handle reset password */}}>Reset Password</Button>
          <Button className="gap-2" onClick={() => setEditModalOpen(true)}>
            <Edit className="w-4 h-4" />
            Edit Profile
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-text-muted/10 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'overview' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'schedule' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          Schedule
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          className={`py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'performance' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          Performance
        </button>
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-6 col-span-1 lg:col-span-2 space-y-6">
            <h3 className="text-lg font-bold text-text-main">Contact & Professional Info</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-6 border-b border-text-muted/10">
              <div className="space-y-4">
                 <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-text-muted" />
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wider font-medium">Email</div>
                      <div className="text-sm text-text-main">{staff.email}</div>
                    </div>
                 </div>
                 <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-text-muted" />
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wider font-medium">Phone</div>
                      <div className="text-sm text-text-main">{staff.phone || 'N/A'}</div>
                    </div>
                 </div>
                 <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-text-muted" />
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wider font-medium">Date Joined</div>
                      <div className="text-sm text-text-main">
                        {staff.dateJoined ? new Date(staff.dateJoined).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                 </div>
              </div>

              {staff.role === 'dentist' && (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-text-muted uppercase tracking-wider font-medium mb-1">License No.</div>
                    <div className="text-sm text-text-main">{staff.licenseNumber || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text-muted uppercase tracking-wider font-medium mb-1">Specializations</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {staff.specializations?.map(spec => (
                        <Badge key={spec} variant="secondary">{spec}</Badge>
                      )) || <span className="text-sm text-text-muted">None specified</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 space-y-6">
            <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Assigned Clinics
            </h3>
            {assignedClinics.length > 0 ? (
              <div className="space-y-3">
                {assignedClinics.map(clinic => (
                  <div key={clinic.id} className="p-3 bg-base rounded-lg border border-text-muted/10">
                    <div className="font-medium text-sm text-text-main">{clinic.name}</div>
                    <div className="text-xs text-text-muted truncate">{clinic.address?.city}, {clinic.address?.state}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-text-muted italic">Not assigned to any clinics.</div>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'schedule' && (
         <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Weekly Working Hours
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {staff.workingHours?.map(hour => (
                <div key={hour.day} className="flex items-center justify-between p-4 bg-base rounded-lg border border-text-muted/10">
                  <span className="font-medium text-sm text-text-main">{hour.day}</span>
                  {hour.isWorking ? (
                    <span className="text-sm text-text-main">{hour.startTime} - {hour.endTime}</span>
                  ) : (
                    <span className="text-sm text-text-muted italic">Off Duty</span>
                  )}
                </div>
              ))}
              {(!staff.workingHours || staff.workingHours.length === 0) && (
                 <div className="col-span-full py-8 text-center text-sm text-text-muted">
                    No working hours configured for this staff member.
                 </div>
              )}
            </div>
         </Card>
      )}

      {activeTab === 'performance' && (
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 flex flex-col items-center justify-center text-center">
              <TrendingUp className="w-8 h-8 text-primary mb-3" />
              <span className="text-3xl font-bold text-text-main">124</span>
              <span className="text-xs text-text-muted uppercase tracking-wider font-medium mt-1">Patients This Month</span>
            </Card>
            <Card className="p-6 flex flex-col items-center justify-center text-center">
              <Star className="w-8 h-8 text-primary mb-3 fill-primary/20" />
              <span className="text-3xl font-bold text-text-main">4.8</span>
              <span className="text-xs text-text-muted uppercase tracking-wider font-medium mt-1">Average Rating</span>
            </Card>
            <Card className="p-6 flex flex-col items-center justify-center text-center">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg mb-3">{symbol}</div>
              <span className="text-3xl font-bold text-text-main">3.2L</span>
              <span className="text-xs text-text-muted uppercase tracking-wider font-medium mt-1">Revenue Generated</span>
            </Card>
         </div>
      )}

      {editModalOpen && (
        <StaffFormModal 
          open={editModalOpen} 
          onOpenChange={setEditModalOpen}
          staff={staff}
          onSave={handleSave} 
        />
      )}
    </div>
  );
}
