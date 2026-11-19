import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { BookingStatus, PaymentStatus } from '@/types';

export type BadgeTone = 'gray' | 'brand' | 'green' | 'yellow' | 'red' | 'blue';

const tones: Record<BadgeTone, string> = {
  gray: 'bg-gray-100 text-gray-700 ring-gray-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'gray', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
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
