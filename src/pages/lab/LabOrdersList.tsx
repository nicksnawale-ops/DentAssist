import React, { useState } from 'react';
import { mockLabOrders } from '../../data/mockLabOrders';
import { mockPatients } from '../../data/mockPatients';
import { mockSuppliers } from '../../data/mockSuppliers';
import { Search, Plus, Filter, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { LabOrder } from '../../types';
import { format, parseISO } from 'date-fns';
import { LabOrderModal } from './LabOrderModal';
import { CreateLabOrderModal } from './CreateLabOrderModal';

export function LabOrdersList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const statuses = ['All', 'Ordered', 'In Progress', 'Quality Check', 'Ready for Pickup', 'Delivered to Clinic', 'Fitted/Completed'];

  const filteredOrders = mockLabOrders.filter(order => {
    const patient = mockPatients.find(p => p.id === order.patientId);
    const patientName = patient ? `${patient.firstName} ${patient.lastName}`.toLowerCase() : '';
    const matchesSearch = patientName.includes(search.toLowerCase()) || order.itemType.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Fitted/Completed':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/20">Completed</span>;
      case 'Delivered to Clinic':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 border border-blue-500/20">At Clinic</span>;
      case 'Ready for Pickup':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-600 border border-purple-500/20">Ready at Lab</span>;
      case 'In Progress':
      case 'Quality Check':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">{status}</span>;
      case 'Ordered':
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-text-muted/10 text-text-muted border border-text-muted/20">Ordered</span>;
    }
  };

  const isOverdue = (order: LabOrder) => {
    if (order.status === 'Fitted/Completed' || order.status === 'Delivered to Clinic') return false;
    return new Date(order.expectedDeliveryDate).getTime() < new Date().getTime();
  };

  const columns = [
    {
      header: 'Patient',
      key: 'patientId',
      cell: (row: LabOrder) => {
        const patient = mockPatients.find(p => p.id === row.patientId);
        return <span className="font-semibold text-text-main">{patient?.firstName} {patient?.lastName}</span>;
      }
    },
    {
      header: 'Lab Name',
      key: 'labId',
      cell: (row: LabOrder) => {
        const lab = mockSuppliers.find(s => s.id === row.labId);
        return <span className="text-sm text-text-muted">{lab?.name}</span>;
      }
    },
    {
      header: 'Item Type',
      key: 'itemType',
      cell: (row: LabOrder) => (
        <div>
          <div className="font-medium text-text-main">{row.itemType}</div>
          {row.toothNumbers.length > 0 && (
            <div className="text-xs text-text-muted">Tooth: {row.toothNumbers.join(', ')}</div>
          )}
        </div>
      )
    },
    {
      header: 'Order Date',
      key: 'orderDate',
      cell: (row: LabOrder) => <span className="text-sm text-text-muted">{format(parseISO(row.orderDate), 'MMM d, yyyy')}</span>
    },
    {
      header: 'Expected Delivery',
      key: 'expectedDeliveryDate',
      cell: (row: LabOrder) => (
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${isOverdue(row) ? 'text-error' : 'text-text-main'}`}>
            {format(parseISO(row.expectedDeliveryDate), 'MMM d, yyyy')}
          </span>
          {isOverdue(row) && <AlertTriangle className="w-4 h-4 text-error" title="Overdue" />}
        </div>
      )
    },
    {
      header: 'Status',
      key: 'status',
      cell: (row: LabOrder) => getStatusBadge(row.status)
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Search by patient name or item type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-base border border-text-muted/20 rounded-lg text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-muted" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-base border border-text-muted/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              {statuses.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        
        <Button className="gap-2" onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="w-4 h-4" /> Create Lab Order
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-text-muted/10 overflow-hidden">
        <DataTable 
          data={filteredOrders} 
          columns={columns} 
          onRowClick={setSelectedOrder}
        />
      </div>

      {selectedOrder && (
        <LabOrderModal 
          order={selectedOrder} 
          onClose={() => setSelectedOrder(null)} 
        />
      )}

      {isCreateModalOpen && (
        <CreateLabOrderModal
          onClose={() => setIsCreateModalOpen(false)}
        />
      )}
    </div>
  );
}
