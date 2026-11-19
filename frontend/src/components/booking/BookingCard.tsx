import { Link } from 'react-router-dom';
import { Badge, bookingStatusTone, formatStatus } from '@/components/ui/Badge';
import { formatInTz } from '@/lib/datetime';
import type { BookingDetail } from '@/types';

export function BookingCard({ booking }: { booking: BookingDetail }) {
  const tz = booking.business.timezone;
  return (
    <Link
      to={`/bookings/${booking.id}`}
      className="group flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-400/40 hover:shadow-card-hover sm:flex-nowrap sm:p-5"
    >
      <div
        className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-500/10 text-brand-200 ring-1 ring-inset ring-brand-400/20"
        aria-hidden="true"
      >
        <span className="text-[0.6875rem] font-semibold uppercase">{formatInTz(booking.start_at, tz, 'MMM')}</span>
        <span className="text-xl font-bold leading-none">{formatInTz(booking.start_at, tz, 'd')}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink group-hover:text-brand-200">{booking.service.name}</p>
        <p className="truncate text-sm text-ink-muted">
          {booking.business.name} &middot; with {booking.staff.display_name}
        </p>
        <p className="text-sm text-slate-200">
          <time dateTime={booking.start_at}>{formatInTz(booking.start_at, tz, 'EEEE d MMM, HH:mm')}</time>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={bookingStatusTone[booking.status]} dot>
          {formatStatus(booking.status)}
        </Badge>
        <svg viewBox="0 0 20 20" fill="currentColor" className="hidden h-5 w-5 text-slate-500 group-hover:text-brand-200 sm:block" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M7.2 4.2a.75.75 0 011.06 0l5.27 5.27a.75.75 0 010 1.06L8.26 15.8a.75.75 0 11-1.06-1.06L11.94 10 7.2 5.26a.75.75 0 010-1.06z"
          />
        </svg>
      </div>
    </Link>
  );
}
