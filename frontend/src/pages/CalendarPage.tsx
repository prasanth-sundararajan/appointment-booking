import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { DayView } from '@/components/calendar/DayView';
import { WeekView } from '@/components/calendar/WeekView';
import { BookingDrawer } from '@/components/calendar/BookingDrawer';
import { useAuth } from '@/hooks/useAuth';
import { useBusinessSocket } from '@/hooks/useBusinessSocket';
import { cn } from '@/lib/cn';
import { formatTimezone } from '@/lib/format';
import { addDaysToKey, formatDateKey, startOfDayUtc, todayInTz, weekdayOfKey } from '@/lib/datetime';
import { toApiError } from '@/services/api';
import { businessesService, businessKeys } from '@/services/businesses';
import { bookingKeys, getBusinessBookings } from '@/services/bookings';
import type { BusinessBooking, BusinessBookingsQuery, ISODate } from '@/types';

type View = 'day' | 'week';

export default function CalendarPage() {
  const { id } = useParams<{ id: string }>();
  const businessId = Number(id);
  const { user } = useAuth();

  const slug =
    user?.owned_businesses.find((b) => b.id === businessId)?.slug ??
    user?.staff_memberships.find((m) => m.business_id === businessId)?.business_slug;

  const businessQuery = useQuery({
    queryKey: businessKeys.bySlug(slug ?? ''),
    queryFn: () => businessesService.getBySlug(slug ?? ''),
    enabled: Boolean(slug),
  });
  const business = businessQuery.data;
  const timezone = business?.timezone ?? 'UTC';
  const today = todayInTz(timezone);

  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<ISODate | null>(null);
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [selected, setSelected] = useState<BusinessBooking | null>(null);
  const current = anchor ?? today;

  useBusinessSocket(Number.isFinite(businessId) ? businessId : undefined, 'dashboard');

  const days = useMemo<ISODate[]>(() => {
    if (view === 'day') return [current];
    const monday = addDaysToKey(current, -weekdayOfKey(current));
    return Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i));
  }, [view, current]);

  const range: BusinessBookingsQuery = {
    from: startOfDayUtc(days[0], timezone),
    to: startOfDayUtc(addDaysToKey(days[days.length - 1], 1), timezone),
    staff_id: staffFilter ? Number(staffFilter) : undefined,
  };

  const bookingsQuery = useQuery({
    queryKey: bookingKeys.businessRange(businessId, range),
    queryFn: () => getBusinessBookings(businessId, range),
    enabled: business !== undefined,
  });
  const bookings = useMemo(
    () => (bookingsQuery.data ?? []).filter((b) => b.status !== 'expired'),
    [bookingsQuery.data],
  );

  // Keep the drawer in sync with live updates.
  const selectedLive = selected ? (bookings.find((b) => b.id === selected.id) ?? selected) : null;
  const closeDrawer = useCallback(() => setSelected(null), []);

  const step = view === 'day' ? 1 : 7;
  const title =
    view === 'day'
      ? formatDateKey(current, 'EEEE d MMMM yyyy')
      : `${formatDateKey(days[0], 'd MMM')} - ${formatDateKey(days[6], 'd MMM yyyy')}`;

  if (!slug) {
    return (
      <PageWrapper contained={false}>
        <EmptyState icon="lock" title="No access" description="You do not own or work at this business." />
      </PageWrapper>
    );
  }

  const staffOptions = [
    { value: '', label: 'All staff' },
    ...(business?.staff ?? []).map((s) => ({ value: String(s.id), label: s.display_name })),
  ];

  return (
    <PageWrapper
      title="Calendar"
      subtitle={business ? `Times in ${formatTimezone(timezone)}. Click a booking for details.` : undefined}
      contained={false}
      actions={
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
          Live
        </span>
      }
    >
      <div className="mb-6 flex flex-col gap-4 rounded-card border border-gray-200 bg-white p-3 shadow-card md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="w-9 px-0"
              onClick={() => setAnchor(addDaysToKey(current, -step))}
              aria-label={view === 'day' ? 'Previous day' : 'Previous week'}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M12.8 4.2a.75.75 0 010 1.06L8.06 10l4.74 4.74a.75.75 0 11-1.06 1.06l-5.27-5.27a.75.75 0 010-1.06l5.27-5.27a.75.75 0 011.06 0z" />
              </svg>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(null)} disabled={anchor === null || anchor === today}>
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-9 px-0"
              onClick={() => setAnchor(addDaysToKey(current, step))}
              aria-label={view === 'day' ? 'Next day' : 'Next week'}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M7.2 4.2a.75.75 0 011.06 0l5.27 5.27a.75.75 0 010 1.06L8.26 15.8a.75.75 0 11-1.06-1.06L11.94 10 7.2 5.26a.75.75 0 010-1.06z" />
              </svg>
            </Button>
          </div>
          <h2 className="ml-1 text-base font-semibold text-gray-900 sm:text-lg" aria-live="polite">
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label="Filter by staff"
            options={staffOptions}
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            containerClassName="w-full sm:w-44"
          />
          <div className="inline-flex rounded-xl bg-gray-100 p-1" role="group" aria-label="Calendar view">
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                  view === v ? 'bg-white text-brand-800 shadow-sm' : 'text-gray-700 hover:text-gray-900',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(businessQuery.isLoading || bookingsQuery.isLoading) && (
        <div role="status" aria-busy="true" className="rounded-card border border-gray-200 bg-white p-4">
          <span className="sr-only">Loading calendar</span>
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-10 w-12" />
                <Skeleton className="h-10 flex-1" />
              </div>
            ))}
          </div>
        </div>
      )}
      {businessQuery.isError && (
        <ErrorState message={toApiError(businessQuery.error).message} onRetry={() => void businessQuery.refetch()} />
      )}
      {bookingsQuery.isError && (
        <ErrorState message={toApiError(bookingsQuery.error).message} onRetry={() => void bookingsQuery.refetch()} />
      )}
      {business && bookingsQuery.isSuccess && bookings.length === 0 && (
        <p className="mb-4 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm text-gray-600">
          No bookings {view === 'day' ? 'on this day' : 'this week'}. Share your booking link from the sidebar to get some.
        </p>
      )}

      {business && bookingsQuery.isSuccess &&
        (view === 'day' ? (
          <DayView date={current} bookings={bookings} timezone={timezone} onSelect={setSelected} />
        ) : (
          <WeekView
            days={days}
            today={today}
            bookings={bookings}
            timezone={timezone}
            onSelect={setSelected}
            onSelectDay={(d) => {
              setAnchor(d);
              setView('day');
            }}
          />
        ))}

      <BookingDrawer
        booking={selectedLive}
        businessId={businessId}
        timezone={timezone}
        staff={business?.staff ?? []}
        onClose={closeDrawer}
      />
    </PageWrapper>
  );
}
