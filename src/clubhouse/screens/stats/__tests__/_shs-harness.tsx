import { act, render, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';
import type { ChPlayerProfile } from '../../../data/stats-player';
import type { ChTeamStats } from '../../../data/stats-team';
import { ToastProvider } from '../../../ui/Toast';
import { StatsPlayer } from '../StatsPlayer';
import { StatsTeam } from '../StatsTeam';

/** The tree the phone Stats redesign renders in, and helpers for its tests. The caller mocks haptics, track and next/navigation. */
export const tree = (node: ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);

const real = typeof window === 'undefined' ? undefined : window.matchMedia;
export function asPhone(): void {
  window.matchMedia = ((q: string) => ({ ...real!(q), matches: q === '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' })) as typeof window.matchMedia;
}
export function asDesktop(): void {
  window.matchMedia = real!;
}
export function resetAddress(): void {
  window.history.replaceState(null, '', '/golf/dashboard/stats');
  try {
    sessionStorage.clear();
  } catch {
    // Nothing to clear.
  }
}

export const showPlayer = (data: ChPlayerProfile) => render(tree(<StatsPlayer data={data} coachId={data.viewer === 'coach' ? 'c1' : null} shs />));
export const showTeam = (data: ChTeamStats) => render(tree(<StatsTeam data={data} shs />));

export const card = (go: string, root: ParentNode = document) => root.querySelector<HTMLElement>(`[data-ch="stats-card"][data-go="${go}"]`);
export const cards = () => [...document.querySelectorAll<HTMLElement>('[data-ch="stats-card"]')].map((c) => c.dataset.go);
export const detailShown = () => document.querySelector<HTMLElement>('[data-ch-shs-detail]')?.dataset.chShsDetail ?? null;

export async function painted(go: string): Promise<HTMLElement> {
  await waitFor(() => expect(card(go)).not.toBeNull());
  return card(go)!;
}

/** A Back, as the browser delivers it: the history moved, then `popstate`. */
export async function browserBack(): Promise<void> {
  await act(async () => {
    window.history.back();
    await new Promise((r) => setTimeout(r, 30));
  });
}
