import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false, updatePreferences: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/qualifiers' }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: vi.fn(), removeChannel: vi.fn() }) }));

import { ToastProvider } from '../../../ui/Toast';
import { QualifiersList } from '../QualifiersList';
import { endedLabel } from '../model';
import { previewList } from '../../../preview/fixtures-qualifiers';

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
const dayAfter = (iso: string) => new Date(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Prod audit 2026-11-15, P1-22 / N13P-51: the Fall Invitational Qualifier still read Active, "Waiting on 7 rounds", 45 days after its
 * last day, so the player could not tell whether they made the squad. The coach's words stay theirs: they chase the rounds and close it.
 */
describe('a qualifier past its last day, as a player sees it', () => {
  it('the label says it is closed and waiting on the coach, not on rounds', () => {
    expect(endedLabel({ outstanding: 7 }, 'player')).toBe('Closed · awaiting coach’s final');
    expect(endedLabel({ outstanding: null }, 'player')).toBe('Closed · awaiting coach’s final');
    expect(endedLabel({ outstanding: 7 })).toBe('Waiting on 7 rounds');
    expect(endedLabel({ outstanding: 7 }, 'coach')).toBe('Waiting on 7 rounds');
  });

  it('on the list it files under Concluded with the closed label; the coach still sees it under Active', () => {
    const player = previewList('player');
    const live = player.items.find((i) => i.status === 'in_progress')!;
    const today = dayAfter([...player.items.map((i) => i.endDate ?? '')].sort().at(-1)!);
    wrap(<QualifiersList data={{ ...player, today }} />);
    const concluded = screen.getByRole('heading', { name: 'Concluded' }).closest('section')!;
    const card = within(concluded).getByText(live.name).closest('a')!;
    expect(card.textContent).toContain('Closed · awaiting coach’s final');
    expect(document.body.textContent).not.toMatch(/Waiting on \d+ rounds?/);
    expect(screen.queryByRole('heading', { name: 'Active' })).toBeNull();
    cleanup();

    const coach = previewList('coach');
    wrap(<QualifiersList data={{ ...coach, today }} />);
    const active = screen.getByRole('heading', { name: 'Active' }).closest('section')!;
    expect(within(active).getByText(coach.items.find((i) => i.status === 'in_progress')!.name)).toBeTruthy();
    expect(document.body.textContent).not.toContain('Closed · awaiting coach’s final');
  });

  it('before its last day is over, a player still sees it live under Active', () => {
    const player = previewList('player');
    const live = player.items.find((i) => i.status === 'in_progress')!;
    wrap(<QualifiersList data={{ ...player, today: live.startDate }} />);
    const active = screen.getByRole('heading', { name: 'Active' }).closest('section')!;
    expect(within(active).getByText(live.name)).toBeTruthy();
    expect(document.body.textContent).not.toContain('Closed · awaiting coach’s final');
  });
});
