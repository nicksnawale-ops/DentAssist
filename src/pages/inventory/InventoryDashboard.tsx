import React, { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Package, ShoppingCart, Truck, AlertTriangle, FlaskConical } from 'lucide-react';
import { InventoryList } from './InventoryList';
import { PurchaseOrders } from './PurchaseOrders';
import { SuppliersList } from './SuppliersList';
import { mockInventory } from '../../data/mockInventory';
import { LabOrdersList } from '../lab/LabOrdersList';
import { LabDirectory } from '../lab/LabDirectory';
import { mockLabOrders } from '../../data/mockLabOrders';

export function InventoryDashboard() {
  const [activeTab, setActiveTab] = useState('items');
  const now = new Date();

  // Metrics
  const lowStockItems = mockInventory.filter(item => item.currentStock <= item.reorderThreshold);
  const expiringItems = mockInventory.filter(item => {
    if (!item.expiryDate) return false;
    const expiry = new Date(item.expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 30; // Includes already expired
  });
  
  const pendingLabOrders = mockLabOrders.filter(lo => lo.status !== 'Fitted/Completed' && lo.status !== 'Delivered to Clinic');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-[22px] sm:text-[26px] font-semibold leading-tight text-text-main">Inventory & Lab Management</h1>
          <p className="text-sm text-text-muted mt-1">Track stock, purchase orders, and lab cases.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-line p-5 shadow-panel">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
              <Package className="w-5 h-5" />
            </div>
            <p className="font-semibold text-text-main">Total Items</p>
          </div>
          <h3 className="text-3xl font-bold text-text-main ml-13">{mockInventory.length}</h3>
        </div>
        
        <div className="bg-surface rounded-xl border border-error/20 p-5 shadow-panel relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-error" />
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-error/10 rounded-lg flex items-center justify-center text-error">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <p className="font-semibold text-text-main">Low Stock</p>
          </div>
          <h3 className="text-3xl font-bold text-text-main ml-13">{lowStockItems.length}</h3>
        </div>

        <div className="bg-surface rounded-xl border border-yellow-500/20 p-5 shadow-panel relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500" />
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center text-yellow-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <p className="font-semibold text-text-main">Expiring Soon</p>
          </div>
          <h3 className="text-3xl font-bold text-text-main ml-13">{expiringItems.length}</h3>
        </div>

        <div className="bg-surface rounded-xl border border-blue-500/20 p-5 shadow-panel relative overflow-hidden">
           <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-600">
              <FlaskConical className="w-5 h-5" />
            </div>
            <p className="font-semibold text-text-main">Pending Lab Cases</p>
          </div>
          <h3 className="text-3xl font-bold text-text-main ml-13">{pendingLabOrders.length}</h3>
        </div>
      </div>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="bg-surface rounded-xl border border-line shadow-panel overflow-hidden">
        <Tabs.List className="flex border-b border-line bg-base px-2 pt-2 overflow-x-auto scrollbar-hide">
          <Tabs.Trigger 
            value="items" 
            className="whitespace-nowrap shrink-0 px-4 sm:px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors flex items-center gap-2"
          >
            <Package className="w-4 h-4" /> Stock Items
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="pos" 
            className="whitespace-nowrap shrink-0 px-4 sm:px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors flex items-center gap-2"
          >
            <ShoppingCart className="w-4 h-4" /> Purchase Orders
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="suppliers" 
            className="whitespace-nowrap shrink-0 px-4 sm:px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors flex items-center gap-2"
          >
            <Truck className="w-4 h-4" /> Suppliers
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="lab_orders" 
            className="whitespace-nowrap shrink-0 px-4 sm:px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors flex items-center gap-2"
          >
            <FlaskConical className="w-4 h-4" /> Lab Orders
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="labs" 
            className="whitespace-nowrap shrink-0 px-4 sm:px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors flex items-center gap-2"
          >
            <FlaskConical className="w-4 h-4" /> Lab Directory
          </Tabs.Trigger>
        </Tabs.List>
        
        <div className="p-6">
          <Tabs.Content value="items" className="outline-none">
            <InventoryList />
          </Tabs.Content>
          <Tabs.Content value="pos" className="outline-none">
            <PurchaseOrders />
          </Tabs.Content>
          <Tabs.Content value="suppliers" className="outline-none">
            <SuppliersList />
          </Tabs.Content>
          <Tabs.Content value="lab_orders" className="outline-none">
            <LabOrdersList />
          </Tabs.Content>
          <Tabs.Content value="labs" className="outline-none">
            <LabDirectory />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}
