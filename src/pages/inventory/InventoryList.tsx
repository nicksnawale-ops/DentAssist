import React, { useState } from 'react';
import { mockInventory } from '../../data/mockInventory';
import { Search, Plus, Filter, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { InventoryItem } from '../../types';
import { InventoryItemModal } from '../../components/inventory/InventoryItemModal';

export function InventoryList() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<string>('All');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const categories = ['All', 'Consumables', 'Instruments', 'PPE', 'Medications', 'Equipment'];

  const filteredItems = mockInventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    const matchesStock = stockFilter === 'All' || 
                         (stockFilter === 'Low Stock' && item.currentStock <= item.reorderThreshold) ||
                         (stockFilter === 'Out of Stock' && item.currentStock <= 0);
    return matchesSearch && matchesCategory && matchesStock;
  });

  const getStatusBadge = (item: InventoryItem) => {
    if (item.currentStock <= 0) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-error/10 text-error border border-error/20">Out of Stock</span>;
    }
    if (item.currentStock <= item.reorderThreshold) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">Low Stock</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/20">In Stock</span>;
  };

  const isExpiringSoon = (dateString?: string) => {
    if (!dateString) return false;
    const expiry = new Date(dateString);
    const diffTime = expiry.getTime() - new Date().getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 30;
  };

  const columns = [
    {
      header: 'Item Name',
      key: 'name',
      cell: (row: InventoryItem) => (
        <div>
          <div className="font-semibold text-text-main flex items-center gap-2">
            {row.name}
            {isExpiringSoon(row.expiryDate) && (
               <AlertTriangle className="w-4 h-4 text-yellow-500" title="Expiring soon or expired" />
            )}
          </div>
          <div className="text-xs text-text-muted">{row.category}</div>
        </div>
      )
    },
    {
      header: 'Current Stock',
      key: 'currentStock',
      cell: (row: InventoryItem) => (
        <div className="flex items-center gap-2">
          <span className={`font-black text-lg ${row.currentStock <= row.reorderThreshold ? 'text-error' : 'text-text-main'}`}>
            {row.currentStock}
          </span>
          <span className="text-xs text-text-muted">{row.unit}</span>
        </div>
      )
    },
    {
      header: 'Status',
      key: 'status',
      cell: (row: InventoryItem) => getStatusBadge(row)
    },
    {
      header: 'Threshold',
      key: 'reorderThreshold',
      cell: (row: InventoryItem) => <span className="text-sm text-text-muted">{row.reorderThreshold} {row.unit}</span>
    },
    {
      header: 'Last Restocked',
      key: 'lastRestockedDate',
      cell: (row: InventoryItem) => (
        <span className="text-sm text-text-muted">
          {row.lastRestockedDate ? new Date(row.lastRestockedDate).toLocaleDateString() : 'N/A'}
        </span>
      )
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
              placeholder="Search inventory items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-base border border-text-muted/20 rounded-lg text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-muted" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-base border border-text-muted/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="bg-base border border-text-muted/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="All">All Stock Levels</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
          </div>
        </div>
        
        <Button className="gap-2">
          <Plus className="w-4 h-4" /> Add New Item
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-text-muted/10 overflow-hidden">
        <DataTable 
          data={filteredItems} 
          columns={columns} 
          onRowClick={setSelectedItem}
        />
      </div>

      {selectedItem && (
        <InventoryItemModal 
          item={selectedItem} 
          onClose={() => setSelectedItem(null)} 
        />
      )}
    </div>
  );
}
