/**
 * Q2, direction A (owner's pick, 12 Nov 2026): on a desk the new chat's home puts the question first. Nick on the old home:
 * "Cramped, basic, not airy or premium"; on the box: "I hate the chat box so much". The greeting and a larger box are the
 * page's middle, above the fold at 1440x900 and 1920x990 with the chats panel open or closed; the starters are chips under
 * the box; what moved since Monday (a player's focus and meter) is a quiet list at the foot. The phone keeps its own home.
 *
 * jsdom has no layout, so the fold is held by the rules that make it: nothing but the ball, the greeting and its line comes
 * before the box, the free height is shared by auto margins above the greeting and above the foot (so on a short window the
 * box rises to sit under the greeting), and the 44 targets. The WebKit measurements, chats panel open and closed, are in
 * docs/clubhouse/pages/P013-coachhelm/changes/2026-11-12-ask-home-question-first.md.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));

import type { ChAskData } from '../../../../data/coachhelm-chat-shape';
import { PREVIEW_ASK_DATA, PREVIEW_ASK_PLAYER_SUGGESTIONS } from '../../../../preview/fixtures-ask';
import { AskSkeleton } from '../AskSkeleton';
import { AskHomeV2 } from '../Home';

afterEach(cleanup);

const BOX = <div className="ch-ask-cmp is-hero" data-testid="box" />;
const COACH: ChAskData = { ...PREVIEW_ASK_DATA, firstName: 'Maya' };
const PLAYER: ChAskData = {
  ...PREVIEW_ASK_DATA,
  role: 'player',
  firstName: 'Jonah',
  suggestions: PREVIEW_ASK_PLAYER_SUGGESTIONS,
  allowance: 'plenty',
};
const FOCUS = [
  { text: 'Approach from 125 to 150, set by Coach Reyes', ask: 'How is my approach from 125 to 150 doing?' },
  { text: 'Putting gained strokes at Hilltop', ask: 'How did my putting go at Hilltop?' },
];

/** The home's own parts, in the order the page draws (and a keyboard reaches) them. */
const parts = (home: Element) =>
  [...home.children].map((el) => (el.matches('.hi') ? 'greeting' : el.matches('.ch-ask-cmp') ? 'box' : el.matches('.sugg') ? 'starters' : el.matches('.foot') ? 'foot' : el.matches('.pulse') ? 'pulse' : el.matches('.ch-ak-meter') ? 'meter' : el.className));

describe('the desk: the question first', () => {
  it('a coach: the greeting, then the box, then the starters, then what moved since Monday at the foot', () => {
    const { container } = render(<AskHomeV2 data={COACH} phone={false} heroComposer={BOX} onAsk={() => undefined} />);
    const home = container.querySelector('.ch-ak-home')!;
    expect(home.classList.contains('is-phone')).toBe(false);
    expect(parts(home)).toEqual(['greeting', 'box', 'starters', 'foot']);
    expect(home.querySelector('.foot > .pulse > b')!.textContent).toBe('Since Monday');
    expect(home.querySelectorAll('.foot .pulse .rw')).toHaveLength(3);
  });

  it('a player (is-solo): the same order, their focus and their meter at the foot', () => {
    const { container } = render(<AskHomeV2 data={PLAYER} phone={false} heroComposer={BOX} onAsk={() => undefined} focus={FOCUS} />);
    const home = container.querySelector('.ch-ak-home')!;
    expect(parts(home)).toEqual(['greeting', 'box', 'starters', 'foot']);
    expect([...home.querySelector('.foot')!.children].map((el) => el.matches('.pulse') ? 'pulse' : el.matches('.ch-ak-meter') ? 'meter' : el.className)).toEqual(['pulse', 'meter']);
    expect(home.querySelector('.foot .pulse > b')!.textContent).toBe('Your focus');
  });

  it('a starter is a chip with the question alone: no arrow, no tag', () => {
    const { container } = render(<AskHomeV2 data={COACH} phone={false} heroComposer={BOX} onAsk={() => undefined} />);
    const chips = [...container.querySelectorAll('.sugg button')];
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) {
      expect(c.querySelector('svg, small')).toBeNull();
      expect(c.textContent).toBe(c.querySelector('span')!.textContent);
    }
  });

  it('no rounds yet: the note sits between the greeting and the box, and the box still comes before the starters', () => {
    const { container } = render(<AskHomeV2 data={{ ...COACH, noRounds: true }} phone={false} heroComposer={BOX} onAsk={() => undefined} />);
    const order = parts(container.querySelector('.ch-ak-home')!);
    expect(order.slice(0, 1)).toEqual(['greeting']);
    expect(order.indexOf('box')).toBe(2);
    expect(order.indexOf('starters')).toBe(3);
  });
});

