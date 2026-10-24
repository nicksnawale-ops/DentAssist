import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Role } from '../types';
import { BrandMark } from '../components/ui/BrandMark';

// Demo accounts created by `python -m app.seed` (shown in development builds only).
const DEMO_ACCOUNTS: { role: Role; label: string; email: string }[] = [
  { role: 'super_admin', label: 'Super admin', email: 'admin@visionedge.com' },
  { role: 'dentist', label: 'Dentist', email: 'dr.smith@visionedge.com' },
  { role: 'receptionist', label: 'Receptionist', email: 'john.reception@visionedge.com' },
  { role: 'patient', label: 'Patient', email: 'patient@example.com' },
];
const DEMO_PASSWORD = 'Demo@1234';

export function Login() {
  const { login, loginAsRole, user, isMockMode } = useAuth();
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<Role>('super_admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  React.useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (isMockMode) {
      await loginAsRole(selectedRole);
      setLoading(false);
      navigate('/');
      return;
    }
    const result = await login(email.trim(), password, remember);
    setLoading(false);
    if (result.ok) navigate('/');
    else setError(result.error?.message || 'Sign in failed. Please try again.');
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <div className="flex min-h-[100dvh] bg-surface">
      {/* Left: what the product is for, shown rather than described */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-1/2 bg-ink text-white flex-col justify-between p-12 xl:p-16">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div className="leading-tight">
            <div className="text-[17px] font-semibold">DentAssist</div>
            <div className="text-sm text-white/55">by VisionEdge</div>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-[40px] leading-[1.1] font-semibold mb-4">
            Your clinic's day, in one calm view.
          </h1>
          <p className="text-[17px] leading-relaxed text-white/70 mb-10">
            Appointments, patient records, billing and stock for every chair and every branch.
          </p>

          {/* A sample of the front-desk queue */}
          <div className="rounded-panel bg-white/[0.06] border border-white/10 p-2" aria-hidden="true">
            <div className="flex items-center justify-between px-3 pt-2 pb-3 text-sm">
              <span className="font-medium">Today, Central Clinic</span>
              <span className="text-white/55">4 waiting</span>
            </div>
            {[
              { time: '09:00', name: 'Alice Johnson', what: 'Root canal, tooth 36', state: 'In chair', tone: 'bg-accent text-ink' },
              { time: '09:45', name: 'Rahul Desai', what: 'Scaling and polish', state: 'Checked in', tone: 'bg-white/15 text-white' },
              { time: '10:30', name: 'Meera Patil', what: 'Crown fitting', state: 'Confirmed', tone: 'bg-white/10 text-white/80' },
            ].map(row => (
              <div key={row.time} className="flex items-center gap-4 rounded-control px-3 py-2.5 odd:bg-white/[0.04]">
                <time className="text-sm text-white/60 w-11">{row.time}</time>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{row.name}</div>
                  <div className="text-xs text-white/55 truncate">{row.what}</div>
                </div>
                <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${row.tone}`}>{row.state}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-white/40">© 2026 VisionEdge</p>
      </div>

      {/* Right: sign in */}
      <div className="w-full lg:flex-1 flex items-center justify-center px-5 py-10 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <BrandMark />
            <div className="leading-tight">
              <div className="text-[17px] font-semibold text-text-main">DentAssist</div>
              <div className="text-sm text-text-muted">by VisionEdge</div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-[26px] font-semibold text-text-main mb-1.5">Sign in</h2>
            <p className="text-text-muted text-[15px]">Use the email your clinic registered for you.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div role="alert" className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}

            {!isMockMode && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-main" htmlFor="email">Email</label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="Enter your email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-main" htmlFor="password">Password</label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={e => setRemember(e.target.checked)}
                      className="rounded border-text-muted/30 text-primary focus:ring-primary h-4 w-4"
                    />
                    <span className="text-sm text-text-muted select-none">Remember me</span>
                  </label>
                  <span className="text-xs text-text-muted">Forgot password? Ask your clinic admin.</span>
                </div>
              </>
            )}

            {isMockMode ? (
              <div className="pt-4 pb-2 border-t border-line mt-6">
                <p className="text-[13px] font-medium text-text-muted mb-2.5">Demo role (mock data)</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['super_admin', 'dentist', 'receptionist', 'patient'] as Role[]).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSelectedRole(role)}
                      className={`px-3 py-2 text-xs font-medium rounded-md transition-colors border ${
                        selectedRole === role
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'border-line text-text-muted hover:border-text-muted/40'
                      }`}
                    >
                      {role.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            ) : import.meta.env.DEV && (
              <div className="pt-4 pb-2 border-t border-line mt-6">
                <p className="text-[13px] font-medium text-text-muted mb-2.5">Demo accounts, password Demo@1234</p>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_ACCOUNTS.map(acc => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fillDemo(acc.email)}
                      className={`px-3 py-2 text-xs font-medium rounded-md transition-colors border ${
                        email === acc.email
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'border-line text-text-muted hover:border-text-muted/40'
                      }`}
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button type="submit" className="w-full mt-2" size="lg" loading={loading}>
              {isMockMode ? `Sign in as ${selectedRole.replace('_', ' ')}` : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
