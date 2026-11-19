import { get } from '@/services/api';
import type { Slot, SlotQuery } from '@/types';

export const slotKeys = {
  all: (businessId: number | undefined) => ['slots', businessId] as const,
  list: (businessId: number | undefined, query: Partial<SlotQuery>) =>
    ['slots', businessId, query.service_id ?? null, query.staff_id ?? null, query.date ?? null] as const,
};

/** GET /api/businesses/{id}/slots (public). */
export function getSlots(businessId: number, query: SlotQuery): Promise<Slot[]> {
  return get<Slot[]>(`/api/businesses/${businessId}/slots`, { params: query });
}
