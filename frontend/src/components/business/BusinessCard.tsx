import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { CATEGORY_LABELS } from '@/lib/options';
import type { Business } from '@/types';

type AvatarSize = 'sm' | 'md' | 'lg';

const avatarSizes: Record<AvatarSize, string> = {
  sm: 'h-10 w-10 text-base rounded-lg',
  md: 'h-12 w-12 text-lg rounded-xl',
  lg: 'h-16 w-16 text-2xl rounded-2xl sm:h-20 sm:w-20 sm:text-3xl',
};

export function BusinessAvatar({
  business,
  size = 'md',
}: {
  business: Pick<Business, 'name' | 'logo_url'>;
  size?: AvatarSize;
}) {
  const cls = avatarSizes[size];
  if (business.logo_url) {
    return <img src={business.logo_url} alt="" className={cn(cls, 'shrink-0 object-cover ring-1 ring-gray-200')} />;
  }
  return (
    <span
      className={cn(
        cls,
        'flex shrink-0 items-center justify-center bg-gradient-to-br from-brand-600 to-accent-500 font-bold text-white',
      )}
      aria-hidden="true"
    >
      {business.name.charAt(0).toUpperCase()}
    </span>
  );
}

export function BusinessCard({ business }: { business: Business }) {
  return (
    <Link
      to={`/b/${business.slug}`}
      className="group flex h-full flex-col rounded-card border border-gray-200 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover"
    >
      <div className="flex items-start gap-4">
        <BusinessAvatar business={business} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-gray-900 group-hover:text-brand-700">{business.name}</h3>
          <p className="flex items-center gap-1 text-sm text-gray-600">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M10 2a6 6 0 00-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 00-6-6zm0 8a2 2 0 100-4 2 2 0 000 4z"
              />
            </svg>
            {business.city}
          </p>
        </div>
      </div>
      {business.description && <p className="mt-3 line-clamp-2 text-sm text-gray-600">{business.description}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">{CATEGORY_LABELS[business.category]}</Badge>
          <Badge tone="gray">{business.deposit_percent}% deposit</Badge>
        </div>
        <span className="text-sm font-semibold text-brand-700" aria-hidden="true">
          Book &rarr;
        </span>
      </div>
    </Link>
  );
}
