import { PatientDocument } from '../types';

export const mockDocuments: PatientDocument[] = [
  {
    id: 'doc-1',
    patientId: 'pat_1',
    type: 'X-Ray',
    fileName: 'panoramic_xray_2024.jpg',
    fileUrl: 'https://images.unsplash.com/photo-1598926065588-b2a8dff3e551?w=800&auto=format&fit=crop&q=60',
    thumbnailUrl: 'https://images.unsplash.com/photo-1598926065588-b2a8dff3e551?w=150&auto=format&fit=crop&q=60',
    tags: ['OPG', 'Baseline'],
    uploadedByStaffId: 'u-1',
    uploadedAt: '2024-03-01T09:00:00Z',
    sizeBytes: 2500000,
  },
  {
    id: 'doc-2',
    patientId: 'pat_1',
    type: 'Intraoral Photo',
    fileName: 'tooth_16_decay.jpg',
    fileUrl: 'https://images.unsplash.com/photo-1606265752439-1f18756aa5fc?w=800&auto=format&fit=crop&q=60',
    thumbnailUrl: 'https://images.unsplash.com/photo-1606265752439-1f18756aa5fc?w=150&auto=format&fit=crop&q=60',
    taggedTeeth: ['16'],
    tags: ['Decay', 'Pre-op'],
    uploadedByStaffId: 'u-1',
    uploadedAt: '2024-03-02T10:15:00Z',
    sizeBytes: 1200000,
  },
  {
    id: 'doc-3',
    patientId: 'pat_1',
    type: 'Consent Form',
    fileName: 'Root_Canal_Consent_Signed.pdf',
    fileUrl: '', // Mock URL
    tags: ['Consent', 'Endo'],
    uploadedByStaffId: 'u-1',
    uploadedAt: '2024-03-10T11:20:00Z',
    sizeBytes: 450000,
  },
  {
    id: 'doc-4',
    patientId: 'pat_3',
    type: 'X-Ray',
    fileName: 'ceph_ortho.jpg',
    fileUrl: 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=800&auto=format&fit=crop&q=60',
    thumbnailUrl: 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=150&auto=format&fit=crop&q=60',
    tags: ['Ceph', 'Orthodontics'],
    uploadedByStaffId: 'u-2',
    uploadedAt: '2024-01-20T10:00:00Z',
    sizeBytes: 3000000,
  }
];
