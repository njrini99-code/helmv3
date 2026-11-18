/* eslint-disable jsx-a11y/aria-role -- role is a component prop (ClubhouseMarker, AliasWait), not an ARIA role */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/golf/dashboard/old',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { AliasWait, aliasSkeletonFor, CH_ALIAS_WAIT_MS } from '../NotRebuilt';
import { ClubhouseMarker } from '../context';

/**
 * GAP-S-19: an old address on its way to its new screen draws that screen's skeleton (the shell's plain page skeleton
 * when the destination isn't known), keeps waiting while its segment is still streaming, and falls to "not rebuilt"
 * (CH-1301) only once the segment has rendered without redirecting.
 */
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('aliasSkeletonFor: each alias draws where its layout sends that role', () => {
  it.each([
    ['/golf/dashboard/team', 'coach', 'settings-team'],
    ['/golf/dashboard/team', 'player', 'settings-golf'],
    ['/golf/dashboard/intelligence', 'coach', 'coachhelm'],
    ['/golf/dashboard/courses', 'coach', 'home'],
    ['/golf/dashboard/roster/abc', 'coach', 'stats-profile'],
    ['/golf/dashboard/roster/abc', 'player', 'roster'],
    ['/golf/dashboard/players/abc/game', 'coach', 'stats-profile'],
    ['/golf/dashboard/coachhelm/chat', 'coach', 'ask'],
    ['/golf/dashboard/coachhelm/chat', 'player', 'coachhelm'],
    ['/golf/dashboard/coachhelm/qualifying/q1', 'coach', 'qualifier-selection'],
    ['/golf/dashboard/coachhelm/qualifying/q1', 'player', 'qualifier'],
    ['/golf/dashboard/coachhelm/genome/p1', 'coach', 'stats-profile'],
    ['/golf/dashboard/coachhelm/genome/compare', 'coach', 'stats-team'],
    ['/golf/dashboard/whats-new', 'player', 'home'],
    ['/golf/dashboard/live/', 'player', 'home'],
  ] as const)('%s for a %s → %s', (path, role, which) => {
    expect(aliasSkeletonFor(path, role)).toBe(which);
  });

  it('names nothing for an address it does not know, or a role that is not sent on', () => {
    expect(aliasSkeletonFor('/golf/dashboard/elsewhere', 'coach')).toBeNull();
    expect(aliasSkeletonFor('/golf/dashboard/intelligence', 'player')).toBeNull();
  });
});

describe('AliasWait draws a skeleton, never a blank canvas (GAP-S-19)', () => {
  it("draws the destination's skeleton (a coach's Team opens Settings on Team), then CH-1301 only if nothing redirected", () => {
    render(
      <ClubhouseMarker role="coach">
        <AliasWait label="Team" path="/golf/dashboard/team" role="coach" />
      </ClubhouseMarker>,
    );
    const settings = code('CH-8401');
    expect(settings).not.toBeNull();
    expect(settings!.getAttribute('data-section')).toBe('team');
    expect(settings!.getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector('[role="status"]')!.textContent).toBe('Opening…');
    expect(code('CH-1301')).toBeNull();
    act(() => vi.advanceTimersByTime(CH_ALIAS_WAIT_MS));
    expect(code('CH-1301')).not.toBeNull();
    expect(code('CH-8401')).toBeNull();
  });

  it("draws the shell's plain page skeleton when the destination isn't known", () => {
    const { container } = render(<AliasWait label="Old page" path="/golf/dashboard/elsewhere" role="coach" />);
    expect(container.querySelector('main.ch-boot-page[aria-busy="true"]')).not.toBeNull();
    expect(code('CH-1301')).toBeNull();
  });

  it('keeps waiting while the alias segment is still streaming, and falls to CH-1301 once it rendered without redirecting', () => {
    const Frame = ({ pending }: { pending: boolean }) => (
      <ClubhouseMarker role="coach">
        <AliasWait label="Team" path="/golf/dashboard/team" role="coach" />
        <div hidden>{pending ? <main aria-busy="true">loading</main> : <p>Team body</p>}</div>
      </ClubhouseMarker>
    );
    const view = render(<Frame pending />);
    act(() => vi.advanceTimersByTime(CH_ALIAS_WAIT_MS * 3));
    expect(code('CH-1301')).toBeNull();
    expect(code('CH-8401')).not.toBeNull();
    view.rerender(<Frame pending={false} />);
    act(() => vi.advanceTimersByTime(CH_ALIAS_WAIT_MS));
    expect(code('CH-1301')).not.toBeNull();
  });
});
