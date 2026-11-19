import type { BusinessCategory, BusinessCreate } from '@/types';
import { minorUnitDigits } from './money';

export const DEFAULT_DEPOSIT_PERCENT = 20;
export const MIN_DEPOSIT_PERCENT = 10;
export const MAX_DEPOSIT_PERCENT = 100;
export const DEFAULT_CANCELLATION_CUTOFF_HOURS = 8;

/** Convert a user-typed major amount ("25.50") to integer minor units. */
export function toMinor(major: string, currency: string): number {
  const digits = minorUnitDigits(currency);
  return Math.round(Number(major) * 10 ** digits);
}

/** Convert minor units to a plain major string for inputs (2550 -> "25.50"). */
export function toMajorString(minor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// ---------- Business form ----------

/** Form state: numbers kept as strings so inputs can be empty while typing. */
export interface BusinessFormValues {
  name: string;
  description: string;
  category: BusinessCategory;
  city: string;
  timezone: string;
  currency: string;
  deposit_percent: string;
  cancellation_cutoff_hours: string;
  booking_buffer_minutes: string;
  min_notice_hours: string;
  max_advance_days: string;
  phone: string;
  email: string;
  address: string;
}

export type BusinessFormErrors = Partial<Record<keyof BusinessFormValues, string>>;

export function defaultBusinessFormValues(): BusinessFormValues {
  return {
    name: '',
    description: '',
    category: 'salon',
    city: '',
    timezone: browserTimezone(),
    currency: 'USD',
    deposit_percent: String(DEFAULT_DEPOSIT_PERCENT),
    cancellation_cutoff_hours: String(DEFAULT_CANCELLATION_CUTOFF_HOURS),
    booking_buffer_minutes: '0',
    min_notice_hours: '1',
    max_advance_days: '60',
    phone: '',
    email: '',
    address: '',
  };
}

function intRule(value: string, label: string, min: number, max: number): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return `${label} is required`;
  if (!/^-?\d+$/.test(trimmed)) return `${label} must be a whole number`;
  const n = Number(trimmed);
  if (n < min) return `${label} must be at least ${min}`;
  if (n > max) return `${label} must be at most ${max}`;
  return undefined;
}

type NumericField =
  | 'deposit_percent'
  | 'cancellation_cutoff_hours'
  | 'booking_buffer_minutes'
  | 'min_notice_hours'
  | 'max_advance_days';

const NUMERIC_RULES: { field: NumericField; label: string; min: number; max: number }[] = [
  { field: 'deposit_percent', label: 'Deposit', min: MIN_DEPOSIT_PERCENT, max: MAX_DEPOSIT_PERCENT },
  { field: 'cancellation_cutoff_hours', label: 'Cancellation cutoff', min: 0, max: 720 },
  { field: 'booking_buffer_minutes', label: 'Buffer', min: 0, max: 240 },
  { field: 'min_notice_hours', label: 'Minimum notice', min: 0, max: 720 },
  { field: 'max_advance_days', label: 'Maximum advance', min: 1, max: 365 },
];

export function validateBusinessForm(values: BusinessFormValues): BusinessFormErrors {
  const errors: BusinessFormErrors = {};
  if (values.name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
  if (!values.city.trim()) errors.city = 'City is required';
  if (!values.timezone) errors.timezone = 'Timezone is required';
  if (!/^[A-Z]{3}$/.test(values.currency)) errors.currency = 'Pick a currency';
  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid email';
  }
  NUMERIC_RULES.forEach(({ field, label, min, max }) => {
    const message = intRule(values[field], label, min, max);
    if (message) errors[field] = message;
  });
  return errors;
}

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function businessFormToPayload(values: BusinessFormValues): BusinessCreate {
  return {
    name: values.name.trim(),
    description: optional(values.description),
    category: values.category,
    city: values.city.trim(),
    timezone: values.timezone,
    currency: values.currency,
    deposit_percent: Number(values.deposit_percent),
    cancellation_cutoff_hours: Number(values.cancellation_cutoff_hours),
    booking_buffer_minutes: Number(values.booking_buffer_minutes),
    min_notice_hours: Number(values.min_notice_hours),
    max_advance_days: Number(values.max_advance_days),
    phone: optional(values.phone),
    email: optional(values.email),
    address: optional(values.address),
  };
}

export function businessToFormValues(business: BusinessCreate): BusinessFormValues {
  return {
    name: business.name,
    description: business.description ?? '',
    category: business.category,
    city: business.city,
    timezone: business.timezone,
    currency: business.currency,
    deposit_percent: String(business.deposit_percent ?? DEFAULT_DEPOSIT_PERCENT),
    cancellation_cutoff_hours: String(business.cancellation_cutoff_hours ?? DEFAULT_CANCELLATION_CUTOFF_HOURS),
    booking_buffer_minutes: String(business.booking_buffer_minutes ?? 0),
    min_notice_hours: String(business.min_notice_hours ?? 1),
    max_advance_days: String(business.max_advance_days ?? 60),
    phone: business.phone ?? '',
    email: business.email ?? '',
    address: business.address ?? '',
  };
}
