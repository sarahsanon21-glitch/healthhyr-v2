import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, getInitials } from '../../src/components/ui/Avatar';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Pagination, getPageItems } from '../../src/components/ui/Pagination';
import { Skeleton, SkeletonText } from '../../src/components/ui/Skeleton';
import { Spinner } from '../../src/components/ui/Spinner';
import { SplitPane } from '../../src/components/ui/SplitPane';
import { expectAllowedTextPair } from '../helpers/contrast';
import { expectClassesGenerated } from '../helpers/tailwind';

describe('Spinner', () => {
  it('is a status region with an announced label', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('accepts a custom label and hides the drawing from assistive tech', () => {
    const { container } = render(<Spinner label="Loading jobs" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading jobs');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('stops spinning for people who prefer reduced motion, and has three sizes', async () => {
    const { container } = render(
      <>
        <Spinner size="sm" />
        <Spinner size="lg" />
      </>,
    );
    const [small, large] = [...container.querySelectorAll('svg')];
    expect(small).toHaveClass('animate-spin', 'motion-reduce:animate-none', 'h-4');
    expect(large).toHaveClass('h-10');
    await expectClassesGenerated();
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive tech', () => {
    const { container } = render(<Skeleton className="h-4 w-full" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('pulses, but not for people who prefer reduced motion', async () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveClass('animate-pulse', 'motion-reduce:animate-none');
    await expectClassesGenerated();
  });

  it('SkeletonText draws the requested lines with a shorter last line', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const lines = container.querySelectorAll('[aria-hidden="true"] > div');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveClass('w-full');
    expect(lines[2]).toHaveClass('w-2/3');
  });

  it('SkeletonText with one line is full width and hidden', () => {
    const { container } = render(<SkeletonText lines={1} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild?.firstElementChild).toHaveClass('w-full');
  });
});

describe('EmptyState', () => {
  it('shows a heading, description and action', () => {
    render(<EmptyState title="No jobs yet" description="Post your first job." action={<Button>Post a job</Button>} />);
    expect(screen.getByRole('heading', { level: 2, name: 'No jobs yet' })).toBeInTheDocument();
    expect(screen.getByText('Post your first job.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post a job' })).toBeInTheDocument();
  });

  it('uses the requested heading level', () => {
    render(<EmptyState title="Nothing here" headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
  });

  it('hides a decorative icon from assistive tech, and omits what is not given', async () => {
    const { container } = render(<EmptyState title="Empty" icon={<svg data-testid="icon" />} />);
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('p')).toBeNull();
    await expectClassesGenerated();
  });

  it('uses allowed text colors', () => {
    render(<EmptyState title="Empty" description="Nothing" />);
    expectAllowedTextPair(screen.getByRole('heading'), ['surface']);
    expectAllowedTextPair(screen.getByText('Nothing'), ['surface']);
  });
});

describe('Avatar', () => {
  it('derives initials', () => {
    expect(getInitials('Sam Rivera')).toBe('SR');
    expect(getInitials('sam')).toBe('S');
    expect(getInitials('  Ana  Maria  Lopez ')).toBe('AL');
    expect(getInitials('')).toBe('?');
  });

  it('shows initials on a lime fill with ink text, named for assistive tech', () => {
    render(<Avatar name="Sam Rivera" />);
    const avatar = screen.getByRole('img', { name: 'Sam Rivera' });
    expect(avatar).toHaveTextContent('SR');
    expect(avatar).toHaveClass('bg-lime', 'text-ink');
    expectAllowedTextPair(avatar);
  });

  it('shows the photo when there is one, with the name on the wrapper', () => {
    const { container } = render(<Avatar name="Sam Rivera" src="/sam.jpg" />);
    expect(screen.getByRole('img', { name: 'Sam Rivera' })).toBeInTheDocument();
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', '/sam.jpg');
    expect(image).toHaveAttribute('alt', '');
  });

  it('falls back to initials when the photo fails to load', () => {
    const { container } = render(<Avatar name="Sam Rivera" src="/missing.jpg" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Sam Rivera' })).toHaveTextContent('SR');
  });

  it('tries a new photo after a failed one', () => {
    const { container, rerender } = render(<Avatar name="Sam Rivera" src="/missing.jpg" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    rerender(<Avatar name="Sam Rivera" src="/new.jpg" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/new.jpg');
  });

  it('can be decorative when the name is shown next to it', () => {
    const { container } = render(<Avatar name="Sam Rivera" decorative />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('has three sizes, none with text under 12px', async () => {
    const { container } = render(
      <>
        <Avatar name="A B" size="sm" />
        <Avatar name="A B" />
        <Avatar name="A B" size="lg" />
      </>,
    );
    const [small, medium, large] = [...container.children];
    expect(small).toHaveClass('h-8', 'text-xs');
    expect(medium).toHaveClass('h-10', 'text-sm');
    expect(large).toHaveClass('h-16', 'text-xl');
    await expectClassesGenerated();
  });
});

describe('SplitPane', () => {
  it('renders the list and the detail as two named regions', () => {
    render(<SplitPane list={<p>Job list</p>} detail={<p>Job detail</p>} listLabel="Search results" detailLabel="Job details" />);
    expect(screen.getByRole('region', { name: 'Search results' })).toHaveTextContent('Job list');
    expect(screen.getByRole('region', { name: 'Job details' })).toHaveTextContent('Job detail');
  });

  it('uses two columns from the large breakpoint, list narrower than detail', async () => {
    const { container } = render(<SplitPane list="a" detail="b" listLabel="l" detailLabel="d" />);
    expect(container.firstElementChild).toHaveClass('grid', 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]');
    await expectClassesGenerated();
  });

  it('on small screens shows the list by default and hides the detail', () => {
    render(<SplitPane list="a" detail="b" listLabel="List" detailLabel="Detail" />);
    expect(screen.getByRole('region', { name: 'List', hidden: true })).not.toHaveClass('hidden');
    expect(screen.getByRole('region', { name: 'Detail', hidden: true })).toHaveClass('hidden', 'lg:block');
  });

  it('on small screens shows only the detail when showDetail is set', () => {
    render(<SplitPane list="a" detail="b" listLabel="List" detailLabel="Detail" showDetail />);
    expect(screen.getByRole('region', { name: 'List', hidden: true })).toHaveClass('hidden', 'lg:block');
    expect(screen.getByRole('region', { name: 'Detail', hidden: true })).not.toHaveClass('hidden');
  });

  it('keeps the detail in view while the list scrolls, on large screens', () => {
    render(<SplitPane list="a" detail="b" listLabel="List" detailLabel="Detail" showDetail />);
    expect(screen.getByRole('region', { name: 'Detail' })).toHaveClass('lg:sticky', 'lg:self-start');
  });
});

describe('getPageItems', () => {
  it('shows every page when there are few', () => {
    expect(getPageItems(1, 3)).toEqual([1, 2, 3]);
    expect(getPageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('collapses distant pages into ellipses', () => {
    expect(getPageItems(1, 10)).toEqual([1, 2, 'ellipsis', 10]);
    expect(getPageItems(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
    expect(getPageItems(10, 10)).toEqual([1, 'ellipsis', 9, 10]);
  });

  it('shows a single hidden page number instead of an ellipsis', () => {
    expect(getPageItems(4, 10)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 10]);
    expect(getPageItems(7, 10)).toEqual([1, 'ellipsis', 6, 7, 8, 9, 10]);
  });

  it('clamps an out-of-range page', () => {
    expect(getPageItems(99, 3)).toEqual([1, 2, 3]);
    expect(getPageItems(-4, 3)).toEqual([1, 2, 3]);
  });
});

describe('Pagination (buttons)', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is a labelled navigation with the current page marked', () => {
    render(<Pagination page={2} pageCount={5} label="Job results pages" onPageChange={() => {}} />);
    expect(screen.getByRole('navigation', { name: 'Job results pages' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 3' })).not.toHaveAttribute('aria-current');
  });

  it('names its previous and next controls, and hides ellipses from assistive tech', () => {
    const { container } = render(<Pagination page={5} pageCount={10} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
    expect(container.querySelectorAll('li[aria-hidden="true"]')).toHaveLength(2);
  });

  it('calls onPageChange for pages, previous and next, by click and by keyboard', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} pageCount={6} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: 'Page 4' }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);

    screen.getByRole('button', { name: 'Page 6' }).focus();
    await user.keyboard('{Enter}');
    expect(onPageChange).toHaveBeenLastCalledWith(6);
  });

  it('disables previous on the first page and next on the last', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(<Pagination page={1} pageCount={4} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onPageChange).not.toHaveBeenCalled();

    rerender(<Pagination page={4} pageCount={4} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('disabled controls are skipped by Tab', async () => {
    const user = userEvent.setup();
    render(<Pagination page={1} pageCount={3} onPageChange={() => {}} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveFocus();
  });

  it('marks the current page with a filled button, not just a color', async () => {
    render(<Pagination page={2} pageCount={4} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveClass('bg-primary', 'text-surface');
    expect(screen.getByRole('button', { name: 'Page 3' })).toHaveClass('text-primary');
    await expectClassesGenerated();
  });
});

describe('Pagination (links)', () => {
  const hrefFor = (page: number) => `/jobs?page=${page}`;

  it('renders real links that crawlers can follow', () => {
    render(<Pagination page={2} pageCount={4} hrefFor={hrefFor} />);
    expect(screen.getByRole('link', { name: 'Page 3' })).toHaveAttribute('href', '/jobs?page=3');
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '/jobs?page=1');
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/jobs?page=3');
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows disabled previous and next as non-link controls marked aria-disabled', () => {
    render(<Pagination page={1} pageCount={3} hrefFor={hrefFor} />);
    expect(screen.queryByRole('link', { name: 'Previous page' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Previous page')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Next page' })).toBeInTheDocument();
  });

  it('is reachable by keyboard and skips disabled controls', async () => {
    const user = userEvent.setup();
    render(<Pagination page={1} pageCount={3} hrefFor={hrefFor} />);
    await user.tab();
    expect(screen.getByRole('link', { name: 'Page 1' })).toHaveFocus();
  });

  it('uses only real classes', async () => {
    render(<Pagination page={5} pageCount={10} hrefFor={hrefFor} />);
    expect(document.body.innerHTML).not.toMatch(/outline-(none|hidden|0)/);
    await expectClassesGenerated();
  });
});
