import { get, patch, post } from '@/services/api';
import { toList } from '@/lib/list';
import type {
  Booking,
  BookingCreate,
  BookingCreateResponse,
  BookingDetail,
  BookingScope,
  BookingStatusUpdate,
  BusinessBooking,
  BusinessBookingsQuery,
  CancelPreview,
  CancelRequest,
  CancelResponse,
  ListResponse,
  RescheduleRequest,
} from '@/types';

export const bookingKeys = {
  detail: (id: number | undefined) => ['booking', id] as const,
  mineAll: ['my-bookings'] as const,
  mine: (scope: BookingScope) => ['my-bookings', scope] as const,
  cancelPreview: (id: number | undefined) => ['booking', id, 'cancel-preview'] as const,
  business: (businessId: number | undefined) => ['business-bookings', businessId] as const,
  businessRange: (businessId: number | undefined, query: BusinessBookingsQuery) =>
    ['business-bookings', businessId, query] as const,
};

/** sessionStorage key used to find the booking after returning from checkout. */
export const LAST_BOOKING_STORAGE_KEY = 'slotease:last_booking_id';

export function rememberLastBooking(id: number): void {
  try {
    sessionStorage.setItem(LAST_BOOKING_STORAGE_KEY, String(id));
  } catch {
    // Storage unavailable (private mode); the success URL still carries the id.
  }
}

export function recallLastBooking(): number | null {
  try {
    const raw = sessionStorage.getItem(LAST_BOOKING_STORAGE_KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export function createBooking(payload: BookingCreate): Promise<BookingCreateResponse> {
  return post<BookingCreateResponse, BookingCreate>('/api/bookings', payload);
}

export function getBooking(id: number): Promise<BookingDetail> {
  return get<BookingDetail>(`/api/bookings/${id}`);
}

export async function getMyBookings(scope: BookingScope): Promise<BookingDetail[]> {
  const data = await get<ListResponse<BookingDetail>>('/api/me/bookings', { params: { scope } });
  return toList(data);
}

export function getCancelPreview(id: number): Promise<CancelPreview> {
  return get<CancelPreview>(`/api/bookings/${id}/cancel-preview`);
}

export function cancelBooking(id: number, payload: CancelRequest = {}): Promise<CancelResponse> {
  return post<CancelResponse, CancelRequest>(`/api/bookings/${id}/cancel`, payload);
}

export function rescheduleBooking(id: number, payload: RescheduleRequest): Promise<Booking> {
  return post<Booking, RescheduleRequest>(`/api/bookings/${id}/reschedule`, payload);
}

export async function getBusinessBookings(
  businessId: number,
  query: BusinessBookingsQuery,
): Promise<BusinessBooking[]> {
  const data = await get<ListResponse<BusinessBooking>>(`/api/businesses/${businessId}/bookings`, {
    params: query,
  });
  return toList(data);
}

export function updateBookingStatus(id: number, payload: BookingStatusUpdate): Promise<Booking> {
  return patch<Booking, BookingStatusUpdate>(`/api/bookings/${id}/status`, payload);
}
