import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  /** Right-aligned detail, e.g. duration and price. */
  aside?: ReactNode;
  /** Render as a bordered, full-width selectable row. */
  card?: boolean;
  containerClassName?: string;
}

/**
 * Native checkbox with a visible label. The whole row is the click target and
 * the input keeps native keyboard (Space) and screen reader behaviour.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, aside, card = false, id, className, containerClassName, checked, disabled, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const labelId = `${inputId}-label`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const asideId = aside ? `${inputId}-aside` : undefined;
  const describedBy = [descriptionId, asideId].filter(Boolean).join(' ') || undefined;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'group flex items-start gap-3',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        card &&
          'rounded-control border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400 has-[:focus-visible]:ring-offset-1',
        card && (checked ? 'border-brand-500 bg-brand-500/15' : 'border-line bg-surface hover:border-white/25 hover:bg-white/5'),
        containerClassName,
      )}
    >
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        className={cn(
          'mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 cursor-pointer rounded border-white/30 text-brand-300 accent-brand-500',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2',
          card && 'focus-visible:ring-0 focus-visible:ring-offset-0',
          className,
        )}
        {...props}
      />
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-sm font-medium text-ink">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="mt-0.5 block text-sm text-ink-muted">
            {description}
          </span>
        )}
      </span>
      {aside && (
        <span id={asideId} className="shrink-0 text-right text-sm text-slate-200">
          {aside}
        </span>
      )}
    </label>
  );
});

export interface ToggleChipProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Filter chip with a checkmark when on. Uses aria-pressed so it reads as a toggle. */
export function ToggleChip({ pressed, onPressedChange, children, disabled, className }: ToggleChipProps) {
  return (
    <motion.button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        pressed
          ? 'border-transparent bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-lg shadow-brand-500/30'
          : 'border-line-strong bg-surface text-slate-200 hover:border-brand-400/50 hover:bg-brand-500/10 hover:text-brand-200',
        className,
      )}
    >
      {pressed && (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z"
          />
        </svg>
      )}
      {children}
    </motion.button>
  );
}
