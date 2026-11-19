import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { formatDateKey } from '@/lib/datetime';
import type { ISODate } from '@/types';

export interface DateStripProps {
  dates: ISODate[];
  selected: ISODate | null;
  onSelect: (date: ISODate) => void;
  /** Today's date key in the business timezone, labelled "Today". */
  today?: ISODate;
}

/** Horizontally scrolling date picker. Arrow keys move between days (roving tabindex). */
export function DateStrip({ dates, selected, onSelect, today }: DateStripProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const focusIndex = Math.max(0, selected ? dates.indexOf(selected) : 0);

  useEffect(() => {
    if (!selected) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-date="${selected}"]`);
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selected]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = dates.indexOf((document.activeElement as HTMLElement | null)?.dataset.date ?? '');
    if (current < 0) return;
    let next = current;
    if (event.key === 'ArrowRight') next = Math.min(dates.length - 1, current + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = dates.length - 1;
    else return;
    event.preventDefault();
    listRef.current?.querySelector<HTMLElement>(`[data-date="${dates[next]}"]`)?.focus();
  };

  return (
    <div
      ref={listRef}
      onKeyDown={onKeyDown}
      className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 pt-1"
      role="listbox"
      aria-label="Choose a date"
      aria-orientation="horizontal"
    >
      {dates.map((date, index) => {
        const isSelected = date === selected;
        const isToday = date === today;
        return (
          <button
            key={date}
            type="button"
            role="option"
            data-date={date}
            aria-selected={isSelected}
            aria-label={`${formatDateKey(date, 'EEEE d MMMM')}${isToday ? ' (today)' : ''}`}
            tabIndex={index === focusIndex ? 0 : -1}
            onClick={() => onSelect(date)}
            className={cn(
              'flex min-w-[4.25rem] snap-start flex-col items-center rounded-xl border px-3 py-2 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
              isSelected
                ? 'border-brand-600 bg-brand-600 text-white shadow-md'
                : 'border-gray-300 bg-white text-gray-800 hover:border-brand-400 hover:bg-brand-50',
            )}
          >
            <span className={cn('text-xs font-medium uppercase tracking-wide', isSelected ? 'text-brand-100' : 'text-gray-600')}>
              {isToday ? 'Today' : formatDateKey(date, 'EEE')}
            </span>
            <span className="text-lg font-semibold tabular-nums">{formatDateKey(date, 'd')}</span>
            <span className={cn('text-xs', isSelected ? 'text-brand-100' : 'text-gray-600')}>{formatDateKey(date, 'MMM')}</span>
          </button>
        );
      })}
    </div>
  );
}
