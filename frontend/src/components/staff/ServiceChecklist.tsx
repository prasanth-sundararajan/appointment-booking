import { useId, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { formatDuration } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { Service } from '@/types';

export interface ServiceChecklistProps {
  services: Service[];
  selected: number[];
  onChange: (ids: number[]) => void;
  currency: string;
  /** Visible group label. */
  label?: string;
  /** Shown when there are no services yet (e.g. a link to the Services page). */
  emptyAction?: ReactNode;
}

/**
 * Checkbox list for assigning services to a staff member.
 * Each row: checkbox + service name + duration and price, so it is obviously selectable.
 */
export function ServiceChecklist({
  services,
  selected,
  onChange,
  currency,
  label = 'Services they offer',
  emptyAction,
}: ServiceChecklistProps) {
  const labelId = useId();

  if (services.length === 0) {
    return (
      <div className="rounded-control border border-dashed border-line-strong bg-white/5 p-4 text-sm text-slate-200">
        <p>You haven&apos;t added any services yet. Add services first, then assign them here.</p>
        {emptyAction && <div className="mt-3">{emptyAction}</div>}
      </div>
    );
  }

  const allIds = services.map((s) => s.id);
  const allSelected = allIds.every((id) => selected.includes(id));
  const toggle = (id: number, checked: boolean) =>
    onChange(checked ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id));

  return (
    <div role="group" aria-labelledby={labelId}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p id={labelId} className="text-sm font-medium text-ink">
          {label}
        </p>
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : allIds)}
          className="rounded text-sm font-medium text-brand-300 hover:text-brand-200 hover:underline"
        >
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {services.map((service) => (
          <Checkbox
            key={service.id}
            card
            checked={selected.includes(service.id)}
            onChange={(e) => toggle(service.id, e.target.checked)}
            label={service.name}
            description={service.is_active ? undefined : 'Inactive: not bookable until re-activated'}
            aside={
              <>
                <span className="block font-medium text-ink">{formatMoney(service.price_minor, currency)}</span>
                <span className="block text-xs text-ink-muted">{formatDuration(service.duration_minutes)}</span>
              </>
            }
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-muted" aria-live="polite">
        {selected.length === 0
          ? 'No services selected. Customers can’t book this person until you pick at least one.'
          : `${selected.length} of ${services.length} selected`}
      </p>
    </div>
  );
}
