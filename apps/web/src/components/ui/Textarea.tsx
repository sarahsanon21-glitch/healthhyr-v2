import type { ComponentPropsWithRef } from 'react';
import { controlClasses } from './controls';
import { cx } from './cx';

export type TextareaProps = ComponentPropsWithRef<'textarea'>;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  return <textarea rows={rows} className={cx(controlClasses, 'min-h-24 resize-y py-2', className)} {...props} />;
}
