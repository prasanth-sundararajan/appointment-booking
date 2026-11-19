import { AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/cn';
import { formatDateKey } from '@/lib/datetime';
import type { BusinessBooking, ISODate } from '@/types';
import { BookingChip } from './BookingChip';
import { bookingDateKey, bookingHour, hourRange } from './calendarUtils';

export interface WeekViewProps {
  days: ISODate[];
  today: ISODate;
  bookings: BusinessBooking[];
  timezone: string;
  onSelect: (booking: BusinessBooking) => void;
  onSelectDay?: (day: ISODate) => void;
}

export function WeekView({ days, today, bookings, timezone, onSelect, onSelectDay }: WeekViewProps) {
  const hours = hourRange(bookings, timezone);

  return (
    <div className="overflow-x-auto rounded-card border border-gray-200 bg-white shadow-card" data-testid="week-view">
      <div className="min-w-[56rem]">
        <div className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))] border-b border-gray-100">
          <span />
          {days.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay?.(day)}
              className={cn(
                'px-2 py-3 text-center text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                day === today ? 'font-semibold text-brand-700' : 'text-gray-700',
              )}
            >
              <span className="block text-xs uppercase">{formatDateKey(day, 'EEE')}</span>
              <span className="text-lg">{formatDateKey(day, 'd')}</span>
            </button>
          ))}
        </div>
        {hours.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))] border-b border-gray-50 last:border-0"
          >
            <span className="px-2 py-2 text-xs font-medium tabular-nums text-gray-500">{hour.toString().padStart(2, '0')}:00</span>
            {days.map((day) => {
              const cell = bookings.filter(
                (b) => bookingDateKey(b, timezone) === day && bookingHour(b, timezone) === hour,
              );
              return (
                <div
                  key={day}
                  className={cn('min-h-[3rem] space-y-1 border-l border-gray-50 p-1', day === today && 'bg-brand-50/30')}
                >
                  <AnimatePresence>
                    {cell.map((b) => (
                      <BookingChip key={b.id} booking={b} timezone={timezone} onSelect={onSelect} compact />
                    ))}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
