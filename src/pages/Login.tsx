import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Role } from '../types';

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
    <div className="flex min-h-screen bg-base">
      {/* Left side - Branding/Illustration (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12 text-white relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
             <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-primary font-bold text-2xl">
              V
            </div>
            <span className="text-2xl font-bold tracking-tight">VisionEdge DentAssist</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-6">
            Modernize your dental practice.
          </h1>
          <p className="text-primary-100 text-lg max-w-md opacity-90">
            A comprehensive, premium enterprise platform for clinic management, patient tracking, and frictionless billing.
          </p>
        </div>
        
        <div className="relative z-10">
          <p className="text-sm opacity-60">© 2026 VisionEdge DentAssist Platforms Inc.</p>
        </div>

        {/* Abstract shapes for decoration */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-white opacity-5 mix-blend-overlay"></div>
        <div className="absolute top-1/4 -right-20 w-72 h-72 rounded-full bg-accent opacity-20 blur-3xl"></div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-24 relative">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-12">
             <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-2xl">
              V
            </div>
            <span className="text-2xl font-bold tracking-tight text-primary">VisionEdge DentAssist</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-text-main mb-2">Welcome back</h2>
            <p className="text-text-muted text-sm">Please enter your details to sign in.</p>
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
              <div className="pt-4 pb-2 border-t border-text-muted/10 mt-6">
                <p className="text-xs font-semibold text-warning mb-3 uppercase tracking-wider">Demo Role Selector (mock data)</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['super_admin', 'dentist', 'receptionist', 'patient'] as Role[]).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSelectedRole(role)}
                      className={`px-3 py-2 text-xs font-medium rounded-md transition-colors border ${
                        selectedRole === role
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'border-text-muted/20 text-text-muted hover:border-text-muted/40'
                      }`}
                    >
                      {role.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            ) : import.meta.env.DEV && (
              <div className="pt-4 pb-2 border-t border-text-muted/10 mt-6">
                <p className="text-xs font-semibold text-warning mb-3 uppercase tracking-wider">Demo accounts (dev only)</p>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_ACCOUNTS.map(acc => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fillDemo(acc.email)}
                      className={`px-3 py-2 text-xs font-medium rounded-md transition-colors border ${
                        email === acc.email
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'border-text-muted/20 text-text-muted hover:border-text-muted/40'
                      }`}
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              {isMockMode ? `Sign in as ${selectedRole.replace('_', ' ')}` : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
