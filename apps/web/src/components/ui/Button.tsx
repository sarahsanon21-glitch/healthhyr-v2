import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

// Focus is never removed here: the global :focus-visible outline in globals.css shows it.
const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-50';

export const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-surface hover:bg-ink',
  secondary: 'border-2 border-primary bg-surface text-primary hover:bg-paper',
  ghost: 'text-primary hover:bg-line',
  destructive: 'bg-danger text-surface hover:opacity-90',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 text-sm',
  md: 'min-h-10 px-4 text-base',
  lg: 'min-h-12 px-6 text-lg',
};

/** Button styles for other elements, such as a link that should look like a button. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string | undefined } = {}): string {
  return cx(base, variantClasses[variant], sizeClasses[size], className);
}

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}
