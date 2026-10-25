import { describe, expect, it } from 'vitest';
import {
  orderReceiptRows,
  receiptCarrierId,
  seenBy,
  seenByAccess,
  seenByAccessibleName,
  seenByLabel,
  type ReceiptRowInput,
} from '../message-receipts';

const SENT = '2026-10-24T18:14:00.000Z';
const marks = (entries: Record<string, string | null>) => new Map(Object.entries(entries));

describe('seenBy (P-1 4.1)', () => {
  it('counts a read at or after the send, excludes the sender, and leaves a null as not yet', () => {
    const s = seenBy(SENT, 'coach', marks({ coach: '2026-10-25T00:00:00Z', ava: SENT, eli: '2026-10-24T18:13:59Z', dana: null }));
    expect(s.seen).toEqual(['ava']);
    expect(s.notYet.sort()).toEqual(['dana', 'eli']);
    expect(s.total).toBe(3);
  });

  it('a member missing from the marks is not counted', () => {
    expect(seenBy(SENT, 'coach', marks({ ava: SENT })).total).toBe(1);
  });
});

describe('labels', () => {
  it('Sent, Seen by n of m, Seen by everyone, and nothing for a thread of one', () => {
    expect(seenByLabel({ seen: [], notYet: ['a'], total: 1 })).toBe('Sent');
    expect(seenByLabel({ seen: ['a'], notYet: Array(10).fill('x'), total: 11 })).toBe('Seen by 1 of 11');
    expect(seenByLabel({ seen: ['a', 'b'], notYet: [], total: 2 })).toBe('Seen by everyone');
    expect(seenByLabel({ seen: [], notYet: [], total: 0 })).toBeNull();
  });

  it('accessible names say whether the list opens', () => {
    expect(seenByAccessibleName({ seen: Array(9).fill('a'), notYet: ['b', 'c'], total: 11 }, true)).toBe('Seen by 9 of 11 people. Show who');
    expect(seenByAccessibleName({ seen: [], notYet: ['b'], total: 1 }, true)).toBe('Sent. Nobody has seen it yet. Show who');
    expect(seenByAccessibleName({ seen: ['a'], notYet: [], total: 1 }, false)).toBe('Seen by everyone');
  });
});

describe('receiptCarrierId', () => {
  const m = (id: string, senderId: string, over: Record<string, unknown> = {}) => ({ id, senderId, ...over });
  it('is the viewer’s newest confirmed message, skipping pending, failed, deleted, polls and system rows', () => {
    const msgs = [m('1', 'me'), m('2', 'me', { poll: {} }), m('3', 'me', { pending: true }), m('4', 'me', { failed: true }), m('5', 'me', { deleted: true }), m('6', 'me', { kind: 'system' }), m('7', 'ava')];
    expect(receiptCarrierId(msgs, { viewerId: 'me', scope: 'mine' })).toBe('1');
  });
  it('stays on mine when others reply after; the thread scope picks the newest eligible', () => {
    const msgs = [m('1', 'me'), m('2', 'ava'), m('3', 'eli')];
    expect(receiptCarrierId(msgs, { viewerId: 'me', scope: 'mine' })).toBe('1');
    expect(receiptCarrierId(msgs, { viewerId: 'me', scope: 'thread' })).toBe('3');
    expect(receiptCarrierId([], { viewerId: 'me', scope: 'mine' })).toBeNull();
  });
});

describe('seenByAccess (4.2 table)', () => {
  const none = { inline: false, count: false, list: false };
  it('(a) sender and coaches', () => {
    expect(seenByAccess('sender-and-coaches', 'coach', true)).toEqual({ inline: true, count: true, list: true });
    expect(seenByAccess('sender-and-coaches', 'coach', false)).toEqual({ inline: false, count: true, list: true });
    expect(seenByAccess('sender-and-coaches', 'player', true)).toEqual({ inline: true, count: true, list: false });
    expect(seenByAccess('sender-and-coaches', 'player', false)).toEqual(none);
  });
  it('(b) coaches only', () => {
    expect(seenByAccess('coaches-only', 'coach', true)).toEqual({ inline: true, count: true, list: true });
    expect(seenByAccess('coaches-only', 'coach', false)).toEqual({ inline: false, count: true, list: true });
    expect(seenByAccess('coaches-only', 'player', true)).toEqual(none);
  });
  it('(c) everyone', () => {
    expect(seenByAccess('everyone', 'coach', false)).toEqual({ inline: true, count: true, list: true });
    expect(seenByAccess('everyone', 'player', false)).toEqual({ inline: true, count: true, list: false });
  });
});

describe('orderReceiptRows', () => {
  const r = (userId: string, over: Partial<ReceiptRowInput> = {}): ReceiptRowInput => ({ userId, name: userId, role: 'player', lastOpened: null, seenAt: null, ...over });
  it('Not yet: oldest last open first, then never opened, then name; coaches after players', () => {
    const rows = [r('zed'), r('amy'), r('bob', { lastOpened: '2026-10-22T10:00:00Z' }), r('cal', { lastOpened: '2026-10-20T10:00:00Z' }), r('dee', { role: 'coach', lastOpened: '2026-10-01T00:00:00Z' })];
    expect(orderReceiptRows(rows, 'notYet').map((x) => x.userId)).toEqual(['cal', 'bob', 'amy', 'zed', 'dee']);
  });
  it('Seen: newest seen first when times exist, else by name', () => {
    const rows = [r('amy', { seenAt: '2026-10-24T18:20:00Z' }), r('bob', { seenAt: '2026-10-24T18:30:00Z' }), r('cal')];
    expect(orderReceiptRows(rows, 'seen').map((x) => x.userId)).toEqual(['bob', 'amy', 'cal']);
    expect(orderReceiptRows([r('bob'), r('amy')], 'seen').map((x) => x.userId)).toEqual(['amy', 'bob']);
  });
});
