import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { MeshBackground } from './MeshBackground';

const POINTS = [
  'Live availability, so slots never double-book',
  'Small deposits that cut no-shows',
  'Clear refund rules for every booking',
  'Two-way Google Calendar sync for businesses',
];

/** Two-column auth layout: form card plus a value panel on large screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <MeshBackground />
      <div className="mx-auto grid w-full max-w-page items-center gap-12 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-2 lg:px-8">
        <section className="hidden lg:block" aria-hidden="true">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-300">SlotEase</p>
          <p className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-ink">
            Booking that just works, for both sides of the counter.
          </p>
          <ul className="mt-8 space-y-4">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-slate-200">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z"
                    />
                  </svg>
                </span>
                {point}
              </li>
            ))}
          </ul>
        </section>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mx-auto w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl shadow-black/30 sm:p-8"
        >
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 border-t border-line pt-5 text-center text-sm text-ink-muted">{footer}</div>}
        </motion.div>
      </div>
    </>
  );
}
