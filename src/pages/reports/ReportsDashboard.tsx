import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { mockReportsData } from '../../data/mockReportsData';
import { 
  BarChart3, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  UserPlus, 
  IndianRupee,
  Calendar,
  Wallet
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { useCurrency } from '../../utils/currencyConfig';

const COLORS = ['#14A89D', '#2A4356', '#59BCA7', '#E59866', '#A569BD', '#5DADE2'];

export function ReportsDashboard() {
  const { selectedClinicId } = useAuth();
  const [dateRange, setDateRange] = useState('This Month');
  const [trendView, setTrendView] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [isLoading, setIsLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [hasData, setHasData] = useState(true);
  const { formatCurrency, symbol } = useCurrency();

  // Simulate network request
  useEffect(() => {
    setIsLoading(true);
    setHasData(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
      // Let's pretend 'Custom' has no data just to show the empty state
      if (dateRange === 'Custom') {
        setHasData(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [dateRange, selectedClinicId]);

  const handleExport = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const renderTrendIcon = (change: number) => {
    if (change > 0) {
      return <TrendingUp className="w-4 h-4 text-success" />;
    }
    return <TrendingDown className="w-4 h-4 text-error" />;
  };

  const renderTrendClass = (change: number) => {
    return change > 0 ? 'text-success' : 'text-error';
  };

  // 1. FILTER BAR
  const renderFilterBar = () => (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto hide-scrollbar">
        {['This Week', 'This Month', 'This Quarter', 'This Year', 'Custom'].map(range => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              dateRange === range 
                ? 'bg-primary text-white shadow-sm' 
                : 'bg-surface border border-text-muted/20 text-text-muted hover:text-text-main hover:bg-surface-hover'
            }`}
          >
            {range === 'Custom' && <Calendar className="w-3.5 h-3.5 inline mr-1.5" />}
            {range}
          </button>
        ))}
      </div>
      <Button onClick={handleExport} className="gap-2 shrink-0">
        <Download className="w-4 h-4" /> Export Report
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {renderFilterBar()}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard className="h-96" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard className="h-96" />
          <SkeletonCard className="h-96" />
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        {renderFilterBar()}
        <div className="mt-12">
          <EmptyState
            icon={BarChart3}
            title="No Data Available"
            description="There is no reporting data for the selected date range. Try selecting a different period."
          />
        </div>
      </div>
    );
  }

  const { summary, revenueTrend, procedurePopularity, clinicRevenue, staffPerformance, paymentMethods } = mockReportsData;

  return (
    <div className="p-6 max-w-7xl mx-auto pb-24">
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-4 right-4 z-50 bg-success text-white px-6 py-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          <span className="font-medium">Report exported successfully!</span>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-main">Reports & Analytics</h1>
        <p className="text-text-muted">Track revenue, procedure performance, and staff metrics.</p>
      </div>

      {renderFilterBar()}

      {/* 2. SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <Wallet className="w-6 h-6" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${renderTrendClass(summary.revenueChange)}`}>
                {renderTrendIcon(summary.revenueChange)}
                {Math.abs(summary.revenueChange)}%
              </div>
            </div>
            <p className="text-sm text-text-muted font-medium">Total Revenue</p>
            <h3 className="text-2xl font-bold text-text-main">{formatCurrency(summary.totalRevenue)}</h3>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
                <Calendar className="w-6 h-6" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${renderTrendClass(summary.appointmentsChange)}`}>
                {renderTrendIcon(summary.appointmentsChange)}
                {Math.abs(summary.appointmentsChange)}%
              </div>
            </div>
            <p className="text-sm text-text-muted font-medium">Total Appointments</p>
            <h3 className="text-2xl font-bold text-text-main">{summary.totalAppointments.toLocaleString()}</h3>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-amber-500/10 text-amber-600 rounded-lg">
                <UserPlus className="w-6 h-6" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${renderTrendClass(summary.newPatientsChange)}`}>
                {renderTrendIcon(summary.newPatientsChange)}
                {Math.abs(summary.newPatientsChange)}%
              </div>
            </div>
            <p className="text-sm text-text-muted font-medium">New Patients</p>
            <h3 className="text-2xl font-bold text-text-main">{summary.newPatients.toLocaleString()}</h3>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-purple-500/10 text-purple-600 rounded-lg">
                <Users className="w-6 h-6" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${renderTrendClass(summary.avgRevenueChange)}`}>
                {renderTrendIcon(summary.avgRevenueChange)}
                {Math.abs(summary.avgRevenueChange)}%
              </div>
            </div>
            <p className="text-sm text-text-muted font-medium">Avg. Revenue per Patient</p>
            <h3 className="text-2xl font-bold text-text-main">{formatCurrency(summary.avgRevenuePerPatient)}</h3>
          </CardContent>
        </Card>
      </div>

      {/* 3. REVENUE TREND CHART */}
      <Card className="mb-6">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-2">
          <div>
            <CardTitle>Revenue Trend</CardTitle>
          </div>
          <div className="flex items-center gap-1 bg-surface border border-text-muted/20 p-1 rounded-lg mt-2 sm:mt-0">
            {['daily', 'weekly', 'monthly'].map(view => (
              <button
                key={view}
                onClick={() => setTrendView(view as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                  trendView === view ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-main'
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 12 }} 
                  dy={10}
                />
                <YAxis 
                  tickFormatter={(value) => formatCurrency(value, {notation: "compact"})}
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 12 }} 
                  dx={-10}
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  name="Actual Revenue" 
                  stroke="#14A89D" 
                  strokeWidth={3} 
                  dot={{ r: 4, strokeWidth: 2 }} 
                  activeDot={{ r: 6, strokeWidth: 0 }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="target" 
                  name="Target Revenue" 
                  stroke="#94A3B8" 
                  strokeWidth={2} 
                  strokeDasharray="5 5" 
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 4. PROCEDURE POPULARITY CHART */}
        <Card>
          <CardHeader>
            <CardTitle>Top Procedures by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={procedurePopularity} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E5E7EB" />
                  <XAxis 
                    type="number" 
                    tickFormatter={(value) => formatCurrency(value, {notation: "compact"})}
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fill: '#4B5563', fontSize: 12, fontWeight: 500 }}
                    width={130}
                  />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      name === 'revenue' ? formatCurrency(value) : value, 
                      name === 'revenue' ? 'Revenue' : 'Count'
                    ]}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#F3F4F6' }}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill="#2A4356" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 7. PAYMENT METHOD BREAKDOWN */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="h-80 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentMethods}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {paymentMethods.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [`${value}%`, 'Usage']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend 
                    layout="vertical" 
                    verticalAlign="middle" 
                    align="right"
                    iconType="circle"
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 5. REVENUE BY CLINIC (Only visible if 'All Clinics' is selected) */}
      {selectedClinicId === 'all' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Clinic Comparison (Revenue)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clinicRevenue} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fill: '#4B5563', fontSize: 12, fontWeight: 500 }}
                    dy={10}
                  />
                  <YAxis 
                    tickFormatter={(value) => formatCurrency(value, {notation: "compact"})}
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    cursor={{ fill: '#F3F4F6' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill="#14A89D" radius={[6, 6, 0, 0]} maxBarSize={60}>
                    {clinicRevenue.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#14A89D' : '#59BCA7'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6. STAFF PERFORMANCE TABLE */}
      <Card>
        <CardHeader>
          <CardTitle>Staff Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border border-text-muted/10 rounded-xl overflow-hidden bg-base">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface border-b border-text-muted/10 text-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Provider Name</th>
                    <th className="px-4 py-3 font-medium text-right">Patients Seen</th>
                    <th className="px-4 py-3 font-medium text-right">Appointments Completed</th>
                    <th className="px-4 py-3 font-medium text-right">Revenue Generated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-text-muted/10">
                  {staffPerformance.map(staff => (
                    <tr key={staff.id} className="hover:bg-surface/50 transition-colors">
                      <td className="px-4 py-4">
                        <div>
                          <div className="font-medium text-text-main">{staff.name}</div>
                          <div className="text-xs text-text-muted mt-0.5">{staff.role}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-text-main">{staff.patientsSeen}</td>
                      <td className="px-4 py-4 text-right font-medium text-text-main">{staff.appointmentsCompleted}</td>
                      <td className="px-4 py-4 text-right font-medium text-success">{formatCurrency(staff.revenueGenerated)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
