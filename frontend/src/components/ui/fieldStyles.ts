import { cn } from '@/lib/cn';

/** Shared control look for Input, Textarea and Select. */
export function controlClasses(hasError: boolean, className?: string): string {
  return cn(
    'block w-full rounded-control border bg-white/5 px-3.5 py-2.5 text-sm text-ink shadow-sm transition-colors',
    'placeholder:text-slate-500 hover:border-white/25',
    'focus:outline-none focus:ring-2 focus-visible:ring-offset-0',
    'disabled:cursor-not-allowed disabled:border-line disabled:bg-white/[0.02] disabled:text-ink-subtle',
    hasError
      ? 'border-red-400/70 focus:border-red-400 focus:ring-red-400/30'
      : 'border-white/15 focus:border-brand-400 focus:ring-brand-400/40',
    className,
  );
}
