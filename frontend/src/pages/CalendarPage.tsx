import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { DayView } from '@/components/calendar/DayView';
import { WeekView } from '@/components/calendar/WeekView';
import { BookingDrawer } from '@/components/calendar/BookingDrawer';
import { useAuth } from '@/hooks/useAuth';
import { useBusinessSocket } from '@/hooks/useBusinessSocket';
import { cn } from '@/lib/cn';
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
      <PageWrapper title="Calendar">
        <p className="text-gray-600">You do not have access to this business.</p>
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
      subtitle={business ? `${business.name} · times in ${timezone}` : undefined}
      actions={
        <span className="inline-flex items-center gap-2 text-xs text-emerald-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
          Live
        </span>
      }
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAnchor(addDaysToKey(current, -step))} aria-label="Previous">
            Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(null)}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(addDaysToKey(current, step))} aria-label="Next">
            Next
          </Button>
          <h2 className="ml-2 text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label="Filter by staff"
            options={staffOptions}
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            containerClassName="w-44"
          />
          <div className="inline-flex rounded-xl bg-gray-100 p-1" role="tablist" aria-label="Calendar view">
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium capitalize',
                  view === v ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-600',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(businessQuery.isLoading || bookingsQuery.isLoading) && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      )}
      {businessQuery.isError && <p className="text-red-600">{toApiError(businessQuery.error).message}</p>}
      {bookingsQuery.isError && <p className="text-red-600">{toApiError(bookingsQuery.error).message}</p>}

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