describe('the phone keeps its home', () => {
  it('the opener, what moved, the starter rows with arrow and tag, and no box (the screen pins its own)', () => {
    const { container } = render(<AskHomeV2 data={COACH} phone heroComposer={BOX} onAsk={() => undefined} />);
    const home = container.querySelector('.ch-ak-home.is-phone')!;
    expect(parts(home)).toEqual(['greeting', 'pulse', 'starters']);
    expect(container.querySelector('[data-testid="box"]')).toBeNull();
    const row = container.querySelector('.sugg button')!;
    expect(row.querySelector('svg')).not.toBeNull();
    expect(row.querySelector('small')).not.toBeNull();
  });

  it('a player on the phone: focus, meter, then the rows, as before', () => {
    const { container } = render(<AskHomeV2 data={PLAYER} phone heroComposer={BOX} onAsk={() => undefined} focus={FOCUS} />);
    expect(parts(container.querySelector('.ch-ak-home')!)).toEqual(['greeting', 'pulse', 'meter', 'starters']);
  });
});

/** Every `selector { body }` in a sheet (top level and inside @media), comments dropped. */
const rules = (file: string) => {
  const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, sels, body]) => sels!.split(',').map((sel) => ({ sel: sel.trim(), body: body! })));
};
const body = (file: string, sel: string) => {
  const hit = rules(file).filter((r) => r.sel === sel);
  expect(hit, sel).toHaveLength(1);
  return hit[0]!.body;
};
const px = (decl: string, b: string) => Number(b.match(new RegExp(`(?:^|[;\\s])${decl}:\\s*(\\d+)px`))?.[1] ?? NaN);

