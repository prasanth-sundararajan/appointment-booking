import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Badge, formatStatus, paymentStatusTone } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';
import { addDaysToKey, formatInTz, startOfDayUtc, todayInTz } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';
import { toApiError } from '@/services/api';
import { businessesService, businessKeys } from '@/services/businesses';
import { getBusinessPayments, paymentKeys } from '@/services/payments';
import type { PaymentRow, PaymentsQuery, PaymentsTotals } from '@/types';

function TotalsCard({ totals }: { totals: PaymentsTotals }) {
  const items = [
    { label: 'Deposits collected', value: totals.collected_minor, className: 'text-gray-900' },
    { label: 'Refunded', value: totals.refunded_minor, className: 'text-red-600' },
    { label: 'Net', value: totals.net_minor, className: 'text-emerald-700' },
  ];
  return (
    <AnimatedList className="mb-6 grid gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label}>
          <p className="text-sm text-gray-500">{item.label}</p>
          <p className={`mt-1 text-2xl font-bold ${item.className}`}>{formatMoney(item.value, totals.currency)}</p>
        </Card>
      ))}
    </AnimatedList>
  );
}

function PaymentsTable({ rows, timezone }: { rows: PaymentRow[]; timezone: string }) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-500">No payments in this period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Booking</th>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="px-3 py-2 text-right font-medium">Deposit</th>
            <th className="px-3 py-2 text-right font-medium">Refunded</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                {formatInTz(p.created_at, timezone, 'd MMM yyyy, HH:mm')}
              </td>
              <td className="px-3 py-2 text-gray-700">
                #{p.booking_id}
                {p.service_name && <span className="text-gray-500"> · {p.service_name}</span>}
                {p.booking_start_at && (
                  <span className="block text-xs text-gray-400">
                    {formatInTz(p.booking_start_at, timezone, 'd MMM, HH:mm')}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-gray-700">{p.customer_name ?? p.customer_email ?? '-'}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-gray-900">
                {formatMoney(p.amount_minor, p.currency)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-red-600">
                {p.refunded_amount_minor > 0 ? formatMoney(p.refunded_amount_minor, p.currency) : '-'}
              </td>
              <td className="px-3 py-2">
                <Badge tone={paymentStatusTone[p.status]}>{formatStatus(p.status)}</Badge>
                {p.refund_failed && (
                  <span className="mt-1 block">
                    <Badge tone="red">Refund failed</Badge>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PaymentsPage() {
  const { id } = useParams<{ id: string }>();
  const businessId = Number(id);
  const { user } = useAuth();
  const slug = user?.owned_businesses.find((b) => b.id === businessId)?.slug;

  const businessQuery = useQuery({
    queryKey: businessKeys.bySlug(slug ?? ''),
    queryFn: () => businessesService.getBySlug(slug ?? ''),
    enabled: Boolean(slug),
  });
  const timezone = businessQuery.data?.timezone ?? 'UTC';
  const currency = businessQuery.data?.currency ?? 'USD';

  const today = todayInTz(timezone);
  const [fromDate, setFromDate] = useState<string>(() => addDaysToKey(today, -30));
  const [toDate, setToDate] = useState<string>(today);

  const query = useMemo<PaymentsQuery>(
    () => ({
      from: fromDate ? startOfDayUtc(fromDate, timezone) : undefined,
      to: toDate ? startOfDayUtc(addDaysToKey(toDate, 1), timezone) : undefined,
    }),
    [fromDate, toDate, timezone],
  );

  const payments = useQuery({
    queryKey: paymentKeys.business(businessId, query),
    queryFn: () => getBusinessPayments(businessId, query),
    enabled: Number.isFinite(businessId) && businessQuery.isSuccess,
  });

  if (!slug) {
    return (
      <PageWrapper title="Payments">
        <p className="text-gray-600">Only the business owner can view payments.</p>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Payments" subtitle={businessQuery.data ? `${businessQuery.data.name} deposits and refunds` : undefined}>
      <div className="mb-6 flex flex-wrap gap-4">
        <Input
          type="date"
          label="From"
          value={fromDate}
          max={toDate || undefined}
          onChange={(e) => setFromDate(e.target.value)}
          containerClassName="w-44"
        />
        <Input
          type="date"
          label="To"
          value={toDate}
          min={fromDate || undefined}
          onChange={(e) => setToDate(e.target.value)}
          containerClassName="w-44"
        />
      </div>

      {(businessQuery.isLoading || payments.isLoading) && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      )}
      {payments.isError && <p className="text-red-600">{toApiError(payments.error).message}</p>}
      {payments.data && (
        <>
          <TotalsCard
            totals={{ ...payments.data.totals, currency: payments.data.items[0]?.currency ?? currency }}
          />
          <Card hoverable={false} padded={false} className="p-2">
            <PaymentsTable rows={payments.data.items} timezone={timezone} />
          </Card>
        </>
      )}
    </PageWrapper>
  );
}
