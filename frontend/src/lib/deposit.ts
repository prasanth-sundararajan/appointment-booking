import { formatMoney } from '@/lib/money';
import type { RefundOutcome } from '@/types';

/**
 * Deposit = price_minor * deposit_percent / 100, rounded half-up to the minor unit
 * (Business Rule 1). Integer maths avoids floating point drift.
 */
export function computeDeposit(priceMinor: number, depositPercent: number): number {
  return Math.floor((priceMinor * depositPercent + 50) / 100);
}

export function refundRuleText(cutoffHours: number): string {
  return `Cancel at least ${cutoffHours}h before for a full deposit refund.`;
}

/** Human-readable refund outcome for a customer cancellation (Business Rule 4). */
export function refundMessage(refund: RefundOutcome, currency: string, cutoffHours: number): string {
  if (refund.eligible && refund.amount_minor > 0) {
    return `You will get a full refund of your ${formatMoney(refund.amount_minor, currency)} deposit.`;
  }
  if (refund.eligible) {
    return 'No deposit has been charged, so there is nothing to refund.';
  }
  return `No refund: cancellations less than ${cutoffHours}h before the start time are not refunded.`;
}
