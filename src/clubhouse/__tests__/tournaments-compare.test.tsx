import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './dialog-polyfill';
import { tourFixture } from '../preview/fixtures-tournaments';
import { Compare } from '../screens/tournaments/Compare';
import type { ChTourCompareData, ChTourCompareSearch, ChTourLoad } from '../screens/tournaments/types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace }) }));

beforeEach(() => replace.mockClear());
afterEach(cleanup);

/**
 * The comparison (P016, board `CompareDesk` and the phone's `MCompare`), as its own page and as the desk's Compare tab
 * (`embedded`). Catalog: CH-16201 and CH-16401 (the page states), CH-16250 (the rounds didn't load), CH-16251 (the field
 * didn't load), CH-16252 (the hole figures didn't load), CH-16350 (a side holds no rounds), CH-16351 (no rounds at all).
 * The figures are the metrics engine's over the fixture's pool of rounds; this file checks what the view says and does,
 * not the arithmetic (the pure tests next to compare/ do that).
 */
const fixture = tourFixture('ready');
const data = fixture.compare;
const none: ChTourCompareSearch = { a: null, b: null, m: null, bench: null, split: null };

const draw = (d: ChTourCompareData, opts: { phone?: boolean; load?: ChTourLoad; embedded?: boolean; search?: Partial<ChTourCompareSearch> } = {}) =>
  render(<Compare data={d} search={{ ...none, ...opts.search }} load={opts.load ?? 'ready'} phone={opts.phone ?? false} embedded={opts.embedded} />).container;
const plain = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const dialog = () => document.querySelector('dialog[open]') as HTMLElement | null;
const lastReplace = () => String(replace.mock.calls.at(-1)?.[0] ?? '');
const param = (name: string) => new URL(lastReplace(), 'http://x').searchParams.get(name);

