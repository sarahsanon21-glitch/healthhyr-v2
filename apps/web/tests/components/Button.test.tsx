import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, buttonClasses, type ButtonVariant } from '../../src/components/ui/Button';
import { expectAllowedTextPair } from '../helpers/contrast';
import { expectClassesGenerated } from '../helpers/tailwind';

const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive'];

describe('Button', () => {
  it('renders a button element that does not submit forms by default', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('can be a submit button', () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit');
  });

  it.each(variants)('uses an allowed color pair and only real classes: %s', async (variant) => {
    render(<Button variant={variant}>Label</Button>);
    const button = screen.getByRole('button');
    expectAllowedTextPair(button);
    await expectClassesGenerated();
  });

  it('uses Surface text on Primary and Danger fills, never lime text', () => {
    render(
      <>
        <Button variant="primary">A</Button>
        <Button variant="destructive">B</Button>
      </>,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('text-surface');
      expect(button.className).not.toMatch(/text-lime/);
    }
  });

  it('has three sizes, none with text under 12px', async () => {
    render(
      <>
        <Button size="sm">S</Button>
        <Button size="md">M</Button>
        <Button size="lg">L</Button>
      </>,
    );
    const [small, medium, large] = screen.getAllByRole('button');
    expect(small).toHaveClass('text-sm');
    expect(medium).toHaveClass('text-base');
    expect(large).toHaveClass('text-lg');
    await expectClassesGenerated();
  });

  it('never removes the keyboard focus outline', () => {
    for (const variant of variants) expect(buttonClasses({ variant })).not.toMatch(/outline-(none|hidden|0)/);
  });

  it('is reachable by keyboard and activates with Enter and Space', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Go' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('takes focus when clicked', async () => {
    const user = userEvent.setup();
    render(<Button>Focus me</Button>);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveFocus();
  });

  it('disabled: is disabled, skipped by Tab, and ignores clicks and keys', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <>
        <button>before</button>
        <Button disabled onClick={onClick}>
          Save
        </Button>
        <button>after</button>
      </>,
    );
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(save).toHaveClass('disabled:opacity-50', 'disabled:cursor-not-allowed');

    await user.tab();
    expect(screen.getByRole('button', { name: 'before' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();

    await user.click(save);
    expect(onClick).not.toHaveBeenCalled();
    await expectClassesGenerated();
  });

  it('passes through aria attributes and a ref', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} aria-describedby="help" aria-pressed="true">
        Toggle
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Toggle' });
    expect(button).toHaveAttribute('aria-describedby', 'help');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(ref.current).toBe(button);
  });

  it('buttonClasses styles a link like a button', () => {
    render(
      <a href="/post" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
        Post a job
      </a>,
    );
    const link = screen.getByRole('link', { name: 'Post a job' });
    expect(link).toHaveClass('border-primary', 'min-h-12');
  });
});
