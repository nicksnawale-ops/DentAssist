import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '../types';
import { getUserById } from '../api/apiService';
import { mockUsers } from '../data/mockData';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginAsRole: (role: Role) => void;
  logout: () => void;
  selectedClinicId: string | 'all';
  setSelectedClinicId: (id: string | 'all') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClinicId, setSelectedClinicId] = useState<string | 'all'>('all');

  // Simulate an initial auth check
  useEffect(() => {
    const initAuth = async () => {
      setLoading(true);
      // For demo, we don't automatically log in. 
      // User must pick a role on the login screen.
      setLoading(false);
    };
    initAuth();
  }, []);

  const loginAsRole = async (role: Role) => {
    setLoading(true);
    // Find the first mock user matching the role for demo purposes
    const mockUser = mockUsers.find(u => u.role === role);
    if (mockUser) {
      const response = await getUserById(mockUser.id);
      if (response.data) {
        setUser(response.data);
        setSelectedClinicId('all'); // Reset on login
      }
    }
    setLoading(false);
  };

  const logout = () => {
    setUser(null);
    setSelectedClinicId('all');
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginAsRole, logout, selectedClinicId, setSelectedClinicId }}>
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
