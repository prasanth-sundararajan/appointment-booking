import { cn } from '@/lib/cn';

type SpinnerSize = 'sm' | 'md' | 'lg';

const sizes: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex text-brand-600', className)}>
      <span className={cn('animate-spin rounded-full border-current border-t-transparent', sizes[size])} />
    </span>
  );
}

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner size="lg" label={label} />
    </div>
  );
}
