import type { ListResponse } from '@/types';

/** Normalise a bare array or paginated envelope into an array. */
export function toList<T>(data: ListResponse<T> | { items: T[] } | null | undefined): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.items ?? [];
}
