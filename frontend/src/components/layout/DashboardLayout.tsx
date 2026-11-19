import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardBusiness } from '@/hooks/useMyBusinesses';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { BusinessAvatar } from '@/components/business/BusinessCard';

interface SidebarItem {
  to: string;
  label: string;
  ownerOnly: boolean;
  icon: string;
}

const ITEMS: SidebarItem[] = [
  { to: 'calendar', label: 'Calendar', ownerOnly: false, icon: 'M6 2v2H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2V2h-2v2H8V2H6zm-2 6h12v8H4V8z' },
  { to: 'services', label: 'Services', ownerOnly: true, icon: 'M3 4h14v2H3V4zm0 5h14v2H3V9zm0 5h9v2H3v-2z' },
  { to: 'staff', label: 'Staff', ownerOnly: true, icon: 'M7 8a3 3 0 100-6 3 3 0 000 6zm6 1a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1 16c0-3 3-5 6-5s6 2 6 5v1H1v-1zm13 1v-1c0-1.3-.4-2.5-1.1-3.4 2.4.2 5.1 1.5 5.1 4.4v0H14z' },
  { to: 'availability', label: 'Availability', ownerOnly: false, icon: 'M10 2a8 8 0 100 16 8 8 0 000-16zm.75 4v3.69l2.53 2.53-1.06 1.06-2.97-2.97V6h1.5z' },
  { to: 'payments', label: 'Payments', ownerOnly: true, icon: 'M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 1v2h12V6H4zm0 5v4h12v-4H4z' },
  { to: 'settings', label: 'Settings', ownerOnly: true, icon: 'M11.3 1l.5 2.2a7 7 0 011.6.9l2.1-.7 1.3 2.2-1.6 1.5a7 7 0 010 1.8l1.6 1.5-1.3 2.2-2.1-.7a7 7 0 01-1.6.9L11.3 15H8.7l-.5-2.2a7 7 0 01-1.6-.9l-2.1.7-1.3-2.2 1.6-1.5a7 7 0 010-1.8L3.2 5.6l1.3-2.2 2.1.7a7 7 0 011.6-.9L8.7 1h2.6zM10 6a2 2 0 100 4 2 2 0 000-4z' },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-brand-50 hover:text-brand-700',
  );

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d={path} />
    </svg>
  );
}

/** Sidebar shell for every /dashboard/b/:id/* page. */
export function DashboardLayout() {
  const { id } = useParams<{ id: string }>();
  const businessId = Number(id);
  const { isLoading: authLoading } = useAuth();
  const { business, isOwner, membership, isLoading, error, refetch } = useDashboardBusiness(businessId);

  if (!Number.isInteger(businessId) || businessId <= 0) {
    return <EmptyState className="m-8" title="Business not found" />;
  }
  if (authLoading || isLoading) return <LoadingBlock />;
  if (!isOwner && !membership) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <EmptyState
          title="No access"
          description="You don't own or work at this business."
          action={
            <Link to="/dashboard" className="text-sm font-medium text-brand-600 hover:underline">
              Back to dashboard
            </Link>
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

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:flex lg:gap-6 lg:px-8">
      <aside className="lg:sticky lg:top-20 lg:h-fit lg:w-60 lg:shrink-0">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <BusinessAvatar business={{ name, logo_url: business?.logo_url ?? null }} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{name}</p>
              <Badge tone={isOwner ? 'brand' : 'blue'}>{isOwner ? 'Owner' : 'Staff'}</Badge>
            </div>
          </div>
          <nav className="mt-4 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Business">
            <NavLink to={`/dashboard?b=${businessId}`} end className={() => linkClass({ isActive: false })}>
              <Icon path="M10 2l8 7h-2v8h-4v-5H8v5H4V9H2l8-7z" />
              Overview
            </NavLink>
            {items.map((item) => (
              <NavLink key={item.to} to={`/dashboard/b/${businessId}/${item.to}`} className={linkClass}>
                <Icon path={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          {business?.slug && (
            <a
              href={`/b/${business.slug}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 hidden text-xs font-medium text-brand-600 hover:underline lg:block"
            >
              View public page &rarr;
            </a>
          )}
        </motion.div>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
