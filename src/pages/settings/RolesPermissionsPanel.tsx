import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Role, Permission } from '../../types';
import { getPermissions } from '../../api/apiService';
import { ShieldCheck } from 'lucide-react';
import { Skeleton } from '../../components/ui/Skeleton';

const ALL_ROLES: Role[] = ['super_admin', 'admin', 'dentist', 'receptionist', 'patient'];

export function RolesPermissionsPanel() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPermissions().then(res => {
      if (res.data) setPermissions(res.data);
      setLoading(false);
    });
  }, []);

  const handleToggle = (permId: string, role: Role, action: 'view' | 'edit' | 'delete') => {
    setPermissions(prev => prev.map(p => {
      if (p.id !== permId) return p;
      const rolePerms = p.roles[role];
      return {
        ...p,
        roles: {
          ...p.roles,
           [role]: { ...rolePerms, [action]: !rolePerms[action] }
        }
      };
    }));
  };

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
           <ShieldCheck className="w-5 h-5 text-primary" />
           Roles & Permissions Matrix
        </CardTitle>
        <CardDescription>
          Configure which roles have access to view, edit, or delete items within each module. Note: Super Admin permissions are fixed.
        </CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-surface-hover border-b border-line text-text-muted text-[13px] font-medium">
            <tr>
              <th className="px-6 py-4 font-semibold text-text-main">Module</th>
              {ALL_ROLES.map(role => (
                <th key={role} className="px-4 py-4 font-semibold text-text-main text-center capitalize">
                  {role.replace('_', ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {permissions.map((perm) => (
              <tr key={perm.id} className="hover:bg-surface-hover/50 transition-colors">
                <td className="px-6 py-4 font-medium text-text-main">{perm.module}</td>
                {ALL_ROLES.map(role => {
                  const rolePerm = perm.roles[role];
                  const isSA = role === 'super_admin';
                  return (
                    <td key={role} className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2 text-xs">
                        {/* View */}
                        <label className={`flex flex-col items-center gap-1 ${isSA ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                           <span className="text-text-muted text-[11px] uppercase">V</span>
                           <input 
                             type="checkbox" 
                             checked={rolePerm.view} 
                             onChange={() => !isSA && handleToggle(perm.id, role, 'view')}
                             disabled={isSA}
                             className="rounded border-text-muted/30 text-primary w-3.5 h-3.5"
                           />
                        </label>
                        {/* Edit */}
                        <label className={`flex flex-col items-center gap-1 ${isSA ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                           <span className="text-text-muted text-[11px] uppercase">E</span>
                           <input 
                             type="checkbox" 
                             checked={rolePerm.edit} 
                             onChange={() => !isSA && handleToggle(perm.id, role, 'edit')}
                             disabled={isSA}
                             className="rounded border-text-muted/30 text-primary w-3.5 h-3.5"
                           />
                        </label>
                        {/* Delete */}
                        <label className={`flex flex-col items-center gap-1 ${isSA ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                           <span className="text-text-muted text-[11px] uppercase">D</span>
                           <input 
                             type="checkbox" 
                             checked={rolePerm.delete} 
                             onChange={() => !isSA && handleToggle(perm.id, role, 'delete')}
                             disabled={isSA}
                             className="rounded border-text-muted/30 text-primary w-3.5 h-3.5"
                           />
                        </label>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-line bg-base flex justify-end">
        <Button onClick={() => {}}>Save Configuration</Button>
      </div>
    </Card>
  );
}
