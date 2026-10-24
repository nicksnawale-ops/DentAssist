import React, { useState } from 'react';
import { PatientDocument, DocumentType } from '../../types';
import { mockDocuments } from '../../data/mockDocuments';
import { Button } from '../ui/Button';
import { Upload, Plus, FileText, Image as ImageIcon, Filter, Check, MoreVertical, Search, FileSignature } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { DocumentViewer } from './DocumentViewer';
import { ConsentFormModal } from './ConsentFormModal';

export function DocumentsTab({ patientId }: { patientId: string }) {
  const [documents, setDocuments] = useState<PatientDocument[]>(mockDocuments.filter(d => d.patientId === patientId));
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedType, setSelectedType] = useState<DocumentType | 'All'>('All');
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  
  const [viewingDoc, setViewingDoc] = useState<PatientDocument | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const documentTypes: (DocumentType | 'All')[] = ['All', 'X-Ray', 'Intraoral Photo', 'Lab Report', 'Consent Form', 'Insurance Document', 'Other'];

  const filteredDocs = selectedType === 'All' ? documents : documents.filter(d => d.type === selectedType);

  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploading(true);
      setUploadProgress(0);
      
      const file = e.target.files[0];
      const objectUrl = URL.createObjectURL(file);
      
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        setUploadProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            const newDoc: PatientDocument = {
              id: `doc-new-${Date.now()}`,
              patientId,
              type: file.type.startsWith('image/') ? 'Intraoral Photo' : 'Other',
              fileName: file.name,
              fileUrl: objectUrl,
              thumbnailUrl: file.type.startsWith('image/') ? objectUrl : undefined,
              tags: [],
              uploadedByStaffId: 'current-user',
              uploadedAt: new Date().toISOString(),
              sizeBytes: file.size,
            };
            setDocuments([newDoc, ...documents]);
            setIsUploading(false);
          }, 300);
        }
      }, 200);
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedDocs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDocs(next);
  };

  const handleSaveConsent = (signedDoc: PatientDocument) => {
    setDocuments([signedDoc, ...documents]);
    setShowConsentModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface p-4 rounded-xl border border-line shadow-panel">
        <div>
          <h3 className="text-lg font-bold text-text-main">Documents & X-Rays</h3>
          <p className="text-sm text-text-muted">Manage patient files, imaging, and consent forms.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowConsentModal(true)} className="gap-2 bg-base"><FileSignature className="w-4 h-4" /> Generate Consent</Button>
          <div className="relative">
             <input type="file" id="file-upload" className="hidden" onChange={handleSimulateUpload} accept="image/*,.pdf,.doc,.docx" />
             <label htmlFor="file-upload" className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors cursor-pointer shadow-panel">
               <Upload className="w-4 h-4" /> Upload File
             </label>
          </div>
        </div>
      </div>

      {isUploading && (
        <div className="bg-surface border border-primary/30 rounded-xl p-4 animate-in fade-in">
           <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold text-text-main">Uploading...</span>
              <span className="text-xs font-medium text-text-muted">{uploadProgress}%</span>
           </div>
           <div className="w-full bg-text-muted/10 rounded-full h-2 overflow-hidden">
              <div className="bg-primary h-2 rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }}></div>
           </div>
        </div>
      )}

      <div className="flex justify-between items-center">
         <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {documentTypes.map(type => (
              <button 
                key={type} 
                onClick={() => setSelectedType(type)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${selectedType === type ? 'bg-primary text-white border-primary shadow-panel' : 'bg-surface text-text-muted border-line hover:text-text-main'}`}
              >
                {type}
              </button>
            ))}
         </div>
         <div className="flex bg-surface rounded-lg p-1 border border-line shadow-panel ml-4 shrink-0">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-base shadow-panel text-text-main' : 'text-text-muted'}`}>
              <ImageIcon className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-base shadow-panel text-text-main' : 'text-text-muted'}`}>
              <Filter className="w-4 h-4" />
            </button>
         </div>
      </div>

      {selectedDocs.size > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex justify-between items-center animate-in fade-in slide-in-from-top-2">
           <span className="text-sm font-medium text-primary">{selectedDocs.size} selected</span>
           <div className="flex gap-2">
              <Button variant="outline" size="sm" className="bg-base border-primary/30 text-primary hover:bg-primary/5">Download Zip</Button>
              <Button variant="outline" size="sm" className="bg-base border-error/30 text-error hover:bg-error/5">Delete</Button>
           </div>
        </div>
      )}

      {filteredDocs.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredDocs.map(doc => (
              <div 
                key={doc.id} 
                className={`group relative bg-base border rounded-xl overflow-hidden shadow-panel transition-all hover:border-text-muted/30 cursor-pointer ${selectedDocs.has(doc.id) ? 'border-primary ring-1 ring-primary' : 'border-line'}`}
                onClick={() => setViewingDoc(doc)}
              >
                 <div className="absolute top-2 left-2 z-10" onClick={(e) => { e.stopPropagation(); toggleSelection(doc.id); }}>
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedDocs.has(doc.id) ? 'bg-primary border-primary text-white' : 'bg-base border-text-muted/30 text-transparent group-hover:border-text-muted/50'}`}>
                      <Check className="w-3.5 h-3.5" />
                    </div>
                 </div>
                 <div className="aspect-square bg-surface border-b border-line relative overflow-hidden flex items-center justify-center">
                    {doc.thumbnailUrl ? (
                      <img src={doc.thumbnailUrl} alt={doc.fileName} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <FileText className="w-12 h-12 text-text-muted/30" />
                    )}
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-[11px] font-bold rounded backdrop-blur-sm">
                      {doc.type}
                    </div>
                 </div>
                 <div className="p-3">
                    <h4 className="font-medium text-sm text-text-main truncate" title={doc.fileName}>{doc.fileName}</h4>
                    <div className="text-[11px] text-text-muted mt-1">{format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}</div>
                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex gap-1 mt-2 overflow-x-hidden">
                        {doc.tags.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 bg-surface-hover rounded text-[11px] font-medium text-text-muted whitespace-nowrap">{tag}</span>
                        ))}
                      </div>
                    )}
                 </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-base border border-line rounded-xl overflow-hidden shadow-panel">
            <table className="w-full text-left text-sm whitespace-nowrap">
               <thead className="bg-surface-hover border-b border-line text-text-muted text-[13px] font-medium">
                  <tr>
                     <th className="px-4 py-3 w-8"></th>
                     <th className="px-4 py-3">File Name</th>
                     <th className="px-4 py-3">Type</th>
                     <th className="px-4 py-3">Date</th>
                     <th className="px-4 py-3">Tags</th>
                     <th className="px-4 py-3">Size</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-line">
                  {filteredDocs.map(doc => (
                    <tr key={doc.id} className={`hover:bg-surface-hover/50 cursor-pointer ${selectedDocs.has(doc.id) ? 'bg-primary/5' : ''}`} onClick={() => setViewingDoc(doc)}>
                       <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); toggleSelection(doc.id); }}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedDocs.has(doc.id) ? 'bg-primary border-primary text-white' : 'bg-surface border-text-muted/30'}`}>
                            {selectedDocs.has(doc.id) && <Check className="w-3 h-3" />}
                          </div>
                       </td>
                       <td className="px-4 py-3 font-medium text-text-main flex items-center gap-3">
                          {doc.thumbnailUrl ? (
                             <img src={doc.thumbnailUrl} className="w-8 h-8 rounded object-cover border border-line" />
                          ) : (
                             <div className="w-8 h-8 rounded bg-surface border border-line flex items-center justify-center"><FileText className="w-4 h-4 text-text-muted" /></div>
                          )}
                          <span className="truncate max-w-[200px]">{doc.fileName}</span>
                       </td>
                       <td className="px-4 py-3 text-text-muted">{doc.type}</td>
                       <td className="px-4 py-3 text-text-muted">{format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}</td>
                       <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {doc.tags?.slice(0, 2).map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 bg-surface-hover border border-line rounded text-[11px] font-medium text-text-muted">{tag}</span>
                            ))}
                            {(doc.tags?.length || 0) > 2 && <span className="text-[11px] text-text-muted">+{doc.tags!.length - 2}</span>}
                          </div>
                       </td>
                       <td className="px-4 py-3 text-text-muted text-xs">
                          {doc.sizeBytes ? `${(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB` : '-'}
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="py-16 text-center bg-surface rounded-xl border border-line border-dashed">
          <ImageIcon className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-text-main">No Documents Found</h3>
          <p className="text-sm text-text-muted mt-1 max-w-sm mx-auto">Upload X-rays, photos, or consent forms to keep patient records complete.</p>
        </div>
      )}

      {viewingDoc && (
        <DocumentViewer 
          document={viewingDoc} 
          onClose={() => setViewingDoc(null)} 
          allDocuments={documents}
        />
      )}

      {showConsentModal && (
        <ConsentFormModal 
          patientId={patientId}
          onClose={() => setShowConsentModal(false)}
          onSave={handleSaveConsent}
        />
      )}
    </div>
  );
}
