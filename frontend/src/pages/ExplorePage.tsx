import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { CATEGORY_LABELS } from '@/lib/options';
import { BusinessCard } from '@/components/business/BusinessCard';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/EmptyState';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { businessKeys, businessesService } from '@/services/businesses';
import {
  BUSINESS_CATEGORIES,
  type ApiError,
  type Business,
  type BusinessCategory,
  type BusinessSearchParams,
  type Paginated,
} from '@/types';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function parseCategory(value: string | null): BusinessCategory | undefined {
  return BUSINESS_CATEGORIES.find((c) => c === value);
}

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const category = parseCategory(params.get('category'));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [city, setCity] = useState(params.get('city') ?? '');
  const debouncedQ = useDebounced(q, 300);
  const debouncedCity = useDebounced(city, 300);

  // Push debounced text filters into the URL (and reset to page 1 when they change).
  useEffect(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        const changed = (next.get('q') ?? '') !== debouncedQ || (next.get('city') ?? '') !== debouncedCity;
        if (debouncedQ) next.set('q', debouncedQ);
        else next.delete('q');
        if (debouncedCity) next.set('city', debouncedCity);
        else next.delete('city');
        if (changed) next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [debouncedQ, debouncedCity, setParams]);

  const search: BusinessSearchParams = {
    q: params.get('q') ?? undefined,
    city: params.get('city') ?? undefined,
    category,
    page,
  };

  const query = useQuery<Paginated<Business>, ApiError>({
    queryKey: businessKeys.search(search),
    queryFn: () => businessesService.search(search),
    placeholderData: keepPreviousData,
  });

  const update = (key: string, value: string | undefined) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    });
  };

  const data = query.data;
  const totalPages = data?.pages ?? 1;

  return (
    <PageWrapper title="Explore businesses" subtitle="Find a business and book a live slot in seconds.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          aria-label="Search businesses"
          placeholder="Search by name..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          leftIcon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path fillRule="evenodd" clipRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08-1.06 1.06-3.08-3.08A7 7 0 012 9z" />
            </svg>
          }
        />
        <Input aria-label="City" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Category">
        {[undefined, ...BUSINESS_CATEGORIES].map((value) => {
          const active = category === value;
          return (
            <motion.button
              key={value ?? 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => update('category', value)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-brand-50',
              )}
            >
              {value ? CATEGORY_LABELS[value] : 'All'}
            </motion.button>
          );
        })}
      </div>

      <section className="mt-8">
        {query.isLoading ? (
          <LoadingBlock label="Loading businesses" />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="No businesses found" description="Try a different search, city or category." />
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-500">
              {data.total} {data.total === 1 ? 'business' : 'businesses'}
            </p>
            <AnimatedList className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', query.isFetching && 'opacity-70')}>
              {data.items.map((business) => (
                <BusinessCard key={business.id} business={business} />
              ))}
            </AnimatedList>
            {totalPages > 1 && (
              <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update('page', String(page - 1))}>
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => update('page', String(page + 1))}
                >
                  Next
                </Button>
              </nav>
            )}
          </>
        )}
      </section>
    </PageWrapper>
  );
}
