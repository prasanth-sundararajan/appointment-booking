import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/EmptyState';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Badge, bookingStatusTone, formatStatus } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/hooks/useAuth';
import { useBusinessSocket } from '@/hooks/useBusinessSocket';
import { useDashboardBusiness } from '@/hooks/useMyBusinesses';
import { formatInTz } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';
import { catalogKeys, catalogService } from '@/services/catalog';
import { staffKeys, staffService } from '@/services/staff';
import { statsKeys, statsService } from '@/services/stats';
import type { ApiError, BusinessStats, Service, StaffMemberPublic } from '@/types';

interface BusinessOption {
  id: number;
  name: string;
  role: 'Owner' | 'Staff';
}

function StatCard({ label, value, hint, delay }: { label: string; value: string; hint?: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </motion.div>
  );
}

function TopServices({ stats }: { stats: BusinessStats }) {
  const max = Math.max(1, ...stats.top_services.map((s) => s.count));
  return (
    <Card hoverable={false}>
      <CardHeader title="Top services" subtitle="By number of bookings" />
      {stats.top_services.length === 0 ? (
        <p className="text-sm text-gray-500">No bookings yet.</p>
      ) : (
        <ul className="space-y-3">
          {stats.top_services.map((service) => (
            <li key={service.service_id}>
              <div className="flex justify-between text-sm">
                <span className="truncate font-medium text-gray-800">{service.name}</span>
                <span className="text-gray-500">{service.count}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-pink-500"
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

function BusinessOverview({ businessId }: { businessId: number }) {
  const { business, isOwner } = useDashboardBusiness(businessId);
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

  if (stats.isLoading) return <LoadingBlock label="Loading stats" />;
  if (stats.isError) return <ErrorState message={stats.error.message} onRetry={() => void stats.refetch()} />;
  const data = stats.data;
  if (!data) return null;

  const timezone = business?.timezone ?? 'UTC';
  const serviceName = (id: number) => services.data?.find((s) => s.id === id)?.name ?? 'Service';
  const staffName = (id: number) => staff.data?.find((s) => s.id === id)?.display_name ?? 'Staff';
  const today = [...data.today_bookings].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const base = `/dashboard/b/${businessId}`;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Today" value={String(today.length)} hint="bookings" delay={0} />
        <StatCard label="Upcoming" value={String(data.upcoming_count)} hint="confirmed" delay={0.05} />
        <StatCard label="This week" value={String(data.week_count)} hint="bookings" delay={0.1} />
        <StatCard
          label="Deposits collected"
          value={formatMoney(data.deposits_collected_minor, data.currency)}
          delay={0.15}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card hoverable={false} className="lg:col-span-2">
          <CardHeader
            title="Today's bookings"
            subtitle={`${formatInTz(new Date(), timezone, 'EEEE d MMMM')} · ${timezone.replace(/_/g, ' ')}`}
            action={
              <Link to={`${base}/calendar`} className="text-sm font-medium text-brand-600 hover:underline">
                Open calendar
              </Link>
            }
          />
          {today.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">Nothing booked for today yet.</p>
          ) : (
            <AnimatedList as="ul" className="divide-y divide-gray-100">
              {today.map((booking) => (
                <div key={booking.id} className="flex items-center gap-4 py-3">
                  <span className="w-14 shrink-0 text-sm font-semibold text-gray-900">
                    {formatInTz(booking.start_at, timezone, 'HH:mm')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{serviceName(booking.service_id)}</p>
                    <p className="truncate text-xs text-gray-500">
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
          <TopServices stats={data} />
          <Card hoverable={false}>
            <CardHeader title="Manage" />
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { to: 'calendar', label: 'Calendar', ownerOnly: false },
                { to: 'availability', label: 'Availability', ownerOnly: false },
                { to: 'services', label: 'Services', ownerOnly: true },
                { to: 'staff', label: 'Staff', ownerOnly: true },
                { to: 'payments', label: 'Payments', ownerOnly: true },
                { to: 'settings', label: 'Settings', ownerOnly: true },
              ]
                .filter((item) => isOwner || !item.ownerOnly)
                .map((item) => (
                  <motion.div key={item.to} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Link
                      to={`${base}/${item.to}`}
                      className="block rounded-xl bg-brand-50 px-3 py-2 text-center font-medium text-brand-700 hover:bg-brand-100"
                    >
                      {item.label}
                    </Link>
                  </motion.div>
                ))}
            </div>
            {business?.slug && (
              <p className="mt-4 break-all text-xs text-gray-500">
                Booking link:{' '}
                <Link to={`/b/${business.slug}`} className="text-brand-600 hover:underline">
                  {window.location.origin}/b/{business.slug}
                </Link>
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  if (!user) return <LoadingBlock />;

  const options: BusinessOption[] = [
    ...user.owned_businesses.map((b) => ({ id: b.id, name: b.name, role: 'Owner' as const })),
    ...user.staff_memberships
      .filter((m) => !user.owned_businesses.some((b) => b.id === m.business_id))
      .map((m) => ({ id: m.business_id, name: m.business_name, role: 'Staff' as const })),
  ];

  if (options.length === 0) {
    return (
      <PageWrapper title="Dashboard">
        <EmptyState
          title="No business yet"
          description="Create your business to get a public booking page, take deposits and manage staff."
          action={<GradientButton onClick={() => navigate('/dashboard/businesses/new')}>Create a business</GradientButton>}
        />
      </PageWrapper>
    );
  }

  const requested = Number(params.get('b'));
  const selected = options.find((o) => o.id === requested) ?? options[0];

  return (
    <PageWrapper
      title="Dashboard"
      subtitle={`${selected.name} · ${selected.role}`}
      actions={
        <>
          {options.length > 1 && (
            <Select
              aria-label="Business"
              containerClassName="w-60"
              options={options.map((o) => ({ value: String(o.id), label: `${o.name} (${o.role})` }))}
              value={String(selected.id)}
              onChange={(e) => setParams({ b: e.target.value }, { replace: true })}
            />
          )}
          {(user.role === 'owner' || user.owned_businesses.length > 0) && (
            <GradientButton size="sm" onClick={() => navigate('/dashboard/businesses/new')}>
              New business
            </GradientButton>
          )}
        </>
      }
    >
      <BusinessOverview key={selected.id} businessId={selected.id} />
    </PageWrapper>
  );
}
