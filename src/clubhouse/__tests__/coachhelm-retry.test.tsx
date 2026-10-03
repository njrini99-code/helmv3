import { LazyMotion, domAnimation } from 'framer-motion';
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './dialog-polyfill';

/**
 * CoachHelm (P013), owner rule 2 (2026-10-01): every Try again on these pages goes through `useRefresh` (`RefreshNotice`), so it says
 * it is working and ignores a second tap, and no screen calls `router.refresh()` bare. Each failed state is rendered and retried.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px)' }));

import type { ChAskData, ChAskLoad } from '../data/coachhelm-chat-shape';
import { Ask } from '../screens/coachhelm/chat/Ask';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { DeepDive } from '../screens/coachhelm/views/DeepDive';
import { Profile } from '../screens/coachhelm/views/Profile';
import { Standing } from '../screens/coachhelm/views/Standing';
import { PREVIEW_ASK_DATA } from '../preview/fixtures-ask';
import { PREVIEW_HELM_COACH_FAILED, PREVIEW_HELM_COACH_PULSE_FAILED, PREVIEW_HELM_PLAYER_FAILED, PREVIEW_HELM_PLAYER_PROPOSALS_FAILED } from '../preview/fixtures-coachhelm';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { ClubhouseMarker } from '../shell/context';
import { ToastProvider } from '../ui/Toast';

const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <PhoneChromeProvider>
        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
        <ClubhouseMarker role="coach">
          <div className="ch-root" data-ui="clubhouse">
            {node}
          </div>
        </ClubhouseMarker>
      </PhoneChromeProvider>
    </ToastProvider>
  </LazyMotion>
);
const ask = (load: ChAskLoad) => <Ask load={load} />;
const ready = (over: Partial<ChAskData> = {}): ChAskLoad => ({ status: 'ready', data: { ...PREVIEW_ASK_DATA, ...over } });

beforeEach(() => {
  phoneState.on = false;
  router.refresh.mockClear();
  router.push.mockClear();
});
afterEach(cleanup);

describe('every Try again on the CoachHelm pages is a refresh that says it is working', () => {
  const cases: Array<[string, () => React.ReactNode, string]> = [
    ['CH-13202 the coach’s players did not load', () => <CoachBoard data={PREVIEW_HELM_COACH_FAILED} />, 'CH-13202'],
    ['CH-13203 the pulse did not load', () => <CoachBoard data={PREVIEW_HELM_COACH_PULSE_FAILED} />, 'CH-13203'],
    ['CH-13201 the player’s insights did not load', () => <PlayerBoard data={PREVIEW_HELM_PLAYER_FAILED} />, 'CH-13201'],
    ['CH-13205 the proposed focus areas did not load', () => <PlayerBoard data={PREVIEW_HELM_PLAYER_PROPOSALS_FAILED} />, 'CH-13205'],
    ['CH-13260 the Game profile did not load', () => <Profile load={{ status: 'failed' }} />, 'CH-13260'],
    ['CH-13270 the standing did not load', () => <Standing load={{ status: 'failed' }} />, 'CH-13270'],
    ['CH-13280 the Deep dive did not load', () => <DeepDive load={{ status: 'failed' }} />, 'CH-13280'],
    ['CH-13221 the Ask context did not load', () => ask({ status: 'failed' }), 'CH-13221'],
    ['CH-13222 the chats did not load', () => ask(ready({ conversations: { list: [], error: true } })), 'CH-13222'],
    ['CH-13223 the pulse did not load, on the desktop', () => ask(ready({ pulse: null })), 'CH-13223'],
    ['CH-13224 the conversation did not load', () => ask(ready({ threadFailed: true })), 'CH-13224'],
  ];
  it.each(cases)('%s', async (_name, node, code) => {
    render(wrap(node()));
    const notice = document.querySelector(`[data-ch-code="${code}"]`) as HTMLElement;
    expect(notice).not.toBeNull();
    await userEvent.click(notice.querySelector('button') as HTMLButtonElement);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('no screen of the page asks the router to refresh on its own: the retry is `useRefresh`’s (a second tap while one is in flight is ignored)', () => {
    const root = join(__dirname, '..', 'screens', 'coachhelm');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(root);
    const bare = files.filter((f) => /router\.refresh\(/.test(readFileSync(f, 'utf8')));
    expect(bare).toEqual([]);
  });
});
