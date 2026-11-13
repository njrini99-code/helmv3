import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTodayThread } from '../earlier-today';
import { QC_RESTORE_MS, qcTeamOf, rememberQcTeam } from '../qc-team';

/**
 * Coach audit 13 Nov 2026 (§2, quick chat #1, #2, #5): with Guilford active, ⌘J opened a Demo University thread, and an old plan
 * card with a live Publish. The conversations table has no team, so the browser remembers which team each quick chat began on:
 * a thread is picked up again only when it is this team's and was touched in the last 30 minutes; anything else opens fresh.
 */
const NOW = new Date('2026-11-12T20:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const MESSAGES = [{ id: 'm1', conversation_id: 'c1', role: 'user', content: 'Plan Thursday', ui_parts: null, created_at: minutesAgo(12) }];

function serve(conversations: Array<{ id: string; created_at: string; updated_at: string; surface?: string | null }>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify({ conversations }), { status: 200 });
    return new Response(JSON.stringify({ messages: MESSAGES }), { status: 200 });
  }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('quick chat picks up a thread only for this team, and only a recent one', () => {
  it('waits 30 minutes, no more', () => {
    expect(QC_RESTORE_MS).toBe(30 * 60_000);
  });

  it('a thread this team began, touched 10 minutes ago, is picked up', async () => {
    rememberQcTeam('c1', 'guilford');
    serve([{ id: 'c1', created_at: minutesAgo(15), updated_at: minutesAgo(10), surface: 'quick_chat' }]);
    expect((await readTodayThread(NOW, 'guilford'))?.id).toBe('c1');
  });

  it('one touched 45 minutes ago opens fresh', async () => {
    rememberQcTeam('c1', 'guilford');
    serve([{ id: 'c1', created_at: minutesAgo(50), updated_at: minutesAgo(45), surface: 'quick_chat' }]);
    expect(await readTodayThread(NOW, 'guilford')).toBeNull();
  });

  it('another team’s thread is never picked up', async () => {
    rememberQcTeam('c1', 'demo-university');
    serve([{ id: 'c1', created_at: minutesAgo(5), updated_at: minutesAgo(2), surface: 'quick_chat' }]);
    expect(await readTodayThread(NOW, 'guilford')).toBeNull();
  });

  it('a thread with no team on record (begun on another device) opens fresh', async () => {
    serve([{ id: 'c1', created_at: minutesAgo(5), updated_at: minutesAgo(2), surface: 'quick_chat' }]);
    expect(await readTodayThread(NOW, 'guilford')).toBeNull();
  });

  it('a newer thread of another team does not hide this team’s', async () => {
    rememberQcTeam('c2', 'demo-university');
    rememberQcTeam('c1', 'guilford');
    serve([
      { id: 'c2', created_at: minutesAgo(4), updated_at: minutesAgo(1), surface: 'quick_chat' },
      { id: 'c1', created_at: minutesAgo(20), updated_at: minutesAgo(8), surface: 'quick_chat' },
    ]);
    expect((await readTodayThread(NOW, 'guilford'))?.id).toBe('c1');
  });

  it('the memory survives a reload and ignores a broken entry', () => {
    rememberQcTeam('c9', 'guilford');
    expect(qcTeamOf('c9')).toBe('guilford');
    window.localStorage.setItem('ch.qc.teams', '{not json');
    expect(qcTeamOf('c9')).toBeNull();
  });
});
