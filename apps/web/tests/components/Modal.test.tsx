import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Modal } from '../../src/components/ui/Modal';
import { expectClassesGenerated } from '../helpers/tailwind';

function Harness({
  onClose = () => {},
  closeOnOverlayClick,
  focusReason = false,
}: {
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  focusReason?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const reasonRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <p>Page content behind the dialog</p>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title="Delete this job?"
        description="This cannot be undone."
        closeOnOverlayClick={closeOnOverlayClick}
        initialFocusRef={focusReason ? reasonRef : undefined}
        footer={
          <>
            <Button variant="secondary">Cancel</Button>
            <Button variant="destructive">Delete</Button>
          </>
        }
      >
        <Input aria-label="Reason" ref={reasonRef} />
      </Modal>
    </>
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open dialog' }));
  return screen.getByRole('dialog');
}

afterEach(() => {
  document.body.style.overflow = '';
});

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(<Modal open={false} onClose={() => {}} title="Hidden" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a modal dialog labelled by its title and described by its description', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await openDialog(user);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Delete this job?');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    expect(screen.getByRole('heading', { name: 'Delete this job?' })).toBeInTheDocument();
  });

  it('renders in a portal on document.body, outside the page container', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const dialog = await openDialog(user);
    expect(container).not.toContainElement(dialog);
    expect(document.body).toContainElement(dialog);
  });

  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await openDialog(user);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  });

  it('focuses a chosen element instead when initialFocusRef is given', async () => {
    const user = userEvent.setup();
    render(<Harness focusReason />);
    await openDialog(user);
    expect(screen.getByLabelText('Reason')).toHaveFocus();
  });

  it('keeps Tab inside the dialog: from the last element it wraps to the first', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await openDialog(user);

    // Order: Close, Reason, Cancel, Delete
    await user.tab();
    expect(screen.getByLabelText('Reason')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();

    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('keeps Shift+Tab inside the dialog: from the first element it wraps to the last', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await openDialog(user);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();

    for (let i = 0; i < 6; i += 1) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('closes on Escape and returns focus to the button that opened it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await openDialog(user);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open dialog' })).toHaveFocus();
  });

  it('closes on Escape from anywhere inside, including a form field', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await openDialog(user);
    await user.click(screen.getByLabelText('Reason'));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await openDialog(user);
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when the dark overlay is clicked, but not when the dialog itself is', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = await openDialog(user);

    await user.click(dialog);
    await user.click(screen.getByText('This cannot be undone.'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open on overlay click when closeOnOverlayClick is off', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} closeOnOverlayClick={false} />);
    const dialog = await openDialog(user);
    await user.click(dialog.parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('makes the rest of the page inert while open, and restores it on close', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    expect(container).not.toHaveAttribute('inert');

    await openDialog(user);
    expect(container).toHaveAttribute('inert');
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull();

    await user.keyboard('{Escape}');
    expect(container).not.toHaveAttribute('inert');
  });

  it('locks page scroll while open and restores it on close', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'scroll';
    render(<Harness />);
    await openDialog(user);
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('has three widths, defaulting to medium', async () => {
    const { rerender } = render(<Modal open onClose={() => {}} title="T" />);
    expect(screen.getByRole('dialog')).toHaveClass('max-w-modal-md');
    rerender(<Modal open onClose={() => {}} title="T" size="sm" />);
    expect(screen.getByRole('dialog')).toHaveClass('max-w-modal-sm');
    rerender(<Modal open onClose={() => {}} title="T" size="lg" />);
    expect(screen.getByRole('dialog')).toHaveClass('max-w-modal-lg');
    await expectClassesGenerated();
  });

  it('uses only real classes and never removes the focus outline', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openDialog(user);
    await expectClassesGenerated();
    expect(document.body.innerHTML).not.toMatch(/outline-(none|hidden|0)/);
  });
});
