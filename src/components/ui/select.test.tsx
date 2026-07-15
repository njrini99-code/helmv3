import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within, waitFor } from '@/test/utils';
import { Select, type SelectOption } from './select';

// jsdom doesn't implement scrollIntoView; Select calls it (pre-existing,
// unrelated to the portal fix) to keep the highlighted option in view.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard for the portal fix: the dropdown must escape into
// document.body (not stay nested inside the trigger's wrapper div) so it is
// never clipped by an overflow-hidden card ancestor, and the wrapper must
// forward `className` instead of hardcoding `w-full` and swallowing it.
// ─────────────────────────────────────────────────────────────────────────────

const OPTIONS: SelectOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie', disabled: true },
];

describe('Select', () => {
  it('portals the open dropdown to document.body, outside the wrapper', async () => {
    const { user, container } = render(<Select options={OPTIONS} placeholder="Pick one" />);

    await user.click(screen.getByRole('button', { name: /pick one/i }));

    const listbox = await screen.findByRole('listbox');
    // The listbox must NOT be a descendant of the component's own wrapper —
    // that's precisely the clipping bug (it used to render `absolute` inside
    // a `relative` div nested in the wrapper, so any overflow-hidden
    // ancestor of the wrapper clipped it).
    expect(container.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
  });

  it('still selects an option and closes after portaling', async () => {
    const onChange = vi.fn();
    const { user } = render(<Select options={OPTIONS} placeholder="Pick one" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /pick one/i }));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: 'Bravo' }));

    expect(onChange).toHaveBeenCalledWith('b');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('closes on outside click even though the dropdown lives outside the wrapper', async () => {
    const { user } = render(
      <div>
        <Select options={OPTIONS} placeholder="Pick one" />
        <button type="button">outside</button>
      </div>
    );

    await user.click(screen.getByRole('button', { name: /pick one/i }));
    await screen.findByRole('listbox');

    await user.click(screen.getByRole('button', { name: 'outside' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('forwards className to the outer wrapper instead of hardcoding w-full', () => {
    const { container } = render(
      <Select options={OPTIONS} placeholder="Pick one" className="w-28" />
    );
    // The wrapper is the outermost rendered element.
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveClass('w-28');
  });

  it('defaults the wrapper to w-full when no className is passed', () => {
    const { container } = render(<Select options={OPTIONS} placeholder="Pick one" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveClass('w-full');
  });

  it('meets the 44px touch-target floor on coarse pointers even when compact desktop styling sets min-h-0', async () => {
    const { user } = render(
      <Select options={OPTIONS} placeholder="Pick one" className="min-h-0" />
    );
    const trigger = screen.getByRole('button', { name: /pick one/i });
    expect(trigger).toHaveClass('[@media(pointer:coarse)]:min-h-[44px]');
    // Compact desktop override is preserved unconditionally alongside it.
    expect(trigger).toHaveClass('min-h-0');
    await user.click(trigger);
    await screen.findByRole('listbox');
  });
});