describe('Compare on the desktop', () => {
  it('opens on a preset the data can answer: two scope cards, the timeline, the groups and the aligned grid', () => {
    const c = draw(data);
    expect(c.querySelector('[data-ch-tour-view="compare"] h1')?.textContent).toBe('Tournaments');
    const cards = c.querySelectorAll('.ch-tour-cmp-scope');
    expect(cards).toHaveLength(2);
    expect(c.querySelector('.ch-tour-cmp-tl')).not.toBeNull();
    const presets = Array.from(c.querySelectorAll('.ch-tour-cmp-pre'));
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.filter((p) => p.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    const tabs = within(c as HTMLElement).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Scoring', 'Counting', 'Off the tee', 'Approach', 'Around the green', 'Putting']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    const rows = c.querySelectorAll('.ch-tour-cmp-body .ch-tour-cmp-row');
    expect(rows).toHaveLength(5);
    expect(plain(rows[0]!.querySelector('.ch-tour-cmp-m b'))).toBe('Scoring average');
  });

  it('draws one primary action, Add event, linking to the event form', () => {
    const c = draw(data);
    const primaries = Array.from(c.querySelectorAll('.ch-btn')).filter((b) => b.className.includes('primary'));
    expect(primaries).toHaveLength(1);
    expect(plain(primaries[0])).toBe('Add event');
    expect(primaries[0]).toHaveAttribute('href', expect.stringContaining('/tournaments/new'));
  });

  it('names the difference with a sign or a word, never colour alone', () => {
    const c = draw(data);
    for (const dl of Array.from(c.querySelectorAll('.ch-tour-cmp-dl'))) {
      expect(plain(dl)).toMatch(/[+−-]|No data|No clear gap|better|worse|Not enough|—/);
    }
  });

  it('swaps the sides and writes both into the address', () => {
    const c = draw(data);
    const before = plain(c.querySelectorAll('.ch-tour-cmp-title')[0]);
    fireEvent.click(within(c as HTMLElement).getByRole('button', { name: 'Swap sides' }));
    expect(replace).toHaveBeenCalledTimes(1);
    const [href, opts] = replace.mock.calls[0]!;
    expect(String(href)).toContain('a=');
    expect(String(href)).toContain('b=');
    expect(String(href)).toContain('m=scoring');
    expect(opts).toEqual({ scroll: false });
    expect(plain(c.querySelectorAll('.ch-tour-cmp-title')[1])).toBe(before);
  });

  it('picking a preset sets both sides and a metric group is a tab that follows the arrow keys', () => {
    const c = draw(data);
    const pre = c.querySelectorAll('.ch-tour-cmp-pre')[1] as HTMLElement;
    expect(pre).toBeDefined();
    fireEvent.click(pre);
    expect(pre).toHaveAttribute('aria-pressed', 'true');
    expect(param('a')).toBeTruthy();
    replace.mockClear();
    const tabs = within(c as HTMLElement).getAllByRole('tab');
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(param('m')).toBe('counting');
    expect(within(c as HTMLElement).getByRole('tab', { name: 'Counting' })).toHaveAttribute('aria-selected', 'true');
    expect(c.querySelectorAll('.ch-tour-cmp-body .ch-tour-cmp-row')).toHaveLength(2);
    expect(c.querySelector('[role="tabpanel"]')).toHaveAttribute('aria-labelledby', 'ch-tour-cmp-tab-counting');
  });

  it('reads the sides, the group and the split from the address', () => {
    const c = draw(data, { search: { a: 'p:jonah|events|season', b: 'p:theo|events|season', m: 'putt', split: 40 } });
    expect(within(c as HTMLElement).getByRole('tab', { name: 'Putting' })).toHaveAttribute('aria-selected', 'true');
    const sep = within(c as HTMLElement).getByRole('separator');
    expect(sep).toHaveAttribute('aria-valuenow', '40');
    expect(plain(c.querySelector('.ch-tour-cmp-foot'))).toContain('40 / 60');
  });

  it('moves the divider with the arrow keys, resets it with Home and says the share', () => {
    const c = draw(data);
    const sep = within(c as HTMLElement).getByRole('separator');
    expect(sep).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(sep).toHaveAttribute('aria-valuenow', '48');
    expect(param('split')).toBe('48');
    expect(sep).toHaveAttribute('aria-valuetext', 'A 48 percent, B 52 percent');
    fireEvent.keyDown(sep, { key: 'Home' });
    expect(sep).toHaveAttribute('aria-valuenow', '50');
    for (let i = 0; i < 30; i++) fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(sep).toHaveAttribute('aria-valuenow', '65');
    fireEvent.click(within(c as HTMLElement).getByRole('button', { name: 'Reset' }));
    expect(sep).toHaveAttribute('aria-valuenow', '50');
  });

  it('opens the rounds behind a value in the evidence drawer, and closes it', () => {
    const c = draw(data);
    const keys = within(c as HTMLElement).getAllByRole('button', { name: /Scoring average, A:/ });
    fireEvent.click(keys[0]!);
    const d = dialog() as HTMLElement;
    expect(d).not.toBeNull();
    expect(d.querySelector('h2')?.textContent).toBeTruthy();
    expect(within(d).getByRole('list', { name: 'Rounds behind this figure' })).toBeInTheDocument();
    expect(plain(d)).toMatch(/Used/);
    fireEvent.click(within(d).getByRole('button', { name: 'Close' }));
    expect(dialog()).toBeNull();
  });

  it('says what a value rests on beside it, so a thin sample never reads as settled', () => {
    const c = draw(tourFixture('thin').compare);
    const words = Array.from(c.querySelectorAll('.ch-tour-cmp-v__d')).map((x) => plain(x));
    expect(words.length).toBeGreaterThan(0);
    expect(words.every((w) => w.length > 0)).toBe(true);
  });

  it('moves the timeline range with the arrow keys, a week at a time, and writes it into the address', () => {
    const c = draw(data);
    const start = within(c as HTMLElement).getAllByRole('slider', { name: 'Range start' })[0]!;
    const before = start.getAttribute('aria-valuetext');
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(replace).toHaveBeenCalled();
    expect(start.getAttribute('aria-valuetext')).not.toBe(before);
    expect(param('b') ?? param('a')).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('sets a range from the timeline’s date fields', () => {
    const c = draw(data);
    const from = within(c as HTMLElement).getByLabelText('Range start', { selector: 'input' });
    fireEvent.change(from, { target: { value: '2026-09-01' } });
    expect(replace).toHaveBeenCalled();
    expect(lastReplace()).toContain('2026-09-01');
  });

  it('switches which side the timeline edits', () => {
    const c = draw(data);
    fireEvent.click(within(c as HTMLElement).getByRole('radio', { name: 'Adjust A' }));
    expect(plain(c.querySelectorAll('.ch-tour-cmp-scope')[0]!)).toContain('Timeline edits A');
  });

  it('writes no exclamation mark and no straight apostrophe', () => {
    for (const d of [data, tourFixture('partial').compare, tourFixture('thin').compare]) {
      expect(plain(draw(d))).not.toMatch(/[!']/);
      cleanup();
    }
  });
});

describe('Compare on the phone', () => {
  it('shows the two sides as cards, one primary Edit comparison, and the figures as blocks', () => {
    const c = draw(data, { phone: true });
    expect(c.querySelector('.ch-tour')).toHaveClass('is-phone');
    expect(c.querySelectorAll('.ch-tour-cmp-scope')).toHaveLength(2);
    expect(c.querySelector('.ch-tour-cmp-tl')).toBeNull();
    const primaries = Array.from(c.querySelectorAll('.ch-btn')).filter((b) => b.className.includes('primary'));
    expect(primaries.map((p) => plain(p))).toEqual(['Edit comparison']);
    expect(c.querySelectorAll('.ch-tour-cmp-block')).toHaveLength(5);
    expect(c.querySelector('[role="separator"]')).toBeNull();
  });

  it('edits both sides in a sheet and applies them to the address', () => {
    const c = draw(data, { phone: true });
    fireEvent.click(within(c as HTMLElement).getByRole('button', { name: /Edit comparison/ }));
    const d = dialog() as HTMLElement;
    expect(d).not.toBeNull();
    expect(plain(d.querySelector('h2'))).toBe('Edit comparison');
    expect(within(d).getAllByRole('radiogroup', { name: /Context/ })).toHaveLength(2);
    fireEvent.click(within(d).getAllByRole('radio', { name: 'Qualifiers' })[0]!);
    expect(replace).toHaveBeenCalled();
    expect(lastReplace()).toContain('qual');
    fireEvent.click(within(d).getByRole('button', { name: 'Show comparison' }));
    expect(dialog()).toBeNull();
  });

  it('opens the rounds behind a value', () => {
    const c = draw(data, { phone: true });
    fireEvent.click(within(c as HTMLElement).getAllByRole('button', { name: /Scoring average, B:/ })[0]!);
    expect(dialog()).not.toBeNull();
  });
});

describe('Compare when embedded', () => {
  it('is the desk’s tab: no page, no head, A set to the event, and no address writes', () => {
    const c = draw({ ...data, eventId: 'e33' }, { embedded: true });
    expect(c.querySelector('main')).toBeNull();
    expect(c.querySelector('h1')).toBeNull();
    expect(c.querySelector('[data-ch-tour-view="compare"]')).not.toBeNull();
    expect(plain(c.querySelectorAll('.ch-tour-cmp-scope__top')[0])).toContain('Oakmont');
    fireEvent.click(within(c as HTMLElement).getAllByRole('tab')[1]!);
    expect(replace).not.toHaveBeenCalled();
    expect(within(c as HTMLElement).getByRole('tab', { name: 'Counting' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe.each([
  ['desktop', false],
  ['phone', true],
] as const)('Compare states, %s', (_, phone) => {
  it('draws the loading state busy (CH-16401), as a page and as a tab', () => {
    const page = draw(data, { load: 'loading', phone }).querySelector('[data-ch-tour-view="compare"]');
    expect(page).toHaveAttribute('data-ch-code', 'CH-16401');
    expect(page).toHaveAttribute('aria-busy', 'true');
    cleanup();
    expect(draw(data, { load: 'loading', phone, embedded: true }).querySelector('[data-ch-code="CH-16401"]')).toHaveAttribute('aria-busy', 'true');
  });

  it('draws the page failure (CH-16201), as a page and as a tab', () => {
    const page = draw(data, { load: 'failed', phone });
    expect(page.querySelector('[data-ch-code="CH-16201"]')).toHaveAttribute('role', 'alert');
    expect(page.querySelector('h1')?.textContent).toBe('Tournaments');
    cleanup();
    expect(draw(data, { load: 'failed', phone, embedded: true }).querySelector('[data-ch-code="CH-16201"]')).toHaveAttribute('role', 'alert');
  });

  it('names a failed rounds read and offers Try again, never an empty comparison (CH-16250)', () => {
    const c = draw({ ...data, errors: { rounds: true } }, { phone });
    const notice = c.querySelector('[data-ch-code="CH-16250"]') as HTMLElement;
    expect(notice).toHaveAttribute('role', 'alert');
    expect(plain(notice)).toContain('The rounds didn’t load');
    expect(within(notice).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(c.querySelector('[data-ch-code="CH-16351"]')).toBeNull();
    expect(c.querySelector('[role="tablist"]')).toBeNull();
  });

  it('keeps the figures when the field did not load and leaves versus field blank (CH-16251)', () => {
    const c = draw(tourFixture('partial').compare, { phone, search: { m: 'scoring' } });
    expect(plain(c.querySelector('[data-ch-code="CH-16251"]'))).toContain('The field didn’t load');
    expect(c.querySelector('[role="tablist"]')).not.toBeNull();
    const row = Array.from(c.querySelectorAll(phone ? '.ch-tour-cmp-block' : '.ch-tour-cmp-row')).find((r) => /vs field/i.test(plain(r)));
    expect(row).toBeDefined();
    expect(plain(row)).toContain('—');
  });

  it('keeps the scores when the hole figures did not load (CH-16252)', () => {
    const c = draw({ ...data, errors: { holes: true } }, { phone, search: { m: 'approach' } });
    expect(plain(c.querySelector('[data-ch-code="CH-16252"]'))).toContain('The hole figures didn’t load');
    expect(c.querySelector('[role="tablist"]')).not.toBeNull();
  });

  it('says when there are no rounds at all (CH-16351)', () => {
    const c = draw({ ...data, rounds: [] }, { phone });
    expect(plain(c.querySelector('[data-ch-code="CH-16351"]'))).toContain('No rounds to compare yet');
  });

  it('says so when a side holds no rounds, instead of drawing a figure (CH-16350)', () => {
    const c = draw(data, { phone, search: { a: 'p:nobody|events|season', b: 'team|events|season' } });
    expect(plain(c.querySelector('[data-ch-code="CH-16350"]'))).toContain('No rounds in this sample');
  });
});
