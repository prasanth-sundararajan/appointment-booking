import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { formatDateKey } from '@/lib/datetime';
import type { ISODate } from '@/types';

export interface DateStripProps {
  dates: ISODate[];
  selected: ISODate | null;
  onSelect: (date: ISODate) => void;
}

export function DateStrip({ dates, selected, onSelect }: DateStripProps) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Choose a date">
      {dates.map((date) => {
        const isSelected = date === selected;
        return (
          <motion.button
            key={date}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(date)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
              'flex min-w-[4.5rem] flex-col items-center rounded-2xl border-2 px-3 py-2 transition-colors',
              isSelected
                ? 'border-brand-600 bg-brand-600 text-white shadow-md'
                : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300',
            )}
          >
            <span className="text-xs uppercase tracking-wide opacity-80">{formatDateKey(date, 'EEE')}</span>
            <span className="text-lg font-semibold">{formatDateKey(date, 'd')}</span>
            <span className="text-xs opacity-80">{formatDateKey(date, 'MMM')}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
