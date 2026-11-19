import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface PageWrapperProps {
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Small link rendered above the title, e.g. back to a list. */
  backTo?: { to: string; label: string };
  className?: string;
  /** Constrain width and add page padding (default true). Use false inside DashboardLayout. */
  contained?: boolean;
}

export function PageWrapper({ children, title, subtitle, actions, backTo, className, contained = true }: PageWrapperProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(contained && 'mx-auto w-full max-w-page px-4 py-8 sm:px-6 sm:py-10 lg:px-8', className)}
    >
      {backTo && (
        <Link
          to={backTo.to}
          className="mb-3 inline-flex items-center gap-1 rounded text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12.8 4.2a.75.75 0 010 1.06L8.06 10l4.74 4.74a.75.75 0 11-1.06 1.06l-5.27-5.27a.75.75 0 010-1.06l5.27-5.27a.75.75 0 011.06 0z"
            />
          </svg>
          {backTo.label}
        </Link>
      )}
      {(title || actions) && (
        <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {title && <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{title}</h1>}
            {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-gray-600 sm:text-base">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </header>
      )}
      {children}
    </motion.div>
  );
}
