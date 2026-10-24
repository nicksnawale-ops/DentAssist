import React, { useState } from 'react';
import { mockPurchaseOrders } from '../../data/mockPurchaseOrders';
import { mockSuppliers } from '../../data/mockSuppliers';
import { Search, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { PurchaseOrder } from '../../types';
import { format, parseISO } from 'date-fns';
import { PurchaseOrderModal } from '../../components/inventory/PurchaseOrderModal';
import { formatCurrency } from '../../utils/currencyConfig';

export function PurchaseOrders() {
  const [search, setSearch] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  const filteredPOs = mockPurchaseOrders.filter(po => 
    po.poNumber.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Received':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/20">Received</span>;
      case 'Partially Received':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">Partial</span>;
      case 'Sent':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 border border-blue-500/20">Sent</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-text-muted/10 text-text-muted border border-text-muted/20">{status}</span>;
    }
  };

  const columns = [
    {
      header: 'PO Number',
      key: 'poNumber',
      cell: (row: PurchaseOrder) => <span className="font-bold text-text-main">{row.poNumber}</span>
    },
    {
      header: 'Supplier',
      key: 'supplierId',
      cell: (row: PurchaseOrder) => {
        const supplier = mockSuppliers.find(s => s.id === row.supplierId);
        return <span className="text-sm font-medium text-text-main">{supplier?.name || 'Unknown'}</span>;
      }
    },
    {
      header: 'Date Created',
      key: 'createdAt',
      cell: (row: PurchaseOrder) => <span className="text-sm text-text-muted">{format(parseISO(row.createdAt), 'MMM d, yyyy')}</span>
    },
    {
      header: 'Items',
      key: 'items',
      cell: (row: PurchaseOrder) => <span className="text-sm text-text-muted">{row.items.length} items</span>
    },
    {
      header: 'Total Amount',
      key: 'totalAmount',
      cell: (row: PurchaseOrder) => <span className="font-semibold text-text-main">{formatCurrency(row.totalAmount || 0)}</span>
    },
    {
      header: 'Status',
      key: 'status',
      cell: (row: PurchaseOrder) => getStatusBadge(row.status)
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            placeholder="Search purchase orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-base border border-text-muted/20 rounded-lg text-sm focus:outline-none focus:border-primary"
          />
        </div>
        
        <Button className="gap-2">
          <Plus className="w-4 h-4" /> Create PO
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-text-muted/10 overflow-hidden">
        <DataTable 
          data={filteredPOs} 
          columns={columns} 
          onRowClick={setSelectedPO}
        />
      </div>

      {selectedPO && (
        <PurchaseOrderModal 
          po={selectedPO} 
          onClose={() => setSelectedPO(null)} 
        />
      )}
    </div>
  );
}
