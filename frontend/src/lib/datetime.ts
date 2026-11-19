import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { ISODate, ISODateTime } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Format an ISO timestamp in the given IANA timezone. */
export function formatInTz(iso: ISODateTime | Date, timezone: string, pattern: string): string {
  return formatInTimeZone(iso, timezone, pattern);
}

/** Today's calendar date ("YYYY-MM-DD") in the given timezone. */
export function todayInTz(timezone: string, now: Date = new Date()): ISODate {
  return formatInTimeZone(now, timezone, 'yyyy-MM-dd');
}

/** Add whole days to a "YYYY-MM-DD" date key (timezone-free arithmetic). */
export function addDaysToKey(key: ISODate, days: number): ISODate {
  const noon = new Date(`${key}T12:00:00Z`).getTime() + days * DAY_MS;
  return new Date(noon).toISOString().slice(0, 10);
}

/** Format a date key with a date-fns pattern, independent of the viewer timezone. */
export function formatDateKey(key: ISODate, pattern: string): string {
  return formatInTimeZone(new Date(`${key}T12:00:00Z`), 'UTC', pattern);
}

/** Weekday of a date key, 0 = Monday ... 6 = Sunday. */
export function weekdayOfKey(key: ISODate): number {
  return (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** UTC instant of local midnight for the date key in the timezone. */
export function startOfDayUtc(key: ISODate, timezone: string): ISODateTime {
  return fromZonedTime(`${key}T00:00:00`, timezone).toISOString();
}

/** The next `count` date keys starting today in the timezone. */
export function upcomingDateKeys(timezone: string, count: number, now: Date = new Date()): ISODate[] {
  const today = todayInTz(timezone, now);
  return Array.from({ length: count }, (_, i) => addDaysToKey(today, i));
}

/** Hours between now and an ISO timestamp (negative if in the past). */
export function hoursUntil(iso: ISODateTime, now: Date = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / (60 * 60 * 1000);
}
