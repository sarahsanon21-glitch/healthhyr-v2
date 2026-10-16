'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from './cx';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './Icons';
import { IconButton } from './IconButton';

export type ToastVariant = 'info' | 'success' | 'danger';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before it goes away. 0 keeps it until dismissed. Errors stay by default. */
  duration?: number;
}

export interface ToastContextValue {
  /** Shows a toast and returns its id. */
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

interface ToastEntry {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

const DEFAULT_DURATION: Record<ToastVariant, number> = { info: 6000, success: 6000, danger: 0 };

const styles: Record<ToastVariant, { border: string; icon: string }> = {
  info: { border: 'border-muted', icon: 'text-muted' },
  success: { border: 'border-primary', icon: 'text-primary' },
  danger: { border: 'border-danger', icon: 'text-danger' },
};

const icons: Record<ToastVariant, typeof InfoIcon> = { info: InfoIcon, success: CheckIcon, danger: AlertIcon };

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

function ToastItem({ entry, onDismiss }: { entry: ToastEntry; onDismiss: (id: string) => void }) {
  const { id, title, description, variant, duration } = entry;
  const Icon = icons[variant];
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const hovered = useRef(false);
  const focused = useRef(false);

  const start = useCallback(() => {
    if (duration <= 0 || timer.current !== undefined) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => onDismiss(id), remaining.current);
  }, [duration, id, onDismiss]);

  const pause = useCallback(() => {
    if (timer.current === undefined) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    remaining.current -= Date.now() - startedAt.current;
  }, []);

  useEffect(() => {
    start();
    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, [start]);

  // The timer pauses while the pointer is over the toast or focus is inside it (WCAG 2.2.1).
  const settle = () => (hovered.current || focused.current ? pause() : start());

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    focused.current = false;
    settle();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') onDismiss(id);
  }

  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      onMouseEnter={() => {
        hovered.current = true;
        settle();
      }}
      onMouseLeave={() => {
        hovered.current = false;
        settle();
      }}
      onFocus={() => {
        focused.current = true;
        settle();
      }}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={cx(
        'pointer-events-auto flex w-full max-w-toast items-start gap-3 rounded-lg border-2 bg-surface p-4 shadow-raised',
        styles[variant].border,
      )}
    >
      <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', styles[variant].icon)} />
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-ink">{title}</p>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <IconButton label="Dismiss notification" size="sm" onClick={() => onDismiss(id)}>
        <CloseIcon className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

export function ToastProvider({ children, maxVisible = 4 }: { children: ReactNode; maxVisible?: number }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      const variant = options.variant ?? 'info';
      const entry: ToastEntry = {
        id,
        title: options.title,
        variant,
        duration: options.duration ?? DEFAULT_DURATION[variant],
        ...(options.description !== undefined && { description: options.description }),
      };
      setToasts((list) => [...list, entry].slice(-maxVisible));
      return id;
    },
    [maxVisible],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 left-4 right-4 z-50 flex flex-col items-end gap-2 sm:left-auto"
      >
        {toasts.map((entry) => (
          <ToastItem key={entry.id} entry={entry} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
