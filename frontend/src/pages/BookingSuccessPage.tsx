import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
      <PageWrapper title="Booking not found">
        <p className="text-gray-600">We could not find the booking you just paid for.</p>
        <Link to="/bookings" className="mt-4 inline-block text-brand-700 underline">
          Go to my bookings
        </Link>
      </PageWrapper>
    );
  }

  const booking = query.data;
  const status = booking?.status;

  return (
    <PageWrapper contained className="mx-auto max-w-xl px-4 py-12">
      <Card hoverable={false} className="text-center">
        {query.isError && <p className="text-red-600">{toApiError(query.error).message}</p>}

        {(!booking || status === 'pending_payment') && !query.isError && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Spinner size="lg" label="Confirming payment" />
            <h1 className="text-xl font-semibold text-gray-900">
              {timedOut ? 'Still waiting for payment confirmation' : 'Confirming your payment...'}
            </h1>
            <p className="text-sm text-gray-500">
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
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-8 w-8" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
            </motion.div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">You are booked!</h1>
            <p className="mt-2 text-gray-600">
              {booking.service.name} at {booking.business.name} with {booking.staff.display_name}
            </p>
            <p className="mt-1 font-medium text-gray-900">
              {formatInTz(booking.start_at, booking.business.timezone, 'EEEE d MMMM yyyy, HH:mm')}
            </p>
            {booking.payment && (
              <p className="mt-2 text-sm text-gray-500">
                Deposit paid: {formatMoney(booking.payment.amount_minor, booking.payment.currency)}
              </p>
            )}
            <div className="mt-6 flex justify-center gap-3">
              <Link to={`/bookings/${booking.id}`}>
                <Button>View booking</Button>
              </Link>
              <Link to="/bookings">
                <Button variant="outline">My bookings</Button>
              </Link>
            </div>
          </motion.div>
        )}

        {booking && (status === 'expired' || status === 'cancelled') && (
          <div className="py-6">
            <h1 className="text-xl font-semibold text-gray-900">
              {status === 'expired' ? 'Your hold expired' : 'This booking was cancelled'}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {status === 'expired'
                ? 'Payment was not completed in time, so the slot was released. If you were charged, the deposit will be refunded automatically.'
                : 'Any deposit paid will be refunded according to the cancellation rule.'}
            </p>
            <Link to={`/b/${booking.business.slug}/book`} className="mt-6 inline-block">
              <Button>Book again</Button>
            </Link>
          </div>
        )}

        {booking && (status === 'completed' || status === 'no_show') && (
          <div className="py-6">
            <Link to={`/bookings/${booking.id}`}>
              <Button>View booking</Button>
            </Link>
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
