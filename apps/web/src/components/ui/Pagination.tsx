'use client';

import type { ReactNode } from 'react';
import { Button, buttonClasses } from './Button';
import { cx } from './cx';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

export type PageItem = number | 'ellipsis';

/** The page numbers to show: first, last, and the current page with one neighbor each side. */
export function getPageItems(page: number, pageCount: number): PageItem[] {
  const current = Math.min(Math.max(page, 1), pageCount);
  const wanted = new Set([1, pageCount, current - 1, current, current + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  const items: PageItem[] = [];
  pages.forEach((n, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined) {
      if (n - previous === 2) items.push(previous + 1);
      else if (n - previous > 2) items.push('ellipsis');
    }
    items.push(n);
  });
  return items;
}

export interface PaginationProps {
  /** The current page, starting at 1. */
  page: number;
  pageCount: number;
  /** Names the navigation landmark. */
  label?: string;
  /** Renders buttons. Use this for in-page updates. */
  onPageChange?: (page: number) => void;
  /** Renders real links, which crawlers can follow. Takes priority over onPageChange. */
  hrefFor?: (page: number) => string;
  className?: string;
}

const disabledLink = 'cursor-not-allowed opacity-50';

export function Pagination({ page, pageCount, label = 'Pagination', onPageChange, hrefFor, className }: PaginationProps) {
  if (pageCount <= 1) return null;
  const current = Math.min(Math.max(page, 1), pageCount);

  function control(
    target: number,
    content: ReactNode,
    name: string,
    options: { isCurrent?: boolean; disabled?: boolean } = {},
  ) {
    const { isCurrent = false, disabled = false } = options;
    const variant = isCurrent ? 'primary' : 'ghost';
    const classes = buttonClasses({ variant, size: 'sm', className: 'min-w-8' });

    if (hrefFor) {
      if (disabled) {
        return (
          <span aria-disabled="true" aria-label={name} className={cx(classes, disabledLink)}>
            {content}
          </span>
        );
      }
      return (
        <a href={hrefFor(target)} aria-label={name} aria-current={isCurrent ? 'page' : undefined} className={classes}>
          {content}
        </a>
      );
    }

    return (
      <Button
        variant={variant}
        size="sm"
        className="min-w-8"
        aria-label={name}
        aria-current={isCurrent ? 'page' : undefined}
        disabled={disabled}
        onClick={() => onPageChange?.(target)}
      >
        {content}
      </Button>
    );
  }

  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap items-center gap-1">
        <li>{control(current - 1, <ChevronLeftIcon className="h-4 w-4" />, 'Previous page', { disabled: current === 1 })}</li>
        {getPageItems(current, pageCount).map((item, index) =>
          item === 'ellipsis' ? (
            <li key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-muted">
              …
            </li>
          ) : (
            <li key={item}>{control(item, item, `Page ${item}`, { isCurrent: item === current })}</li>
          ),
        )}
        <li>
          {control(current + 1, <ChevronRightIcon className="h-4 w-4" />, 'Next page', { disabled: current === pageCount })}
        </li>
      </ul>
    </nav>
  );
}
