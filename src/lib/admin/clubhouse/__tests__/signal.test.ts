import { describe, expect, it } from 'vitest';
import { chSignalSchema, isFailureSignal, MAX_BATCH, MAX_CONTEXT, parseSignalBatch, redactSignal, TRAIL_MAX } from '../signal';
import { signal } from './fixtures';

describe('chSignalSchema', () => {
  it('accepts a full envelope', () => {
    expect(chSignalSchema.safeParse(signal({ act: 'messages.send', surface: 'messages.thread', durationMs: 840, serverCode: '42501' })).success).toBe(true);
  });

  it('accepts a Bridge ID for a row with no CH code', () => {
    expect(chSignalSchema.safeParse(signal({ code: '10102', kind: 'view', outcome: undefined })).success).toBe(true);
  });

  it.each([
    ['a code that is neither CH- nor a Bridge ID', { code: 'ERR-1' }],
    ['a page outside P###', { page: 'home' }],
    ['a surface that is not screen.section', { surface: 'Home Leaderboard' }],
    ['a kind the envelope does not have', { kind: 'click' }],
    ['a negative seq', { seq: -1 }],
    ['a user id that is not a UUID', { userId: 'nick@example.com' }],
    ['a duration past ten minutes', { durationMs: 700_000 }],
  ])('rejects %s', (_label, over) => {
    expect(chSignalSchema.safeParse({ ...signal(), ...over }).success).toBe(false);
  });

  it('lets a view, a tap and an action start leave their code to the server, and nothing else', () => {
    expect(chSignalSchema.safeParse(signal({ code: undefined, kind: 'view', outcome: undefined })).success).toBe(true);
    expect(chSignalSchema.safeParse(signal({ code: undefined, kind: 'tap', outcome: undefined, control: 'CTL-P007-001' })).success).toBe(true);
    expect(chSignalSchema.safeParse(signal({ code: undefined, kind: 'action', outcome: 'start', act: 'messages.send' })).success).toBe(true);
    expect(chSignalSchema.safeParse(signal({ code: undefined, kind: 'action', outcome: 'failure' })).success).toBe(false);
    expect(chSignalSchema.safeParse(signal({ code: undefined, kind: 'crash', outcome: undefined })).success).toBe(false);
  });

  it('strips fields the envelope does not list, so they are never stored', () => {
    const parsed = chSignalSchema.parse({ ...signal(), email: 'nick@example.com', name: 'Nick' });
    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('name');
  });
});

describe('parseSignalBatch', () => {
  it('drops a batch that is not { signals: [] }, empty, or too long', () => {
    expect(parseSignalBatch(null)).toEqual({ ok: false, reason: 'not-a-batch' });
    expect(parseSignalBatch([signal()])).toEqual({ ok: false, reason: 'not-a-batch' });
    expect(parseSignalBatch({ signals: [] })).toEqual({ ok: false, reason: 'empty' });
    expect(parseSignalBatch({ signals: Array.from({ length: MAX_BATCH + 1 }, () => signal()) })).toEqual({ ok: false, reason: 'too-many' });
  });

  it('keeps the good envelopes of a batch and counts the bad ones', () => {
    const r = parseSignalBatch({ signals: [signal(), { nope: true }, signal({ seq: 2 }), 'x'] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.signals.map((s) => s.seq)).toEqual([1, 2]);
      expect(r.dropped).toBe(2);
      expect(r.context).toEqual([]);
      expect(r.ended).toBe(false);
    }
  });

  it('carries the newest context envelopes and the page-hidden mark', () => {
    const context = Array.from({ length: MAX_CONTEXT + 5 }, (_, i) => signal({ seq: i + 1, kind: 'state', code: '70101', outcome: undefined }));
    const r = parseSignalBatch({ signals: [signal({ seq: 99 })], context: [...context, { nope: true }], ended: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.context).toHaveLength(MAX_CONTEXT - 1);
      expect(r.context[0]!.seq).toBe(7);
      expect(r.dropped).toBe(1);
      expect(r.ended).toBe(true);
    }
  });
});

describe('redactSignal', () => {
  it('keeps free text only on a failure', () => {
    expect(isFailureSignal({ kind: 'crash' })).toBe(true);
    expect(isFailureSignal({ kind: 'action', outcome: 'failure' })).toBe(true);
    expect(isFailureSignal({ kind: 'action', outcome: 'offline' })).toBe(false);
    const ok = redactSignal(signal({ outcome: 'success', message: 'saved for nick@example.com', trail: ['a'] }));
    expect(ok).not.toHaveProperty('message');
    expect(ok).not.toHaveProperty('trail');
  });

  it('masks emails and URL secrets in a failure message, as /api/log-error does', () => {
    const out = redactSignal(signal({ message: 'Failed for nick@example.com at https://x.test/auth?token=abc123secret' }));
    expect(out.message).not.toContain('nick@example.com');
    expect(out.message).not.toContain('abc123secret');
  });

  it('keeps the last 12 breadcrumbs, each cut and redacted', () => {
    const trail = Array.from({ length: 20 }, (_, n) => `step ${n} ${n === 19 ? 'mail a@b.co' : ''}`);
    const out = redactSignal(signal({ trail }));
    expect(out.trail).toHaveLength(TRAIL_MAX);
    expect(out.trail?.[0]).toContain('step 8');
    expect(out.trail?.join(' ')).not.toContain('a@b.co');
  });
});
