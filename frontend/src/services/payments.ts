import { get } from '@/services/api';
import type { PaymentRow, PaymentsEnvelope, PaymentsQuery, PaymentsTotals } from '@/types';

export const paymentKeys = {
  business: (businessId: number | undefined, query: PaymentsQuery) => ['payments', businessId, query] as const,
};

export interface PaymentsResult {
  items: PaymentRow[];
  totals: PaymentsTotals;
}

/** Collected = deposits received (succeeded or later refunded); refunded = refunded amounts. */
export function computePaymentTotals(items: PaymentRow[], fallbackCurrency = 'USD'): PaymentsTotals {
  let collected = 0;
  let refunded = 0;
  items.forEach((p) => {
    if (p.status === 'succeeded' || p.status === 'refund_pending' || p.status === 'refunded') {
      collected += p.amount_minor;
    }
    refunded += p.refunded_amount_minor ?? 0;
  });
  return {
    collected_minor: collected,
    refunded_minor: refunded,
    net_minor: collected - refunded,
    currency: items[0]?.currency ?? fallbackCurrency,
  };
}

/** GET /api/businesses/{id}/payments?from=&to= (owner). */
export async function getBusinessPayments(businessId: number, query: PaymentsQuery): Promise<PaymentsResult> {
  const data = await get<PaymentRow[] | PaymentsEnvelope>(`/api/businesses/${businessId}/payments`, {
    params: query,
  });
  const items = Array.isArray(data) ? data : (data.items ?? []);
  const computed = computePaymentTotals(items);
  const serverTotals = Array.isArray(data) ? undefined : data.totals;
  return { items, totals: { ...computed, ...serverTotals } };
}
