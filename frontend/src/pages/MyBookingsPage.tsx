import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { BookingCard } from '@/components/booking/BookingCard';
import { cn } from '@/lib/cn';
import { toApiError } from '@/services/api';
import { bookingKeys, getMyBookings } from '@/services/bookings';
import type { BookingScope } from '@/types';

const TABS: { id: BookingScope; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
];

export default function MyBookingsPage() {
  const [scope, setScope] = useState<BookingScope>('upcoming');
  const query = useQuery({
    queryKey: bookingKeys.mine(scope),
    queryFn: () => getMyBookings(scope),
  });
  const bookings = query.data ?? [];

  return (
    <PageWrapper title="My bookings" subtitle="Manage, cancel or reschedule your appointments.">
      <div role="tablist" aria-label="Booking scope" className="mb-6 inline-flex rounded-xl bg-gray-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={scope === tab.id}
            onClick={() => setScope(tab.id)}
            className={cn(
              'relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              scope === tab.id ? 'text-brand-700' : 'text-gray-600 hover:text-gray-900',
            )}
          >
            {scope === tab.id && (
              <motion.span layoutId="bookings-tab" className="absolute inset-0 rounded-lg bg-white shadow-sm" />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        ))}
      </div>

      {query.isLoading && <FullPageSpinner />}
      {query.isError && <p className="text-red-600">{toApiError(query.error).message}</p>}
      {query.isSuccess && bookings.length === 0 && (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <p className="text-gray-600">
            {scope === 'upcoming' ? 'You have no upcoming bookings.' : 'No past bookings yet.'}
          </p>
          <Link to="/explore" className="mt-3 inline-block font-medium text-brand-700 hover:underline">
            Find a business
          </Link>
        </div>
      )}
      {bookings.length > 0 && (
        <AnimatedList className="space-y-3" key={scope}>
          {bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </AnimatedList>
      )}
    </PageWrapper>
  );
}
