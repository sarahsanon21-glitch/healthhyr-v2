import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge, type BadgeVariant } from '../../src/components/ui/Badge';
import { Card } from '../../src/components/ui/Card';
import { expectAllowedTextPair } from '../helpers/contrast';
import { expectClassesGenerated } from '../helpers/tailwind';

describe('Badge', () => {
  it('defaults to a lime fill with ink text', () => {
    render(<Badge>New</Badge>);
    const badge = screen.getByText('New');
    expect(badge).toHaveClass('bg-lime', 'text-ink');
  });

  it.each<BadgeVariant>(['lime', 'neutral', 'primary', 'danger'])('uses an allowed color pair: %s', async (variant) => {
    render(<Badge variant={variant}>Label</Badge>);
    expectAllowedTextPair(screen.getByText('Label'));
    await expectClassesGenerated();
  });

  it('never uses lime as a text color', () => {
    render(
      <>
        <Badge variant="lime">a</Badge>
        <Badge variant="neutral">b</Badge>
        <Badge variant="primary">c</Badge>
        <Badge variant="danger">d</Badge>
      </>,
    );
    for (const text of ['a', 'b', 'c', 'd']) expect(screen.getByText(text).className).not.toMatch(/text-lime/);
  });

  it('is 12px text at the smallest', () => {
    render(<Badge>Small</Badge>);
    expect(screen.getByText('Small')).toHaveClass('text-xs');
  });

  it('passes through attributes', () => {
    render(<Badge aria-label="Status: Coming soon">Coming soon</Badge>);
    expect(screen.getByLabelText('Status: Coming soon')).toBeInTheDocument();
  });
});

describe('Card', () => {
  it('renders children in a surface card with padding', async () => {
    render(<Card data-testid="card">Content</Card>);
    const card = screen.getByTestId('card');
    expect(card).toHaveTextContent('Content');
    expect(card.tagName).toBe('DIV');
    expect(card).toHaveClass('bg-surface', 'border-line', 'shadow-card', 'p-6');
    await expectClassesGenerated();
  });

  it('can render as another element', () => {
    render(
      <>
        <ul>
          <Card as="li">Item</Card>
        </ul>
        <Card as="article" aria-label="Job">
          Body
        </Card>
      </>,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('Item');
    expect(screen.getByRole('article', { name: 'Job' })).toBeInTheDocument();
  });

  it('can drop its padding', () => {
    render(
      <Card padded={false} data-testid="card">
        x
      </Card>,
    );
    expect(screen.getByTestId('card')).not.toHaveClass('p-6');
  });
});
