import { del, get } from '@/services/api';
import type { CalendarStatus, GoogleConnectResponse } from '@/types';

export const calendarKeys = {
  status: ['calendar-status'] as const,
};

/** GET /api/calendar/google/connect, returns the Google consent URL. */
export async function getGoogleConnectUrl(): Promise<string> {
  const data = await get<GoogleConnectResponse>('/api/calendar/google/connect');
  const url = data.url ?? data.auth_url ?? data.authorization_url;
  if (!url) throw new Error('No authorization URL returned');
  return url;
}

export function getCalendarStatus(): Promise<CalendarStatus> {
  return get<CalendarStatus>('/api/calendar/google/status');
}

export function disconnectGoogleCalendar(): Promise<void> {
  return del<void>('/api/calendar/google');
}
