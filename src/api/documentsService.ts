/** Patient documents: X-rays, photos, reports. Mock mode keeps files in memory as object URLs. */
import { ApiResponse } from '../types';
import { apiClient } from './apiClient';
import { apiUrl, http, USE_MOCK_API } from './http';
import { mockDocuments } from '../data/mockDocuments';

export const DOCUMENT_TYPES = ['X-Ray', 'Intraoral Photo', 'Lab Report', 'Consent Form', 'Insurance Document', 'Prescription', 'Other'] as const;
export const PATIENT_UPLOAD_TYPES = ['Insurance Document', 'Lab Report', 'Other'] as const;
export const XRAY_KINDS = ['IOPA', 'Bitewing', 'OPG', 'CBCT', 'Cephalometric', 'Other'] as const;
export type DocumentType = typeof DOCUMENT_TYPES[number];

export interface Annotation {
  id?: string;
  kind: 'arrow' | 'circle' | 'line' | 'text';
  x: number; y: number; x2?: number; y2?: number; r?: number;
  text?: string; color: string; by?: string; at?: string;
}

export interface PatientDoc {
  id: string; patientId: string; clinicId: string | null; type: DocumentType; xrayKind: string | null; title: string;
  fileName: string; contentType: string; sizeBytes: number; width: number | null; height: number | null;
  teeth: string[]; tags: string[]; notes: string | null; takenAt: string | null; annotations: Annotation[];
  sharedWithPatient: boolean; treatmentPlanId: string | null; clinicalNoteId: string | null; uploadedByName?: string | null;
  uploadedByPatient: boolean; isImage: boolean; fileUrl: string; thumbnailUrl: string | null; createdAt: string;
}

export interface UploadFields {
  type: DocumentType; title?: string; xrayKind?: string; teeth?: string[]; tags?: string[]; notes?: string;
  takenAt?: string; sharedWithPatient?: boolean; treatmentPlanId?: string; clinicalNoteId?: string;
}

const withUrls = (d: PatientDoc): PatientDoc => ({ ...d, fileUrl: apiUrl(d.fileUrl), thumbnailUrl: d.thumbnailUrl ? apiUrl(d.thumbnailUrl) : null });

// ---------- Mock ----------

let mockDocs: PatientDoc[] = mockDocuments.map(d => ({
  id: d.id, patientId: d.patientId, clinicId: null, type: (DOCUMENT_TYPES as readonly string[]).includes(d.type) ? d.type as DocumentType : 'Other',
  xrayKind: d.type === 'X-Ray' ? 'OPG' : null, title: d.fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' '), fileName: d.fileName,
  contentType: /\.pdf$/i.test(d.fileName) ? 'application/pdf' : 'image/jpeg', sizeBytes: d.sizeBytes || 0, width: null, height: null,
  teeth: d.taggedTeeth || [], tags: d.tags, notes: null, takenAt: d.uploadedAt.slice(0, 10), annotations: [], sharedWithPatient: true,
  treatmentPlanId: null, clinicalNoteId: null, uploadedByName: 'Dr. Sarah Smith', uploadedByPatient: false,
  isImage: !/\.pdf$/i.test(d.fileName), fileUrl: d.fileUrl, thumbnailUrl: d.thumbnailUrl || d.fileUrl, createdAt: d.uploadedAt,
}));

// ---------- API ----------

export async function getDocuments(patientId: string, filters: { type?: string; tooth?: string } = {}): Promise<ApiResponse<PatientDoc[]>> {
  if (!USE_MOCK_API) {
    const res = await http.get<PatientDoc[]>(`/patients/${encodeURIComponent(patientId)}/documents`, filters);
    return res.data ? { ...res, data: res.data.map(withUrls) } : res;
  }
  return apiClient(() => mockDocs.filter(d => d.patientId === patientId &&
    (!filters.type || filters.type === 'All' || d.type === filters.type) && (!filters.tooth || d.teeth.includes(filters.tooth))));
}

export async function uploadDocument(patientId: string, file: File, fields: UploadFields): Promise<ApiResponse<PatientDoc>> {
  if (!USE_MOCK_API) {
    const form = new FormData();
    form.append('file', file);
    form.append('type', fields.type);
    if (fields.title) form.append('title', fields.title);
    if (fields.xrayKind) form.append('xrayKind', fields.xrayKind);
    if (fields.teeth?.length) form.append('teeth', fields.teeth.join(','));
    if (fields.tags?.length) form.append('tags', JSON.stringify(fields.tags));
    if (fields.notes) form.append('notes', fields.notes);
    if (fields.takenAt) form.append('takenAt', fields.takenAt);
    if (fields.sharedWithPatient !== undefined) form.append('sharedWithPatient', String(fields.sharedWithPatient));
    if (fields.treatmentPlanId) form.append('treatmentPlanId', fields.treatmentPlanId);
    const res = await http.upload<PatientDoc>(`/patients/${encodeURIComponent(patientId)}/documents`, form);
    return res.data ? { ...res, data: withUrls(res.data) } : res;
  }
  return apiClient(() => {
    const url = URL.createObjectURL(file);
    const isImage = file.type.startsWith('image/');
    const doc: PatientDoc = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, patientId, clinicId: null, type: fields.type,
      xrayKind: fields.xrayKind || null, title: fields.title || file.name.replace(/\.[^.]+$/, ''), fileName: file.name,
      contentType: file.type || 'application/octet-stream', sizeBytes: file.size, width: null, height: null, teeth: fields.teeth || [],
      tags: fields.tags || [], notes: fields.notes || null, takenAt: fields.takenAt || new Date().toISOString().slice(0, 10),
      annotations: [], sharedWithPatient: fields.sharedWithPatient ?? true, treatmentPlanId: null, clinicalNoteId: null,
      uploadedByName: 'You', uploadedByPatient: false, isImage, fileUrl: url, thumbnailUrl: isImage ? url : null, createdAt: new Date().toISOString(),
    };
    mockDocs = [doc, ...mockDocs];
    return doc;
  });
}

export async function updateDocument(id: string, patch: Partial<Pick<PatientDoc, 'type' | 'xrayKind' | 'title' | 'teeth' | 'tags' | 'notes' | 'takenAt' | 'sharedWithPatient' | 'annotations'>>): Promise<ApiResponse<PatientDoc>> {
  if (!USE_MOCK_API) {
    const res = await http.patch<PatientDoc>(`/documents/${encodeURIComponent(id)}`, patch);
    return res.data ? { ...res, data: withUrls(res.data) } : res;
  }
  return apiClient(() => {
    const d = mockDocs.find(x => x.id === id)!;
    Object.assign(d, patch);
    return { ...d };
  });
}

export async function deleteDocument(id: string): Promise<ApiResponse<boolean>> {
  if (!USE_MOCK_API) return http.delete(`/documents/${encodeURIComponent(id)}`);
  return apiClient(() => { mockDocs = mockDocs.filter(d => d.id !== id); return true; });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
