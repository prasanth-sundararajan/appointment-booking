import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { formatInTz } from '@/lib/datetime';
import type { BusinessBooking } from '@/types';
import { bookingCustomerName, bookingServiceName, statusChipClass } from './calendarUtils';

export interface BookingChipProps {
  booking: BusinessBooking;
  timezone: string;
  onSelect: (booking: BusinessBooking) => void;
  compact?: boolean;
}

export function BookingChip({ booking, timezone, onSelect, compact = false }: BookingChipProps) {
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -1 }}
      onClick={() => onSelect(booking)}
      className={cn(
        'w-full rounded-lg border px-2 py-1 text-left text-xs shadow-sm transition-colors hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        statusChipClass[booking.status],
      )}
    >
      <span className="block font-semibold">
        {formatInTz(booking.start_at, timezone, 'HH:mm')} {bookingServiceName(booking)}
      </span>
      {!compact && <span className="block truncate opacity-80">{bookingCustomerName(booking)}</span>}
    </motion.button>
  );
}
