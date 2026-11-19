import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { formatInTz } from '@/lib/datetime';
import { Skeleton } from '@/components/ui/Skeleton';
import { DAY_PARTS, groupSlotsByDayPart } from '@/lib/slots';
import type { Slot } from '@/types';

export interface SlotGridProps {
  slots: Slot[];
  timezone: string;
  /** `start_at` of the selected slot. */
  selectedStart?: string | null;
  onSelect: (slot: Slot) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  /** Extra explanation under the empty message (why there are no times). */
  emptyHint?: ReactNode;
  /** Next action in the empty state, e.g. "Try next day". */
  emptyAction?: ReactNode;
}

/** Live grid of open slots grouped Morning / Afternoon / Evening. Slots removed from `slots` animate out. */
export function SlotGrid({
  slots,
  timezone,
  selectedStart,
  onSelect,
  isLoading = false,
  emptyMessage = 'No open slots on this day. Try another date.',
  emptyHint,
  emptyAction,
}: SlotGridProps) {
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">Loading slots</span>
        <Skeleton className="h-3 w-20" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-8 text-center">
        <p className="font-medium text-gray-900">{emptyMessage}</p>
        {emptyHint && <div className="mx-auto mt-2 max-w-md text-sm text-gray-600">{emptyHint}</div>}
        {emptyAction && <div className="mt-5 flex flex-wrap justify-center gap-2">{emptyAction}</div>}
      </div>
    );
  }

  const groups = groupSlotsByDayPart(slots, timezone);

  return (
    <div className="space-y-5" role="group" aria-label="Available times">
      {DAY_PARTS.filter((part) => groups[part.id].length > 0).map((part) => (
        <section key={part.id} aria-labelledby={`slots-${part.id}`}>
          <h3 id={`slots-${part.id}`} className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
            {part.label}
            <span className="font-normal normal-case tracking-normal text-gray-500">
              ({groups[part.id].length} {groups[part.id].length === 1 ? 'time' : 'times'})
            </span>
          </h3>
          <motion.ul layout className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            <AnimatePresence initial={false} mode="popLayout">
              {groups[part.id].map((slot) => {
                const isSelected = slot.start_at === selectedStart;
                return (
                  <motion.li
                    key={slot.start_at}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.2 } }}
                  >
                    <motion.button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onSelect(slot)}
                      whileTap={{ scale: 0.95 }}
                      className={cn(
                        'h-11 w-full rounded-lg border text-sm font-semibold tabular-nums transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                        isSelected
                          ? 'border-brand-600 bg-brand-600 text-white shadow-md'
                          : 'border-gray-300 bg-white text-gray-800 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800',
                      )}
                    >
                      {formatInTz(slot.start_at, timezone, 'HH:mm')}
                    </motion.button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        </section>
      ))}
    </div>
  );
}
