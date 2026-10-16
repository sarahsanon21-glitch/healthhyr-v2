import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs, type TabItem } from '../../src/components/ui/Tabs';
import { expectClassesGenerated } from '../helpers/tailwind';

const tabs: TabItem[] = [
  { id: 'overview', label: 'Overview', panel: <p>Overview content</p> },
  { id: 'jobs', label: 'Jobs', panel: <p>Jobs content</p> },
  { id: 'billing', label: 'Billing', panel: <p>Billing content</p>, disabled: true },
  { id: 'settings', label: 'Settings', panel: <p>Settings content</p> },
];

describe('Tabs', () => {
  it('is a labelled tab list with one selected tab and its panel visible', () => {
    render(<Tabs tabs={tabs} label="Account sections" />);
    expect(screen.getByRole('tablist', { name: 'Account sections' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(4);

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Jobs' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Overview content');
    expect(screen.queryByText('Jobs content')).not.toBeVisible();
  });

  it('connects each tab to its panel with aria-controls and aria-labelledby', () => {
    render(<Tabs tabs={tabs} label="Sections" />);
    const tab = screen.getByRole('tab', { name: 'Overview' });
    const panel = screen.getByRole('tabpanel');
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
    expect(panel).toHaveAccessibleName('Overview');
  });

  it('puts only the selected tab in the Tab order (roving tabindex)', () => {
    render(<Tabs tabs={tabs} label="Sections" />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Jobs' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('tabindex', '-1');
  });

  it('selects a tab on click', async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={tabs} label="Sections" />);
    await user.click(screen.getByRole('tab', { name: 'Jobs' }));
    expect(screen.getByRole('tab', { name: 'Jobs' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Jobs content');
  });

  it('moves with the arrow keys, skipping disabled tabs and wrapping around', async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={tabs} label="Sections" />);
    await user.tab();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Jobs' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Jobs' })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}'); // skips disabled Billing
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveFocus();

    await user.keyboard('{ArrowRight}'); // wraps to the first
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}'); // wraps to the last
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Settings content');
  });

  it('jumps to the first and last tab with Home and End', async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={tabs} label="Sections" defaultValue="jobs" />);
    await user.tab();
    expect(screen.getByRole('tab', { name: 'Jobs' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();
  });

  it('moves from the selected tab into its panel with Tab', async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={tabs} label="Sections" />);
    await user.tab();
    await user.tab();
    expect(screen.getByRole('tabpanel')).toHaveFocus();
  });

  it('disabled: cannot be clicked or reached, and keeps its state', async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={tabs} label="Sections" />);
    const billing = screen.getByRole('tab', { name: 'Billing' });
    expect(billing).toBeDisabled();
    await user.click(billing);
    expect(billing).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('starts on defaultValue', () => {
    render(<Tabs tabs={tabs} label="Sections" defaultValue="settings" />);
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Settings content');
  });

  it('reports changes, and works controlled', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function Controlled() {
      const [value, setValue] = useState('overview');
      return (
        <Tabs
          tabs={tabs}
          label="Sections"
          value={value}
          onValueChange={(id) => {
            onValueChange(id);
            setValue(id);
          }}
        />
      );
    }
    render(<Controlled />);
    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(onValueChange).toHaveBeenCalledWith('settings');
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a controlled value that the parent does not update stays put', async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={tabs} label="Sections" value="overview" onValueChange={() => {}} />);
    await user.click(screen.getByRole('tab', { name: 'Jobs' }));
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows selection with a border and a color, uses muted for others, and only real classes', async () => {
    render(<Tabs tabs={tabs} label="Sections" />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveClass('border-primary', 'text-primary');
    expect(screen.getByRole('tab', { name: 'Jobs' })).toHaveClass('text-muted');
    expect(document.body.innerHTML).not.toMatch(/outline-(none|hidden|0)/);
    await expectClassesGenerated();
  });
});
