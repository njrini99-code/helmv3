import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../ui/Button';
import { DateField } from '../ui/DateField';
import { TimeField } from '../ui/TimeField';
import { roving } from '../ui/use-roving';
import './dialog-polyfill';

// Thursday 15 October 2026.
const TODAY = '2026-10-15';

function DateHarness({ initial = '', onValue, ...rest }: { initial?: string; onValue?: (v: string) => void } & Partial<React.ComponentProps<typeof DateField>>) {
  const [v, setV] = useState(initial);
  return (
    <DateField
      label="Date"
      today={TODAY}
      {...rest}
      value={v}
      onChange={(n) => {
        setV(n);
        onValue?.(n);
      }}
    />
  );
}
function TimeHarness({ initial = '', onValue, ...rest }: { initial?: string; onValue?: (v: string) => void } & Partial<React.ComponentProps<typeof TimeField>>) {
  const [v, setV] = useState(initial);
  return (
    <TimeField
      label="Start time"
      {...rest}
      value={v}
      onChange={(n) => {
        setV(n);
        onValue?.(n);
      }}
    />
  );
}
const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

afterEach(() => vi.restoreAllMocks());

describe('DateField on the desktop', () => {
  it('shows the day in the app voice and keeps the form string', () => {
    render(<DateHarness initial="2026-10-15" />);
    expect(input('Date').value).toBe('Thu 15 Oct');
  });

  it('keeps the year for a date outside this year', () => {
    render(<DateHarness initial="2027-01-08" />);
    expect(input('Date').value).toBe('Fri 8 Jan 2027');
  });

  it('reads what is typed on blur, and a complete ISO at once', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<DateHarness onValue={seen} />);
    await user.click(input('Date'));
    await user.type(input('Date'), 'oct 20');
    expect(seen).not.toHaveBeenCalled(); // half-typed text does not reach the form
    await user.tab();
    expect(seen).toHaveBeenLastCalledWith('2026-10-20');
    expect(input('Date').value).toBe('Tue 20 Oct');
    fireEvent.change(input('Date'), { target: { value: '2026-11-02' } });
    expect(seen).toHaveBeenLastCalledWith('2026-11-02');
    fireEvent.change(input('Date'), { target: { value: '' } });
    expect(seen).toHaveBeenLastCalledWith('');
  });

  it('says so inline when the text is not a date, and leaves the value alone', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<DateHarness initial="2026-10-15" onValue={seen} />);
    await user.click(input('Date'));
    await user.type(input('Date'), 'soon');
    await user.tab();
    expect(seen).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Try 10\/15/);
    expect(input('Date').getAttribute('aria-invalid')).toBe('true');
  });

  it('does not send a form on the Enter that sets a date, and does on the next', async () => {
    const user = userEvent.setup();
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <DateHarness />
        <button type="submit">Go</button>
      </form>,
    );
    await user.click(input('Date'));
    await user.type(input('Date'), 'tomorrow{Enter}');
    expect(input('Date').value).toBe('Fri 16 Oct');
    expect(submit).not.toHaveBeenCalled();
    await user.click(input('Date'));
    await user.keyboard('{Enter}');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('opens a month: today marked, the chosen day lit, days out of range off', async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="2026-10-20" min="2026-10-10" max="2026-10-25" />);
    await user.click(screen.getByRole('button', { name: 'Pick a date' }));
    const cal = await screen.findByRole('dialog', { name: 'Pick date' });
    expect(within(cal).getByText('October 2026')).toBeTruthy();
    expect(within(cal).getByRole('button', { name: 'Thu 15 Oct 2026' }).getAttribute('aria-current')).toBe('date');
    expect(within(cal).getByRole('button', { name: 'Tue 20 Oct 2026' }).closest('[role="gridcell"]')!.getAttribute('aria-selected')).toBe('true');
    expect((within(cal).getByRole('button', { name: 'Fri 9 Oct 2026' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(cal).getByRole('button', { name: 'Mon 26 Oct 2026' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(cal).getByRole('button', { name: 'Sat 10 Oct 2026' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('moves with the arrow keys, pages by month, chooses with Enter', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<DateHarness initial="2026-10-15" onValue={seen} />);
    await user.click(screen.getByRole('button', { name: 'Pick a date' }));
    const cal = await screen.findByRole('dialog', { name: 'Pick date' });
    expect(document.activeElement).toBe(within(cal).getByRole('button', { name: 'Thu 15 Oct 2026' }));
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(document.activeElement).toBe(within(cal).getByRole('button', { name: 'Fri 23 Oct 2026' }));
    await user.keyboard('{PageDown}');
    expect(within(cal).getByText('November 2026')).toBeTruthy();
    expect(document.activeElement).toBe(within(cal).getByRole('button', { name: 'Mon 23 Nov 2026' }));
    await user.keyboard('{Enter}');
    expect(seen).toHaveBeenLastCalledWith('2026-11-23');
    expect(screen.queryByRole('dialog', { name: 'Pick date' })).toBeNull();
    expect(document.activeElement).toBe(input('Date')); // focus returns to the field
    expect(input('Date').value).toBe('Mon 23 Nov');
  });

  it('closes on Escape without that Escape reaching the dialog the field sits in', async () => {
    const user = userEvent.setup();
    const host = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- stands in for the dialog that would take an Escape
      <div onKeyDown={(e) => host(e.defaultPrevented)}>
        <DateHarness initial="2026-10-15" />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Pick a date' }));
    const day = await screen.findByRole('button', { name: 'Thu 15 Oct 2026' });
    expect(fireEvent.keyDown(day, { key: 'Escape' })).toBe(false); // prevented: the native dialog would otherwise close
    expect(screen.queryByRole('dialog', { name: 'Pick date' })).toBeNull();
  });

  it('couples a range: the end opens on the start and cannot be picked before it', async () => {
    const user = userEvent.setup();
    function Pair() {
      const [a, setA] = useState('2026-10-19');
      const [b, setB] = useState('');
      return (
        <>
          <DateField label="Start date" today={TODAY} value={a} onChange={setA} />
          <DateField label="End date" today={TODAY} value={b} min={a} anchor={a} clearable onChange={setB} />
        </>
      );
    }
    render(<Pair />);
    await user.click(screen.getAllByRole('button', { name: 'Pick a date' })[1]!);
    const cal = await screen.findByRole('dialog', { name: 'Pick end date' });
    expect((within(cal).getByRole('button', { name: 'Sun 18 Oct 2026' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(cal).getByRole('button', { name: 'Mon 19 Oct 2026' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(within(cal).getByRole('button', { name: 'Wed 21 Oct 2026' }));
    expect(input('End date').value).toBe('Wed 21 Oct');
    // An optional end can be cleared from the picker.
    await user.click(screen.getAllByRole('button', { name: 'Pick a date' })[1]!);
    await user.click(within(await screen.findByRole('dialog', { name: 'Pick end date' })).getByRole('button', { name: 'Clear' }));
    expect(input('End date').value).toBe('');
  });

  it('lets a typed day outside min and max through, for the form to answer', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<DateHarness max={TODAY} onValue={seen} />);
    await user.click(input('Date'));
    await user.type(input('Date'), '10/20/2026');
    await user.tab();
    expect(seen).toHaveBeenLastCalledWith('2026-10-20');
  });
});

describe('opening from the text field', () => {
  it('a click in the date text opens the month and leaves the cursor in the text; typing moves the month', async () => {
    const user = userEvent.setup();
    render(
      <>
        <DateHarness initial="2026-10-15" />
        <input aria-label="Next field" />
      </>,
    );
    await user.click(input('Date'));
    const cal = await screen.findByRole('dialog', { name: 'Pick date' });
    expect(document.activeElement).toBe(input('Date'));
    await user.clear(input('Date'));
    await user.type(input('Date'), '12/25/2026');
    await user.tab();
    expect(screen.queryByRole('dialog', { name: 'Pick date' })).toBeNull(); // tabbing on closes it
    expect(input('Date').value).toBe('Fri 25 Dec');
    await user.click(screen.getByRole('button', { name: 'Pick a date' }));
    expect(within(await screen.findByRole('dialog', { name: 'Pick date' })).getByText('December 2026')).toBeTruthy();
    void cal;
  });

  it('a click in the time text opens the list with focus still in the text', async () => {
    const user = userEvent.setup();
    render(<TimeHarness initial="09:00" />);
    await user.click(input('Start time'));
    await screen.findByRole('listbox', { name: 'Times' });
    expect(document.activeElement).toBe(input('Start time'));
  });

  it('an end time cannot be picked before its start, but a typed one still goes to the form', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<TimeHarness initial="10:00" min="09:15" onValue={seen} label="End time" />);
    await user.click(screen.getByRole('button', { name: 'Pick a time' }));
    const list = await screen.findByRole('listbox', { name: 'Times' });
    expect((within(list).getByRole('option', { name: '9:00 AM' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(list).getByRole('option', { name: '9:15 AM' }) as HTMLButtonElement).disabled).toBe(false);
    await user.keyboard('{Escape}');
    await user.clear(input('End time'));
    await user.type(input('End time'), '8:00 am');
    await user.tab();
    expect(seen).toHaveBeenLastCalledWith('08:00');
  });
});

describe('TimeField', () => {
  it('shows the time as the calendar writes it and reads typed times', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<TimeHarness initial="15:30" onValue={seen} />);
    expect(input('Start time').value).toBe('3:30 PM');
    await user.clear(input('Start time'));
    await user.type(input('Start time'), '9a');
    await user.tab();
    expect(seen).toHaveBeenLastCalledWith('09:00');
    fireEvent.change(input('Start time'), { target: { value: '23:45' } });
    expect(seen).toHaveBeenLastCalledWith('23:45');
    await user.clear(input('Start time'));
    await user.type(input('Start time'), '25:99');
    await user.tab();
    expect(screen.getByRole('alert').textContent).toMatch(/Try 3p/);
  });

  it('lists the day by quarter hours with the chosen time lit, and an off-grid value kept', async () => {
    const user = userEvent.setup();
    render(<TimeHarness initial="15:05" />);
    await user.click(screen.getByRole('button', { name: 'Pick a time' }));
    const list = await screen.findByRole('listbox', { name: 'Times' });
    const rows = within(list).getAllByRole('option');
    expect(rows).toHaveLength(97);
    expect(within(list).getByRole('option', { name: '3:05 PM' }).getAttribute('aria-selected')).toBe('true');
    expect(rows[0]!.textContent).toBe('12:00 AM');
  });

  it('moves with the arrows, pages by the hour, chooses with Enter', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<TimeHarness initial="09:00" onValue={seen} />);
    await user.click(screen.getByRole('button', { name: 'Pick a time' }));
    await screen.findByRole('listbox', { name: 'Times' });
    expect(document.activeElement!.textContent).toBe('9:00 AM');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement!.textContent).toBe('9:30 AM');
    await user.keyboard('{PageDown}');
    expect(document.activeElement!.textContent).toBe('10:30 AM');
    await user.keyboard('{Enter}');
    expect(seen).toHaveBeenLastCalledWith('10:30');
    expect(input('Start time').value).toBe('10:30 AM');
  });

  it('turns times outside min and max off and skips them', async () => {
    const user = userEvent.setup();
    render(<TimeHarness initial="09:00" min="08:30" max="10:00" />);
    await user.click(screen.getByRole('button', { name: 'Pick a time' }));
    const list = await screen.findByRole('listbox', { name: 'Times' });
    expect((within(list).getByRole('option', { name: '8:15 AM' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(list).getByRole('option', { name: '8:30 AM' }) as HTMLButtonElement).disabled).toBe(false);
    await user.keyboard('{End}');
    expect(document.activeElement!.textContent).toBe('10:00 AM');
  });

  it('is off while disabled', () => {
    render(<TimeHarness initial="09:00" disabled />);
    expect(input('Start time').disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Pick a time' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('on the phone', () => {
  function phone(on: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: on, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
  }
  afterEach(() => phone(false));

  it('is a key that opens a sheet with the month, not a field to type in', async () => {
    phone(true);
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<DateHarness initial="2026-10-15" onValue={seen} label="Start date" />);
    const key = screen.getByRole('button', { name: 'Start date, Thu 15 Oct' });
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(key);
    const sheet = await screen.findByRole('dialog', { name: 'Start date' });
    await user.click(within(sheet).getByRole('button', { name: 'Sat 17 Oct 2026' }));
    expect(seen).toHaveBeenLastCalledWith('2026-10-17');
    expect(screen.getByRole('button', { name: 'Start date, Sat 17 Oct' })).toBeTruthy();
  });

  it('lists times in the sheet', async () => {
    phone(true);
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<TimeHarness initial="09:00" onValue={seen} />);
    await user.click(screen.getByRole('button', { name: 'Start time, 9:00 AM' }));
    const sheet = await screen.findByRole('dialog', { name: 'Start time' });
    await user.click(within(sheet).getByRole('option', { name: '9:45 AM' }));
    expect(seen).toHaveBeenLastCalledWith('09:45');
  });
});

describe('Button busy', () => {
  it('is aria-busy, blocks a second press and says it is working, not unavailable', async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    const { rerender } = render(<Button variant="primary" onClick={go}>Save</Button>);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(go).toHaveBeenCalledTimes(1);
    rerender(<Button variant="primary" busy onClick={go}>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.disabled).toBe(true); // the lit look is [aria-busy]:disabled in ui.css
    await user.click(b);
    fireEvent.click(b);
    expect(go).toHaveBeenCalledTimes(1);
    rerender(<Button variant="primary" onClick={go}>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('aria-busy')).toBe(false);
  });

  it('leaves a plain disabled button unlit and not busy', () => {
    render(<Button variant="primary" disabled>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(b.hasAttribute('aria-busy')).toBe(false);
  });
});

describe('roving focus', () => {
  function Group({ checked = 'b', off = [] as string[] }: { checked?: string; off?: string[] }) {
    const [on, setOn] = useState(checked);
    return (
      <div role="radiogroup" aria-label="Holes" {...roving}>
        {['a', 'b', 'c', 'd'].map((k) => (
          <button key={k} type="button" role="radio" aria-checked={on === k} disabled={off.includes(k)} onClick={() => setOn(k)}>
            {k}
          </button>
        ))}
      </div>
    );
  }
  const tabStops = () => screen.getAllByRole('radio').filter((r) => r.getAttribute('tabindex') === '0').map((r) => r.textContent);

  it('has one tab stop: the checked radio', () => {
    render(<Group />);
    expect(tabStops()).toEqual(['b']);
  });

  it('falls to the first enabled radio when none is checked', () => {
    render(<Group checked="none" off={['a']} />);
    expect(tabStops()).toEqual(['b']);
  });

  it('moves and checks with the arrows, wrapping, and with Home and End', async () => {
    const user = userEvent.setup();
    render(<Group />);
    screen.getByRole('radio', { name: 'b' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement!.textContent).toBe('c');
    expect(screen.getByRole('radio', { name: 'c' }).getAttribute('aria-checked')).toBe('true');
    expect(tabStops()).toEqual(['c']);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement!.textContent).toBe('a'); // d, then round to a
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement!.textContent).toBe('d');
    await user.keyboard('{Home}');
    expect(document.activeElement!.textContent).toBe('a');
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'd' }).getAttribute('aria-checked')).toBe('true');
  });

  it('skips a disabled radio (18 holes while the card is part filled)', async () => {
    const user = userEvent.setup();
    render(<Group checked="a" off={['b']} />);
    screen.getByRole('radio', { name: 'a' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement!.textContent).toBe('c');
  });
});
