import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Badge, formatStatus, paymentStatusTone } from '@/components/ui/Badge';
import { CardGridSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { addDaysToKey, formatInTz, startOfDayUtc, todayInTz } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';
import { toApiError } from '@/services/api';
import { businessesService, businessKeys } from '@/services/businesses';
import { getBusinessPayments, paymentKeys } from '@/services/payments';
import type { PaymentRow, PaymentsQuery, PaymentsTotals } from '@/types';

function TotalsCard({ totals }: { totals: PaymentsTotals }) {
  const items = [
    { label: 'Deposits collected', value: totals.collected_minor, className: 'text-ink' },
    { label: 'Refunded', value: totals.refunded_minor, className: 'text-red-300' },
    { label: 'Net', value: totals.net_minor, className: 'text-emerald-300' },
  ];
  return (
    <AnimatedList className="mb-6 grid gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label}>
          <p className="text-sm font-medium text-ink-muted">{item.label}</p>
          <p className={cn('mt-1 text-2xl font-bold tabular-nums', item.className)}>{formatMoney(item.value, totals.currency)}</p>
        </Card>
      ))}
    </AnimatedList>
  );
}

function PaymentsTable({ rows, timezone }: { rows: PaymentRow[]; timezone: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="card"
        className="border-0"
        title="No payments in this period"
        description="Deposits appear here as soon as customers pay. Try a wider date range."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-white/10 text-sm">
        <caption className="sr-only">Payments</caption>
        <thead className="bg-white/5">
          <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
            <th scope="col" className="px-3 py-3 font-semibold">Date</th>
            <th scope="col" className="px-3 py-3 font-semibold">Booking</th>
            <th scope="col" className="px-3 py-3 font-semibold">Customer</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Deposit</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Refunded</th>
            <th scope="col" className="px-3 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-white/5">
              <td className="whitespace-nowrap px-3 py-3 text-slate-200">
                {formatInTz(p.created_at, timezone, 'd MMM yyyy, HH:mm')}
              </td>
              <td className="px-3 py-3 text-slate-200">
                #{p.booking_id}
                {p.service_name && <span className="text-ink-muted"> · {p.service_name}</span>}
                {p.booking_start_at && (
                  <span className="block text-xs text-ink-muted">
                    {formatInTz(p.booking_start_at, timezone, 'd MMM, HH:mm')}
                  </span>
                )}
              </td>
              <td className="px-3 py-3 text-slate-200">{p.customer_name ?? p.customer_email ?? '-'}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-ink">
                {formatMoney(p.amount_minor, p.currency)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-red-300">
                {p.refunded_amount_minor > 0 ? formatMoney(p.refunded_amount_minor, p.currency) : '-'}
              </td>
              <td className="px-3 py-3">
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
      <PageWrapper contained={false}>
        <EmptyState icon="lock" title="Owners only" description="Only the business owner can view payments." />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Payments" subtitle="Deposits collected and refunds issued. Dates are in the business timezone." contained={false}>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
        <Input
          type="date"
          label="From"
          value={fromDate}
          max={toDate || undefined}
          onChange={(e) => setFromDate(e.target.value)}
          containerClassName="sm:w-44"
        />
        <Input
          type="date"
          label="To"
          value={toDate}
          min={fromDate || undefined}
          onChange={(e) => setToDate(e.target.value)}
          containerClassName="sm:w-44"
        />
      </div>

      {(businessQuery.isLoading || payments.isLoading) && (
        <>
          <CardGridSkeleton count={3} label="Loading payments" className="mb-6 grid gap-4 sm:grid-cols-3" />
          <Skeleton className="h-64 rounded-card" />
        </>
      )}
      {payments.isError && (
        <ErrorState message={toApiError(payments.error).message} onRetry={() => void payments.refetch()} />
      )}
      {payments.data && (
        <>
          <TotalsCard
            totals={{ ...payments.data.totals, currency: payments.data.items[0]?.currency ?? currency }}
          />
          <Card padded={false} className="overflow-hidden">
            <PaymentsTable rows={payments.data.items} timezone={timezone} />
          </Card>
        </>
      )}
    </PageWrapper>
  );
}
