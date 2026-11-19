import { forwardRef, useId, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface InputProps extends HTMLMotionProps<'input'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, id, className, containerClassName, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
            {leftIcon}
          </span>
        )}
        <motion.input
          ref={ref}
          id={inputId}
          whileFocus={{ scale: 1.01 }}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'w-full rounded-xl border-2 bg-white px-4 py-2.5 text-gray-900 outline-none transition-colors',
            'placeholder:text-gray-400 focus:border-brand-500',
            'disabled:cursor-not-allowed disabled:bg-gray-50',
            error ? 'border-red-500' : 'border-gray-200',
            leftIcon && 'pl-10',
            className,
          )}
          {...props}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${inputId}-hint`} className="mt-1 text-sm text-gray-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
});

/** Alias used by skills/FRONTEND.md. */
export const AnimatedInput = Input;
