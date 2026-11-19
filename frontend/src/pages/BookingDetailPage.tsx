import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge, bookingStatusTone, formatStatus, paymentStatusTone } from '@/components/ui/Badge';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { CancelDialog } from '@/components/booking/CancelDialog';
import { RescheduleDialog } from '@/components/booking/RescheduleDialog';
import { HoldCountdown } from '@/components/booking/HoldCountdown';
import { formatInTz, hoursUntil } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';
import { refundRuleText } from '@/lib/deposit';
import { formatDuration, formatTimezone } from '@/lib/format';
import { toApiError } from '@/services/api';
import { bookingKeys, getBooking } from '@/services/bookings';
import type { BookingDetail } from '@/types';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-gray-100 py-3 text-sm last:border-0">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{children}</dd>
    </div>
  );
}

function BookingSummary({ booking }: { booking: BookingDetail }) {
  const tz = booking.business.timezone;
  return (
    <dl>
      <Row label="Service">
        {booking.service.name} ({formatDuration(booking.service.duration_minutes)})
      </Row>
      <Row label="Business">
        <Link to={`/b/${booking.business.slug}`} className="link">
          {booking.business.name}
        </Link>
      </Row>
      <Row label="With">{booking.staff.display_name}</Row>
      <Row label="When">
        {formatInTz(booking.start_at, tz, 'EEEE d MMMM yyyy, HH:mm')} - {formatInTz(booking.end_at, tz, 'HH:mm')}
        <span className="block text-xs font-normal text-gray-600">{formatTimezone(tz)} time</span>
      </Row>
      <Row label="Price">{formatMoney(booking.service.price_minor, booking.business.currency)}</Row>
      {booking.payment && (
        <Row label="Deposit">
          <span className="inline-flex items-center gap-2">
            {formatMoney(booking.payment.amount_minor, booking.payment.currency)}
            <Badge tone={paymentStatusTone[booking.payment.status]}>{formatStatus(booking.payment.status)}</Badge>
          </span>
        </Row>
      )}
      {booking.payment && booking.payment.refunded_amount_minor > 0 && (
        <Row label="Refunded">{formatMoney(booking.payment.refunded_amount_minor, booking.payment.currency)}</Row>
      )}
      {booking.customer_note && <Row label="Note">{booking.customer_note}</Row>}
    </dl>
  );
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const bookingId = Number(id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const query = useQuery({
    queryKey: bookingKeys.detail(bookingId),
    queryFn: () => getBooking(bookingId),
    enabled: Number.isFinite(bookingId),
  });

  if (query.isLoading) {
    return (
      <PageWrapper>
        <PageSkeleton label="Loading booking" />
      </PageWrapper>
    );
  }
  if (query.isError || !query.data) {
    return (
      <PageWrapper>
        <EmptyState
          as="h1"
          icon="search"
          title="Booking not found"
          description={query.error ? toApiError(query.error).message : 'This booking does not exist or is not yours.'}
          action={<ButtonLink to="/bookings">Back to my bookings</ButtonLink>}
        />
      </PageWrapper>
    );
  }

  const booking = query.data;
  const cutoff = booking.business.cancellation_cutoff_hours;
  const isFuture = hoursUntil(booking.start_at) > 0;
  const canCancel = isFuture && (booking.status === 'confirmed' || booking.status === 'pending_payment');
  const canReschedule = booking.status === 'confirmed' && hoursUntil(booking.start_at) >= cutoff;

  return (
    <PageWrapper
      title={booking.service.name}
      subtitle={`${booking.business.name} · ${formatInTz(booking.start_at, booking.business.timezone, 'EEE d MMM, HH:mm')}`}
      backTo={{ to: '/bookings', label: 'My bookings' }}
      actions={
        <Badge tone={bookingStatusTone[booking.status]} dot className="px-3 py-1 text-sm">
          {formatStatus(booking.status)}
        </Badge>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <Card className="lg:col-span-2">
          <CardHeader title="Booking summary" />
          <BookingSummary booking={booking} />
        </Card>

        <Card className="space-y-4 lg:sticky lg:top-24">
          <CardHeader title="Manage booking" />
          {booking.status === 'pending_payment' && booking.hold_expires_at && (
            <HoldCountdown expiresAt={booking.hold_expires_at} />
          )}
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{refundRuleText(cutoff)}</p>
          {canReschedule && (
            <Button fullWidth variant="outline" onClick={() => setRescheduleOpen(true)}>
              Reschedule
            </Button>
          )}
          {booking.status === 'confirmed' && isFuture && !canReschedule && (
            <p className="text-sm text-gray-600">Rescheduling closes {cutoff}h before the start time.</p>
          )}
          {canCancel && (
            <Button fullWidth variant="danger-ghost" className="border border-red-200" onClick={() => setCancelOpen(true)}>
              Cancel booking
            </Button>
          )}
          {!canCancel && !canReschedule && <p className="text-sm text-gray-600">This booking can no longer be changed.</p>}
          <ButtonLink to={`/b/${booking.business.slug}`} variant="ghost" fullWidth>
            Visit {booking.business.name}
          </ButtonLink>
        </Card>
      </div>

      <CancelDialog
        bookingId={booking.id}
        businessId={booking.business.id}
        currency={booking.payment?.currency ?? booking.business.currency}
        cutoffHours={cutoff}
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
      />
      {canReschedule && (
        <RescheduleDialog booking={booking} isOpen={rescheduleOpen} onClose={() => setRescheduleOpen(false)} />
      )}
    </PageWrapper>
  );
}
