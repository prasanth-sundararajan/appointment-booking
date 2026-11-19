import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { OnboardingChecklist } from '@/components/dashboard/OnboardingChecklist';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Badge, bookingStatusTone, formatStatus } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Select } from '@/components/ui/Select';
import { PageSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useBusinessSocket } from '@/hooks/useBusinessSocket';
import { useDashboardBusiness } from '@/hooks/useMyBusinesses';
import { formatInTz } from '@/lib/datetime';
import { formatTimezone } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { buildOnboardingSteps, bookableStaff, onboardingProgress, readLinkShared, writeLinkShared } from '@/lib/onboarding';
import { canOwnBusiness } from '@/lib/roles';
import { publicBusinessUrl } from '@/lib/url';
import { availabilityKeys, availabilityService } from '@/services/availability';
import { catalogKeys, catalogService } from '@/services/catalog';
import { staffKeys, staffService } from '@/services/staff';
import { statsKeys, statsService } from '@/services/stats';
import type { ApiError, BusinessStats, Service, StaffMember, StaffMemberPublic } from '@/types';

interface BusinessOption {
  id: number;
  name: string;
  role: 'Owner' | 'Staff';
}

const MAX_HOURS_LOOKUPS = 10;

function StatCard({ label, value, hint, delay }: { label: string; value: string; hint?: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-card border border-gray-200 bg-white p-5 shadow-card"
    >
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-gray-900 sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-600">{hint}</p>}
    </motion.div>
  );
}

function StatsSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading stats</span>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-card border border-gray-200 bg-white p-5 shadow-card">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-3 h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-card lg:col-span-2" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    </div>
  );
}

