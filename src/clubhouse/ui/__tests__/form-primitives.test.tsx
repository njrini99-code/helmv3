import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceGroup } from '../ChoiceGroup';
import { Field } from '../Field';
import { Stepper } from '../Stepper';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));

// Premium plan batch 5: the Field, Stepper and ChoiceGroup primitives.
describe('Field', () => {
  it('names the control, joins the error and counter to it, and marks it invalid', () => {
    render(
      <Field label="Group name" error="Give the group a name" count={3} max={40}>
        {(c) => <input {...c} />}
      </Field>,
    );
    const input = screen.getByLabelText('Group name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = input.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)!.textContent);
    expect(described).toContain('Give the group a name');
    expect(described.join(' ')).toContain('3 / 40');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Stepper', () => {
  it('steps by keys and keys, and stops at its range', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Stepper label="Minutes" value={5} onChange={onChange} min={0} max={10} unit="minutes" />);
    const spin = screen.getByRole('spinbutton', { name: 'Minutes' });
    expect(spin.getAttribute('aria-valuetext')).toBe('5 minutes');
    fireEvent.keyDown(spin, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(6);
    fireEvent.keyDown(spin, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(10);
    rerender(<Stepper label="Minutes" value={10} onChange={onChange} min={0} max={10} />);
    expect((screen.getByRole('button', { name: 'More minutes' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ChoiceGroup', () => {
  it('is a named group of radios, one chosen', () => {
    const onChange = vi.fn();
    render(<ChoiceGroup legend="Who can see it" value="team" onChange={onChange} options={[{ value: 'team', label: 'The team' }, { value: 'coaches', label: 'Coaches only', hint: 'Players never see it' }]} />);
    expect(screen.getByRole('group', { name: 'Who can see it' })).toBeTruthy();
    expect((screen.getByRole('radio', { name: /The team/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Coaches only/ }));
    expect(onChange).toHaveBeenCalledWith('coaches');
  });
});
