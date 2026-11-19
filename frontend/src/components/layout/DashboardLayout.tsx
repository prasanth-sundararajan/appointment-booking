import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardBusiness } from '@/hooks/useMyBusinesses';
import { publicBusinessUrl } from '@/lib/url';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { BusinessAvatar } from '@/components/business/BusinessCard';

interface SidebarItem {
  to: string;
  label: string;
  ownerOnly: boolean;
  icon: string;
}

const ICON_OVERVIEW = 'M10 2l8 7h-2v8h-4v-5H8v5H4V9H2l8-7z';
const ICON_EXTERNAL =
  'M11 3a1 1 0 100 2h2.59l-6.3 6.3a1 1 0 101.42 1.4L15 6.42V9a1 1 0 102 0V4a1 1 0 00-1-1h-5zM5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z';

const ITEMS: SidebarItem[] = [
  { to: 'calendar', label: 'Calendar', ownerOnly: false, icon: 'M6 2v2H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2V2h-2v2H8V2H6zm-2 6h12v8H4V8z' },
  { to: 'services', label: 'Services', ownerOnly: true, icon: 'M3 4h14v2H3V4zm0 5h14v2H3V9zm0 5h9v2H3v-2z' },
  { to: 'staff', label: 'Staff', ownerOnly: true, icon: 'M7 8a3 3 0 100-6 3 3 0 000 6zm6 1a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1 16c0-3 3-5 6-5s6 2 6 5v1H1v-1zm13 1v-1c0-1.3-.4-2.5-1.1-3.4 2.4.2 5.1 1.5 5.1 4.4H14z' },
  { to: 'availability', label: 'Availability', ownerOnly: false, icon: 'M10 2a8 8 0 100 16 8 8 0 000-16zm.75 4v3.69l2.53 2.53-1.06 1.06-2.97-2.97V6h1.5z' },
  { to: 'payments', label: 'Payments', ownerOnly: true, icon: 'M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 1v2h12V6H4zm0 5v4h12v-4H4z' },
  { to: 'settings', label: 'Settings', ownerOnly: true, icon: 'M11.3 1l.5 2.2a7 7 0 011.6.9l2.1-.7 1.3 2.2-1.6 1.5a7 7 0 010 1.8l1.6 1.5-1.3 2.2-2.1-.7a7 7 0 01-1.6.9L11.3 15H8.7l-.5-2.2a7 7 0 01-1.6-.9l-2.1.7-1.3-2.2 1.6-1.5a7 7 0 010-1.8L3.2 5.6l1.3-2.2 2.1.7a7 7 0 011.6-.9L8.7 1h2.6zM10 6a2 2 0 100 4 2 2 0 000-4z' },
];

function Icon({ path, className = 'h-4 w-4' }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={cn('shrink-0', className)} aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d={path} />
    </svg>
  );
}

const sideLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-500/10 text-brand-200' : 'text-slate-200 hover:bg-white/10 hover:text-white',
  );

const tabLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors',
    isActive ? 'border-brand-400 text-brand-300' : 'border-transparent text-ink-muted hover:text-white',
  );

function LayoutSkeleton() {
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-page px-4 py-6 sm:px-6 lg:flex lg:gap-8 lg:px-8">
      <span className="sr-only">Loading business</span>
      <div className="hidden w-64 shrink-0 space-y-3 lg:block">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    </div>
  );
}

/** Shell for every /dashboard/b/:id/* page: sidebar on desktop, scrollable tabs on mobile. */
export function DashboardLayout() {
  const { id } = useParams<{ id: string }>();
  const businessId = Number(id);
  const { isLoading: authLoading } = useAuth();
  const { business, isOwner, membership, isLoading, error, refetch } = useDashboardBusiness(businessId);

  if (!Number.isInteger(businessId) || businessId <= 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <EmptyState
          title="Business not found"
          action={
            <ButtonLink to="/dashboard" variant="outline">
              Back to dashboard
            </ButtonLink>
          }
        />
      </div>
    );
  }
  if (authLoading || isLoading) return <LayoutSkeleton />;
  if (!isOwner && !membership) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <EmptyState
          icon="lock"
          title="No access"
          description="You don't own or work at this business."
          action={
            <ButtonLink to="/dashboard" variant="outline">
              Back to dashboard
            </ButtonLink>
          }
        />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <ErrorState message={error.message} onRetry={refetch} />
      </div>
    );
  }

  const items = ITEMS.filter((item) => isOwner || !item.ownerOnly);
  const name = business?.name ?? membership?.business_name ?? 'Business';
  const slug = business?.slug ?? membership?.business_slug;
  const base = `/dashboard/b/${businessId}`;

  return (
    <div className="mx-auto w-full max-w-page lg:flex lg:gap-8 lg:px-8 lg:py-8">
      {/* Mobile / tablet: business header, then sticky scrollable tabs */}
      <div className="bg-surface lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
          <BusinessAvatar business={{ name, logo_url: business?.logo_url ?? null }} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{name}</p>
            <Badge tone={isOwner ? 'brand' : 'blue'}>{isOwner ? 'Owner' : 'Staff'}</Badge>
          </div>
          {slug && <CopyButton value={publicBusinessUrl(slug)} label="Copy link" aria-label="Copy public booking link" />}
        </div>
      </div>
      <nav
        aria-label="Business sections"
        className="sticky top-16 z-30 flex gap-1 overflow-x-auto border-b border-line bg-navy-900/95 px-2 backdrop-blur [scrollbar-width:none] sm:px-4 lg:hidden"
      >
        <NavLink to={`/dashboard?b=${businessId}`} className={() => tabLinkClass({ isActive: false })}>
          <Icon path={ICON_OVERVIEW} />
          Overview
        </NavLink>
        {items.map((item) => (
          <NavLink key={item.to} to={`${base}/${item.to}`} className={tabLinkClass}>
            <Icon path={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block lg:w-64 lg:shrink-0">
        <div className="sticky top-24 space-y-4">
          <div className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center gap-3">
              <BusinessAvatar business={{ name, logo_url: business?.logo_url ?? null }} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink" title={name}>
                  {name}
                </p>
                <Badge tone={isOwner ? 'brand' : 'blue'}>{isOwner ? 'Owner' : 'Staff'}</Badge>
              </div>
            </div>
            {slug && (
              <div className="mt-4 space-y-2 border-t border-line pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Public booking page</p>
                <p className="truncate text-xs text-ink-muted" title={publicBusinessUrl(slug)}>
                  {publicBusinessUrl(slug).replace(/^https?:\/\//, '')}
                </p>
                <div className="flex gap-2">
                  <CopyButton value={publicBusinessUrl(slug)} className="flex-1" />
                  <Link
                    to={`/b/${slug}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open public page in a new tab"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-line-strong bg-surface text-slate-200 shadow-sm hover:bg-white/5"
                  >
                    <Icon path={ICON_EXTERNAL} />
                  </Link>
                </div>
              </div>
            )}
          </div>
          <nav aria-label="Business sections" className="rounded-card border border-line bg-surface p-2 shadow-card">
            <NavLink to={`/dashboard?b=${businessId}`} className={() => sideLinkClass({ isActive: false })}>
              <Icon path={ICON_OVERVIEW} />
              Overview
            </NavLink>
            {items.map((item) => (
              <NavLink key={item.to} to={`${base}/${item.to}`} className={sideLinkClass}>
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-brand-600" aria-hidden="true" />}
                    <Icon path={item.icon} />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-0 lg:py-0">
        <Outlet />
      </div>
    </div>
  );
}
