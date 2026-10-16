import type { ComponentPropsWithRef, ReactNode } from 'react';
import { type ButtonSize, type ButtonVariant, variantClasses } from './Button';
import { cx } from './cx';

const squareSizes: Record<ButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
};

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'aria-label' | 'children'> {
  /** Accessible name. Required: an icon alone is not a name. */
  label: string;
  /** The icon. It should be decorative (aria-hidden). */
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function IconButton({
  label,
  children,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        squareSizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
