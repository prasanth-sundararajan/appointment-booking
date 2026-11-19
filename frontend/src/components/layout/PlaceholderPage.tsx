import type { ReactNode } from 'react';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { GlassCard } from '@/components/ui/GlassCard';

interface PlaceholderPageProps {
  title: string;
  description: string;
  /** Planned components from the PRP. */
  components?: string[];
  children?: ReactNode;
}

/** Temporary scaffold used until each module's page is implemented. */
export function PlaceholderPage({ title, description, components = [], children }: PlaceholderPageProps) {
  return (
    <PageWrapper title={title} subtitle={description}>
      <GlassCard hoverable={false}>
        <p className="text-sm text-gray-600">This page is scaffolded and will be built in its module phase.</p>
        {components.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {components.map((name) => (
              <li key={name} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                {name}
              </li>
            ))}
          </ul>
        )}
        {children}
      </GlassCard>
    </PageWrapper>
  );
}
