import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { formatInTz } from '@/lib/datetime';
import { Spinner } from '@/components/ui/Spinner';
import type { Slot } from '@/types';

export interface SlotGridProps {
  slots: Slot[];
  timezone: string;
  /** `start_at` of the selected slot. */
  selectedStart?: string | null;
  onSelect: (slot: Slot) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

/** Live grid of open slots. Slots removed from `slots` animate out. */
export function SlotGrid({
  slots,
  timezone,
  selectedStart,
  onSelect,
  isLoading = false,
  emptyMessage = 'No open slots on this day. Try another date.',
}: SlotGridProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label="Loading slots" />
      </div>
    );
  }

  if (slots.length === 0) {
    return <p className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <motion.ul layout className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" aria-label="Available times">
      <AnimatePresence initial={false} mode="popLayout">
        {slots.map((slot) => {
          const isSelected = slot.start_at === selectedStart;
          return (
            <motion.li
              key={slot.start_at}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.25 } }}
            >
              <motion.button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(slot)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  'w-full rounded-xl border-2 px-2 py-2.5 text-sm font-medium transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  isSelected
                    ? 'border-brand-600 bg-brand-600 text-white shadow-md'
                    : 'border-gray-200 bg-white text-gray-800 hover:border-brand-300 hover:bg-brand-50',
                )}
              >
                {formatInTz(slot.start_at, timezone, 'HH:mm')}
              </motion.button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </motion.ul>
  );
}
