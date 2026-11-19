import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Shimmering placeholder block. Size it with className (h-*, w-*). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative block overflow-hidden rounded-md bg-white/10', className)}>
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </span>
  );
}

function SkeletonRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Stack of card-shaped rows (bookings, services, staff). */
export function ListSkeleton({
  rows = 3,
  label = 'Loading',
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <SkeletonRegion label={label} className={cn('space-y-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="hidden h-9 w-24 sm:block" />
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Grid of cards (directory, stats). */
export function CardGridSkeleton({
  count = 6,
  label = 'Loading',
  className = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
}: {
  count?: number;
  label?: string;
  className?: string;
}) {
  return (
    <SkeletonRegion label={label} className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-card border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Generic page body placeholder: title line plus content blocks. */
export function PageSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-card lg:col-span-2" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </SkeletonRegion>
  );
}
