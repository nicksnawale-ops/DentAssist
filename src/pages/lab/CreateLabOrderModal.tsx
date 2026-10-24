import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { mockPatients } from '../../data/mockPatients';
import { mockSuppliers } from '../../data/mockSuppliers';
import { LabItemType } from '../../types';

interface CreateLabOrderModalProps {
  onClose: () => void;
  defaultPatientId?: string;
  defaultToothNumbers?: string[];
}

export function CreateLabOrderModal({ onClose, defaultPatientId, defaultToothNumbers }: CreateLabOrderModalProps) {
  const labs = mockSuppliers.filter(s => s.isLab);
  
  const [patientId, setPatientId] = useState(defaultPatientId || '');
  const [labId, setLabId] = useState('');
  const [itemType, setItemType] = useState<LabItemType | ''>('');
  const [toothNumbers, setToothNumbers] = useState(defaultToothNumbers?.join(', ') || '');
  const [shade, setShade] = useState('');
  const [instructions, setInstructions] = useState('');
  const [expectedDate, setExpectedDate] = useState('');

  const itemTypes: LabItemType[] = ['Crown', 'Bridge', 'Denture', 'Aligner', 'Night Guard', 'Veneer', 'Implant Component'];
  const shades = ['A1', 'A2', 'A3', 'A3.5', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4', 'Bleach'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Creating Lab Order:', { patientId, labId, itemType, toothNumbers, shade, instructions, expectedDate });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-2xl rounded-panel border border-line shadow-2xl flex flex-col">
        <div className="p-4 border-b border-line flex justify-between items-center bg-base rounded-t-2xl">
          <h2 className="text-lg font-bold text-text-main">Create Lab Order</h2>
          <button onClick={onClose} className="p-2 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-text-main mb-1">Patient</label>
              <select
                required
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="w-full px-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
              >
                <option value="">Select Patient...</option>
                {mockPatients.map(p => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-main mb-1">Assign To Lab</label>
              <select
                required
                value={labId}
                onChange={(e) => setLabId(e.target.value)}
                className="w-full px-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
              >
                <option value="">Select Lab...</option>
                {labs.map(l => (
                  <option key={l.id} value={l.id}>{l.name} (Avg: {l.averageTurnaroundDays} days)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-main mb-1">Item Type</label>
              <select
                required
                value={itemType}
                onChange={(e) => setItemType(e.target.value as LabItemType)}
                className="w-full px-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
              >
                <option value="">Select Type...</option>
                {itemTypes.map(it => (
                  <option key={it} value={it}>{it}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-main mb-1">Expected Delivery Date</label>
              <input
                type="date"
                required
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full px-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-line">
            <div>
              <label className="block text-sm font-semibold text-text-main mb-1">Tooth Number(s)</label>
              <input
                type="text"
                placeholder="e.g. 14, 15 (Comma separated)"
                value={toothNumbers}
                onChange={(e) => setToothNumbers(e.target.value)}
                className="w-full px-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-main mb-1">Shade Reference</label>
              <select
                value={shade}
                onChange={(e) => setShade(e.target.value)}
                className="w-full px-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
              >
                <option value="">None / N/A</option>
                {shades.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main mb-1">Special Instructions</label>
            <textarea
              rows={3}
              placeholder="Any specific requests for the lab..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full px-4 py-2 bg-base border border-line rounded-lg focus:outline-none focus:border-primary"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-line">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Create Order</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
