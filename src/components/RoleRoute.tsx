import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Role } from '../types';

interface RoleRouteProps {
  allowedRoles: Role[];
  children?: React.ReactNode;
}

export function RoleRoute({ allowedRoles, children }: RoleRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-full items-center justify-center text-text-muted text-sm">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/access-denied" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
