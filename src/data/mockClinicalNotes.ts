import { ClinicalNote } from '../types';

export const mockClinicalNotes: ClinicalNote[] = [
  {
    id: 'cn-1',
    patientId: 'pat_1',
    appointmentId: 'appt-1',
    subjective: 'Patient reports mild sensitivity in upper left molar when drinking cold water. No pain while chewing.',
    objective: 'Visual exam reveals existing composite filling on tooth 26 with marginal leakage. Percussion test negative. Cold test positive with lingering sensation. Pocket depths within normal limits (2-3mm).',
    assessment: 'Reversible pulpitis on tooth 26 due to failing restoration.',
    plan: 'Replace composite filling on 26. Discussed option for PFM crown if defect is too large after decay removal. Patient consented to filling replacement. Re-eval in 2 weeks.',
    authorStaffId: 'u-1',
    createdAt: '2024-02-15T11:30:00Z'
  },
  {
    id: 'cn-2',
    patientId: 'pat_1',
    subjective: 'Patient presented for routine checkup and cleaning. No specific complaints today.',
    objective: 'Oral hygiene is fair. Mild calculus buildup on lower anterior lingual surfaces. Gingiva appears slightly inflamed but pink and firm otherwise. No new carious lesions detected on bitewings.',
    assessment: 'Gingivitis, mild. Caries free at present.',
    plan: 'Full mouth scaling and polishing performed. Oral hygiene instructions given, emphasized flossing technique. Recommend 6-month recall.',
    authorStaffId: 'u-1',
    createdAt: '2023-08-10T10:00:00Z'
  },
  {
    id: 'cn-3',
    patientId: 'pat_3',
    appointmentId: 'appt-3',
    subjective: 'Mother states child has crowded lower teeth and wants an orthodontic evaluation.',
    objective: 'Mixed dentition. Class I molar relationship. Anterior crowding, 4mm overjet, 3mm overbite. No active decay noted. Good oral hygiene.',
    assessment: 'Class I malocclusion with anterior crowding.',
    plan: 'Orthodontic records taken (pano, ceph, photos, impressions). Will formulate treatment plan and present to parents next week. Likely metal braces, estimated 18-24 months.',
    authorStaffId: 'u-2',
    createdAt: '2024-01-20T14:45:00Z'
  }
];
