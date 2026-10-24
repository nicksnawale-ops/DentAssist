import React, { useState } from 'react';
import { InventoryItem } from '../../types';
import { mockSuppliers } from '../../data/mockSuppliers';
import { X, Package, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Info, Calendar } from 'lucide-react';
import { Button } from '../ui/Button';
import { format, parseISO } from 'date-fns';

interface InventoryItemModalProps {
  item: InventoryItem;
  onClose: () => void;
}

export function InventoryItemModal({ item, onClose }: InventoryItemModalProps) {
  const supplier = mockSuppliers.find(s => s.id === item.supplierId);
  const [activeTab, setActiveTab] = useState<'details' | 'adjust'>('details');
  const [adjustType, setAdjustType] = useState<'addition' | 'usage'>('usage');
  const [adjustAmount, setAdjustAmount] = useState(1);
  const [adjustReason, setAdjustReason] = useState('');

  const isExpiringSoon = (dateString?: string) => {
    if (!dateString) return false;
    const expiry = new Date(dateString);
    const diffTime = expiry.getTime() - new Date().getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 30;
  };

  const isExpired = (dateString?: string) => {
    if (!dateString) return false;
    return new Date(dateString).getTime() < new Date().getTime();
  };

  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would call an API to update stock
    console.log(`Adjusting ${adjustType} by ${adjustAmount} for: ${adjustReason}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-2xl rounded-2xl border border-text-muted/20 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-text-muted/10 flex justify-between items-center bg-base rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-main">{item.name}</h2>
              <p className="text-sm text-text-muted">{item.category}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-text-muted/10 bg-base px-4">
          <button
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}
            onClick={() => setActiveTab('details')}
          >
            Item Details
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'adjust' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}
            onClick={() => setActiveTab('adjust')}
          >
            Adjust Stock
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'details' && (
            <div className="space-y-8">
              {isExpiringSoon(item.expiryDate) && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${isExpired(item.expiryDate) ? 'bg-error/10 border-error/20 text-error' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700'}`}>
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold">{isExpired(item.expiryDate) ? 'Item Expired' : 'Expiring Soon'}</h4>
                    <p className="text-sm opacity-90 mt-1">
                      This item {isExpired(item.expiryDate) ? 'expired' : 'will expire'} on {format(parseISO(item.expiryDate!), 'MMMM d, yyyy')}.
                      {isExpired(item.expiryDate) && ' Do not use for patient treatment.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-base p-4 rounded-xl border border-text-muted/10">
                  <p className="text-xs text-text-muted font-medium mb-1">Current Stock</p>
                  <p className={`text-2xl font-black ${item.currentStock <= item.reorderThreshold ? 'text-error' : 'text-text-main'}`}>
                    {item.currentStock} <span className="text-sm font-normal text-text-muted">{item.unit}</span>
                  </p>
                </div>
                <div className="bg-base p-4 rounded-xl border border-text-muted/10">
                  <p className="text-xs text-text-muted font-medium mb-1">Reorder Level</p>
                  <p className="text-2xl font-bold text-text-main">{item.reorderThreshold}</p>
                </div>
                <div className="bg-base p-4 rounded-xl border border-text-muted/10 col-span-2">
                  <p className="text-xs text-text-muted font-medium mb-1 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Primary Supplier
                  </p>
                  <p className="text-sm font-bold text-text-main truncate">{supplier?.name}</p>
                  <p className="text-xs text-text-muted truncate">{supplier?.email}</p>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-text-main mb-4">Stock Movement History</h3>
                {item.movements && item.movements.length > 0 ? (
                  <div className="space-y-3">
                    {item.movements.map(mov => (
                      <div key={mov.id} className="flex items-start justify-between p-3 bg-base border border-text-muted/10 rounded-lg">
                        <div className="flex items-start gap-3">
                          {mov.type === 'usage' ? (
                            <ArrowDownCircle className="w-5 h-5 text-error mt-0.5 shrink-0" />
                          ) : (
                            <ArrowUpCircle className="w-5 h-5 text-success mt-0.5 shrink-0" />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-text-main">{mov.reason}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {format(parseISO(mov.recordedAt), 'MMM d, yyyy h:mm a')}</span>
                            </div>
                          </div>
                        </div>
                        <div className={`font-bold ${mov.type === 'usage' ? 'text-error' : 'text-success'}`}>
                          {mov.type === 'usage' ? '' : '+'}{mov.changeAmount}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted italic">No recent movements recorded.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'adjust' && (
            <form onSubmit={handleAdjust} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div 
                  className={`p-4 border rounded-xl cursor-pointer transition-all ${adjustType === 'usage' ? 'border-error bg-error/5 ring-1 ring-error' : 'border-text-muted/20 hover:border-error/30'}`}
                  onClick={() => setAdjustType('usage')}
                >
                  <div className="flex items-center gap-2 text-error font-bold mb-1">
                    <ArrowDownCircle className="w-5 h-5" /> Reduce Stock
                  </div>
                  <p className="text-xs text-text-muted">Item was used, damaged, or expired.</p>
                </div>
                <div 
                  className={`p-4 border rounded-xl cursor-pointer transition-all ${adjustType === 'addition' ? 'border-success bg-success/5 ring-1 ring-success' : 'border-text-muted/20 hover:border-success/30'}`}
                  onClick={() => setAdjustType('addition')}
                >
                  <div className="flex items-center gap-2 text-success font-bold mb-1">
                    <ArrowUpCircle className="w-5 h-5" /> Add Stock
                  </div>
                  <p className="text-xs text-text-muted">Manual restock or adjustment.</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-text-main mb-1">Quantity ({item.unit})</label>
                <input
                  type="number"
                  min="1"
                  max={adjustType === 'usage' ? item.currentStock : undefined}
                  required
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-base border border-text-muted/20 rounded-lg focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-text-main mb-1">Reason</label>
                <input
                  type="text"
                  required
                  placeholder={adjustType === 'usage' ? 'e.g., Used in procedure, Expired' : 'e.g., Inventory recount, Manual addition'}
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full px-4 py-2 bg-base border border-text-muted/20 rounded-lg focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="submit" variant={adjustType === 'usage' ? 'danger' : 'primary'}>
                  Confirm Adjustment
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
