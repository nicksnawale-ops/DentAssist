/** Owner analytics. Mock mode returns a believable demo dataset. */
import { ApiResponse } from '../types';
import { apiClient } from './apiClient';
import { http, USE_MOCK_API } from './http';

export interface AnalyticsKpis {
  collected: number; billed: number; visits: number; newPatients: number; revenuePerVisit: number | null;
  noShowRate: number | null; cancellationRate: number | null; chairUtilisation: number | null;
  planAcceptanceRate: number | null; recallSuccessRate: number | null; reviewRequests: number; labSpend: number;
}

export interface TrendPoint {
  label: string; start: string; collected: number; visits: number; newPatients: number;
  noShowRate: number | null; cancellationRate: number | null;
}

export interface DentistRow {
  dentistId: string | null; name: string; collected: number; billed: number; visits: number; noShowRate: number | null;
  bookedHours: number; availableHours: number; utilisation: number | null;
}

export interface Analytics {
  range: { from: string; to: string; granularity: 'week' | 'month' };
  previousRange: { from: string; to: string };
  kpis: AnalyticsKpis;
  previous: AnalyticsKpis;
  trend: TrendPoint[];
  byDentist: DentistRow[];
  topProcedures: { name: string; count: number; revenue: number }[];
  paymentMethods: { method: string; amount: number }[];
  plans: { proposed: number; accepted: number; completed: number; proposedValue: number; acceptedValue: number };
  recalls: { created: number; contacted: number; booked: number };
  lab: { cases: number; remakes: number };
}

function mock(from: string, to: string): Analytics {
  const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const trend = months.map((m, i) => ({
    label: `${m} 2026`, start: `2026-${String(5 + i).padStart(2, '0')}-01`, collected: 180000 + i * 22000 + (i % 2) * 9000,
    visits: 64 + i * 5, newPatients: 14 + i * 2, noShowRate: [0.11, 0.1, 0.12, 0.09, 0.08, 0.07][i], cancellationRate: [0.09, 0.08, 0.1, 0.08, 0.07, 0.06][i],
  }));
  const kpis: AnalyticsKpis = {
    collected: trend.reduce((s, t) => s + t.collected, 0), billed: 1460000, visits: trend.reduce((s, t) => s + t.visits, 0),
    newPatients: trend.reduce((s, t) => s + t.newPatients, 0), revenuePerVisit: 3150, noShowRate: 0.09, cancellationRate: 0.08,
    chairUtilisation: 0.71, planAcceptanceRate: 0.64, recallSuccessRate: 0.38, reviewRequests: 212, labSpend: 186000,
  };
  return {
    range: { from, to, granularity: 'month' }, previousRange: { from, to }, kpis,
    previous: { ...kpis, collected: kpis.collected * 0.86, visits: kpis.visits - 31, newPatients: kpis.newPatients - 9, revenuePerVisit: 2980,
      noShowRate: 0.12, cancellationRate: 0.09, chairUtilisation: 0.64, planAcceptanceRate: 0.58, recallSuccessRate: 0.29 },
    trend,
    byDentist: [
      { dentistId: 's1', name: 'Dr. Sarah Smith', collected: 812000, billed: 860000, visits: 244, noShowRate: 0.08, bookedHours: 410, availableHours: 540, utilisation: 0.76 },
      { dentistId: 's3', name: 'Dr. Anil Kumar', collected: 494000, billed: 520000, visits: 155, noShowRate: 0.11, bookedHours: 300, availableHours: 470, utilisation: 0.64 },
    ],
    topProcedures: [
      { name: 'Root Canal Treatment (Posterior)', count: 38, revenue: 342000 }, { name: 'PFM Crown', count: 41, revenue: 287000 },
      { name: 'Scaling & Polishing', count: 160, revenue: 192000 }, { name: 'Composite Filling', count: 96, revenue: 172800 },
      { name: 'Consultation', count: 210, revenue: 105000 },
    ],
    paymentMethods: [{ method: 'UPI', amount: 820000 }, { method: 'Cash', amount: 260000 }, { method: 'Card', amount: 226000 }],
    plans: { proposed: 86, accepted: 55, completed: 31, proposedValue: 2100000, acceptedValue: 1340000 },
    recalls: { created: 140, contacted: 112, booked: 53 },
    lab: { cases: 62, remakes: 3 },
  };
}

export async function getAnalytics(params: { from: string; to: string; clinicId?: string; dentistId?: string }): Promise<ApiResponse<Analytics>> {
  if (!USE_MOCK_API) return http.get('/analytics/overview', params);
  return apiClient(() => mock(params.from, params.to));
}
