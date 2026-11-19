import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { BookingStatus, PaymentStatus } from '@/types';

export type BadgeTone = 'gray' | 'brand' | 'green' | 'yellow' | 'red' | 'blue';

// Light 200/300 text on tinted translucent fills keeps WCAG AA contrast on the dark theme.
const tones: Record<BadgeTone, { body: string; dot: string }> = {
  gray: { body: 'bg-white/10 text-slate-200 ring-white/10', dot: 'bg-slate-400' },
  brand: { body: 'bg-brand-500/10 text-brand-300 ring-brand-400/30', dot: 'bg-brand-500' },
  green: { body: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30', dot: 'bg-emerald-500' },
  yellow: { body: 'bg-amber-500/10 text-amber-200 ring-amber-500/30', dot: 'bg-amber-500' },
  red: { body: 'bg-red-500/10 text-red-300 ring-red-500/30', dot: 'bg-red-500' },
  blue: { body: 'bg-sky-500/10 text-sky-200 ring-sky-500/30', dot: 'bg-sky-500' },
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
