import { describe, expect, it } from 'vitest';
import graph from '../../../../../docs/clubhouse/generated/bridge-graph.json';
import { explainFailure, failureHeadline, HEADLINE_MAX, normalizeQuotes, plainLine, sawText } from '../explain';
import { describeServerCode, isMigrationMissingCode } from '@/lib/admin/server-codes';

type Id = { ch?: string; meaning: string; catalogRow?: { theySee?: string } };
const ids = Object.entries((graph as unknown as { ids: Record<string, Id> }).ids);

describe('failureHeadline over every id in the real Bridge map', () => {
  const headlines = ids.map(([id, v]) => ({ id, ...failureHeadline({ theySee: v.catalogRow?.theySee ?? null, meaning: v.meaning, code: v.ch ?? null, kind: 'failure' }) }));

  it('has one for every id', () => {
    expect(headlines.length).toBeGreaterThan(1000);
    expect(headlines.every((h) => h.text.length > 0)).toBe(true);
  });
  it('is one readable line: capped, no backticks, braces or spec references', () => {
    const bad = headlines.filter(
      (h) => h.text.length > HEADLINE_MAX + 1 || /[`{}]/.test(h.text) || /GAP-|\(D-\d|\(R-\d|\brow \d\d|owner, 20/.test(h.text) || /\s{2}/.test(h.text),
    );
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it('never leaves a bracket open', () => {
    const open = headlines.filter((h) => (h.text.match(/\(/g) ?? []).length > (h.text.match(/\)/g) ?? []).length);
    expect(open.slice(0, 5)).toEqual([]);
  });
  it('uses straight quotes nowhere (one quote style)', () => {
    expect(headlines.filter((h) => /["']/.test(h.text)).slice(0, 5)).toEqual([]);
  });
  it('quotes only what a person read', () => {
    expect(headlines.filter((h) => h.quoted).length).toBeGreaterThan(500);
    const bell = headlines.find((h) => h.id === '10601');
    expect(bell).toMatchObject({ quoted: true, text: 'Couldn’t mark your notifications read' });
  });
});

describe('sawText and plainLine', () => {
  it('takes the leading quoted message only', () => {
    expect(sawText('"Couldn\'t mark your notifications read", Retry; the unread dots come back.')).toBe('Couldn’t mark your notifications read');
    expect(sawText('“Notifications didn’t load” + “Try again; the error has been reported.”')).toBe('Notifications didn’t load');
  });
  it('rejects prose that only mentions a label, and templates', () => {
    expect(sawText('Its top bar is already the pushed bar: the back link ("‹ More")')).toBeNull();
    expect(sawText('"{Thing} isn’t here" when the section names it')).toBeNull();
    expect(sawText(null)).toBeNull();
  });
  it('drops spec references and backticks, keeps the first sentence', () => {
    expect(plainLine('A save still hasn’t answered after 20 seconds (GAP-S-31)')).toBe('A save still hasn’t answered after 20 seconds');
    expect(plainLine('Opening a notification: the server did not keep the read (it answered `success: false`, or the call failed)')).toBe(
      'Opening a notification: the server did not keep the read',
    );
  });
  it('normalizes quotes to one style', () => {
    expect(normalizeQuotes(`"Mark all read" in the bell doesn't work`)).toBe('“Mark all read” in the bell doesn’t work');
  });
});

describe('describeServerCode', () => {
  it('explains exact codes from the PostgREST and Postgres lists', () => {
    expect(describeServerCode('42501')).toMatchObject({ label: 'Row rule refused', owner: 'access', match: 'exact', source: 'Postgres' });
    expect(describeServerCode('PGRST116')).toMatchObject({ label: 'Not exactly one row', match: 'exact', source: 'PostgREST' });
    expect(describeServerCode('PGRST116')!.meaning).toMatch(/none or more than one/);
  });
  it('falls back to the SQLSTATE class, then to the code itself', () => {
    expect(describeServerCode('23P02')).toMatchObject({ label: 'Data rule broken', match: 'class' });
    expect(describeServerCode('57P01')).toMatchObject({ owner: 'timeout', match: 'class' });
    expect(describeServerCode('PGRST999')).toMatchObject({ match: 'none', owner: 'unknown' });
    expect(describeServerCode(null)).toBeNull();
  });
  it('groups the codes that mean a migration is missing', () => {
    for (const c of ['42P01', '42703', '42883', '3F000', 'PGRST202', 'PGRST204', 'PGRST205']) {
      expect(isMigrationMissingCode(c)).toBe(true);
      expect(describeServerCode(c)!.steps.join(' ')).toMatch(/HELD\.md/);
    }
    expect(isMigrationMissingCode('42501')).toBe(false);
  });
});

describe('explainFailure', () => {
  const f = (o: Partial<Parameters<typeof explainFailure>[0]>) => explainFailure({ kind: 'action', outcome: 'failure', serverCode: null, message: null, ...o });

  it('trusts the server code first and says so', () => {
    const e = f({ serverCode: '42501', message: 'Load failed' });
    expect(e).toMatchObject({ label: 'Row rule refused', basis: 'server code', basisWords: 'from Postgres code 42501' });
    expect(e.steps.join(' ')).toMatch(/test:rls/);
  });
  it.each([
    ['Load failed', 'Connection dropped', 'network'],
    ['TypeError: Failed to fetch', 'Connection dropped', 'network'],
    ['TimeoutError: The operation was aborted', 'Gave up waiting', 'timeout'],
    ['You must be signed in', 'Signed out', 'sign-in'],
    ['Unauthorized', 'Signed out', 'sign-in'],
    ['Forbidden', 'Not allowed', 'access'],
    ['Round not found or was deleted', 'Not found', 'data'],
    ['live channel CHANNEL_ERROR', 'Live updates dropped', 'network'],
    ['chat/stream: model error — messages.7.content.1: `tool_use` ids must be unique', 'AI model error', 'server'],
    ['ChunkLoadError: Loading chunk 812 failed', 'Old app version', 'app'],
    ['Failed to find Server Action "abc". This request might be from an older or newer deployment.', 'Old app version', 'app'],
    ['relation "public.golf_thing" does not exist', 'Schema missing', 'migration'],
    ['Request failed with status 502', 'Server error', 'server'],
  ])('reads %j as %s', (message, label, owner) => {
    expect(f({ message })).toMatchObject({ label, owner, basis: 'message' });
  });
  it('a crash with no code says it only knows the kind', () => {
    expect(f({ kind: 'crash' })).toMatchObject({ label: 'Section crashed', basis: 'kind' });
  });
  it('a bare failure says the cause was not reported, never a guess', () => {
    expect(f({ message: 'action failed' })).toMatchObject({ label: 'Cause not reported', owner: 'unknown', basis: 'nothing' });
  });
  it('an unlisted code with no useful message keeps the code and asks for an entry', () => {
    expect(f({ serverCode: 'PGRST999' })).toMatchObject({ basis: 'server code', owner: 'unknown' });
  });
  it('every step list is non-empty', () => {
    for (const code of ['42501', '23505', '57014', 'PGRST301', 'XX000', '08006']) expect(f({ serverCode: code }).steps.length).toBeGreaterThan(0);
  });
});