describe('the rules that hold the box above the fold', () => {
  it('the desk home fills the pane, and auto margins above the greeting and above the foot share the free height', () => {
    expect(body('coachhelm-ask.css', '.ch-ask:not(.is-phone) .ch-ask-scroll.is-home')).toMatch(/display:\s*flex;[\s\S]*flex-direction:\s*column/);
    const home = body('coachhelm-ask-v2.css', '.ch-ak-home:not(.is-phone)');
    expect(home).toMatch(/flex:\s*1 0 auto/);
    expect(home).toMatch(/flex-direction:\s*column/);
    expect(body('coachhelm-ask-v2.css', '.ch-ak-home:not(.is-phone) .hi')).toMatch(/margin-top:\s*auto/);
    expect(body('coachhelm-ask-v2.css', '.ch-ak-home:not(.is-phone) > .foot')).toMatch(/margin-top:\s*auto/);
    // Nothing else in the home takes an auto margin, so nothing else can push the box down.
    const auto = rules('coachhelm-ask-v2.css').filter((r) => r.sel.startsWith('.ch-ak-home:not(.is-phone)') && /margin(-top)?:\s*auto/.test(r.body));
    expect(auto.map((r) => r.sel).sort()).toEqual(['.ch-ak-home:not(.is-phone) .hi', '.ch-ak-home:not(.is-phone) > .foot']);
  });

  it('the starter chips and the foot’s rows are 44 targets; the box’s text starts two lines tall and still grows', () => {
    expect(px('min-height', body('coachhelm-ask-v2.css', '.ch-ak-home:not(.is-phone) .sugg button'))).toBeGreaterThanOrEqual(44);
    // The desk does not shrink ASK-10's 44 on the foot's rows.
    for (const r of rules('coachhelm-ask-v2.css').filter((x) => x.sel.startsWith('.ch-ak-home:not(.is-phone) .pulse .rw'))) expect(r.body).not.toMatch(/min-height/);
    const ta = body('coachhelm-ask.css', '.ch-ask-cmp.is-hero:not(.is-phone) .ch-ask-cmp__ta');
    expect(px('min-height', ta)).toBe(88);
    expect(ta).not.toMatch(/(^|[;\s])height:/);
  });

  it('the box’s own controls rest on a resting fill with no ring; the hover token is not a resting fill', () => {
    const quiet = body('coachhelm-ask.css', '.ch-ask-cmp.is-hero:not(.is-phone) .ch-ask-cmp__chip:not(.is-set)');
    expect(quiet).toMatch(/background-color:\s*var\(--ch-chip-flat-bg\)/);
    expect(quiet).toMatch(/box-shadow:\s*none/);
    expect(rules('coachhelm-ask.css').filter((r) => r.sel.includes('.is-hero') && !r.sel.includes(':hover') && /ledger-row-hover/.test(r.body))).toEqual([]);
    expect(rules('coachhelm-ask-v2.css').filter((r) => r.sel.startsWith('.ch-ak-home:not(.is-phone)') && !r.sel.includes(':hover') && /ledger-row-hover/.test(r.body))).toEqual([]);
  });

  it('the box now sits mid-page, so its picker opens down only while the composer measured room there (else `is-up`)', () => {
    const down = rules('coachhelm-ask.css').filter((r) => /\.ch-ask-cmp\.is-hero:not\(\.is-phone\) \.ch-ask-pick/.test(r.sel) && /top:\s*calc\(100% \+ 8px\)/.test(r.body));
    expect(down.map((r) => r.sel)).toEqual(['.ch-ask-cmp.is-hero:not(.is-phone) .ch-ask-pick:not(.is-up)']);
  });
});

describe('the skeleton waits in the new home’s shape, so nothing jumps on landing', () => {
  it('a coach: the chats column, then the home in its own classes: greeting, box, four 44 chips, the foot', () => {
    const { container } = render(<AskSkeleton chained />);
    expect(container.querySelector('.ch-ask-body.has-panel > .ch-ask-hist')).not.toBeNull();
    const home = container.querySelector('.ch-ask-scroll.is-home > .ch-ak-home')!;
    expect([...home.children].map((el) => el.className.split(' ')[0])).toEqual(['hi', 'ch-skel', 'ch-ask-sk__pills', 'foot']);
    const box = home.children[1] as HTMLElement;
    expect(box.style.height).toBe('206px');
    const chips = [...home.querySelectorAll<HTMLElement>('.ch-ask-sk__pills > .ch-skel')];
    expect(chips).toHaveLength(4);
    for (const c of chips) expect(c.style.height).toBe('44px');
    expect(home.querySelectorAll('.foot > .pulse > .ch-skel-ln')).toHaveLength(5);
    expect(container.querySelector('.ch-ask-scroll.is-home > .ch-ask-foot.is-home')).not.toBeNull();
    expect(container.querySelector('.ch-ask-caps, .ch-ask-home')).toBeNull();
  });

  it('a player: no chats column (is-solo), as the loaded page draws it', () => {
    const { container } = render(<AskSkeleton chained player />);
    expect(container.querySelector('.ch-ask-body')!.className).toBe('ch-ask-body is-solo');
    expect(container.querySelector('.ch-ask-hist')).toBeNull();
    expect(container.querySelectorAll('.ch-ak-home .foot > .pulse > .ch-skel-ln')).toHaveLength(3);
  });
});
