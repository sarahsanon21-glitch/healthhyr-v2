import type { ComponentPropsWithRef } from 'react';
import { controlClasses } from './controls';
import { cx } from './cx';

export type InputProps = ComponentPropsWithRef<'input'>;

export function Input({ className, type = 'text', ...props }: InputProps) {
  return <input type={type} className={cx(controlClasses, className)} {...props} />;
}