function TopServices({ stats }: { stats: BusinessStats }) {
  const max = Math.max(1, ...stats.top_services.map((s) => s.count));
  return (
    <Card>
      <CardHeader title="Top services" subtitle="By number of bookings" />
      {stats.top_services.length === 0 ? (
        <p className="text-sm text-gray-600">No bookings yet. Your most popular services will show here.</p>
      ) : (
        <ul className="space-y-3">
          {stats.top_services.map((service) => (
            <li key={service.service_id}>
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate font-medium text-gray-800">{service.name}</span>
                <span className="tabular-nums text-gray-600">{service.count}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-brand-600 to-accent-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(service.count / max) * 100}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Owner-only setup checklist built from services, staff, hours and stats. */
function OwnerOnboarding({ businessId, slug, stats }: { businessId: number; slug: string | undefined; stats: BusinessStats | undefined }) {
  const [linkShared, setLinkShared] = useState(() => readLinkShared(businessId));
  const services = useQuery<Service[], ApiError>({
    queryKey: catalogKeys.allByBusiness(businessId),
    queryFn: () => catalogService.listAll(businessId),
  });
  const staff = useQuery<StaffMember[], ApiError>({
    queryKey: staffKeys.allByBusiness(businessId),
    queryFn: () => staffService.listAll(businessId),
  });
  const candidates = bookableStaff(staff.data ?? []).slice(0, MAX_HOURS_LOOKUPS);
  const hours = useQueries({
    queries: candidates.map((member) => ({
      queryKey: availabilityKeys.hours(member.id),
      queryFn: () => availabilityService.getHours(member.id),
    })),
  });

  if (services.isLoading || staff.isLoading || hours.some((h) => h.isLoading)) return null;
  if (services.isError || staff.isError) return null;

  const staffIdsWithHours = candidates.filter((_, i) => (hours[i]?.data?.length ?? 0) > 0).map((m) => m.id);
  const hasBookings = Boolean(
    stats &&
      (stats.today_bookings.length > 0 || stats.upcoming_count > 0 || stats.week_count > 0 || stats.deposits_collected_minor > 0),
  );
  const steps = buildOnboardingSteps({
    businessId,
    services: services.data ?? [],
    staff: staff.data ?? [],
    staffIdsWithHours,
    hasBookings,
    linkShared,
  });
  if (onboardingProgress(steps).complete) return null;

  return (
    <OnboardingChecklist
      steps={steps}
      publicUrl={slug ? publicBusinessUrl(slug) : null}
      onLinkCopied={() => {
        writeLinkShared(businessId);
        setLinkShared(true);
      }}
    />
  );
}

function BusinessOverview({ businessId }: { businessId: number }) {
  const { business, isOwner, membership } = useDashboardBusiness(businessId);
  // Live updates: booking.* events on the dashboard channel invalidate ['stats', id].
  useBusinessSocket(businessId, 'dashboard');

  const stats = useQuery<BusinessStats, ApiError>({
    queryKey: statsKeys.byBusiness(businessId),
    queryFn: () => statsService.get(businessId),
    refetchInterval: 60_000,
  });
  const services = useQuery<Service[], ApiError>({
    queryKey: catalogKeys.byBusiness(businessId),
    queryFn: () => catalogService.list(businessId),
  });
  const staff = useQuery<StaffMemberPublic[], ApiError>({
    queryKey: staffKeys.byBusiness(businessId),
    queryFn: () => staffService.list(businessId),
  });

  const slug = business?.slug ?? membership?.business_slug;
  const base = `/dashboard/b/${businessId}`;
  const timezone = business?.timezone ?? 'UTC';

  const onboarding = isOwner ? <OwnerOnboarding businessId={businessId} slug={slug} stats={stats.data} /> : null;

  if (stats.isLoading) {
    return (
      <>
        {onboarding}
        <StatsSkeleton />
      </>
    );
  }
  if (stats.isError) {
    return (
      <>
        {onboarding}
        <ErrorState message={stats.error.message} onRetry={() => void stats.refetch()} />
      </>
    );
  }
  const data = stats.data;
  if (!data) return null;

  const serviceName = (id: number) => services.data?.find((s) => s.id === id)?.name ?? 'Service';
  const staffName = (id: number) => staff.data?.find((s) => s.id === id)?.display_name ?? 'Staff';
  const today = [...data.today_bookings].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const manageItems = [
    { to: 'calendar', label: 'Calendar', ownerOnly: false },
    { to: 'availability', label: 'Availability', ownerOnly: false },
    { to: 'services', label: 'Services', ownerOnly: true },
    { to: 'staff', label: 'Staff', ownerOnly: true },
    { to: 'payments', label: 'Payments', ownerOnly: true },
    { to: 'settings', label: 'Settings', ownerOnly: true },
  ].filter((item) => isOwner || !item.ownerOnly);

  return (
    <>
      {onboarding}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Today" value={String(today.length)} hint={today.length === 1 ? 'booking' : 'bookings'} delay={0} />
        <StatCard label="Upcoming" value={String(data.upcoming_count)} hint="confirmed" delay={0.04} />
        <StatCard label="This week" value={String(data.week_count)} hint="bookings" delay={0.08} />
        <StatCard
          label="Deposits collected"
          value={formatMoney(data.deposits_collected_minor, data.currency)}
          hint="all time"
          delay={0.12}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Today's bookings"
            subtitle={`${formatInTz(new Date(), timezone, 'EEEE d MMMM')} · ${formatTimezone(timezone)}`}
            action={
              <ButtonLink to={`${base}/calendar`} variant="outline" size="sm">
                Open calendar
              </ButtonLink>
            }
          />
          {today.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center">
              <p className="font-medium text-gray-900">Nothing booked for today</p>
              <p className="mt-1 text-sm text-gray-600">
                {data.upcoming_count > 0
                  ? `You have ${data.upcoming_count} upcoming ${data.upcoming_count === 1 ? 'booking' : 'bookings'}.`
                  : 'Share your booking link to start filling your calendar.'}
              </p>
              {slug && data.upcoming_count === 0 && (
                <div className="mt-4 flex justify-center">
                  <CopyButton value={publicBusinessUrl(slug)} label="Copy booking link" />
                </div>
              )}
            </div>
          ) : (
            <AnimatedList as="ul" className="divide-y divide-gray-100">
              {today.map((booking) => (
                <div key={booking.id} className="flex items-center gap-4 py-3">
                  <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                    {formatInTz(booking.start_at, timezone, 'HH:mm')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{serviceName(booking.service_id)}</p>
                    <p className="truncate text-xs text-gray-600">
                      with {staffName(booking.staff_id)} &middot; until {formatInTz(booking.end_at, timezone, 'HH:mm')}
                    </p>
                  </div>
                  <Badge tone={bookingStatusTone[booking.status]}>{formatStatus(booking.status)}</Badge>
                </div>
              ))}
            </AnimatedList>
          )}
        </Card>
        <div className="space-y-6">
          {slug && (
            <Card>
              <CardHeader title="Your booking link" subtitle="Share it anywhere customers find you." />
              <p className="truncate rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700" title={publicBusinessUrl(slug)}>
                {publicBusinessUrl(slug).replace(/^https?:\/\//, '')}
              </p>
              <div className="mt-3 flex gap-2">
                <CopyButton
                  value={publicBusinessUrl(slug)}
                  className="flex-1"
                  onCopied={() => writeLinkShared(businessId)}
                />
                <ButtonLink to={`/b/${slug}`} target="_blank" rel="noreferrer" variant="ghost" size="sm">
                  Preview
                </ButtonLink>
              </div>
            </Card>
          )}
          <TopServices stats={data} />
          <Card>
            <CardHeader title="Manage" />
            <nav aria-label="Manage business" className="grid grid-cols-2 gap-2 text-sm">
              {manageItems.map((item) => (
                <Link
                  key={item.to}
                  to={`${base}/${item.to}`}
                  className="rounded-lg border border-gray-200 px-3 py-2.5 text-center font-medium text-gray-800 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  if (!user) {
    return (
      <PageWrapper>
        <PageSkeleton label="Loading dashboard" />
      </PageWrapper>
    );
  }

  const options: BusinessOption[] = [
    ...user.owned_businesses.map((b) => ({ id: b.id, name: b.name, role: 'Owner' as const })),
    ...user.staff_memberships
      .filter((m) => !user.owned_businesses.some((b) => b.id === m.business_id))
      .map((m) => ({ id: m.business_id, name: m.business_name, role: 'Staff' as const })),
  ];
  const owner = canOwnBusiness(user);

  if (options.length === 0) {
    return (
      <PageWrapper title="Dashboard">
        <EmptyState
          icon="calendar"
          title={owner ? 'Create your first business' : 'No business yet'}
          description={
            owner
              ? 'Get a public booking page, take deposits and manage staff. It takes about two minutes.'
              : 'Turn on business tools from your profile, then create your booking page.'
          }
          action={
            owner ? (
              <ButtonLink to="/dashboard/businesses/new" variant="gradient">
                Create a business
              </ButtonLink>
            ) : (
              <ButtonLink to="/profile" variant="gradient">
                Go to profile
              </ButtonLink>
            )
          }
        />
      </PageWrapper>
    );
  }

  const requested = Number(params.get('b'));
  const selected = options.find((o) => o.id === requested) ?? options[0];

  return (
    <PageWrapper
      title={selected.name}
      subtitle={selected.role === 'Owner' ? 'Overview of your business today.' : 'Your schedule at a glance.'}
      actions={
        <>
          {options.length > 1 && (
            <Select
              aria-label="Switch business"
              containerClassName="w-full sm:w-60"
              options={options.map((o) => ({ value: String(o.id), label: `${o.name} (${o.role})` }))}
              value={String(selected.id)}
              onChange={(e) => setParams({ b: e.target.value }, { replace: true })}
            />
          )}
          <ButtonLink to={`/dashboard/b/${selected.id}/calendar`} variant="outline">
            Open workspace
          </ButtonLink>
          {owner && (
            <ButtonLink to="/dashboard/businesses/new" variant="ghost">
              New business
            </ButtonLink>
          )}
        </>
      }
    >
      <BusinessOverview key={selected.id} businessId={selected.id} />
    </PageWrapper>
  );
}
