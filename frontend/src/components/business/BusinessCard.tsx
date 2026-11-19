import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/Badge';
import { CATEGORY_LABELS } from '@/lib/options';
import type { Business } from '@/types';

export function BusinessAvatar({ business, size = 'md' }: { business: Pick<Business, 'name' | 'logo_url'>; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-16 w-16 text-2xl' : 'h-12 w-12 text-lg';
  if (business.logo_url) {
    return <img src={business.logo_url} alt="" className={`${cls} shrink-0 rounded-xl object-cover`} />;
  }
  return (
    <span
      className={`${cls} flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-pink-500 font-bold text-white`}
      aria-hidden="true"
    >
      {business.name.charAt(0).toUpperCase()}
    </span>
  );
}

export function BusinessCard({ business }: { business: Business }) {
  return (
    <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.99 }} className="h-full">
      <Link
        to={`/b/${business.slug}`}
        className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-lg hover:shadow-brand-900/5"
      >
        <div className="flex items-start gap-4">
          <BusinessAvatar business={business} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-gray-900">{business.name}</h3>
            <p className="text-sm text-gray-500">{business.city}</p>
          </div>
        </div>
        {business.description && <p className="mt-3 line-clamp-2 text-sm text-gray-600">{business.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <Badge tone="brand">{CATEGORY_LABELS[business.category]}</Badge>
          <Badge tone="gray">{business.deposit_percent}% deposit</Badge>
        </div>
      </Link>
    </motion.div>
  );
}
