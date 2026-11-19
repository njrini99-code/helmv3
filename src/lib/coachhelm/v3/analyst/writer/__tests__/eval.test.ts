import { describe, expect, it } from 'vitest';
import { PRODUCTION_PROJECT_REF } from '../../dry-run';
import { checkWriterEvalArgs, estimateCost, offlineClient, parseWriterEvalArgs, runWriterEval } from '../eval';
import { syntheticPlayers } from './fixtures';

const TEAM = '11111111-1111-4111-8111-111111111111';
const STAGING = ['--target', 'staging', '--url', 'https://stagingref.supabase.co', '--service-key-env', 'K', '--team', TEAM];
const env = { K: 'not-a-jwt', ANTHROPIC_API_KEY: 'x' };
const check = (argv: string[], e: Record<string, string | undefined> = env) => checkWriterEvalArgs(parseWriterEvalArgs(argv), e);

describe('the eval refuses to spend without every safeguard', () => {
  it('is offline by default', () => {
    expect(check([])).toEqual({ ok: true, live: false, view: 'coach', target: 'fixtures' });
  });

  it('refuses a live run without --max-usd, without staging, or without a key', () => {
    expect(check(['--live', ...STAGING])).toMatchObject({ ok: false, why: expect.stringContaining('--max-usd') });
    expect(check(['--live', '--max-usd', '2'])).toMatchObject({ ok: false, why: expect.stringContaining('--target staging') });
    expect(check(['--live', '--max-usd', '2', ...STAGING], { K: 'not-a-jwt' })).toMatchObject({ ok: false, why: expect.stringContaining('ANTHROPIC_API_KEY') });
    expect(check(['--max-usd', '2'])).toMatchObject({ ok: false });
    expect(() => parseWriterEvalArgs(['--max-usd', '0'])).toThrow('positive');
    expect(() => parseWriterEvalArgs(['--max-usd', 'lots'])).toThrow('positive');
  });

  it('refuses production by URL and by key', () => {
    const prodUrl = ['--live', '--max-usd', '2', '--target', 'staging', '--url', `https://${PRODUCTION_PROJECT_REF}.supabase.co`, '--service-key-env', 'K', '--team', TEAM];
    expect(check(prodUrl)).toMatchObject({ ok: false, why: expect.stringContaining('production') });
    const jwt = `x.${Buffer.from(JSON.stringify({ ref: PRODUCTION_PROJECT_REF })).toString('base64url')}.y`;
    expect(check(['--live', '--max-usd', '2', ...STAGING], { K: jwt, ANTHROPIC_API_KEY: 'x' })).toMatchObject({ ok: false, why: expect.stringContaining('production') });
  });

  it('accepts a live staging run with every safeguard', () => {
    expect(check(['--live', '--max-usd', '2', ...STAGING])).toMatchObject({ ok: true, live: true, target: 'staging', maxUsd: 2 });
  });
});

describe('the offline run', () => {
  it('calls no model, writes nothing, and estimates the cost from the prompt', async () => {
    const players = syntheticPlayers();
    const client = offlineClient();
    const report = await runWriterEval(players, { view: 'coach', client, live: false, maxUsd: null, now: () => new Date('2026-11-10T00:00:00Z') });
    expect(client.calls).toBe(players.length * 2);
    expect(report).toMatchObject({ live: false, written: 0, spent_usd: 0, skipped_for_budget: [], rejection_counts: { no_read_returned: players.length * 2 } });
    const e = estimateCost(players[0]!.sheet, players[0]!.notability, 'coach')!;
    expect(e.prompt_tokens).toBeGreaterThan(1000);
    expect(e.two_attempts_usd).toBeGreaterThan(e.one_attempt_usd);
  });

  it('stops before a player whose worst case would pass the cap', async () => {
    const players = syntheticPlayers();
    const report = await runWriterEval(players, { view: 'coach', client: offlineClient(), live: true, maxUsd: 0.01, now: () => new Date() });
    expect(report.skipped_for_budget).toEqual(players.map((p) => p.id));
    expect(report.rows).toEqual([]);
  });
});
