import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const sizes: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
}

/**
 * Accessible dialog: labelled by its title, traps Tab focus, closes on Escape,
 * returns focus to the opener, and becomes a bottom sheet on small screens.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const first = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).find(
        (el) => el.getAttribute('aria-label') !== 'Close',
      );
      (first ?? panel).focus();
    };
    const frame = requestAnimationFrame(focusFirst);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('overflow-hidden');
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('overflow-hidden');
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-gray-950/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 32 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className={cn(
              'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-pop focus:outline-none sm:rounded-2xl',
              sizes[size],
            )}
          >
            <div className="flex items-start gap-4 border-b border-gray-100 px-5 pb-4 pt-5 sm:px-6">
              <div className="min-w-0 flex-1">
                {title && (
                  <h2 id={titleId} className="text-lg font-semibold text-gray-900">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descriptionId} className="mt-1 text-sm text-gray-600">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="-mr-1 -mt-1 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            {children && <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>}
            {footer && (
              <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:rounded-b-2xl sm:px-6">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Footer row for forms rendered inside a Modal body. */
export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 -mb-5 mt-6 flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-4 sm:-mx-6 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
      {children}
    </div>
  );
}
