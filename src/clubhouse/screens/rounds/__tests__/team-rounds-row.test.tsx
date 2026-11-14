import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The phone row of Team rounds: every round has one structure, a name, the course, then the tee and what kind of round it was. */
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => true }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/rounds' }));

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_TEAM_ROUNDS } from '../../../preview/fixtures-team-rounds';
import { CrumbProvider } from '../../../shell/crumbs';
import { PhoneChromeProvider } from '../../../shell/phone-chrome';
import { ToastProvider } from '../../../ui/Toast';
import { TeamRounds } from '../TeamRounds';

const show = () =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <TeamRounds data={PREVIEW_TEAM_ROUNDS} teamId="t1" />
            </div>
          </PhoneChromeProvider>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>,
  );
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/rounds.css'), 'utf8');
const rule = (sel: string) => {
  const at = css.indexOf(`\n${sel} {`);
  if (at < 0) throw new Error(`no rule ${sel}`);
  return css.slice(at, css.indexOf('}', at));
};

afterEach(cleanup);

describe('Team rounds · the phone row keeps one structure', () => {
  it('a long tee name gives way before the chip beside it takes a third line', () => {
    show();
    // Eli Brooks at Carolina GC, from the Championship tees: the name is its own item, so it can end in an ellipsis.
    const row = screen.getByRole('link', { name: /^Sep 26 Eli Brooks Carolina GC/ });
    const kind = row.querySelector('.ch-trd-meta__kind')!;
    expect(kind.querySelector('.ch-trd-meta__tee > .ch-trd-meta__teen')!.textContent).toBe('Championship tees');
    expect(kind.querySelectorAll('.ch-rd-pill')).toHaveLength(1);
    const name = rule('.ch-trd-meta__teen');
    expect(name).toContain('text-overflow: ellipsis');
    expect(name).toContain('white-space: nowrap');
    expect(name).toContain('min-width: 0');
    expect(rule('.ch-trd-meta__tee')).toContain('min-width: 0');
    // One chip: the line never wraps. Two or more still may.
    expect(rule('.ch-trd-meta__kind:not(:has(.ch-rd-pill ~ .ch-rd-pill))')).toContain('flex-wrap: nowrap');
    expect(rule('.ch-trd-meta__kind')).toContain('flex-wrap: wrap');
    expect(rule('.ch-trd-meta__kind > .ch-rd-pill')).toContain('flex: none');
  });

  it('the score column is in tabular numerals, so a +3 over a 75 lines up with an E over a 72', () => {
    show();
    const scores = [...document.querySelectorAll('.ch-trd-score')];
    expect(scores.length).toBe(PREVIEW_TEAM_ROUNDS.rounds.list.length);
    for (const s of scores) {
      expect(s.querySelector('b')!.classList.contains('ch-num')).toBe(true);
      expect(s.querySelector('em')!.classList.contains('ch-num')).toBe(true);
    }
    // The season's captions and the head line carry figures too.
    expect([...document.querySelectorAll('.ch-fgr__note')].every((n) => n.querySelector('.ch-num') != null)).toBe(true);
    expect(document.querySelector('.ch-rd-k')!.classList.contains('ch-num')).toBe(true);
  });
});
