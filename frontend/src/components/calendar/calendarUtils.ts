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
  pending_payment: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
  confirmed: 'border-brand-400/50 bg-brand-500/10 text-brand-100',
  completed: 'border-sky-500/40 bg-sky-500/10 text-sky-100',
  no_show: 'border-line-strong bg-white/10 text-slate-200',
  cancelled: 'border-red-500/30 bg-red-500/10 text-red-300 line-through',
  expired: 'border-line bg-white/5 text-ink-muted',
};
