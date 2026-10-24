import React, { useState } from 'react';
import { LabOrder, LabOrderStatus } from '../../types';
import { mockPatients } from '../../data/mockPatients';
import { mockSuppliers } from '../../data/mockSuppliers';
import { X, FlaskConical, Clock, CheckCircle, FileText, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { format, parseISO } from 'date-fns';

interface LabOrderModalProps {
  order: LabOrder;
  onClose: () => void;
}

export function LabOrderModal({ order, onClose }: LabOrderModalProps) {
  const patient = mockPatients.find(p => p.id === order.patientId);
  const lab = mockSuppliers.find(s => s.id === order.labId);
  
  const [newUpdateNote, setNewUpdateNote] = useState('');
  const [newUpdateStatus, setNewUpdateStatus] = useState<LabOrderStatus>(order.status);

  const statuses: LabOrderStatus[] = ['Ordered', 'In Progress', 'Quality Check', 'Ready for Pickup', 'Delivered to Clinic', 'Fitted/Completed'];
  
  const getStatusIndex = (st: string) => statuses.indexOf(st as LabOrderStatus);
  const currentStatusIndex = getStatusIndex(order.status);

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    // In real app, API call to update status and add note
    console.log('Update lab order:', { newUpdateStatus, newUpdateNote });
    setNewUpdateNote('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-3xl rounded-panel border border-line shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-line flex justify-between items-center bg-base rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-600">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-main">Lab Order: {order.itemType}</h2>
              <p className="text-sm text-text-muted">Patient: {patient?.firstName} {patient?.lastName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">
          {/* Left Column: Details & Updates */}
          <div className="flex-1 space-y-8">
            
            {/* Status Pipeline */}
            <div>
              <h3 className="font-bold text-text-main mb-4">Order Status</h3>
              <div className="flex justify-between relative">
                <div className="absolute top-3 left-0 w-full h-0.5 bg-text-muted/20" />
                <div 
                  className="absolute top-3 left-0 h-0.5 bg-primary transition-all duration-500" 
                  style={{ width: `${(currentStatusIndex / (statuses.length - 1)) * 100}%` }} 
                />
                
                {statuses.map((st, idx) => (
                  <div key={st} className="relative flex flex-col items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 bg-surface z-10 transition-colors ${idx <= currentStatusIndex ? 'border-primary text-primary' : 'border-text-muted/30 text-transparent'}`}>
                      {idx <= currentStatusIndex && <div className="w-2 h-2 bg-primary rounded-full" />}
                    </div>
                    <span className={`text-[11px] font-bold text-center max-w-[60px] ${idx <= currentStatusIndex ? 'text-primary' : 'text-text-muted/50'}`}>
                      {st}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-base p-4 rounded-xl border border-line">
                <p className="text-xs text-text-muted font-medium mb-1">Assigned Lab</p>
                <p className="font-bold text-text-main">{lab?.name}</p>
              </div>
              <div className="bg-base p-4 rounded-xl border border-line">
                <p className="text-xs text-text-muted font-medium mb-1">Expected Delivery</p>
                <p className="font-bold text-text-main">{format(parseISO(order.expectedDeliveryDate), 'MMM d, yyyy')}</p>
              </div>
              <div className="bg-base p-4 rounded-xl border border-line col-span-2">
                <p className="text-xs text-text-muted font-medium mb-1">Specifications</p>
                <div className="flex gap-4">
                   {order.toothNumbers.length > 0 && (
                     <div className="text-sm"><span className="font-semibold">Teeth:</span> {order.toothNumbers.join(', ')}</div>
                   )}
                   {order.shadeMaterialSpec && (
                     <div className="text-sm"><span className="font-semibold">Material/Shade:</span> {order.shadeMaterialSpec}</div>
                   )}
                </div>
                {order.specialInstructions && (
                  <p className="text-sm text-text-muted mt-2 italic">" {order.specialInstructions} "</p>
                )}
              </div>
            </div>

            {/* Updates Log */}
            <div>
              <h3 className="font-bold text-text-main mb-4">Tracking History</h3>
              <div className="space-y-4">
                {order.updates.map((update) => (
                  <div key={update.id} className="flex gap-4">
                    <div className="mt-1">
                       <CheckCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 bg-base p-3 rounded-lg border border-line">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-sm text-text-main">{update.status}</span>
                        <span className="text-xs text-text-muted flex items-center gap-1"><Clock className="w-3 h-3" /> {format(parseISO(update.updatedAt), 'MMM d, h:mm a')}</span>
                      </div>
                      <p className="text-sm text-text-muted">{update.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column: Actions & Attachments */}
          <div className="w-full md:w-64 space-y-6">
            
            <form onSubmit={handleUpdate} className="bg-base p-4 rounded-xl border border-line space-y-4">
              <h4 className="font-bold text-sm text-text-main">Log Status Update</h4>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">New Status</label>
                <select 
                  value={newUpdateStatus}
                  onChange={e => setNewUpdateStatus(e.target.value as LabOrderStatus)}
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
                >
                  {statuses.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Note / Remark</label>
                <textarea
                  required
                  value={newUpdateNote}
                  onChange={e => setNewUpdateNote(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary min-h-[80px]"
                  placeholder="E.g., Called lab, delayed by 1 day..."
                />
              </div>
              <Button type="submit" className="w-full text-sm">Save Update</Button>
            </form>

            <div>
              <h4 className="font-bold text-sm text-text-main mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Attachments
              </h4>
              <div className="space-y-2">
                {/* Mock file */}
                <div className="flex items-center justify-between p-2 bg-base border border-line rounded-lg text-sm">
                  <span className="truncate text-text-main">intraoral_scan.stl</span>
                  <a href="#" className="text-primary hover:underline text-xs">View</a>
                </div>
                <button className="w-full flex justify-center items-center gap-2 p-2 border border-dashed border-text-muted/30 rounded-lg text-xs font-semibold text-text-muted hover:text-primary hover:border-primary/50 transition-colors">
                  <Upload className="w-3 h-3" /> Upload File
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
