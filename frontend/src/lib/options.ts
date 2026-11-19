import type { SelectOption } from '@/components/ui/Select';
import { BUSINESS_CATEGORIES, type BusinessCategory } from '@/types';

export const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  salon: 'Salon & beauty',
  clinic: 'Clinic & health',
  fitness: 'Fitness',
  consulting: 'Consulting',
  education: 'Education',
  other: 'Other',
};

export const CATEGORY_OPTIONS: SelectOption[] = BUSINESS_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'SGD', 'AED', 'JPY', 'NZD', 'CHF', 'SEK', 'ZAR', 'BRL', 'MXN'];

export const CURRENCY_OPTIONS: SelectOption[] = CURRENCIES.map((code) => ({ value: code, label: code }));

const COMMON_TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Zurich',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
];

/** Common IANA zones, plus any extra zone (current value, browser zone) not already listed. */
export function timezoneOptions(...extra: string[]): SelectOption[] {
  const zones = [...COMMON_TIMEZONES];
  extra.forEach((zone) => {
    if (zone && !zones.includes(zone)) zones.unshift(zone);
  });
  return zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }));
}

/** 0 = Monday ... 6 = Sunday (matches the backend Weekday). */
export const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
