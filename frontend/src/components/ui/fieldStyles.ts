import { cn } from '@/lib/cn';

/** Shared control look for Input, Textarea and Select. */
export function controlClasses(hasError: boolean, className?: string): string {
  return cn(
    'block w-full rounded-control border bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-colors',
    'placeholder:text-gray-400 hover:border-gray-400',
    'focus:outline-none focus:ring-2 focus-visible:ring-offset-0',
    'disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500',
    hasError
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/25'
      : 'border-gray-300 focus:border-brand-500 focus:ring-brand-500/25',
    className,
  );
}
