import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { toast } from '../components/ui/useToast';
import { User, Bell, Shield, Camera, Lock, CreditCard, Globe } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { RolesPermissionsPanel } from './settings/RolesPermissionsPanel';
import { SubscriptionOverview } from './settings/SubscriptionOverview';
import { WhatsAppTemplates } from './settings/WhatsAppTemplates';
import { AuditLogTab } from './settings/AuditLogTab';
import { MessageSquare, FileText } from 'lucide-react';
import { currencyConfig, setCurrency, useCurrency, CurrencyCode } from '../utils/currencyConfig';

export function Settings() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [isSaving, setIsSaving] = useState(false);
  const { currencyCode } = useCurrency();
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(currencyCode);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Simulate remote save API
    setTimeout(() => {
      setIsSaving(false);
      toast({
        title: "Settings updated",
        description: "Your preferences have been saved successfully.",
        variant: "success"
      });
    }, 1000);
  };

  const handleSaveRegional = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    setTimeout(() => {
      setCurrency(selectedCurrency);
      setIsSaving(false);
      toast({
        title: "Regional settings updated",
        description: "Currency has been updated across the application.",
        variant: "success"
      });
    }, 600);
  };

  if (!user) return null;
  const initialTab = searchParams.get('tab') || 'profile';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-[22px] sm:text-[26px] font-semibold leading-tight text-text-main">System Settings</h1>
        <p className="text-sm text-text-muted mt-1">Manage your account preferences and application settings.</p>
      </div>

      <Tabs.Root defaultValue={initialTab} className="flex flex-col md:flex-row gap-6">
        <Tabs.List className="flex flex-row md:flex-col gap-2 min-w-[200px] border-b md:border-b-0 md:border-r border-line overflow-x-auto md:overflow-visible pb-4 md:pb-0 md:pr-4">
          <Tabs.Trigger 
            value="profile"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-base transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary whitespace-nowrap"
          >
            <User className="w-4 h-4" /> Profile Info
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="regional"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-base transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary whitespace-nowrap"
          >
            <Globe className="w-4 h-4" /> Regional
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="notifications"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-base transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary whitespace-nowrap"
          >
            <Bell className="w-4 h-4" /> Notifications
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="security"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-base transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary whitespace-nowrap"
          >
            <Shield className="w-4 h-4" /> Security
          </Tabs.Trigger>
          {user.role === 'super_admin' && (
            <>
              <Tabs.Trigger 
                value="permissions"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-base transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary whitespace-nowrap"
              >
                <Lock className="w-4 h-4" /> Roles & Permissions
              </Tabs.Trigger>
              <Tabs.Trigger 
                value="subscription"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-base transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary whitespace-nowrap"
              >
                <CreditCard className="w-4 h-4" /> Subscription Plan
              </Tabs.Trigger>
              <Tabs.Trigger 
                value="audit_log"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-base transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary whitespace-nowrap"
              >
                <FileText className="w-4 h-4" /> Audit Log
              </Tabs.Trigger>
            </>
          )}
          <Tabs.Trigger 
            value="whatsapp"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-base transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary whitespace-nowrap"
          >
            <MessageSquare className="w-4 h-4" /> WhatsApp Templates
          </Tabs.Trigger>
        </Tabs.List>

        <div className="flex-1 min-w-0">
          <Tabs.Content value="profile" className="outline-none">
            <Card>
              <CardHeader>
                <CardTitle>Public Profile</CardTitle>
                <CardDescription>This information will be displayed on your internal organization directory.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSave} className="space-y-6">
                  {/* Avatar Upload Mock */}
                  <div className="flex items-center gap-5 pb-4 border-b border-line">
                    <div className="relative w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-2xl font-bold">
                      {user.firstName[0]}{user.lastName[0]}
                      <button type="button" className="absolute bottom-0 right-0 bg-surface rounded-full p-1.5 border border-line shadow-panel hover:bg-base text-text-muted hover:text-primary transition-colors">
                        <Camera className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-text-main">Profile Photo</h4>
                      <p className="text-xs text-text-muted mt-1">Recommended size 256x256px. Max 2MB.</p>
                      <Button variant="outline" size="sm" type="button" className="mt-3">Upload new</Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <FormField label="First Name" htmlFor="firstName">
                      <Input id="firstName" defaultValue={user.firstName} required />
                    </FormField>
                    <FormField label="Last Name" htmlFor="lastName">
                      <Input id="lastName" defaultValue={user.lastName} required />
                    </FormField>
                  </div>
                  
                  <FormField label="Email Address" htmlFor="email" description="Managed by IT. Contact support to change your primary email.">
                    <Input id="email" defaultValue={user.email} disabled className="bg-base opacity-70" />
                  </FormField>

                  <div className="pt-4 flex justify-end">
                    <Button type="submit" loading={isSaving}>Save Changes</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="regional" className="outline-none">
            <Card>
              <CardHeader>
                <CardTitle>Regional Settings</CardTitle>
                <CardDescription>Configure currency and localization preferences.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveRegional} className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="currency" className="block text-sm font-medium text-text-main">
                      Default Currency
                    </label>
                    <select
                      id="currency"
                      value={selectedCurrency}
                      onChange={(e) => setSelectedCurrency(e.target.value as CurrencyCode)}
                      className="w-full h-10 px-3 py-2 bg-surface border border-line rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-text-main"
                    >
                      <option value="INR">Indian Rupee (₹ INR)</option>
                      <option value="USD">US Dollar ($ USD)</option>
                      <option value="EUR">Euro (€ EUR)</option>
                    </select>
                    <p className="text-xs text-text-muted mt-1">
                      This symbol and formatting will be used across all billing, dashboards, and reports.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-line flex justify-end">
                    <Button type="submit" loading={isSaving}>Update Regional Settings</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="notifications" className="outline-none">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Choose what alerts you want to receive and how you get them.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSave} className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-text-main">Email Alerts</h4>
                    
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" className="mt-1 rounded border-text-muted/30 text-primary focus:ring-primary h-4 w-4" defaultChecked />
                      <div>
                        <p className="text-sm font-medium text-text-main">Daily Summaries</p>
                        <p className="text-xs text-text-muted mt-0.5">Receive a daily breakdown of your schedule and pending items.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" className="mt-1 rounded border-text-muted/30 text-primary focus:ring-primary h-4 w-4" defaultChecked />
                      <div>
                        <p className="text-sm font-medium text-text-main">Urgent System Alerts</p>
                        <p className="text-xs text-text-muted mt-0.5">Alerts regarding clinic operations, low stock, or platform updates.</p>
                      </div>
                    </label>
                  </div>

                  <div className="pt-4 border-t border-line flex justify-end">
                    <Button type="submit" loading={isSaving}>Update Preferences</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="security" className="outline-none">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Manage your password and platform access.</CardDescription>
              </CardHeader>
              <CardContent>
                 <form onSubmit={handleSave} className="space-y-6">
                  <FormField label="Current Password" htmlFor="currentPwd">
                    <Input id="currentPwd" type="password" required />
                  </FormField>
                  <FormField label="New Password" htmlFor="newPwd">
                    <Input id="newPwd" type="password" required />
                  </FormField>
                  <FormField label="Confirm New Password" htmlFor="confirmPwd">
                    <Input id="confirmPwd" type="password" required />
                  </FormField>

                   <div className="pt-4 border-t border-line flex justify-end">
                    <Button type="submit" loading={isSaving}>Update Password</Button>
                  </div>
                 </form>
              </CardContent>
            </Card>
          </Tabs.Content>

          {user.role === 'super_admin' && (
            <>
              <Tabs.Content value="permissions" className="outline-none">
                <RolesPermissionsPanel />
              </Tabs.Content>
              <Tabs.Content value="subscription" className="outline-none">
                <SubscriptionOverview />
              </Tabs.Content>
              <Tabs.Content value="audit_log" className="outline-none">
                <AuditLogTab />
              </Tabs.Content>
            </>
          )}
          
          <Tabs.Content value="whatsapp" className="outline-none">
             <WhatsAppTemplates />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}
