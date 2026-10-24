/** AI assistant: SOAP drafts from dictation and patient explanations of treatment plans. */
import { ApiResponse } from '../types';
import { apiClient } from './apiClient';
import { http, USE_MOCK_API } from './http';

export interface AiStatus { enabled: boolean; provider: string; model: string | null; demo: boolean }

export interface SoapDraft {
  subjective: string; objective: string; assessment: string; plan: string;
  teeth: string[]; followUp: string; needsChecking: string[]; demo: boolean;
}

export interface PlanExplanation {
  language: 'en' | 'hi' | 'mr';
  summary: string;
  steps: { name: string; why: string; whatToExpect: string }[];
  aftercare: string;
  questions: string[];
  shared?: boolean;
  sharedAt?: string | null;
  reviewedBy?: string;
  updatedAt?: string;
  demo?: boolean;
}

export const AI_LANGUAGES: { code: PlanExplanation['language']; label: string; speech: string }[] = [
  { code: 'en', label: 'English', speech: 'en-IN' },
  { code: 'hi', label: 'हिंदी', speech: 'hi-IN' },
  { code: 'mr', label: 'मराठी', speech: 'mr-IN' },
];

export async function getAiStatus(): Promise<ApiResponse<AiStatus>> {
  if (!USE_MOCK_API) return http.get('/ai/status');
  return apiClient(() => ({ enabled: true, provider: 'mock', model: null, demo: true }));
}

export async function draftSoapNote(patientId: string, transcript: string, appointmentId?: string): Promise<ApiResponse<SoapDraft>> {
  if (!USE_MOCK_API) return http.post('/ai/soap-draft', { patientId, transcript, appointmentId });
  return apiClient(() => {
    const teeth = Array.from(new Set(transcript.match(/\b[1-8][1-8]\b/g) || []));
    return {
      subjective: `[Demo draft] ${transcript.split(/[.!?]/)[0]}.`, objective: `[Demo draft] Findings${teeth.length ? ` on ${teeth.join(', ')}` : ''} as dictated.`,
      assessment: '[Demo draft] Provisional diagnosis as dictated.', plan: '[Demo draft] Treatment and advice as dictated.',
      teeth, followUp: '', needsChecking: ['Demo mode: switch on the real assistant for real drafts.'], demo: true,
    };
  });
}

export async function draftExplanation(planId: string, language: PlanExplanation['language']): Promise<ApiResponse<PlanExplanation>> {
  if (!USE_MOCK_API) return http.post(`/treatment-plans/${encodeURIComponent(planId)}/explanation/draft`, { language });
  return apiClient(() => ({
    language, demo: true,
    summary: '[Demo] This plan treats the problems your dentist found and protects your teeth from further damage.',
    steps: [{ name: 'Root canal treatment (RCT)', why: '[Demo] The nerve inside the tooth is infected.', whatToExpect: '[Demo] 1-2 visits of about an hour, with numbing.' }],
    aftercare: '[Demo] Avoid chewing hard food on that side until the crown is fitted.',
    questions: ['How many visits will this take?', 'What happens if I wait?'],
  }));
}

export async function saveExplanation(planId: string, e: PlanExplanation & { shared: boolean }): Promise<ApiResponse<PlanExplanation>> {
  if (!USE_MOCK_API) return http.put(`/treatment-plans/${encodeURIComponent(planId)}/explanation`, e);
  return apiClient(() => ({ ...e, reviewedBy: 'Dr. Sarah Smith', updatedAt: new Date().toISOString(), sharedAt: e.shared ? new Date().toISOString() : null }));
}

// ---------- Browser speech recognition (Chrome, Edge, Safari) ----------

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};

export function speechSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function createRecognition(lang: string): Recognition | null {
  const w = window as unknown as Record<string, new () => Recognition>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = lang;
  r.continuous = true;
  r.interimResults = true;
  return r;
}
