import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

export type EmptyIcon = 'info' | 'calendar' | 'search' | 'users' | 'list' | 'lock' | 'card';

const ICONS: Record<EmptyIcon, string> = {
  info: 'M10 2a8 8 0 100 16 8 8 0 000-16zm-.75 4h1.5v5h-1.5V6zm0 6.5h1.5V14h-1.5v-1.5z',
  calendar: 'M6 2v2H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2V2h-2v2H8V2H6zm-2 6h12v8H4V8z',
  search: 'M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08-1.06 1.06-3.08-3.08A7 7 0 012 9z',
  users:
    'M7 8a3 3 0 100-6 3 3 0 000 6zm6 1a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1 16c0-3 3-5 6-5s6 2 6 5v1H1v-1zm13 1v-1c0-1.3-.4-2.5-1.1-3.4 2.4.2 5.1 1.5 5.1 4.4H14z',
  list: 'M3 4h14v2H3V4zm0 5h14v2H3V9zm0 5h9v2H3v-2z',
  lock: 'M10 2a4 4 0 00-4 4v2H5a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1h-1V6a4 4 0 00-4-4zm-2 6V6a2 2 0 114 0v2H8z',
  card: 'M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 1v2h12V6H4zm0 5v4h12v-4H4z',
};

export function EmptyIconBadge({ icon = 'info', className }: { icon?: EmptyIcon; className?: string }) {
  return (
    <span className={cn('flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10 text-brand-300 ring-8 ring-brand-400/10', className)}>
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6" aria-hidden="true">
        <path fillRule="evenodd" clipRule="evenodd" d={ICONS[icon]} />
      </svg>
    </span>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: EmptyIcon;
  className?: string;
  /** Heading level for the title (default h2). */
  as?: 'h1' | 'h2' | 'h3';
}

export function EmptyState({ title, description, action, icon = 'info', className, as: Heading = 'h2' }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <EmptyIconBadge icon={icon} />
      <Heading className="mt-5 text-base font-semibold text-ink">{title}</Heading>
      {description && <p className="mt-1.5 max-w-md text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </motion.div>
  );
}

export function ErrorState({
  message,
  onRetry,
  title = 'Something went wrong',
  className,
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('rounded-card border border-red-500/30 bg-red-500/10 p-6 text-center', className)}>
      <p className="font-semibold text-red-200">{title}</p>
      <p className="mt-1 text-sm text-red-300">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <Spinner size="lg" label={label} />
    </div>
  );
}
