import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Card } from '@/components/ui/Card';
import { formatStatus } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { HoldCountdown } from '@/components/booking/HoldCountdown';
import { formatInTz } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';
import { toApiError } from '@/services/api';
import { bookingKeys, getBooking, recallLastBooking } from '@/services/bookings';
import type { BookingStatus } from '@/types';

const POLL_MS = 2_000;
const GIVE_UP_MS = 3 * 60_000;
const FINAL: BookingStatus[] = ['confirmed', 'expired', 'cancelled', 'completed', 'no_show'];

function resolveBookingId(params: URLSearchParams): number | null {
  const raw = params.get('booking_id') ?? params.get('id') ?? params.get('booking');
  const fromUrl = raw ? Number(raw) : NaN;
  if (Number.isFinite(fromUrl) && fromUrl > 0) return fromUrl;
  return recallLastBooking();
}

export default function BookingSuccessPage() {
  const [params] = useSearchParams();
  const bookingId = resolveBookingId(params);
  const [startedAt] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), GIVE_UP_MS - (Date.now() - startedAt));
    return () => clearTimeout(timer);
  }, [startedAt]);

  const query = useQuery({
    queryKey: bookingKeys.detail(bookingId ?? undefined),
    queryFn: () => getBooking(bookingId ?? 0),
    enabled: bookingId !== null,
    staleTime: 0,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (timedOut || (status && FINAL.includes(status))) return false;
      return POLL_MS;
    },
  });

  if (bookingId === null) {
    return (
      <PageWrapper>
        <EmptyState
          as="h1"
          icon="search"
          title="Booking not found"
          description="We could not find the booking you just paid for. If you were charged, it will appear in your bookings shortly."
          action={<ButtonLink to="/bookings">Go to my bookings</ButtonLink>}
        />
      </PageWrapper>
    );
  }

  const booking = query.data;
  const status = booking?.status;

  return (
    <PageWrapper className="max-w-xl">
      <Card className="text-center" aria-live="polite">
        {query.isError && (
          <ErrorState
            title="We couldn't load your booking"
            message={toApiError(query.error).message}
            onRetry={() => void query.refetch()}
          />
        )}

        {(!booking || status === 'pending_payment') && !query.isError && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Spinner size="lg" label="Confirming payment" />
            <h1 className="text-xl font-semibold text-ink">
              {timedOut ? 'Still waiting for payment confirmation' : 'Confirming your payment...'}
            </h1>
            <p className="text-sm text-ink-muted">
              {timedOut
                ? 'This is taking longer than usual. We will email you as soon as it is confirmed.'
                : 'This usually takes a few seconds.'}
            </p>
            {booking?.hold_expires_at && <HoldCountdown expiresAt={booking.hold_expires_at} />}
            {timedOut && (
              <Button variant="outline" onClick={() => void query.refetch()}>
                Check again
              </Button>
            )}
          </div>
        )}

        {booking && status === 'confirmed' && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-8 w-8" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
            </motion.div>
            <h1 className="mt-4 text-2xl font-bold text-ink">You are booked!</h1>
            <p className="mt-2 text-slate-200">
              {booking.service.name} at {booking.business.name} with {booking.staff.display_name}
            </p>
            <dl className="mx-auto mt-6 max-w-sm divide-y divide-white/10 rounded-xl border border-line bg-white/5 text-left text-sm">
              <div className="flex justify-between gap-3 px-4 py-3">
                <dt className="text-ink-muted">When</dt>
                <dd className="text-right font-medium text-ink">
                  {formatInTz(booking.start_at, booking.business.timezone, 'EEE d MMM yyyy, HH:mm')}
                </dd>
              </div>
              {booking.payment && (
                <div className="flex justify-between gap-3 px-4 py-3">
                  <dt className="text-ink-muted">Deposit paid</dt>
                  <dd className="font-medium text-ink">
                    {formatMoney(booking.payment.amount_minor, booking.payment.currency)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3 px-4 py-3">
                <dt className="text-ink-muted">Free cancellation</dt>
                <dd className="text-right font-medium text-ink">
                  Until {booking.business.cancellation_cutoff_hours}h before
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-ink-muted">A confirmation email is on its way.</p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink to={`/bookings/${booking.id}`}>View booking</ButtonLink>
              <ButtonLink to="/bookings" variant="outline">
                My bookings
              </ButtonLink>
            </div>
          </motion.div>
        )}

        {booking && (status === 'expired' || status === 'cancelled') && (
          <div className="py-6">
            <h1 className="text-xl font-semibold text-ink">
              {status === 'expired' ? 'Your hold expired' : 'This booking was cancelled'}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              {status === 'expired'
                ? 'Payment was not completed in time, so the slot was released. If you were charged, the deposit will be refunded automatically.'
                : 'Any deposit paid will be refunded according to the cancellation rule.'}
            </p>
            <ButtonLink to={`/b/${booking.business.slug}/book`} className="mt-6">
              Book again
            </ButtonLink>
          </div>
        )}

        {booking && (status === 'completed' || status === 'no_show') && (
          <div className="py-6">
            <h1 className="text-xl font-semibold text-ink">This booking is {formatStatus(status)}</h1>
            <ButtonLink to={`/bookings/${booking.id}`} className="mt-6">
              View booking
            </ButtonLink>
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
