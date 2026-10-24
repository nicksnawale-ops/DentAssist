import React, { useState } from 'react';
import { ClinicalNote } from '../../types';
import { mockClinicalNotes } from '../../data/mockClinicalNotes';
import { Button } from '../ui/Button';
import { Plus, Calendar as CalendarIcon, User, Save, FileText, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export function ClinicalNotesTab({ patientId }: { patientId: string }) {
  const [notes, setNotes] = useState<ClinicalNote[]>(mockClinicalNotes.filter(n => n.patientId === patientId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  const [isAdding, setIsAdding] = useState(false);
  
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

  const handleSave = () => {
    const newNote: ClinicalNote = {
      id: `cn-new-${Date.now()}`,
      patientId,
      subjective,
      objective,
      assessment,
      plan,
      authorStaffId: 'current-user',
      createdAt: new Date().toISOString()
    };
    setNotes([newNote, ...notes]);
    setIsAdding(false);
    setSubjective('');
    setObjective('');
    setAssessment('');
    setPlan('');
  };

  const applyTemplate = (type: string) => {
    if (type === 'routine') {
      setSubjective('Patient presents for routine recall exam and prophylaxis. No chief complaints.');
      setObjective('Extraoral/intraoral exam WNL. Oral hygiene is fair. No active carious lesions noted on clinical or radiographic exam (if taken). Periodontium appears stable with mild localized marginal gingivitis.');
      setAssessment('Healthy/Stable. Mild localized gingivitis.');
      setPlan('Full mouth adult prophylaxis. OHI reviewed. Return for 6 month recall.');
    } else if (type === 'limited') {
       setSubjective('Patient complains of pain in the [area] that started [duration] ago. Pain is [sharp/dull/throbbing] and is aggravated by [hot/cold/biting].');
       setObjective('Tooth [#] is sensitive to percussion. Cold test [positive/negative]. Radiograph reveals [finding].');
       setAssessment('[Diagnosis] of tooth [#].');
       setPlan('Discussed findings and treatment options with patient. Recommended [Treatment]. Patient consented. [Treatment performed].');
    }
  };

  return (
    <div className="space-y-6">
      {!isAdding ? (
        <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-text-muted/10 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-text-main">Clinical Notes</h3>
            <p className="text-sm text-text-muted">SOAP notes and visit history.</p>
          </div>
          <Button onClick={() => setIsAdding(true)} className="gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> Add Note
          </Button>
        </div>
      ) : (
        <div className="bg-base rounded-xl border border-text-muted/20 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4">
          <div className="p-4 border-b border-text-muted/10 bg-surface flex justify-between items-center">
             <h3 className="font-bold text-text-main">New Clinical Note (SOAP)</h3>
             <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => applyTemplate('routine')}>Routine Exam Template</Button>
                <Button variant="outline" size="sm" onClick={() => applyTemplate('limited')}>Limited Exam Template</Button>
             </div>
          </div>
          <div className="p-6 space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-text-main flex items-center gap-2"><span className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center text-xs">S</span> Subjective</label>
                  <p className="text-xs text-text-muted">Chief complaint, patient's own words.</p>
                  <textarea value={subjective} onChange={e => setSubjective(e.target.value)} className="w-full h-24 bg-surface border border-text-muted/20 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none" placeholder="Patient reports..."></textarea>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-text-main flex items-center gap-2"><span className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center text-xs">O</span> Objective</label>
                  <p className="text-xs text-text-muted">Clinical findings, test results, exam details.</p>
                  <textarea value={objective} onChange={e => setObjective(e.target.value)} className="w-full h-24 bg-surface border border-text-muted/20 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none" placeholder="Exam reveals..."></textarea>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-text-main flex items-center gap-2"><span className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center text-xs">A</span> Assessment</label>
                  <p className="text-xs text-text-muted">Diagnosis based on S and O.</p>
                  <textarea value={assessment} onChange={e => setAssessment(e.target.value)} className="w-full h-24 bg-surface border border-text-muted/20 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none" placeholder="Diagnosis is..."></textarea>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-text-main flex items-center gap-2"><span className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center text-xs">P</span> Plan</label>
                  <p className="text-xs text-text-muted">Treatment performed and future plan.</p>
                  <textarea value={plan} onChange={e => setPlan(e.target.value)} className="w-full h-24 bg-surface border border-text-muted/20 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none" placeholder="Treatment provided..."></textarea>
                </div>
             </div>
          </div>
          <div className="p-4 border-t border-text-muted/10 bg-surface flex justify-end gap-3">
             <Button variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
             <Button onClick={handleSave} className="gap-2"><Save className="w-4 h-4" /> Save Note</Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {notes.length > 0 ? notes.map(note => (
          <div key={note.id} className="bg-base border border-text-muted/20 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-surface px-5 py-3 border-b border-text-muted/10 flex justify-between items-center">
               <div className="flex items-center gap-4">
                 <div className="flex items-center gap-1.5 text-sm font-bold text-text-main">
                    <CalendarIcon className="w-4 h-4 text-primary" />
                    {format(parseISO(note.createdAt), 'MMM d, yyyy h:mm a')}
                 </div>
               </div>
               <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
                  <User className="w-3.5 h-3.5" /> Dr. Smith {/* Mocked author name */}
               </div>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
               <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2"><span className="text-primary">S</span> Subjective</h4>
                  <p className="text-sm text-text-main leading-relaxed">{note.subjective || '-'}</p>
               </div>
               <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2"><span className="text-primary">O</span> Objective</h4>
                  <p className="text-sm text-text-main leading-relaxed">{note.objective || '-'}</p>
               </div>
               <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2"><span className="text-primary">A</span> Assessment</h4>
                  <p className="text-sm text-text-main leading-relaxed">{note.assessment || '-'}</p>
               </div>
               <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2"><span className="text-primary">P</span> Plan</h4>
                  <p className="text-sm text-text-main leading-relaxed">{note.plan || '-'}</p>
               </div>
            </div>
          </div>
        )) : (
          !isAdding && (
            <div className="py-12 text-center border border-text-muted/10 border-dashed rounded-xl">
              <FileText className="w-8 h-8 text-text-muted/30 mx-auto mb-2" />
              <p className="text-text-muted">No clinical notes recorded yet.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
