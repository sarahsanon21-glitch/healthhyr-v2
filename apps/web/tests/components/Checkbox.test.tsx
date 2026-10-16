import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from '../../src/components/ui/Checkbox';
import { expectClassesGenerated } from '../helpers/tailwind';

describe('Checkbox', () => {
  it('is a checkbox named by its label', () => {
    render(<Checkbox label="Remember me" />);
    const checkbox = screen.getByRole('checkbox', { name: 'Remember me' });
    expect(checkbox).not.toBeChecked();
  });

  it('is reachable with Tab and toggles with the Space key', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Remember me" onChange={onChange} />);
    const checkbox = screen.getByRole('checkbox');

    await user.tab();
    expect(checkbox).toHaveFocus();
    await user.keyboard(' ');
    expect(checkbox).toBeChecked();
    await user.keyboard(' ');
    expect(checkbox).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('toggles by clicking the box or the label, and takes focus', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Remember me" />);
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveFocus();
    await user.click(screen.getByText('Remember me'));
    expect(checkbox).not.toBeChecked();
  });

  it('describes the checkbox with its description', () => {
    render(<Checkbox label="Easy Apply" description="Applicants use their saved profile." />);
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription('Applicants use their saved profile.');
  });

  it('error state: invalid, described by the error, announced with an icon and prefix', () => {
    const { container } = render(
      <Checkbox label="I agree" description="Required to continue." error="You must agree to continue." />,
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Error: You must agree to continue.');
    expect(checkbox).toHaveAccessibleDescription('Required to continue. Error: You must agree to continue.');
    expect(container.querySelector('[role="alert"] svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('without an error, is not marked invalid', () => {
    render(<Checkbox label="I agree" />);
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disabled: is disabled, skipped by Tab, keeps its state, and mutes the label', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Checkbox label="Locked" disabled defaultChecked />
        <button>after</button>
      </>,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Locked' });
    expect(checkbox).toBeDisabled();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(screen.getByText('Locked')).toHaveClass('text-muted');
  });

  it('works controlled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Controlled" checked={false} onChange={onChange} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('never removes the focus outline, and uses only real classes', async () => {
    render(<Checkbox label="x" description="y" error="z" />);
    expect(screen.getByRole('checkbox').className).not.toMatch(/outline-(none|hidden|0)/);
    await expectClassesGenerated();
  });
});
