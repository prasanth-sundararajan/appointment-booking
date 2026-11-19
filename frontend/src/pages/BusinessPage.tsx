import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BusinessAvatar } from '@/components/business/BusinessCard';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Skeleton } from '@/components/ui/Skeleton';
import { MeshBackground } from '@/components/layout/MeshBackground';
import { computeDeposit, refundRuleText } from '@/lib/deposit';
import { formatDuration, formatTimezone } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { CATEGORY_LABELS } from '@/lib/options';
import { initialsOf } from '@/lib/roles';
import { businessKeys, businessesService } from '@/services/businesses';
import type { ApiError, BusinessPublic } from '@/types';

function BusinessPageSkeleton() {
  return (
    <PageWrapper>
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading business</span>
        <div className="flex items-center gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card">
          <Skeleton className="h-20 w-20 rounded-2xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-64 max-w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-56 rounded-card" />
        </div>
      </div>
    </PageWrapper>
  );
}

export default function BusinessPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const query = useQuery<BusinessPublic, ApiError>({
    queryKey: businessKeys.bySlug(slug),
    queryFn: () => businessesService.getBySlug(slug),
    enabled: slug !== '',
  });

  if (query.isLoading) return <BusinessPageSkeleton />;
  if (query.isError) {
    return (
      <PageWrapper>
        {query.error.status === 404 ? (
          <EmptyState
            as="h1"
            icon="search"
            title="Business not found"
            description="This booking page doesn't exist or is no longer active."
            action={
              <ButtonLink to="/explore" variant="gradient">
                Explore other businesses
              </ButtonLink>
            }
          />
        ) : (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        )}
      </PageWrapper>
    );
  }
  const business = query.data;
  if (!business) return null;

  const services = business.services.filter((s) => s.is_active);
  const bookPath = (serviceId?: number) => `/b/${business.slug}/book${serviceId ? `?service_id=${serviceId}` : ''}`;
  const staffNamesFor = (serviceId: number) =>
    business.staff.filter((s) => s.service_ids.includes(serviceId)).map((s) => s.display_name);
  const location = [business.address, business.city].filter(Boolean).join(', ');
  const fromPrice = services.length > 0 ? Math.min(...services.map((s) => s.price_minor)) : null;

  return (
    <>
      <MeshBackground />
      <PageWrapper>
        <section className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 shadow-card sm:flex-row sm:items-center sm:p-8">
          <BusinessAvatar business={business} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-ink sm:text-3xl">{business.name}</h1>
              <Badge tone="brand">{CATEGORY_LABELS[business.category]}</Badge>
            </div>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-muted">
              {location && <span>{location}</span>}
              {business.phone && (
                <a href={`tel:${business.phone}`} className="link">
                  {business.phone}
                </a>
              )}
            </p>
            {business.description && <p className="mt-3 max-w-2xl text-slate-200">{business.description}</p>}
          </div>
          <div className="flex flex-col gap-1.5 sm:items-end">
            {services.length > 0 ? (
              <ButtonLink to={bookPath()} variant="gradient" size="lg">
                Book now
              </ButtonLink>
            ) : (
              <span className="text-sm text-ink-muted">Not taking bookings yet</span>
            )}
            {fromPrice !== null && (
              <span className="text-sm text-ink-muted">From {formatMoney(fromPrice, business.currency)}</span>
            )}
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2" aria-labelledby="services-heading">
            <h2 id="services-heading" className="mb-4 text-lg font-semibold text-ink">
              Services
            </h2>
            {services.length === 0 ? (
              <EmptyState
                icon="list"
                title="No services yet"
                description="This business hasn't published any services. Check back soon."
                action={
                  <ButtonLink to="/explore" variant="outline">
                    Explore other businesses
                  </ButtonLink>
                }
              />
            ) : (
              <AnimatedList as="ul" className="space-y-3">
                {services.map((service) => {
                  const deposit = computeDeposit(service.price_minor, business.deposit_percent);
                  const staffNames = staffNamesFor(service.id);
                  return (
                    <Card key={service.id} className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-ink">{service.name}</h3>
                        <p className="mt-0.5 text-sm text-ink-muted">
                          {formatDuration(service.duration_minutes)}
                          {staffNames.length > 0 && <> &middot; with {staffNames.join(', ')}</>}
                        </p>
                        {service.description && <p className="mt-1.5 text-sm text-slate-200">{service.description}</p>}
                      </div>
                      <div className="flex items-center justify-between gap-4 border-t border-line pt-3 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
                        <div className="sm:text-right">
                          <p className="text-lg font-semibold text-ink">{formatMoney(service.price_minor, business.currency)}</p>
                          <p className="text-xs text-ink-muted">{formatMoney(deposit, business.currency)} deposit to book</p>
                        </div>
                        <ButtonLink
                          to={bookPath(service.id)}
                          variant="secondary"
                          size="sm"
                          aria-label={`Book ${service.name}`}
                        >
                          Book
                        </ButtonLink>
                      </div>
                    </Card>
                  );
                })}
              </AnimatedList>
            )}
          </section>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardHeader title="Booking policy" />
              <ul className="space-y-2.5 text-sm text-slate-200">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />A{' '}
                  {business.deposit_percent}% deposit confirms your booking.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  {refundRuleText(business.cancellation_cutoff_hours)}
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  Later cancellations are not refunded. If the business cancels, you always get a full refund.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  Times are shown in {formatTimezone(business.timezone)}.
                </li>
              </ul>
            </Card>
            <Card>
              <CardHeader title="Team" />
              {business.staff.length === 0 ? (
                <p className="text-sm text-ink-muted">No team members listed yet.</p>
              ) : (
                <ul className="space-y-3">
                  {business.staff.map((member) => (
                    <li key={member.id} className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/20 text-sm font-semibold text-brand-200"
                      >
                        {initialsOf(member.display_name)}
                      </span>
                      <span className="text-sm font-medium text-ink">{member.display_name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {business.email && (
              <Card>
                <CardHeader title="Contact" />
                <a href={`mailto:${business.email}`} className="link break-all text-sm">
                  {business.email}
                </a>
              </Card>
            )}
          </aside>
        </div>
      </PageWrapper>
    </>
  );
}
