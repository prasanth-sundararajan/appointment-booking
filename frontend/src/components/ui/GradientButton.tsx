import { forwardRef } from 'react';
import { Button, type ButtonProps } from './Button';

export type GradientButtonProps = Omit<ButtonProps, 'variant'>;

/** Primary call-to-action. Same sizes, focus and loading behaviour as <Button>. */
export const GradientButton = forwardRef<HTMLButtonElement, GradientButtonProps>(function GradientButton(props, ref) {
  return <Button ref={ref} variant="gradient" {...props} />;
});
