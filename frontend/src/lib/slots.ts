import { formatInTz } from '@/lib/datetime';
import type { Slot } from '@/types';

export type DayPart = 'morning' | 'afternoon' | 'evening';

export const DAY_PARTS: { id: DayPart; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];

/** Morning before 12:00, afternoon 12:00-16:59, evening from 17:00 (business timezone). */
export function dayPartOf(iso: string, timezone: string): DayPart {
  const hour = Number(formatInTz(iso, timezone, 'H'));
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function groupSlotsByDayPart(slots: Slot[], timezone: string): Record<DayPart, Slot[]> {
  const groups: Record<DayPart, Slot[]> = { morning: [], afternoon: [], evening: [] };
  slots.forEach((slot) => groups[dayPartOf(slot.start_at, timezone)].push(slot));
  return groups;
}
