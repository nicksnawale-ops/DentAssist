import React, { useState, useRef, useEffect } from 'react';
import { PatientDocument } from '../../types';
import { Button } from '../ui/Button';
import { X, FileSignature, Save, Trash2 } from 'lucide-react';

interface ConsentFormModalProps {
  patientId: string;
  onClose: () => void;
  onSave: (doc: PatientDocument) => void;
}

const TEMPLATES = [
  { id: 'extraction', name: 'Extraction Consent', content: 'I, the undersigned, give consent to the dental extraction of tooth/teeth _______. I understand the risks involved including bleeding, swelling, infection, and possible nerve damage.' },
  { id: 'root_canal', name: 'Root Canal Treatment Consent', content: 'I consent to Root Canal Treatment on tooth _______. I understand that this procedure involves removing the nerve of the tooth, cleaning, and sealing the canal. I understand a crown is usually required afterwards.' },
  { id: 'general', name: 'General Treatment Consent', content: 'I authorize the dental staff to perform necessary general dental treatments including exams, x-rays, and prophylaxis.' }
];

export function ConsentFormModal({ patientId, onClose, onSave }: ConsentFormModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0].id);
  const [toothNumber, setToothNumber] = useState('');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);

  const template = TEMPLATES.find(t => t.id === selectedTemplate);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.strokeStyle = '#000000';
        context.lineWidth = 2;
        context.lineCap = 'round';
        setCtx(context);
      }
    }
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ctx) return;
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !ctx) return;
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!ctx) return;
    setIsDrawing(false);
    ctx.closePath();
  };

  const clearSignature = () => {
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const handleSave = () => {
    const newDoc: PatientDocument = {
      id: `doc-consent-${Date.now()}`,
      patientId,
      type: 'Consent Form',
      fileName: `${template?.name.replace(/ /g, '_')}_Signed.pdf`,
      fileUrl: '', // In reality, we'd generate a PDF or save the canvas data
      tags: ['Consent', template?.id || ''],
      uploadedByStaffId: 'current-user',
      uploadedAt: new Date().toISOString()
    };
    if (toothNumber) {
      newDoc.taggedTeeth = [toothNumber];
    }
    onSave(newDoc);
  };

  return (
    <div className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-2xl rounded-panel border border-line shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
         <div className="p-4 border-b border-line flex justify-between items-center bg-base">
            <h3 className="font-bold text-text-main flex items-center gap-2"><FileSignature className="w-5 h-5 text-primary" /> Generate Consent Form</h3>
            <button onClick={onClose} className="p-1.5 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
         </div>
         
         <div className="p-6 overflow-y-auto flex-1 space-y-6">
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-xs font-bold text-text-muted mb-2">Select Template</label>
                  <select 
                    value={selectedTemplate} 
                    onChange={e => setSelectedTemplate(e.target.value)}
                    className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  >
                    {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
               </div>
               <div>
                  <label className="block text-xs font-bold text-text-muted mb-2">Tooth Number (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 16, 48"
                    value={toothNumber}
                    onChange={e => setToothNumber(e.target.value)}
                    className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
               </div>
            </div>

            <div className="bg-base border border-line rounded-lg p-6">
               <h4 className="font-bold text-lg text-center mb-6">{template?.name}</h4>
               <p className="text-sm text-text-main leading-relaxed mb-8">
                 {template?.content.replace('_______', toothNumber ? ` ${toothNumber} ` : ' _______ ')}
               </p>
               
               <div className="space-y-2">
                 <label className="block text-xs font-bold text-text-muted">Patient Signature</label>
                 <div className="border border-line rounded-lg bg-white relative">
                   <canvas 
                     ref={canvasRef}
                     className="w-full h-40 cursor-crosshair rounded-lg"
                     onMouseDown={startDrawing}
                     onMouseMove={draw}
                     onMouseUp={stopDrawing}
                     onMouseLeave={stopDrawing}
                     onTouchStart={(e) => {
                       e.preventDefault();
                       const touch = e.touches[0];
                       const rect = canvasRef.current?.getBoundingClientRect();
                       if (rect && ctx) {
                         setIsDrawing(true);
                         ctx.beginPath();
                         ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
                       }
                     }}
                     onTouchMove={(e) => {
                       e.preventDefault();
                       if (!isDrawing || !ctx) return;
                       const touch = e.touches[0];
                       const rect = canvasRef.current?.getBoundingClientRect();
                       if (rect) {
                         ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
                         ctx.stroke();
                       }
                     }}
                     onTouchEnd={stopDrawing}
                   />
                   <button 
                     onClick={clearSignature}
                     className="absolute top-2 right-2 p-1.5 bg-surface border border-line rounded text-text-muted hover:text-error transition-colors"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                 </div>
                 <p className="text-[11px] text-text-muted text-center mt-1">Sign above using mouse or touch</p>
               </div>
            </div>
         </div>

         <div className="p-4 border-t border-line bg-base flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} className="gap-2"><Save className="w-4 h-4" /> Save Signed Document</Button>
         </div>
      </div>
    </div>
  );
}
