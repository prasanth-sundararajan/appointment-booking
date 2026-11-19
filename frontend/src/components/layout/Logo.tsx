import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-sm',
        className,
      )}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-[1.125rem] w-[1.125rem]">
        <path d="M6 2a1 1 0 011 1v1h6V3a1 1 0 112 0v1h1a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h1V3a1 1 0 011-1zm7.7 7.3a1 1 0 00-1.4-1.4L9 11.18l-1.3-1.3a1 1 0 00-1.4 1.42l2 2a1 1 0 001.4 0l4-4z" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn('flex items-center gap-2 rounded-lg text-lg font-bold tracking-tight text-ink', className)}
      aria-label="SlotEase home"
    >
      <LogoMark />
      <span>SlotEase</span>
    </Link>
  );
}
