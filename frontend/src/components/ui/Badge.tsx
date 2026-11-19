import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { BookingStatus, PaymentStatus } from '@/types';

export type BadgeTone = 'gray' | 'brand' | 'green' | 'yellow' | 'red' | 'blue';

// 700/800 text on 50 backgrounds keeps contrast above WCAG AA (4.5:1).
const tones: Record<BadgeTone, { body: string; dot: string }> = {
  gray: { body: 'bg-gray-100 text-gray-700 ring-gray-200', dot: 'bg-gray-500' },
  brand: { body: 'bg-brand-50 text-brand-700 ring-brand-200', dot: 'bg-brand-500' },
  green: { body: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  yellow: { body: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  red: { body: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
  blue: { body: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500' },
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  /** Show a leading status dot. */
  dot?: boolean;
}

export function Badge({ tone = 'gray', children, className, dot = false }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone].body,
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', tones[tone].dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}

export const bookingStatusTone: Record<BookingStatus, BadgeTone> = {
  pending_payment: 'yellow',
  confirmed: 'green',
  cancelled: 'red',
  completed: 'blue',
  no_show: 'gray',
  expired: 'gray',
};

export const paymentStatusTone: Record<PaymentStatus, BadgeTone> = {
  pending: 'yellow',
  succeeded: 'green',
  failed: 'red',
  refund_pending: 'yellow',
  refunded: 'blue',
};

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
