import React from 'react';
import { PurchaseOrder } from '../../types';
import { mockSuppliers } from '../../data/mockSuppliers';
import { mockInventory } from '../../data/mockInventory';
import { X, Printer, Download, CheckCircle, Package } from 'lucide-react';
import { Button } from '../ui/Button';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '../../utils/currencyConfig';

interface PurchaseOrderModalProps {
  po: PurchaseOrder;
  onClose: () => void;
}

export function PurchaseOrderModal({ po, onClose }: PurchaseOrderModalProps) {
  const supplier = mockSuppliers.find(s => s.id === po.supplierId);

  const handlePrint = () => {
    window.print();
  };

  const markReceived = () => {
    // In a real app, this would call API and update stock
    console.log('Marking PO as received');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-base/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0">
      <div className="bg-surface w-full max-w-4xl rounded-panel border border-line shadow-2xl relative my-8 print:shadow-none print:border-none print:my-0">
        
        {/* Controls */}
        <div className="absolute top-4 right-4 flex gap-3 print:hidden">
          {po.status !== 'Received' && (
            <Button onClick={markReceived} className="gap-2 shadow-panel bg-success hover:bg-success/90 text-white border-none">
              <CheckCircle className="w-4 h-4" /> Mark Received
            </Button>
          )}
          <Button variant="outline" onClick={handlePrint} className="bg-surface gap-2 shadow-panel">
            <Printer className="w-4 h-4" /> Print / PDF
          </Button>
          <button onClick={onClose} className="p-2 ml-2 bg-base hover:bg-text-muted/10 rounded-full transition-colors text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-12 print:p-8">
          <div className="flex justify-between items-start border-b border-line pb-8">
             <div>
               <div className="flex items-center gap-2 mb-2">
                 <Package className="w-8 h-8 text-blue-600" />
                 <h1 className="text-3xl font-black text-gray-900 tracking-tight">Purchase Order</h1>
               </div>
               <p className="text-sm font-bold text-gray-500 mt-2">{po.poNumber}</p>
               <p className="text-sm text-gray-500">Date: {format(parseISO(po.createdAt), 'MMM d, yyyy')}</p>
               <div className="mt-4 inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                 Status: {po.status}
               </div>
             </div>
             
             <div className="text-right max-w-xs">
                <p className="text-xs font-bold text-gray-400 mb-2">Vendor To</p>
                <h3 className="text-lg font-bold text-gray-900">{supplier?.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{supplier?.contactPerson}</p>
                <p className="text-sm text-gray-600">{supplier?.address}</p>
                <p className="text-sm text-gray-600">{supplier?.phone} • {supplier?.email}</p>
             </div>
          </div>

          <div className="mt-8">
            <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="border-b-2 border-gray-200">
                   <th className="py-3 text-xs font-bold text-gray-500 w-1/2">Item Description</th>
                   <th className="py-3 text-xs font-bold text-gray-500 text-right">Qty Req.</th>
                   <th className="py-3 text-xs font-bold text-gray-500 text-right">Qty Recv.</th>
                   <th className="py-3 text-xs font-bold text-gray-500 text-right">Unit Price</th>
                   <th className="py-3 text-xs font-bold text-gray-500 text-right">Line Total</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                 {po.items.map((item, idx) => {
                   const inventoryItem = mockInventory.find(i => i.id === item.itemId);
                   const lineTotal = item.quantity * (item.unitPrice || 0);
                   return (
                     <tr key={idx}>
                       <td className="py-4">
                         <p className="font-bold text-gray-900">{inventoryItem?.name || 'Unknown Item'}</p>
                         <p className="text-xs text-gray-500">{inventoryItem?.category} • Unit: {inventoryItem?.unit}</p>
                       </td>
                       <td className="py-4 text-right font-medium text-gray-900">{item.quantity}</td>
                       <td className="py-4 text-right font-medium text-gray-600">{item.receivedQuantity}</td>
                       <td className="py-4 text-right text-gray-600">{formatCurrency(item.unitPrice || 0)}</td>
                       <td className="py-4 text-right font-bold text-gray-900">{formatCurrency(lineTotal)}</td>
                     </tr>
                   );
                 })}
               </tbody>
            </table>
          </div>

          <div className="mt-8 flex justify-end">
             <div className="w-64">
               <div className="flex justify-between items-center pt-4 border-t-2 border-gray-200">
                  <span className="font-bold text-gray-900 text-lg">Total Amount</span>
                  <span className="font-black text-gray-900 text-2xl">{formatCurrency(po.totalAmount || 0)}</span>
               </div>
             </div>
          </div>

          {po.notes && (
            <div className="mt-12 pt-8 border-t border-gray-200">
              <p className="text-xs font-bold text-gray-400 mb-2">Order Notes</p>
              <p className="text-sm text-gray-600">{po.notes}</p>
            </div>
          )}

          <div className="mt-16 pt-8 border-t-2 border-gray-100 flex justify-between items-end">
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1">Clinic Detail</p>
              <p className="text-sm font-bold text-gray-900">VisionEdge DentAssist HQ</p>
            </div>
            <div className="text-center">
              <div className="w-40 h-12 border-b border-gray-300 mb-2"></div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Authorized Signatory</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
