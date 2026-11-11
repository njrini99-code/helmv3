// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));

import { CoachHelmSkeleton } from '../CoachHelmSkeleton';

afterEach(() => {
  cleanup();
  phoneState.on = false;
});

const draw = () => render(<LazyMotion features={domAnimation}><CoachHelmSkeleton view="player" /></LazyMotion>);
const heads = (root: ParentNode) => [...root.querySelectorAll(':scope > .feat, :scope > .card')].map((c) => (c.classList.contains('feat') ? 'focus' : c.querySelector('h4')!.textContent));

/** H6: a player's CoachHelm loads as Your week (their Board), never as the retired board's focus beside a short list. */
describe('a player’s loading state is Your week’s own shapes', () => {
  it('on a desk: the page’s frame, the tight head with the views held, the focus over the plan and the strokes, and the right column’s three cards', () => {
    draw();
    const main = screen.getByRole('main', { name: 'Loading CoachHelm' });
    // Your week's own page frame, so its gutters, measure and grid are the loaded page's.
    expect(main.className).toBe('ch-hf is-desk');
    expect(main.getAttribute('data-ch')).toBe('your-week');
    expect(main.getAttribute('data-canopy')).toBe('');
    const file = main.querySelector(':scope > .dfile') as HTMLElement;
    const head = file.querySelector(':scope > header.ch-hl-h.has-aside') as HTMLElement;
    expect(head.getAttribute('data-canopy-head')).toBe('tight');
    expect(head.querySelector('.ch-hl-h__aside [role="radiogroup"]')).not.toBeNull();
    const cols = [...file.querySelectorAll(':scope > .ch-hf-flow > .grid2 > .col')];
    expect(cols).toHaveLength(2);
    expect(heads(cols[0]!)).toEqual(['focus', 'Your plan', 'Where the strokes go']);
    expect(heads(cols[1]!)).toEqual(['What’s working', 'Last round in context', 'Also worth knowing']);
    // Every card holds the room it lands in, and carries lines under its head.
    for (const c of file.querySelectorAll('.feat, .card')) {
      expect(parseFloat((c as HTMLElement).style.minHeight)).toBeGreaterThan(100);
      expect(c.querySelectorAll('.sk > i.ch-skel').length).toBeGreaterThanOrEqual(2);
    }
    // None of the retired board's shapes.
    expect(main.querySelector('.ch-hl-sk__col, .ch-hl-sk__row, .ch-hl-sk__line')).toBeNull();
  });

  it('on the phone: the view row, the large title and its line, then the cards in the page’s phone order', () => {
    phoneState.on = true;
    draw();
    const main = screen.getByRole('main', { name: 'Loading CoachHelm' });
    expect(main.className).toBe('ch-hf is-phone');
    const kids = [...main.children].map((c) => c.className);
    expect(kids).toEqual(['ch-sr-only', 'ch-hl-sk__tabs', 'dfile']);
    const file = main.querySelector(':scope > .dfile') as HTMLElement;
    expect(file.querySelector(':scope > .dhead.is-week [data-ch-large-title]')).not.toBeNull();
    expect(heads(file.querySelector(':scope > .ch-hf-flow')!)).toEqual(['focus', 'What’s working', 'Your plan', 'Last round in context', 'Where the strokes go', 'Also worth knowing']);
  });

  it('the cards are in the order Your week draws them, on a desk and on the phone', () => {
    const page = readFileSync(join(__dirname, '..', 'file', 'YourWeek.tsx'), 'utf8');
    // Desk: the two columns as YourWeek builds them.
    expect(page).toMatch(/const left = \[feat, <PlanCard[^\n]*<SgCard/);
    expect(page).toMatch(/const right = \[<WorkingCard[^\n]*<FieldCard[^\n]*<ReadsCard/);
    // Phone: the one column's order.
    expect(page.replace(/\s+/g, ' ')).toMatch(/\{feat\} <WorkingCard [^>]*\/> <PlanCard [^>]*\/> \{cards\.field && <FieldCard [^>]*\/>\} \{cards\.sg && <SgCard [^>]*\/>\} <ReadsCard/);
  });

  it('the page stylesheet reaches the route’s skeleton from loading.tsx, never from the skeleton’s own module (it would load ahead of ui.css)', () => {
    const skeleton = readFileSync(join(__dirname, '..', 'CoachHelmSkeleton.tsx'), 'utf8');
    expect(skeleton).not.toMatch(/import '[^']*coachhelm-file\.css'/);
    const loading = readFileSync(join(__dirname, '..', '..', '..', '..', 'app', 'golf', '(dashboard)', 'dashboard', 'coachhelm', 'loading.tsx'), 'utf8');
    expect(loading).toMatch(/import '@\/clubhouse\/styles\/coachhelm-file\.css';/);
  });
});
