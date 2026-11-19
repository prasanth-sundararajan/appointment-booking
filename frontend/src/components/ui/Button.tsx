import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { Link, type LinkProps } from 'react-router-dom';
import { Spinner } from './Spinner';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles';

export type { ButtonSize, ButtonVariant } from './buttonStyles';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  /** Accessible text announced while loading (default "Loading"). */
  loadingText?: string;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    loadingText = 'Loading',
    fullWidth = false,
    leftIcon,
    rightIcon,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  const isDisabled = disabled || isLoading;
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {isLoading ? <Spinner size="sm" className="text-current" label={loadingText} /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </motion.button>
  );
});

export interface ButtonLinkProps extends Omit<LinkProps, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
}

/** A router link styled as a button (never nest a <button> inside an <a>). */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = 'primary', size = 'md', fullWidth = false, leftIcon, rightIcon, className, children, ...props },
  ref,
) {
  return (
    <Link ref={ref} className={buttonClasses({ variant, size, fullWidth, className })} {...props}>
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  );
});
