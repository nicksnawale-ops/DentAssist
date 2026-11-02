import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, User, Role } from '../types';
import { getUserById } from '../api/apiService';
import { http, SESSION_EXPIRED_EVENT, tokenStore, USE_MOCK_API } from '../api/http';
import { mockUsers } from '../data/mockData';

interface LoginResult {
  ok: boolean;
  error?: ApiError;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Real sign-in against the backend. */
  login: (email: string, password: string, remember?: boolean) => Promise<LoginResult>;
  /** Mock mode only: sign in as the first demo user with this role. */
  loginAsRole: (role: Role) => Promise<void>;
  logout: () => Promise<void>;
  isMockMode: boolean;
  selectedClinicId: string | 'all';
  setSelectedClinicId: (id: string | 'all') => void;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClinicId, setSelectedClinicId] = useState<string | 'all'>('all');

  const signOutLocally = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setSelectedClinicId('all');
  }, []);

  // Restore an existing session on page load.
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!USE_MOCK_API && (tokenStore.access || tokenStore.refresh)) {
        const res = await http.get<User>('/auth/me');
        if (!cancelled) {
          if (res.data) setUser(res.data);
          else tokenStore.clear();
        }
      }
      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // The HTTP client fires this when a refresh token is rejected.
  useEffect(() => {
    const onExpired = () => signOutLocally();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [signOutLocally]);

  const login = async (email: string, password: string, remember = true): Promise<LoginResult> => {
    const res = await http.anonymousPost<TokenResponse>('/auth/login', { email, password });
    if (!res.data) return { ok: false, error: res.error ?? undefined };
    tokenStore.set(res.data.accessToken, res.data.refreshToken, remember);
    setUser(res.data.user);
    setSelectedClinicId('all');
    return { ok: true };
  };

  const loginAsRole = async (role: Role) => {
    setLoading(true);
    const mockUser = mockUsers.find(u => u.role === role);
    if (mockUser) {
      const response = await getUserById(mockUser.id);
      if (response.data) {
        setUser(response.data);
        setSelectedClinicId('all');
      }
    }
    setLoading(false);
  };

  const logout = async () => {
    if (!USE_MOCK_API && tokenStore.access) {
      await http.post('/auth/logout'); // revokes refresh tokens server-side; ignore failures
    }
    signOutLocally();
  };

  return (
    <AuthContext.Provider value={{
      user, loading, login, loginAsRole, logout, isMockMode: USE_MOCK_API, selectedClinicId, setSelectedClinicId,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
