import { act, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The front door's Bridge signals: P015's addresses only, held while signed out, sent as the person once signed in. */

type AuthCallback = (event: string, session: { user: { id: string; user_metadata?: Record<string, unknown> } } | null) => void;

const nav = vi.hoisted(() => ({ pathname: '/golf/login' }));
const auth = vi.hoisted(() => ({ callback: null as AuthCallback | null, unsubscribe: vi.fn() }));
const hook = vi.hoisted(() => ({ useChSignals: vi.fn() }));

vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: AuthCallback) => {
        auth.callback = cb;
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      },
    },
  }),
}));
vi.mock('../use-signals', () => hook);

import { GateSignals, gateRole } from '../GateSignals';

/** Lets the lazily loaded browser client arrive. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const last = () => hook.useChSignals.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;

describe('GateSignals', () => {
  beforeEach(() => {
    hook.useChSignals.mockClear();
    auth.unsubscribe.mockClear();
    auth.callback = null;
    nav.pathname = '/golf/login';
  });
  afterEach(() => document.body.replaceChildren());

  it('does nothing with the switch off', async () => {
    render(<GateSignals enabled={false} />);
    await settle();
    expect(hook.useChSignals).not.toHaveBeenCalled();
  });

  it("does nothing on the dashboard's pages, where the shell counts", async () => {
    for (const path of ['/golf/dashboard', '/golf/dashboard/roster', '/golf/admin/clubhouse', '/golf']) {
      nav.pathname = path;
      const { unmount } = render(<GateSignals enabled />);
      await settle();
      unmount();
    }
    expect(hook.useChSignals).not.toHaveBeenCalled();
  });

  it('holds on the front door while nobody is signed in', async () => {
    render(<GateSignals enabled />);
    await settle();
    act(() => auth.callback?.('INITIAL_SESSION', null));
    expect(last()).toMatchObject({ enabled: true, hold: true, userId: null, teamId: null, pathname: '/golf/login' });
  });

  it('sends as the person once a sign-in says who they are', async () => {
    render(<GateSignals enabled />);
    await settle();
    act(() => auth.callback?.('SIGNED_IN', { user: { id: 'coach-1', user_metadata: { role: 'coach' } } }));
    expect(last()).toMatchObject({ enabled: true, hold: false, role: 'coach', userId: 'coach-1', pathname: '/golf/login' });
  });

  it('keeps holding for someone signed in whose role neither their account nor the address says', async () => {
    nav.pathname = '/golf/welcome';
    render(<GateSignals enabled />);
    await settle();
    act(() => auth.callback?.('INITIAL_SESSION', { user: { id: 'u-3', user_metadata: {} } }));
    expect(last()).toMatchObject({ hold: true, userId: null });
  });

  it('takes the role from the invitation a signed-in person opened', async () => {
    nav.pathname = '/golf/join/ABC123';
    render(<GateSignals enabled />);
    await settle();
    act(() => auth.callback?.('INITIAL_SESSION', { user: { id: 'player-2' } }));
    expect(last()).toMatchObject({ hold: false, role: 'player', userId: 'player-2', pathname: '/golf/join/ABC123' });
  });

  it('stops, and drops what waits, when a session it saw ends (a sign-out in another tab)', async () => {
    render(<GateSignals enabled />);
    await settle();
    act(() => auth.callback?.('SIGNED_IN', { user: { id: 'coach-1', user_metadata: { role: 'coach' } } }));
    act(() => auth.callback?.('SIGNED_OUT', null));
    expect(last()).toMatchObject({ enabled: false, hold: false, userId: null });
    act(() => auth.callback?.('SIGNED_IN', { user: { id: 'coach-9', user_metadata: { role: 'coach' } } }));
    expect(last()).toMatchObject({ enabled: true, hold: false, userId: 'coach-9' });
  });

  it('stops following the session when the front door is left', async () => {
    const { unmount } = render(<GateSignals enabled />);
    await settle();
    unmount();
    expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('gateRole', () => {
  it("takes the account's declared role first, then the address's", () => {
    expect(gateRole('/golf/player', 'coach')).toBe('coach');
    expect(gateRole('/golf/coach/pending', undefined)).toBe('coach');
    expect(gateRole('/golf/staff/join/x1', null)).toBe('coach');
    expect(gateRole('/golf/player', 'admin')).toBe('player');
    expect(gateRole('/golf/join', undefined)).toBe('player');
    expect(gateRole('/golf/login', undefined)).toBeNull();
  });
});

describe('every Bridge page has an emitter', () => {
  const graph = JSON.parse(readFileSync(join(process.cwd(), 'docs/clubhouse/generated/bridge-graph.json'), 'utf8')) as {
    pages: Record<string, { routes: string[] }>;
  };
  const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

  it("serves each page's routes under the dashboard's shell or the front door's signals", () => {
    const unserved: string[] = [];
    for (const [id, page] of Object.entries(graph.pages)) {
      for (const route of page.routes) {
        const shell = route === '/golf/dashboard' || route.startsWith('/golf/dashboard/');
        if (!shell && id !== 'P015') unserved.push(`${id} ${route}`);
      }
    }
    expect(unserved).toEqual([]);
  });

  it('mounts both', () => {
    expect(read('src/app/golf/(dashboard)/layout.tsx')).toMatch(/<ClubhouseShell\b/);
    expect(read('src/clubhouse/shell/ClubhouseFrame.tsx')).toMatch(/useChSignals\(\{ enabled: shell\.signals === true/);
    expect(read('src/app/golf/layout.tsx')).toMatch(/<GateSignals enabled=\{isFlagEnabled\('clubhouse_signals'/);
  });
});
