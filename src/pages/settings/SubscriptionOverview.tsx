import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PlatformSubscription } from '../../types';
import { getPlatformSubscription } from '../../api/apiService';
import { CreditCard, Download, Building, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../utils/currencyConfig';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export function SubscriptionOverview() {
  const [sub, setSub] = useState<PlatformSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlatformSubscription().then(res => {
      if (res.data) setSub(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) {
     return <Skeleton className="h-64 w-full" />;
  }

  if (!sub) return null;

  return (
    <div className="space-y-6">
      {/* Current Plan Summary */}
      <Card className="border-primary/20 shadow-md">
        <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-4">
             <div className="flex items-center gap-3">
               <div className="p-2 bg-primary/10 rounded-lg text-primary">
                 <CreditCard className="w-6 h-6" />
               </div>
               <div>
                  <h3 className="text-xl font-bold text-text-main flex items-center gap-2">
                    {sub.planName}
                    <Badge variant={sub.status === 'active' ? 'success' : 'warning'} className="uppercase text-[10px]">
                      {sub.status.replace('_', ' ')}
                    </Badge>
                  </h3>
                  <p className="text-sm text-text-muted mt-1">Billed monthly. Next charge on {new Date(sub.nextBillingDate).toLocaleDateString()}</p>
               </div>
             </div>
             
             <div className="flex flex-col sm:flex-row gap-6 mt-4">
               <div>
                 <span className="text-3xl font-bold text-text-main">{formatCurrency(sub.monthlyFee)}</span>
                 <span className="text-sm text-text-muted"> / month</span>
               </div>
               <div className="bg-surface rounded-lg p-3 border border-text-muted/10 flex items-center gap-3">
                 <Building className="w-5 h-5 text-primary" />
                 <div>
                   <div className="text-sm font-bold text-text-main">Clinic Limit: {sub.clinicLimit}</div>
                   <div className="text-xs text-text-muted">Currently using up to 4 clinics</div>
                 </div>
               </div>
             </div>
          </div>
          
          <div className="flex flex-col gap-3 min-w-[200px]">
            <Button size="lg" className="w-full">Upgrade Plan</Button>
            <Button size="lg" variant="outline" className="w-full">Update Payment Method</Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Usage</CardTitle>
            <CardDescription>Number of active clinics over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="h-[250px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sub.usageChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="month" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #333', borderRadius: '8px' }}
                    itemStyle={{ color: '#E0E0E0' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="clinics" 
                    stroke="#D4AF37" 
                    strokeWidth={3}
                    dot={{ fill: '#D4AF37', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Invoice History */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice History</CardTitle>
            <CardDescription>Past billing statements for your subscription</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sub.invoiceHistory.map(invoice => (
                <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-base border border-text-muted/10">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-success/10 text-success rounded-full">
                       <CheckCircle2 className="w-4 h-4" />
                     </div>
                     <div>
                       <div className="text-sm font-bold text-text-main">{formatCurrency(invoice.amount)}</div>
                       <div className="text-xs text-text-muted">{new Date(invoice.date).toLocaleDateString()} &middot; {invoice.id}</div>
                     </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="w-3.5 h-3.5" /> Receipt
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
