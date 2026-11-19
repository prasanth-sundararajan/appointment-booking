import { formatInTz } from '@/lib/datetime';
import type { BookingStatus, BusinessBooking, ISODate, StaffMemberPublic } from '@/types';

export const DEFAULT_START_HOUR = 8;
export const DEFAULT_END_HOUR = 20;

export function bookingServiceName(b: BusinessBooking): string {
  return b.service_name ?? b.service?.name ?? `Booking #${b.id}`;
}

export function bookingCustomerName(b: BusinessBooking): string {
  return b.customer_name ?? b.customer?.full_name ?? b.customer_email ?? b.customer?.email ?? 'Customer';
}

export function bookingStaffName(b: BusinessBooking, staff: StaffMemberPublic[]): string {
  return b.staff_name ?? b.staff?.display_name ?? staff.find((s) => s.id === b.staff_id)?.display_name ?? 'Staff';
}

export function bookingDateKey(b: BusinessBooking, timezone: string): ISODate {
  return formatInTz(b.start_at, timezone, 'yyyy-MM-dd');
}

export function bookingHour(b: BusinessBooking, timezone: string): number {
  return Number(formatInTz(b.start_at, timezone, 'H'));
}

/** Hours to render: default business day, widened to fit any booking. */
export function hourRange(bookings: BusinessBooking[], timezone: string): number[] {
  let start = DEFAULT_START_HOUR;
  let end = DEFAULT_END_HOUR;
  bookings.forEach((b) => {
    const h = bookingHour(b, timezone);
    start = Math.min(start, h);
    end = Math.max(end, h + 1);
  });
  return Array.from({ length: end - start }, (_, i) => start + i);
}

export const statusChipClass: Record<BookingStatus, string> = {
  pending_payment: 'border-amber-300 bg-amber-50 text-amber-900',
  confirmed: 'border-brand-300 bg-brand-50 text-brand-900',
  completed: 'border-sky-300 bg-sky-50 text-sky-900',
  no_show: 'border-gray-300 bg-gray-100 text-gray-700',
  cancelled: 'border-red-200 bg-red-50 text-red-700 line-through',
  expired: 'border-gray-200 bg-gray-50 text-gray-600',
};
