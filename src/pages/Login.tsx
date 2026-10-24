import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Role } from '../types';

export function Login() {
  const { loginAsRole, user } = useAuth();
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<Role>('super_admin');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  React.useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await loginAsRole(selectedRole);
    setLoading(false);
    navigate('/');
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-main" htmlFor="email">Email</label>
              <Input 
                id="email" 
                type="email" 
                placeholder="Enter your email" 
                defaultValue="demo@visionedge.com"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-main" htmlFor="password">Password</label>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                defaultValue="password123"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-text-muted/30 text-primary focus:ring-primary h-4 w-4" />
                <span className="text-sm text-text-muted select-none">Remember me</span>
              </label>
              <a href="#" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                Forgot password?
              </a>
            </div>

            {/* DEMO ROLE SELECTOR */}
            <div className="pt-4 pb-2 border-t border-text-muted/10 mt-6">
              <p className="text-xs font-semibold text-warning mb-3 uppercase tracking-wider">Demo Role Selector</p>
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

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Sign in as {selectedRole.replace('_', ' ')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
