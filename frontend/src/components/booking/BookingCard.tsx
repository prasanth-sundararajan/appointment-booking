import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Badge, bookingStatusTone, formatStatus } from '@/components/ui/Badge';
import { formatInTz } from '@/lib/datetime';
import type { BookingDetail } from '@/types';

export function BookingCard({ booking }: { booking: BookingDetail }) {
  const tz = booking.business.timezone;
  return (
    <Link to={`/bookings/${booking.id}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-2xl">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <span className="text-xs uppercase">{formatInTz(booking.start_at, tz, 'MMM')}</span>
            <span className="text-lg font-bold leading-none">{formatInTz(booking.start_at, tz, 'd')}</span>
          </div>
          <div>
            <p className="font-semibold text-gray-900">{booking.service.name}</p>
            <p className="text-sm text-gray-500">
              {booking.business.name} · {booking.staff.display_name}
            </p>
            <p className="text-sm text-gray-500">{formatInTz(booking.start_at, tz, 'EEEE, HH:mm')}</p>
          </div>
        </div>
        <Badge tone={bookingStatusTone[booking.status]}>{formatStatus(booking.status)}</Badge>
      </Card>
    </Link>
  );
}
