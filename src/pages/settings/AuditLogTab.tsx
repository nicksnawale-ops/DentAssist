import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Search, Filter, Activity, Clock, User as UserIcon, AlertCircle } from 'lucide-react';
import { format, subHours, subDays } from 'date-fns';

const MOCK_AUDIT_LOGS = [
  { id: 'al-1', timestamp: subHours(new Date(), 1), actor: 'Dr. Sarah Smith', action: 'UPDATE_TREATMENT_PLAN', entity: 'Patient: P-1002', details: 'Added Root Canal to phase 1.' },
  { id: 'al-2', timestamp: subHours(new Date(), 3), actor: 'Jane Doe (Receptionist)', action: 'CANCEL_APPOINTMENT', entity: 'Appointment: A-932', details: 'Patient requested cancellation.' },
  { id: 'al-3', timestamp: subHours(new Date(), 5), actor: 'System', action: 'WHATSAPP_SENT', entity: 'Patient: P-1005', details: 'Sent appointment reminder.' },
  { id: 'al-4', timestamp: subDays(new Date(), 1), actor: 'Admin User', action: 'UPDATE_INVOICE', entity: 'Invoice: INV-2024-001', details: 'Applied 10% discount.' },
  { id: 'al-5', timestamp: subDays(new Date(), 2), actor: 'Dr. Sarah Smith', action: 'CREATE_CLINICAL_NOTE', entity: 'Patient: P-1002', details: 'Added progress note for extraction.' },
  { id: 'al-6', timestamp: subDays(new Date(), 3), actor: 'Super Admin', action: 'MODIFY_ROLE', entity: 'Staff: Dr. John', details: 'Changed role from admin to dentist.' },
];

export function AuditLogTab() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = MOCK_AUDIT_LOGS.filter(log => 
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.entity.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <CardTitle>System Audit Log</CardTitle>
          <CardDescription>Chronological record of significant actions across the system.</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="w-4 h-4" /> Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search logs by action, actor, or entity..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-base border border-line rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="border border-line rounded-xl overflow-hidden bg-base">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-hover border-b border-line text-text-muted text-[13px] font-medium">
                <tr>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-surface/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-text-main">
                        <Clock className="w-3.5 h-3.5 text-text-muted" />
                        {format(log.timestamp, 'MMM d, HH:mm')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-text-main">
                        {log.actor === 'System' ? (
                          <Activity className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <UserIcon className="w-3.5 h-3.5 text-text-muted" />
                        )}
                        {log.actor}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded bg-text-muted/10 text-xs font-mono text-text-main">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-main">{log.entity}</td>
                    <td className="px-4 py-3 text-text-muted">{log.details}</td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No audit logs found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
