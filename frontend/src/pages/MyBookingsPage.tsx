import { useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { ButtonLink } from '@/components/ui/Button';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
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

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.id === scope);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setScope(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <PageWrapper
      title="My bookings"
      subtitle="Manage, cancel or reschedule your appointments."
      actions={
        <ButtonLink to="/explore" variant="outline">
          Book something new
        </ButtonLink>
      }
    >
      <div
        role="tablist"
        aria-label="Booking scope"
        onKeyDown={onTabKey}
        className="mb-6 inline-flex rounded-xl bg-white/10 p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={scope === tab.id}
            aria-controls="bookings-panel"
            tabIndex={scope === tab.id ? 0 : -1}
            onClick={() => setScope(tab.id)}
            className={cn(
              'relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              scope === tab.id ? 'text-brand-200' : 'text-slate-200 hover:text-white',
            )}
          >
            {scope === tab.id && (
              <motion.span layoutId="bookings-tab" className="absolute inset-0 rounded-lg bg-brand-500/25 shadow-sm ring-1 ring-inset ring-brand-400/40" />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        ))}
      </div>

      <div id="bookings-panel" role="tabpanel" aria-labelledby={`tab-${scope}`}>
        {query.isLoading && <ListSkeleton rows={3} label="Loading bookings" />}
        {query.isError && (
          <ErrorState message={toApiError(query.error).message} onRetry={() => void query.refetch()} />
        )}
        {query.isSuccess && bookings.length === 0 && (
          <EmptyState
            icon="calendar"
            title={scope === 'upcoming' ? 'No upcoming bookings' : 'No past bookings yet'}
            description={
              scope === 'upcoming'
                ? 'Find a business, pick a live time, and it will show up here.'
                : 'Completed and cancelled appointments will appear here.'
            }
            action={
              <ButtonLink to="/explore" variant="gradient">
                Find a business
              </ButtonLink>
            }
          />
        )}
        {bookings.length > 0 && (
          <AnimatedList as="ul" className="space-y-3" key={scope}>
            {bookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </AnimatedList>
        )}
      </div>
    </PageWrapper>
  );
}
