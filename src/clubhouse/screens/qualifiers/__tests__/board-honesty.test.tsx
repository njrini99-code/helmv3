import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false, updatePreferences: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/qualifiers' }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: vi.fn(), removeChannel: vi.fn() }) }));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({ createGolfQualifier: vi.fn(), setQualifierRoundCourses: vi.fn(), updateGolfQualifierDetails: vi.fn(), updateQualifierStatus: vi.fn() }));
vi.mock('@/app/golf/actions/qualifier-setup', () => ({ setQualifierEntrants: vi.fn(), setQualifierSquadSize: vi.fn() }));

import { ToastProvider } from '../../../ui/Toast';
import { QualifierDetail } from '../QualifierDetail';
import { StandingsSpread } from '../StandingsSpread';
import { DETAIL_INDEX, previewDetail } from '../../../preview/fixtures-qualifiers';

afterEach(cleanup);

const wrap = (node: ReactNode) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
const writes = () => ({ create: vi.fn(), saveEdit: vi.fn(), setStatus: vi.fn(async () => ({ success: true })), courses: vi.fn(async () => []), tees: vi.fn(async () => []) });

/** Coach audit 13 Nov 2026 (§12 #2–#3): Samanyu, 2 of 3 rounds at +14, looked tied with Connor; the rules printed twice as one run-on. */
describe('the qualifier board says what it holds', () => {
  it('a card a round behind the field is drawn hollow on the spread; mid-round, cards level with the field are not', () => {
    const d = previewDetail(DETAIL_INDEX.live!, 'coach');
    const rows = d.board!.rows.filter((r) => r.toPar != null);
    const most = Math.max(...rows.map((r) => r.played));
    // Samanyu's case: everyone else has three rounds in, he has two.
    const field = rows.map((r, i) => (i === rows.length - 1 ? { ...r, played: most - 1 } : { ...r, played: most }));
    const { container, unmount } = render(<StandingsSpread rows={field} topScore={d.board!.topScore} />);
    const hollow = () => [...container.querySelectorAll('.ch-qf-sp__plot li.is-short')];
    expect(hollow()).toHaveLength(1);
    unmount();
    const level = rows.map((r) => ({ ...r, played: most }));
    const again = render(<StandingsSpread rows={level} topScore={d.board!.topScore} />);
    expect(again.container.querySelectorAll('.ch-qf-sp__plot li.is-short')).toHaveLength(0);
  });

  it('the rules show once, keep the coach’s line breaks, and fold when long', async () => {
    const rules = 'Playoffs (if needed) will be Thursday at the Cardinal.\nSudden death.\nBall will be played up through the green on every hole, and the coach decides ties on the day if weather shortens a round.';
    const d = { ...previewDetail(DETAIL_INDEX.live!, 'coach'), rules };
    await act(async () => {
      wrap(<QualifierDetail data={d} writes={writes()} live={false} />);
    });
    const shown = [...document.querySelectorAll('*')].filter((el) => el.childElementCount === 0 && el.textContent?.includes('Sudden death.'));
    expect(shown).toHaveLength(1);
    expect(shown[0]!.classList.contains('ch-qf-rules')).toBe(true);
    expect(shown[0]!.textContent).toContain('Cardinal.\nSudden death.');
    expect(shown[0]!.classList.contains('is-folded')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Show all rules' }));
    expect(shown[0]!.classList.contains('is-folded')).toBe(false);
  });
});
