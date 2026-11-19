import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import type { ToastTone } from '@/context/ToastContext';
import { useToast } from '@/hooks/useToast';

export { ToastProvider } from '@/context/ToastContext';

const toneStyles: Record<ToastTone, { bar: string; icon: string }> = {
  success: { bar: 'bg-emerald-500', icon: 'text-emerald-600' },
  error: { bar: 'bg-red-500', icon: 'text-red-600' },
  info: { bar: 'bg-brand-500', icon: 'text-brand-600' },
  warning: { bar: 'bg-amber-500', icon: 'text-amber-600' },
};

const iconPath: Record<ToastTone, string> = {
  success: 'M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z',
  error: 'M10 2a8 8 0 100 16 8 8 0 000-16zm-1 4h2v5H9V6zm0 7h2v2H9v-2z',
  info: 'M10 2a8 8 0 100 16 8 8 0 000-16zm-1 4h2v2H9V6zm0 4h2v5H9v-5z',
  warning: 'M10 2l8.66 15H1.34L10 2zm-1 6v4h2V8H9zm0 6v2h2v-2H9z',
};

/** Renders active toasts. Mount once inside <ToastProvider>. */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-3 p-4 sm:items-end sm:p-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            role={t.tone === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="pointer-events-auto relative flex w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white shadow-pop"
          >
            <span className={cn('w-1 shrink-0', toneStyles[t.tone].bar)} aria-hidden="true" />
            <div className="flex flex-1 items-start gap-3 p-4">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className={cn('mt-0.5 h-5 w-5 shrink-0', toneStyles[t.tone].icon)}
                aria-hidden="true"
              >
                <path fillRule="evenodd" d={iconPath[t.tone]} clipRule="evenodd" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-gray-600">{t.description}</p>}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(t.id)}
                className="-m-1 rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
