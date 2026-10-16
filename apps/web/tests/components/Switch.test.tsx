import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from '../../src/components/ui/Switch';
import { expectClassesGenerated } from '../helpers/tailwind';

function Controlled({ initial = false, disabled = false }: { initial?: boolean; disabled?: boolean }) {
  const [checked, setChecked] = useState(initial);
  return (
    <Switch
      checked={checked}
      onCheckedChange={setChecked}
      label="Let employers find my profile"
      description="You can turn this off at any time."
      disabled={disabled}
    />
  );
}

describe('Switch', () => {
  it('is a switch named by its label and described by its description', () => {
    render(<Controlled />);
    const toggle = screen.getByRole('switch', { name: 'Let employers find my profile' });
    expect(toggle).toHaveAccessibleDescription('You can turn this off at any time.');
  });

  it('exposes its state with aria-checked and matching colors', () => {
    const { rerender } = render(<Switch checked={false} onCheckedChange={() => {}} label="Mode" />);
    const off = screen.getByRole('switch');
    expect(off).toHaveAttribute('aria-checked', 'false');
    expect(off).toHaveClass('bg-muted');

    rerender(<Switch checked onCheckedChange={() => {}} label="Mode" />);
    const on = screen.getByRole('switch');
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(on).toHaveClass('bg-primary');
  });

  it('asks for the opposite value when clicked', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const { rerender } = render(<Switch checked={false} onCheckedChange={onCheckedChange} label="Mode" />);
    await user.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);

    rerender(<Switch checked onCheckedChange={onCheckedChange} label="Mode" />);
    await user.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it('toggles from the keyboard with Space and Enter, and takes focus with Tab', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const toggle = screen.getByRole('switch');

    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles when the label text is clicked', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByText('Let employers find my profile'));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('does not change the page by itself: it is controlled', async () => {
    const user = userEvent.setup();
    render(<Switch checked={false} onCheckedChange={() => {}} label="Mode" />);
    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('disabled: is disabled, skipped by Tab, and cannot be toggled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <>
        <Switch checked={false} onCheckedChange={onCheckedChange} label="Mode" disabled />
        <button>after</button>
      </>,
    );
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveClass('disabled:opacity-50', 'disabled:cursor-not-allowed');
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
    await user.click(toggle);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('hides the thumb from assistive tech and moves it with the state', () => {
    const { container, rerender } = render(<Switch checked={false} onCheckedChange={() => {}} label="Mode" />);
    const thumb = container.querySelector('button span');
    expect(thumb).toHaveAttribute('aria-hidden', 'true');
    expect(thumb).toHaveClass('translate-x-1');

    rerender(<Switch checked onCheckedChange={() => {}} label="Mode" />);
    expect(container.querySelector('button span')).toHaveClass('translate-x-6');
  });

  it('never removes the focus outline, and uses only real classes in every state', async () => {
    const { rerender } = render(<Switch checked={false} onCheckedChange={() => {}} label="Mode" description="d" />);
    expect(screen.getByRole('switch').className).not.toMatch(/outline-(none|hidden|0)/);
    await expectClassesGenerated();
    rerender(<Switch checked onCheckedChange={() => {}} label="Mode" description="d" disabled />);
    await expectClassesGenerated();
  });
});
