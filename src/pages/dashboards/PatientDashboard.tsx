import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getDashboardStats } from '../../api/apiService';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { Calendar as CalendarIcon, MapPin, User, FileText, DollarSign, Star } from 'lucide-react';
import { PatientBookingModal } from './PatientBookingModal';
import { PageHeader, greeting } from '../../components/ui/PageHeader';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../utils/currencyConfig';
import { generateICS } from '../../utils/icsGenerator';

export function PatientDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDashboardStats('patient').then(res => {
      setData(res.data);
      setLoading(false);
    });
  }, [user]);

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SkeletonCard /><SkeletonCard />
        <div className="md:col-span-2"><SkeletonCard /></div>
      </div>
    );
  }

  const handleDownloadICS = () => {
    if (!data.nextAppointment) return;
    const icsContent = generateICS({
      title: 'Dental Appointment',
      description: `Appointment with ${data.nextAppointment.providerName}`,
      location: data.nextAppointment.clinicName,
      // Fake date parsing for demo
      startDate: new Date(), 
      endDate: new Date(new Date().getTime() + 30 * 60000)
    });
    
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'appointment.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title={greeting(user?.firstName)}
        description="Your visits, records and bills in one place."
        actions={
          <Button onClick={() => setIsBookingModalOpen(true)}>
            <CalendarIcon className="w-4 h-4" /> Book appointment
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="border-primary/20 shadow-md">
          <CardHeader className="bg-primary/5 pb-4 border-b border-primary/10 rounded-t-2xl">
            <CardTitle className="text-primary flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" /> Next Appointment
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-6">
            {!data.nextAppointment ? (
              <div className="space-y-4">
                <p className="text-sm text-text-muted">You have no upcoming appointments.</p>
                <Button onClick={() => setIsBookingModalOpen(true)}>Book an appointment</Button>
              </div>
            ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-text-main mb-1">{data.nextAppointment.date}</h3>
                <p className="text-text-main font-medium">{data.nextAppointment.time}</p>
              </div>
              
              <div className="space-y-2 pt-4 border-t border-line">
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-text-muted shrink-0" />
                  <p className="text-sm text-text-main">{data.nextAppointment.providerName}</p>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-text-main">{data.nextAppointment.clinicName}</p>
                    <p className="text-xs text-text-muted">{data.nextAppointment.address}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => setIsBookingModalOpen(true)}>Reschedule</Button>
                <Button className="flex-1" onClick={handleDownloadICS}>Add to Calendar</Button>
              </div>
            </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {data.pendingLabOrder && (
            <Card className="border-blue-500/20 shadow-md bg-blue-500/5">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-text-main mb-1">Lab Work Update</h4>
                  <p className="text-sm text-text-muted">{data.pendingLabOrder}</p>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Post-appointment Feedback Prompt */}
          {!reviewSubmitted && (
            <Card className="border-primary/20 shadow-panel bg-primary/5">
              <CardContent className="p-5">
                <h4 className="font-bold text-sm text-text-main mb-2">How was your recent visit?</h4>
                <div className="flex gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button 
                      key={star} 
                      onClick={() => setRating(star)}
                      className={`p-1 transition-colors ${rating >= star ? 'text-yellow-500' : 'text-text-muted/30'}`}
                    >
                      <Star className="w-6 h-6 fill-current" />
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <textarea 
                      placeholder="Any additional comments? (optional)"
                      className="w-full text-sm p-2 rounded border border-line bg-base focus:outline-none focus:border-primary mb-2 min-h-[60px]"
                    />
                    <Button size="sm" onClick={() => setReviewSubmitted(true)}>Submit Feedback</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6 flex items-start gap-4">
              <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center text-accent shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-text-muted mb-1">Recent Treatment</p>
                {!data.recentTreatment ? (
                  <p className="text-sm text-text-muted">No completed visits yet.</p>
                ) : (<>
                <h4 className="font-semibold text-text-main mb-1">{data.recentTreatment.procedure}</h4>
                <p className="text-xs text-text-muted mb-3">{data.recentTreatment.date}</p>
                <div className="bg-base rounded-lg p-3 text-sm text-text-main border border-line">
                  <span className="font-medium">Notes:</span> {data.recentTreatment.notes || '—'}
                </div>
                </>)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex flex-col justify-center gap-4 h-[calc(100%-80px)] xl:h-auto">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-text-muted mb-1">Outstanding Balance</p>
                  <h3 className="text-3xl font-semibold text-text-main tabular">{formatCurrency(data.outstandingBalance || 0)}</h3>
                </div>
                <div className="w-12 h-12 bg-warning/10 rounded-full flex items-center justify-center text-warning shrink-0">
                  <DollarSign className="w-6 h-6" />
                </div>
              </div>
              <Button variant="outline" className="w-full mt-2" onClick={() => navigate('/bills')}>View bills</Button>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {isBookingModalOpen && (
        <PatientBookingModal
          onClose={() => setIsBookingModalOpen(false)}
          onBooked={() => getDashboardStats('patient').then(res => res.data && setData(res.data))}
        />
      )}
    </div>
  );
}