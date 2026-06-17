import { describe, it, expect } from 'vitest';
import { mergeTags, MERGE_TOKENS, type Recipient } from '../merge-tags';
import { mergeTemplate } from '../gmail-compose';

// merge-tags is the single source of truth for what gets rendered into real
// cold emails to coaches — these tests pin the token set + the name-split
// fallbacks so a future "cleanup" can't silently change what coaches receive.

const FULL: Recipient = {
  id: 'c1',
  email: 'coach@school.edu',
  name: 'Pat Q. Rivers',
  title: 'Head Coach',
  school: 'State University',
  conference: 'ODAC',
  division: 'D3',
  program: 'mens',
  team_size: 9,
  current_software: 'Spreadsheets',
};

describe('mergeTags', () => {
  it('replaces all 11 canonical tokens', () => {
    const tpl = MERGE_TOKENS.map((t) => `{${t}}`).join('|');
    const out = mergeTags(tpl, FULL);
    expect(out).toBe(
      ['Pat Q. Rivers', 'Pat', 'Q. Rivers', 'coach@school.edu', 'Head Coach',
       'State University', 'ODAC', 'D3', 'mens', '9', 'Spreadsheets'].join('|'),
    );
    // no token braces should survive
    expect(out).not.toMatch(/\{[a-z_]+\}/);
  });

  it('derives first/last from a multi-word name when not explicit', () => {
    expect(mergeTags('{first_name}', FULL)).toBe('Pat');
    expect(mergeTags('{last_name}', FULL)).toBe('Q. Rivers');
  });

  it('prefers explicit first_name/last_name over the name split', () => {
    const r: Recipient = { ...FULL, first_name: 'Patricia', last_name: 'Rivers' };
    expect(mergeTags('{first_name} {last_name}', r)).toBe('Patricia Rivers');
  });

  it('single-token name → empty last_name (route semantics)', () => {
    const r: Recipient = { id: 'c', email: 'e@x.edu', name: 'Cher' };
    expect(mergeTags('{first_name}', r)).toBe('Cher');
    expect(mergeTags('{last_name}', r)).toBe('');
  });

  it('renders team_size 0 as "0" but null/undefined as empty (no "null"/"undefined" leaks)', () => {
    expect(mergeTags('{team_size}', { ...FULL, team_size: 0 })).toBe('0');
    expect(mergeTags('{team_size}', { ...FULL, team_size: null })).toBe('');
    expect(mergeTags('{team_size}', { id: 'c', email: 'e@x.edu', name: 'A B' })).toBe('');
  });

  it('renders missing optional fields as empty strings, never "undefined"/"null"', () => {
    const bare: Recipient = { id: 'c', email: 'e@x.edu', name: 'A B' };
    const out = mergeTags(MERGE_TOKENS.map((t) => `{${t}}`).join(','), bare);
    expect(out).not.toMatch(/undefined|null/);
  });

  it('handles empty input', () => {
    expect(mergeTags('', FULL)).toBe('');
  });
});

describe('mergeTemplate (gmail-compose delegates to mergeTags)', () => {
  it('renders identically to mergeTags for a multi-word name', () => {
    const tpl = 'Hi {first_name} ({last_name}) at {school} — {division}';
    expect(mergeTemplate(tpl, FULL)).toBe(mergeTags(tpl, FULL));
  });

  it('single-token name → last_name falls back to first_name (batch-sender semantics, kept)', () => {
    // This deliberately differs from raw mergeTags: the Gmail/batch path uses
    // first_name as the last_name fallback so "Coach {last_name}," still reads.
    expect(mergeTemplate('{last_name}', { name: 'Cher' })).toBe('Cher');
  });

  it('collapses internal whitespace in the name (batch sub() semantics)', () => {
    expect(mergeTemplate('{first_name}|{last_name}', { name: 'Pat   Q.  Rivers' }))
      .toBe('Pat|Q. Rivers');
  });
});
