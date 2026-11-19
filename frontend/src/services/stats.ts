import type { BusinessStats } from '@/types';
import { get } from './api';

/**
 * Query keys for dashboard stats (Module 10).
 * useBusinessSocket('dashboard') should invalidate `statsKeys.all` (or `statsKeys.byBusiness(id)`).
 */
export const statsKeys = {
  all: ['stats'] as const,
  byBusiness: (businessId: number) => ['stats', businessId] as const,
};

export const statsService = {
  /** GET /api/businesses/{id}/stats */
  get(businessId: number): Promise<BusinessStats> {
    return get<BusinessStats>(`/api/businesses/${businessId}/stats`);
  },
};
