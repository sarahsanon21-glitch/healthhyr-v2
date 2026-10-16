import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CloseIcon } from '../../src/components/ui/Icons';
import { IconButton } from '../../src/components/ui/IconButton';
import { expectAllowedTextPair } from '../helpers/contrast';
import { expectClassesGenerated } from '../helpers/tailwind';

describe('IconButton', () => {
  it('is named by its label, and the icon is hidden from assistive tech', () => {
    const { container } = render(
      <IconButton label="Close dialog">
        <CloseIcon className="h-5 w-5" />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveAttribute('aria-label', 'Close dialog');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toHaveAttribute('focusable', 'false');
  });

  it('does not submit forms by default', () => {
    render(
      <IconButton label="Edit">
        <CloseIcon />
      </IconButton>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('is keyboard operable and takes focus', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton label="Delete" onClick={onClick}>
        <CloseIcon />
      </IconButton>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('disabled: is disabled, skipped by Tab, and ignores clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <>
        <button>before</button>
        <IconButton label="Delete" disabled onClick={onClick}>
          <CloseIcon />
        </IconButton>
        <button>after</button>
      </>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps a square 32, 40 or 48px target and allowed colors', async () => {
    render(
      <>
        <IconButton label="Small" size="sm" variant="primary">
          <CloseIcon />
        </IconButton>
        <IconButton label="Medium">
          <CloseIcon />
        </IconButton>
        <IconButton label="Large" size="lg" variant="destructive">
          <CloseIcon />
        </IconButton>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass('h-8', 'w-8');
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveClass('h-10', 'w-10');
    expect(screen.getByRole('button', { name: 'Large' })).toHaveClass('h-12', 'w-12');
    for (const button of screen.getAllByRole('button')) expectAllowedTextPair(button);
    await expectClassesGenerated();
  });
});
