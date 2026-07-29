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

  // Regression guard: className used to be forwarded verbatim to BOTH the
  // wrapper and the trigger button, so a caller passing padding/background
  // utilities meant for the button (e.g. DiscoverView's compact
  // `min-h-0 px-3 py-1.5` "Sort:" select, or a Fairway `fwInputCls` recipe
  // with `bg-*`/`border-*`/`px-*` in it) leaked that styling onto the
  // wrapper too, adding invisible padding/background around the whole
  // label + trigger + hint/error stack. Only width/flex-sizing utilities
  // (needed for the wrapper's flex/grid participation) should reach the
  // wrapper; visual utilities stay scoped to the button, same as before the
  // wrapper started receiving className at all.
  it('does not forward padding/background utilities to the wrapper, only to the trigger button', () => {
    const { container } = render(
      <Select
        options={OPTIONS}
        placeholder="Pick one"
        className="text-sm min-h-0 px-3 py-1.5 bg-cream-50"
      />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    const trigger = screen.getByRole('button', { name: /pick one/i });

    // The button keeps the full visual treatment (compact height/padding,
    // background) exactly as a consumer expressed it.
    expect(trigger).toHaveClass('text-sm', 'min-h-0', 'px-3', 'py-1.5', 'bg-cream-50');

    // None of those visual utilities should have leaked onto the wrapper —
    // it only ever gets `w-full` (default) plus any width/flex-sizing token.
    expect(wrapper).not.toHaveClass('px-3', 'py-1.5', 'bg-cream-50', 'text-sm', 'min-h-0');
    expect(wrapper).toHaveClass('w-full');
  });

  it('forwards a width/flex-sizing token mixed into className to the wrapper, alongside the button', () => {
    const { container } = render(
      <Select options={OPTIONS} placeholder="Pick one" className="w-28 shrink-0 text-sm" />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    const trigger = screen.getByRole('button', { name: /pick one/i });

    // Wrapper — the actual flex item in a consumer's row — gets the sizing
    // tokens so it no longer claims a full-width flex footprint.
    expect(wrapper).toHaveClass('w-28', 'shrink-0');
    expect(wrapper).not.toHaveClass('text-sm');

    // Button is unaffected — still gets the full original className.
    expect(trigger).toHaveClass('w-28', 'shrink-0', 'text-sm');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The clear affordance. It used to render INSIDE the trigger <button>, which
// is invalid HTML: the browser's parser splits the outer button when it meets
// the inner one, so server-rendered markup reparses into a different tree than
// React expects and hydration mismatches. It is now a sibling positioned over
// the trigger, which changes two things that must not regress — click
// isolation, and the disabled case.
// ─────────────────────────────────────────────────────────────────────────────

describe('Select — clear affordance', () => {
  it('renders the clear control OUTSIDE the trigger button', () => {
    render(<Select options={OPTIONS} value="a" clearable onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: /alpha/i });
    const clear = screen.getByRole('button', { name: /clear selection/i });

    // The whole point: not a descendant. A nested interactive element is
    // invalid HTML and a hydration-crash class.
    expect(trigger.contains(clear)).toBe(false);
  });

  it('clears the value without also opening the dropdown', async () => {
    const onChange = vi.fn();
    const { user } = render(
      <Select options={OPTIONS} value="a" clearable onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: /clear selection/i }));

    expect(onChange).toHaveBeenCalledWith('');
    // The control now sits visually on top of the trigger rather than inside
    // it, so stopPropagation is still doing real work — without it the click
    // would fall through and toggle the listbox open.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not offer clear on a disabled select', () => {
    // Regression guard for a bug the refactor could have introduced. While the
    // control lived inside the trigger, a `disabled` button suppressed pointer
    // events across its whole subtree, so this was free. As a sibling nothing
    // suppresses it, and a disabled select would have become clearable.
    render(<Select options={OPTIONS} value="a" clearable disabled onChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /clear selection/i })).not.toBeInTheDocument();
  });

  it('shows no clear control when there is nothing to clear', () => {
    render(<Select options={OPTIONS} clearable placeholder="Pick one" onChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /clear selection/i })).not.toBeInTheDocument();
  });
});
