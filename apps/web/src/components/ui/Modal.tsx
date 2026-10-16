'use client';

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { useSafeId } from './ids';
import { CloseIcon } from './Icons';
import { IconButton } from './IconButton';

export type ModalSize = 'sm' | 'md' | 'lg';

const sizes: Record<ModalSize, string> = {
  sm: 'max-w-modal-sm',
  md: 'max-w-modal-md',
  lg: 'max-w-modal-lg',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  /** Called on Escape, the close button, and a click outside (unless turned off). The parent closes it. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons at the bottom, such as Cancel and Confirm. */
  footer?: ReactNode;
  size?: ModalSize;
  closeOnOverlayClick?: boolean;
  /** Where focus lands when the modal opens. Defaults to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const subscribe = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

function ModalDialog({
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  initialFocusRef,
}: Omit<ModalProps, 'open'>) {
  const base = useSafeId();
  const titleId = `${base}-title`;
  const descriptionId = description ? `${base}-description` : undefined;
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Runs once per open. initialFocusRef is only read at that moment.
  useEffect(() => {
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Everything behind the dialog becomes inert: not focusable, not readable by screen readers.
    const madeInert: Element[] = [];
    for (const child of document.body.children) {
      if (child !== overlay && !child.hasAttribute('inert')) {
        child.setAttribute('inert', '');
        madeInert.push(child);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    (initialFocusRef?.current ?? focusableIn(dialog)[0] ?? dialog).focus();

    return () => {
      for (const element of madeInert) element.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const items = focusableIn(dialog);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (!dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  function onOverlayMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (closeOnOverlayClick && event.target === event.currentTarget) onClose();
  }

  return (
    <div
      ref={overlayRef}
      onKeyDown={onKeyDown}
      onMouseDown={onOverlayMouseDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={cx('flex max-h-full w-full flex-col rounded-lg bg-surface shadow-raised', sizes[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="font-heading text-xl font-bold text-ink">
            {title}
          </h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="overflow-y-auto p-6">
          {description && (
            <p id={descriptionId} className="mb-4 text-base text-muted">
              {description}
            </p>
          )}
          {children}
        </div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-line p-6">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * An accessible modal dialog. It moves focus in, keeps Tab and Shift+Tab inside, closes on Escape,
 * makes the rest of the page inert, locks page scroll, and returns focus to what opened it.
 */
export function Modal({ open, ...props }: ModalProps) {
  const isClient = useIsClient();
  if (!open || !isClient) return null;
  return createPortal(<ModalDialog {...props} />, document.body);
}
