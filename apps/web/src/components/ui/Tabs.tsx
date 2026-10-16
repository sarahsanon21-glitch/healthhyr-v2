'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import { useSafeId } from './ids';

export interface TabItem {
  id: string;
  label: ReactNode;
  panel: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Names the tab list for screen readers. */
  label: string;
  /** Controlled selection. Omit to let Tabs manage it. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  className?: string;
}

/**
 * The WAI-ARIA tabs pattern: arrow keys move between tabs (wrapping), Home and End jump to the
 * ends, only the selected tab is in the Tab order, and disabled tabs are skipped.
 */
export function Tabs({ tabs, label, value, defaultValue, onValueChange, className }: TabsProps) {
  const base = useSafeId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const firstEnabled = tabs.find((tab) => !tab.disabled)?.id ?? tabs[0]?.id;
  const [internal, setInternal] = useState(defaultValue ?? firstEnabled);
  const current = value ?? internal;

  function select(id: string) {
    setInternal(id);
    onValueChange?.(id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const enabled = tabs.filter((tab) => !tab.disabled);
    const index = enabled.findIndex((tab) => tab.id === id);
    let next: string | undefined;

    if (event.key === 'ArrowRight') next = enabled[(index + 1) % enabled.length]?.id;
    else if (event.key === 'ArrowLeft') next = enabled[(index - 1 + enabled.length) % enabled.length]?.id;
    else if (event.key === 'Home') next = enabled[0]?.id;
    else if (event.key === 'End') next = enabled[enabled.length - 1]?.id;
    else return;

    event.preventDefault();
    if (next === undefined) return;
    select(next);
    refs.current[next]?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map((tab) => {
          const selected = tab.id === current;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                refs.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => select(tab.id)}
              onKeyDown={(event) => onKeyDown(event, tab.id)}
              className={cx(
                'min-h-10 border-b-2 px-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50',
                selected ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          tabIndex={0}
          hidden={tab.id !== current}
          className="pt-4"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
