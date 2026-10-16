import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Field } from '../../src/components/ui/Field';
import { Input } from '../../src/components/ui/Input';
import { Select } from '../../src/components/ui/Select';
import { Textarea } from '../../src/components/ui/Textarea';
import { expectClassesGenerated } from '../helpers/tailwind';

describe('Field', () => {
  it('connects the label to the control', () => {
    render(<Field label="Email">{(control) => <Input type="email" {...control} />}</Field>);
    const input = screen.getByLabelText('Email');
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input).toHaveAttribute('type', 'email');
  });

  it('with no hint or error, adds no describedby or invalid state', () => {
    render(<Field label="Name">{(control) => <Input {...control} />}</Field>);
    const input = screen.getByLabelText('Name');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-required');
  });

  it('links the hint through aria-describedby', () => {
    render(
      <Field label="Phone" hint="Only employers you apply to can see this.">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText('Phone');
    expect(input).toHaveAccessibleDescription('Only employers you apply to can see this.');
  });

  it('error state: marks the control invalid and announces the message with an icon and prefix', () => {
    const { container } = render(
      <Field label="Email" hint="We never share it." error="Enter a valid email address.">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Error: Enter a valid email address.');
    expect(alert.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    // The control is described by both the hint and the error.
    expect(input).toHaveAccessibleDescription('We never share it. Error: Enter a valid email address.');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);
    expect(container.querySelector(`#${alert.id}`)).toBe(alert);
  });

  it('required: marks the control required and hides the asterisk from assistive tech', () => {
    render(
      <Field label="Job title" required>
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText(/Job title/);
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('honors a custom id', () => {
    render(
      <Field label="City" id="city">
        {(control) => <Input {...control} />}
      </Field>,
    );
    expect(screen.getByLabelText('City')).toHaveAttribute('id', 'city');
  });

  it('gives each field its own id', () => {
    render(
      <>
        <Field label="One">{(control) => <Input {...control} />}</Field>
        <Field label="Two">{(control) => <Input {...control} />}</Field>
      </>,
    );
    expect(screen.getByLabelText('One').id).not.toBe(screen.getByLabelText('Two').id);
  });

  it('works with Textarea and Select too', () => {
    render(
      <>
        <Field label="About you" error="Too short.">
          {(control) => <Textarea {...control} />}
        </Field>
        <Field label="Role">
          {(control) => (
            <Select {...control}>
              <option value="cna">CNA</option>
            </Select>
          )}
        </Field>
      </>,
    );
    expect(screen.getByLabelText('About you')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Role')).toBeInstanceOf(HTMLSelectElement);
  });

  it('uses only real classes', async () => {
    render(
      <Field label="Email" hint="Hint" error="Error" required>
        {(control) => <Input {...control} />}
      </Field>,
    );
    await expectClassesGenerated();
  });
});

describe('Input', () => {
  it('uses the Muted border (3:1 against Surface), never the Line color', () => {
    render(<Input aria-label="x" />);
    const input = screen.getByLabelText('x');
    expect(input).toHaveClass('border-muted');
    expect(input.className).not.toMatch(/border-line/);
  });

  it('shows the error state through aria-invalid styles', () => {
    render(<Input aria-label="x" aria-invalid="true" />);
    const input = screen.getByLabelText('x');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveClass('aria-invalid:border-danger', 'aria-invalid:border-2');
  });

  it('takes typed text, by keyboard focus', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>before</button>
        <Input aria-label="Name" />
      </>,
    );
    await user.tab();
    await user.tab();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await user.keyboard('Sam');
    expect(screen.getByLabelText('Name')).toHaveValue('Sam');
  });

  it('takes focus when clicked', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Name" />);
    await user.click(screen.getByLabelText('Name'));
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('disabled: is disabled, skipped by Tab, and refuses typing', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>before</button>
        <Input aria-label="Name" disabled defaultValue="fixed" />
        <button>after</button>
      </>,
    );
    const input = screen.getByLabelText('Name');
    expect(input).toBeDisabled();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
    await user.type(input, 'more');
    expect(input).toHaveValue('fixed');
    expect(input).toHaveClass('disabled:bg-paper', 'disabled:text-muted');
  });

  it('never removes the focus outline, and uses only real classes', async () => {
    render(<Input aria-label="x" />);
    expect(screen.getByLabelText('x').className).not.toMatch(/outline-(none|hidden|0)/);
    await expectClassesGenerated();
  });
});

describe('Textarea', () => {
  it('has 4 rows by default and accepts typing', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Bio" />);
    const textarea = screen.getByLabelText('Bio');
    expect(textarea).toHaveAttribute('rows', '4');
    await user.type(textarea, 'Hello{Enter}there');
    expect(textarea).toHaveValue('Hello\nthere');
  });

  it('uses the Muted border and the aria-invalid error style', () => {
    render(<Textarea aria-label="Bio" aria-invalid="true" />);
    const textarea = screen.getByLabelText('Bio');
    expect(textarea).toHaveClass('border-muted', 'aria-invalid:border-danger');
  });

  it('is reachable with Tab', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Bio" />);
    await user.tab();
    expect(screen.getByLabelText('Bio')).toHaveFocus();
  });

  it('disabled: is disabled and skipped by Tab', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Textarea aria-label="Bio" disabled />
        <button>after</button>
      </>,
    );
    expect(screen.getByLabelText('Bio')).toBeDisabled();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('uses only real classes', async () => {
    render(<Textarea aria-label="Bio" />);
    await expectClassesGenerated();
  });
});

describe('Select', () => {
  function Example(props: { disabled?: boolean; invalid?: boolean }) {
    return (
      <Select aria-label="Role" disabled={props.disabled} aria-invalid={props.invalid ? true : undefined} defaultValue="">
        <option value="" disabled>
          Choose a role
        </option>
        <option value="cna">CNA</option>
        <option value="rn">RN</option>
      </Select>
    );
  }

  it('is a native combobox that picks an option', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const select = screen.getByRole('combobox', { name: 'Role' });
    await user.selectOptions(select, 'rn');
    expect(select).toHaveValue('rn');
  });

  it('is reachable with Tab', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('hides the decorative chevron from assistive tech', () => {
    const { container } = render(<Example />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toHaveClass('pointer-events-none');
  });

  it('disabled: is disabled and skipped by Tab', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Example disabled />
        <button>after</button>
      </>,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('error state: aria-invalid and the danger border', () => {
    render(<Example invalid />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveClass('border-muted', 'aria-invalid:border-danger');
  });

  it('uses only real classes', async () => {
    render(<Example />);
    await expectClassesGenerated();
  });
});
