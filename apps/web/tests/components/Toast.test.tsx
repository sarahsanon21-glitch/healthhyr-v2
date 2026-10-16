import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type ToastOptions } from '../../src/components/ui/Toast';
import { expectClassesGenerated } from '../helpers/tailwind';

function Trigger({ options, label = 'Show toast' }: { options: ToastOptions; label?: string }) {
  const { toast } = useToast();
  return <button onClick={() => toast(options)}>{label}</button>;
}

const userWithTimers = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

function setup(options: ToastOptions, providerProps: { maxVisible?: number } = {}) {
  const user = userWithTimers();
  render(
    <ToastProvider {...providerProps}>
      <Trigger options={options} />
    </ToastProvider>,
  );
  return user;
}

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  // Testing Library only recognizes Jest's fake timers. This tells it how to advance Vitest's,
  // otherwise user-event waits forever. Scoped to this file.
  Object.assign(globalThis, { jest: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) } });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'jest');
});

describe('Toast', () => {
  it('shows a title and description in a labelled notifications region', async () => {
    const user = setup({ title: 'Job saved', description: 'It is live for 30 days.', variant: 'success' });
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(screen.getByRole('status')).toHaveTextContent('Job saved');
    expect(screen.getByRole('status')).toHaveTextContent('It is live for 30 days.');
  });

  it('announces info and success politely (status) and errors assertively (alert)', async () => {
    const user = userWithTimers();
    render(
      <ToastProvider>
        <Trigger options={{ title: 'Info one' }} label="info" />
        <Trigger options={{ title: 'Saved', variant: 'success' }} label="success" />
        <Trigger options={{ title: 'Failed', variant: 'danger' }} label="danger" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'info' }));
    await user.click(screen.getByRole('button', { name: 'success' }));
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'danger' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  });

  it('goes away by itself after the default time for info and success', async () => {
    const user = setup({ title: 'Saved', variant: 'success' });
    await user.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    advance(5999);
    expect(screen.getByRole('status')).toBeInTheDocument();
    advance(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps errors until they are dismissed', async () => {
    const user = setup({ title: 'Payment failed', variant: 'danger' });
    await user.click(screen.getByRole('button', { name: 'Show toast' }));
    advance(60_000);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('honors a custom duration, and duration 0 keeps it', async () => {
    const user = userWithTimers();
    render(
      <ToastProvider>
        <Trigger options={{ title: 'Short', duration: 1000 }} label="short" />
        <Trigger options={{ title: 'Sticky', duration: 0 }} label="sticky" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'short' }));
    await user.click(screen.getByRole('button', { name: 'sticky' }));
    advance(1000);
    expect(screen.queryByText('Short')).not.toBeInTheDocument();
    expect(screen.getByText('Sticky')).toBeInTheDocument();
  });

  it('can be dismissed with its labelled button', async () => {
    const user = setup({ title: 'Saved', variant: 'success' });
    await user.click(screen.getByRole('button', { name: 'Show toast' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('can be dismissed with Escape while it has focus', async () => {
    const user = setup({ title: 'Saved', variant: 'success', duration: 0 });
    await user.click(screen.getByRole('button', { name: 'Show toast' }));
    act(() => {
      screen.getByRole('button', { name: 'Dismiss notification' }).focus();
    });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('pauses while the pointer is over it, then finishes the remaining time', async () => {
    const user = setup({ title: 'Saved', variant: 'success' });
    await user.click(screen.getByRole('button', { name: 'Show toast' }));
    advance(4000);

    await user.hover(screen.getByRole('status'));
    advance(60_000);
    expect(screen.getByRole('status')).toBeInTheDocument();

    await user.unhover(screen.getByRole('status'));
    advance(1999);
    expect(screen.getByRole('status')).toBeInTheDocument();
    advance(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('pauses while focus is inside it, and resumes when focus leaves', async () => {
    const user = setup({ title: 'Saved', variant: 'success' });
    await user.click(screen.getByRole('button', { name: 'Show toast' }));

    act(() => {
      screen.getByRole('button', { name: 'Dismiss notification' }).focus();
    });
    advance(60_000);
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      screen.getByRole('button', { name: 'Show toast' }).focus();
    });
    advance(6000);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps only the newest toasts when there are too many', async () => {
    const user = userWithTimers();
    function Many() {
      const { toast } = useToast();
      return (
        <button
          onClick={() => {
            for (const n of [1, 2, 3]) toast({ title: `Toast ${n}`, duration: 0 });
          }}
        >
          many
        </button>
      );
    }
    render(
      <ToastProvider maxVisible={2}>
        <Many />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'many' }));
    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
    expect(screen.getByText('Toast 2')).toBeInTheDocument();
    expect(screen.getByText('Toast 3')).toBeInTheDocument();
  });

  it('useToast outside a provider throws a clear error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger options={{ title: 'x' }} />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });

  it('uses an icon for each variant, not just a color', async () => {
    const user = userWithTimers();
    render(
      <ToastProvider>
        <Trigger options={{ title: 'A', variant: 'info', duration: 0 }} label="a" />
        <Trigger options={{ title: 'B', variant: 'success', duration: 0 }} label="b" />
        <Trigger options={{ title: 'C', variant: 'danger', duration: 0 }} label="c" />
      </ToastProvider>,
    );
    for (const name of ['a', 'b', 'c']) await user.click(screen.getByRole('button', { name }));

    const region = screen.getByRole('region', { name: 'Notifications' });
    for (const toast of [...region.children]) {
      expect(toast.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.getByText('A').closest('[role]')).toHaveClass('border-muted');
    expect(screen.getByText('B').closest('[role]')).toHaveClass('border-primary');
    expect(screen.getByText('C').closest('[role]')).toHaveClass('border-danger');
  });

  it('uses only real classes and never removes the focus outline', async () => {
    const user = userWithTimers();
    render(
      <ToastProvider>
        <Trigger options={{ title: 'A', description: 'd', variant: 'info', duration: 0 }} label="a" />
        <Trigger options={{ title: 'B', variant: 'success', duration: 0 }} label="b" />
        <Trigger options={{ title: 'C', variant: 'danger', duration: 0 }} label="c" />
      </ToastProvider>,
    );
    for (const name of ['a', 'b', 'c']) await user.click(screen.getByRole('button', { name }));
    expect(document.body.innerHTML).not.toMatch(/outline-(none|hidden|0)/);

    // The Tailwind compiler is real async work, so it runs on real timers.
    vi.useRealTimers();
    await expectClassesGenerated();
  });
});
