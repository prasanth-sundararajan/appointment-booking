import { toList } from '@/lib/list';
import type { ListResponse, Service, ServiceCreate, ServiceUpdate } from '@/types';
import { del, get, post, put } from './api';

/** Query keys for services (Module 3). Named "catalog" to avoid clashing with the services/ folder. */
export const catalogKeys = {
  all: ['services'] as const,
  byBusiness: (businessId: number) => ['services', 'business', businessId] as const,
  allByBusiness: (businessId: number) => ['services', 'business', businessId, 'all'] as const,
};

export const catalogService = {
  /** GET /api/businesses/{id}/services */
  list(businessId: number): Promise<Service[]> {
    return get<ListResponse<Service>>(`/api/businesses/${businessId}/services`).then(toList);
  },

  /** GET /api/businesses/{id}/services/all (owner, includes inactive) */
  listAll(businessId: number): Promise<Service[]> {
    return get<ListResponse<Service>>(`/api/businesses/${businessId}/services/all`).then(toList);
  },

  /** POST /api/businesses/{id}/services */
  create(businessId: number, payload: ServiceCreate): Promise<Service> {
    return post<Service, ServiceCreate>(`/api/businesses/${businessId}/services`, payload);
  },

  /** PUT /api/services/{id} */
  update(serviceId: number, payload: ServiceUpdate): Promise<Service> {
    return put<Service, ServiceUpdate>(`/api/services/${serviceId}`, payload);
  },

  /** DELETE /api/services/{id} (soft delete) */
  remove(serviceId: number): Promise<void> {
    return del<void>(`/api/services/${serviceId}`);
  },
};
