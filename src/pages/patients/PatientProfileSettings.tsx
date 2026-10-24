import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { mockPatients } from '../../data/mockPatients';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { User, Phone, Mail, MapPin, CheckCircle, AlertCircle, MessageSquare, Heart } from 'lucide-react';

export function PatientProfileSettings() {
  const { user } = useAuth();
  // Assume patient is linked to user.id, normally we'd fetch patient by userId
  const patientData = mockPatients.find(p => p.id === 'pat_1') || mockPatients[0]; // fallback
  
  const [formData, setFormData] = useState({
    firstName: patientData.firstName,
    lastName: patientData.lastName,
    phone: patientData.phone,
    email: patientData.email || '',
    address: patientData.address || '',
    whatsappOptIn: patientData.communicationPrefs?.whatsappOptIn ?? true,
    language: patientData.communicationPrefs?.language ?? 'English'
  });

  const [isPendingReview, setIsPendingReview] = useState(false);

  if (!user) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Safety design choice: Profile edits by the patient go into a 'pending review' state 
    // requiring front-desk approval, rather than directly overwriting clinical-relevant data
    // like allergies without staff awareness.
    setIsPendingReview(true);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-[22px] sm:text-[26px] font-semibold leading-tight text-text-main">My Profile</h1>
        <p className="text-sm text-text-muted">Manage your personal information and communication preferences.</p>
      </div>

      {isPendingReview && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-yellow-800 mb-1">Changes pending review</h4>
            <p className="text-sm text-yellow-700/80">
              For your safety, profile updates are reviewed by our front-desk staff before being applied to your clinical record.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
                  <User className="w-5 h-5" /> Personal Details
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-text-main mb-1">First Name</label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      className="w-full px-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-text-main mb-1">Last Name</label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      className="w-full px-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-text-main mb-1">Phone</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full pl-9 pr-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-text-main mb-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full pl-9 pr-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-text-main mb-1">Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-4 h-4 text-text-muted" />
                      <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        className="w-full pl-9 pr-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-line space-y-4">
                  <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" /> Preferences
                  </h3>
                  
                  <label className="flex items-start gap-3 p-4 border border-line rounded-xl cursor-pointer hover:bg-base/50 transition-colors">
                    <input
                      type="checkbox"
                      name="whatsappOptIn"
                      checked={formData.whatsappOptIn}
                      onChange={handleChange}
                      className="mt-1 w-4 h-4 text-primary rounded focus:ring-primary"
                    />
                    <div>
                      <div className="font-semibold text-text-main text-sm">WhatsApp Notifications</div>
                      <div className="text-xs text-text-muted mt-1">Receive appointment reminders and follow-ups on WhatsApp.</div>
                    </div>
                  </label>

                  <div>
                    <label className="block text-sm font-semibold text-text-main mb-1">Preferred Language</label>
                    <select
                      name="language"
                      value={formData.language}
                      onChange={handleChange}
                      className="w-full md:w-1/2 px-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
                    >
                      <option value="English">English</option>
                      <option value="Hindi">Hindi</option>
                      <option value="Marathi">Marathi</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button type="submit">Save Request</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-primary text-white border-none shadow-lg">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-1">Smile Rewards</h3>
              <p className="text-primary-foreground/80 text-sm mb-4">You have earned 450 points from recent visits and referrals!</p>
              <div className="bg-white/10 p-3 rounded-lg flex justify-between items-center text-sm">
                <span>Current Tier</span>
                <span className="font-bold">Gold Member</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <h3 className="font-bold text-text-main mb-3">Refer a Friend</h3>
              <p className="text-sm text-text-muted mb-4">Give your friends 10% off their first visit, and get 500 bonus points for yourself.</p>
              <div className="flex bg-base rounded border border-line p-1">
                 <input type="text" readOnly value="SMILE-P1-492" className="bg-transparent border-none outline-none text-sm font-bold text-center w-full" />
                 <Button size="sm" variant="outline">Copy</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
