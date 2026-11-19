import { toList } from '@/lib/list';
import type { ListResponse, TimeOff, TimeOffCreate, WorkingHours, WorkingHoursInput } from '@/types';
import { del, get, post, put } from './api';

/** Query keys for availability (Module 4). */
export const availabilityKeys = {
  hours: (staffId: number) => ['availability', 'hours', staffId] as const,
  timeOff: (staffId: number) => ['availability', 'time-off', staffId] as const,
};

export const availabilityService = {
  /** GET /api/staff/{id}/hours */
  getHours(staffId: number): Promise<WorkingHours[]> {
    return get<ListResponse<WorkingHours>>(`/api/staff/${staffId}/hours`).then(toList);
  },

  /** PUT /api/staff/{id}/hours (replaces the whole week; body is the list of intervals) */
  replaceHours(staffId: number, hours: WorkingHoursInput[]): Promise<WorkingHours[]> {
    return put<ListResponse<WorkingHours>, WorkingHoursInput[]>(`/api/staff/${staffId}/hours`, hours).then(toList);
  },

  /**
   * GET /api/staff/{id}/time-off
   */
  listTimeOff(staffId: number): Promise<TimeOff[]> {
    return get<ListResponse<TimeOff>>(`/api/staff/${staffId}/time-off`).then(toList);
  },

  /** POST /api/staff/{id}/time-off */
  addTimeOff(staffId: number, payload: TimeOffCreate): Promise<TimeOff> {
    return post<TimeOff, TimeOffCreate>(`/api/staff/${staffId}/time-off`, payload);
  },

  /** DELETE /api/time-off/{id} */
  removeTimeOff(timeOffId: number): Promise<void> {
    return del<void>(`/api/time-off/${timeOffId}`);
  },
};
