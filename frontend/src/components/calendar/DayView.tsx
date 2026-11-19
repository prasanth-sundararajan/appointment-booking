import { AnimatePresence } from 'framer-motion';
import type { BusinessBooking, ISODate } from '@/types';
import { BookingChip } from './BookingChip';
import { bookingDateKey, bookingHour, hourRange } from './calendarUtils';

export interface DayViewProps {
  date: ISODate;
  bookings: BusinessBooking[];
  timezone: string;
  onSelect: (booking: BusinessBooking) => void;
}

export function DayView({ date, bookings, timezone, onSelect }: DayViewProps) {
  const dayBookings = bookings.filter((b) => bookingDateKey(b, timezone) === date);
  const hours = hourRange(dayBookings, timezone);

  return (
    <div className="divide-y divide-white/10 rounded-card border border-line bg-surface shadow-card" data-testid="day-view">
      {hours.map((hour) => {
        const inHour = dayBookings.filter((b) => bookingHour(b, timezone) === hour);
        return (
          <div key={hour} className="grid grid-cols-[4rem_1fr] gap-3 px-3 py-2">
            <span className="pt-1 text-xs font-medium tabular-nums text-ink-subtle">{hour.toString().padStart(2, '0')}:00</span>
            <div className="flex min-h-[2.5rem] flex-wrap gap-2">
              <AnimatePresence>
                {inHour.map((b) => (
                  <div key={b.id} className="w-full sm:w-60">
                    <BookingChip booking={b} timezone={timezone} onSelect={onSelect} />
                  </div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
}
