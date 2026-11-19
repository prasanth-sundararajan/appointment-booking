import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BusinessAvatar } from '@/components/business/BusinessCard';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/EmptyState';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { MeshBackground } from '@/components/layout/MeshBackground';
import { computeDeposit, refundRuleText } from '@/lib/deposit';
import { formatMoney } from '@/lib/money';
import { CATEGORY_LABELS } from '@/lib/options';
import { businessKeys, businessesService } from '@/services/businesses';
import type { ApiError, BusinessPublic } from '@/types';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m} min`;
}

export default function BusinessPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const query = useQuery<BusinessPublic, ApiError>({
    queryKey: businessKeys.bySlug(slug),
    queryFn: () => businessesService.getBySlug(slug),
    enabled: slug !== '',
  });

  if (query.isLoading) return <LoadingBlock label="Loading business" />;
  if (query.isError) {
    return (
      <PageWrapper>
        {query.error.status === 404 ? (
          <EmptyState title="Business not found" description="This booking page doesn't exist or is no longer active." />
        ) : (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        )}
      </PageWrapper>
    );
  }
  const business = query.data;
  if (!business) return null;

  const services = business.services.filter((s) => s.is_active);
  const book = (serviceId?: number) =>
    navigate(`/b/${business.slug}/book${serviceId ? `?service_id=${serviceId}` : ''}`);
  const staffNamesFor = (serviceId: number) =>
    business.staff.filter((s) => s.service_ids.includes(serviceId)).map((s) => s.display_name);

  return (
    <>
      <MeshBackground />
      <PageWrapper>
        <GlassCard hoverable={false} className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <BusinessAvatar business={business} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{business.name}</h1>
              <Badge tone="brand">{CATEGORY_LABELS[business.category]}</Badge>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {[business.address, business.city].filter(Boolean).join(', ')}
              {business.phone && <> &middot; {business.phone}</>}
            </p>
            {business.description && <p className="mt-3 text-gray-700">{business.description}</p>}
          </div>
          <GradientButton size="lg" onClick={() => book()} disabled={services.length === 0}>
            Book now
          </GradientButton>
        </GlassCard>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Services</h2>
            {services.length === 0 ? (
              <EmptyState title="No services yet" description="This business hasn't published any services." />
            ) : (
              <AnimatedList className="space-y-3">
                {services.map((service) => {
                  const deposit = computeDeposit(service.price_minor, business.deposit_percent);
                  const staffNames = staffNamesFor(service.id);
                  return (
                    <Card key={service.id} className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900">{service.name}</h3>
                        <p className="text-sm text-gray-500">
                          {formatDuration(service.duration_minutes)}
                          {staffNames.length > 0 && <> &middot; with {staffNames.join(', ')}</>}
                        </p>
                        {service.description && <p className="mt-1 text-sm text-gray-600">{service.description}</p>}
                      </div>
                      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{formatMoney(service.price_minor, business.currency)}</p>
                          <p className="text-xs text-brand-700">
                            {business.deposit_percent}% deposit ({formatMoney(deposit, business.currency)}) to book
                          </p>
                        </div>
                        <motion.button
                          type="button"
                          onClick={() => book(service.id)}
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                          className="rounded-full bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
                        >
                          Book
                        </motion.button>
                      </div>
                    </Card>
                  );
                })}
              </AnimatedList>
            )}
          </section>

          <aside className="space-y-6">
            <Card hoverable={false}>
              <CardHeader title="Team" />
              {business.staff.length === 0 ? (
                <p className="text-sm text-gray-500">No team members listed.</p>
              ) : (
                <ul className="space-y-3">
                  {business.staff.map((member) => (
                    <li key={member.id} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                        {member.display_name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{member.display_name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card hoverable={false}>
              <CardHeader title="Booking policy" />
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
                <li>A {business.deposit_percent}% deposit is required to confirm your booking.</li>
                <li>{refundRuleText(business.cancellation_cutoff_hours)}</li>
                <li>Later cancellations are not refunded. If the business cancels, you always get a full refund.</li>
                <li>Times are shown in {business.timezone.replace(/_/g, ' ')}.</li>
              </ul>
            </Card>
          </aside>
        </div>
      </PageWrapper>
    </>
  );
}
