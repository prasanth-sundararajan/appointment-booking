import { toList } from '@/lib/list';
import type {
  ListResponse,
  Business,
  BusinessCreate,
  BusinessPublic,
  BusinessSearchParams,
  BusinessUpdate,
  Paginated,
} from '@/types';
import { del, get, post, put } from './api';

/** Query keys for Module 2 (Businesses & Directory). */
export const businessKeys = {
  all: ['businesses'] as const,
  search: (params: BusinessSearchParams) => ['businesses', 'search', params] as const,
  bySlug: (slug: string) => ['businesses', 'slug', slug] as const,
  mine: () => ['businesses', 'mine'] as const,
  mineById: (id: number) => ['businesses', 'mine', id] as const,
};

function cleanParams(params: BusinessSearchParams): BusinessSearchParams {
  const cleaned: BusinessSearchParams = {};
  if (params.q?.trim()) cleaned.q = params.q.trim();
  if (params.category) cleaned.category = params.category;
  if (params.city?.trim()) cleaned.city = params.city.trim();
  if (params.page && params.page > 1) cleaned.page = params.page;
  return cleaned;
}

export const businessesService = {
  /** GET /api/businesses?q=&category=&city=&page= */
  search(params: BusinessSearchParams): Promise<Paginated<Business>> {
    return get<Paginated<Business>>('/api/businesses', { params: cleanParams(params) });
  },

  /** GET /api/businesses/{slug} (public, includes services + staff) */
  getBySlug(slug: string): Promise<BusinessPublic> {
    return get<BusinessPublic>(`/api/businesses/${encodeURIComponent(slug)}`);
  },

  /** GET /api/me/businesses */
  mine(): Promise<Business[]> {
    return get<ListResponse<Business>>('/api/me/businesses').then(toList);
  },

  /** GET /api/me/businesses/{id} (owner, full record incl. inactive) */
  getMine(id: number): Promise<Business> {
    return get<Business>(`/api/me/businesses/${id}`);
  },

  /** POST /api/businesses */
  create(payload: BusinessCreate): Promise<Business> {
    return post<Business, BusinessCreate>('/api/businesses', payload);
  },

  /** PUT /api/businesses/{id} */
  update(id: number, payload: BusinessUpdate): Promise<Business> {
    return put<Business, BusinessUpdate>(`/api/businesses/${id}`, payload);
  },

  /** DELETE /api/businesses/{id} (deactivate) */
  deactivate(id: number): Promise<void> {
    return del<void>(`/api/businesses/${id}`);
  },
};
