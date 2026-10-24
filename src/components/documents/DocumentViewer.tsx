import React, { useState, useRef, useEffect } from 'react';
import { PatientDocument } from '../../types';
import { X, ZoomIn, ZoomOut, Contrast, Sun, Move, Columns, PenTool, Save, Trash2, Download } from 'lucide-react';
import { Button } from '../ui/Button';
import { format, parseISO } from 'date-fns';

interface DocumentViewerProps {
  document: PatientDocument;
  allDocuments: PatientDocument[];
  onClose: () => void;
}

export function DocumentViewer({ document, allDocuments, onClose }: DocumentViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareDocId, setCompareDocId] = useState<string>('');
  
  const [isAnnotating, setIsAnnotating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);

  const compareDoc = allDocuments.find(d => d.id === compareDocId);
  const isImage = document.type === 'X-Ray' || document.type === 'Intraoral Photo';

  useEffect(() => {
    if (isAnnotating && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.strokeStyle = '#ef4444'; // Red for annotations
        context.lineWidth = 3;
        context.lineCap = 'round';
        setCtx(context);
      }
    }
  }, [isAnnotating]);

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

  const clearAnnotations = () => {
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const handleSaveAnnotations = () => {
    // In a real app, canvasRef.current.toDataURL() would be saved to Annotation table
    setIsAnnotating(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-base/95 backdrop-blur-sm flex flex-col animate-in fade-in">
      <div className="flex justify-between items-center p-4 border-b border-line bg-surface">
         <div>
           <h3 className="font-bold text-text-main flex items-center gap-3">
             {document.fileName}
             <span className="text-[11px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">{document.type}</span>
           </h3>
           <p className="text-xs text-text-muted mt-1">Uploaded {format(parseISO(document.uploadedAt), 'PPP')} • {document.tags?.join(', ') || 'No tags'}</p>
         </div>
         <div className="flex items-center gap-3">
           {isImage && (
             <>
               <Button variant="outline" size="sm" onClick={() => setIsCompareMode(!isCompareMode)} className={`gap-2 ${isCompareMode ? 'bg-primary/10 border-primary/30 text-primary' : ''}`}>
                 <Columns className="w-4 h-4" /> Compare
               </Button>
               {!isCompareMode && (
                 <Button variant="outline" size="sm" onClick={() => setIsAnnotating(!isAnnotating)} className={`gap-2 ${isAnnotating ? 'bg-error/10 border-error/30 text-error' : ''}`}>
                   <PenTool className="w-4 h-4" /> {isAnnotating ? 'Annotating' : 'Annotate'}
                 </Button>
               )}
             </>
           )}
           <div className="w-px h-6 bg-text-muted/20 mx-2"></div>
           <Button variant="outline" size="sm" className="gap-2"><Download className="w-4 h-4" /> Download</Button>
           <button onClick={onClose} className="p-2 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors">
             <X className="w-5 h-5" />
           </button>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
         {/* Left Side: Main Image */}
         <div className={`flex-1 relative bg-[#0a0a0a] flex items-center justify-center overflow-hidden ${isCompareMode ? 'border-r border-line' : ''}`}>
            {isImage ? (
               <div className="relative w-full h-full flex items-center justify-center p-8">
                 <img 
                   src={document.fileUrl} 
                   alt={document.fileName}
                   className="max-w-full max-h-full object-contain transition-transform duration-200"
                   style={{ 
                     transform: `scale(${zoom})`,
                     filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                     cursor: zoom > 1 ? 'grab' : 'default'
                   }}
                   draggable={false}
                 />
                 {isAnnotating && (
                   <canvas 
                     ref={canvasRef}
                     className="absolute inset-0 w-full h-full cursor-crosshair z-10"
                     onMouseDown={startDrawing}
                     onMouseMove={draw}
                     onMouseUp={stopDrawing}
                     onMouseLeave={stopDrawing}
                   />
                 )}
               </div>
            ) : (
               <div className="text-center text-text-muted">
                 <p className="mb-4">Preview not available for this file type.</p>
                 <Button variant="outline"><Download className="w-4 h-4 mr-2" /> Download File</Button>
               </div>
            )}

            {/* Image Controls Floating Panel */}
            {isImage && !isCompareMode && !isAnnotating && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-surface/90 backdrop-blur border border-line rounded-full px-6 py-3 flex gap-6 shadow-xl z-20">
                 <div className="flex items-center gap-3">
                   <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="text-text-muted hover:text-text-main"><ZoomOut className="w-4 h-4" /></button>
                   <span className="text-xs font-bold text-text-main w-12 text-center">{Math.round(zoom * 100)}%</span>
                   <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="text-text-muted hover:text-text-main"><ZoomIn className="w-4 h-4" /></button>
                 </div>
                 <div className="w-px h-5 bg-text-muted/20"></div>
                 <div className="flex items-center gap-2">
                   <Sun className="w-4 h-4 text-text-muted" />
                   <input type="range" min="50" max="150" value={brightness} onChange={e => setBrightness(Number(e.target.value))} className="w-20 accent-primary" />
                 </div>
                 <div className="w-px h-5 bg-text-muted/20"></div>
                 <div className="flex items-center gap-2">
                   <Contrast className="w-4 h-4 text-text-muted" />
                   <input type="range" min="50" max="150" value={contrast} onChange={e => setContrast(Number(e.target.value))} className="w-20 accent-primary" />
                 </div>
                 <div className="w-px h-5 bg-text-muted/20"></div>
                 <button onClick={() => { setZoom(1); setBrightness(100); setContrast(100); }} className="text-xs font-bold text-text-muted hover:text-text-main">RESET</button>
              </div>
            )}

            {/* Annotation Controls Floating Panel */}
            {isAnnotating && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-surface/90 backdrop-blur border border-error/30 rounded-full px-6 py-3 flex gap-4 shadow-xl z-20">
                 <Button size="sm" variant="outline" onClick={clearAnnotations} className="gap-2 border-line"><Trash2 className="w-4 h-4" /> Clear</Button>
                 <Button size="sm" onClick={handleSaveAnnotations} className="gap-2 bg-error hover:bg-error/90 text-white border-transparent"><Save className="w-4 h-4" /> Save Annotation</Button>
                 <Button size="sm" variant="outline" onClick={() => setIsAnnotating(false)} className="border-transparent">Cancel</Button>
              </div>
            )}
         </div>

         {/* Right Side: Compare Mode */}
         {isCompareMode && (
           <div className="flex-1 relative bg-[#0a0a0a] flex flex-col border-l border-line">
              <div className="p-3 bg-surface border-b border-line flex items-center justify-between z-10">
                 <select 
                   value={compareDocId} 
                   onChange={e => setCompareDocId(e.target.value)}
                   className="bg-base border border-line rounded-lg px-3 py-1.5 text-sm font-medium text-text-main focus:outline-none focus:border-primary w-full max-w-sm"
                 >
                   <option value="">Select an image to compare...</option>
                   {allDocuments.filter(d => (d.type === 'X-Ray' || d.type === 'Intraoral Photo') && d.id !== document.id).map(d => (
                     <option key={d.id} value={d.id}>{d.fileName} ({format(parseISO(d.uploadedAt), 'MMM d, yyyy')})</option>
                   ))}
                 </select>
                 <button onClick={() => setIsCompareMode(false)} className="text-text-muted hover:text-text-main"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden">
                {compareDoc ? (
                  <img 
                    src={compareDoc.fileUrl} 
                    alt={compareDoc.fileName}
                    className="max-w-full max-h-full object-contain"
                    style={{ filter: `brightness(${brightness}%) contrast(${contrast}%)` }}
                    draggable={false}
                  />
                ) : (
                  <div className="text-text-muted/50 text-sm">Select an image above</div>
                )}
              </div>
           </div>
         )}
      </div>
    </div>
  );
}
