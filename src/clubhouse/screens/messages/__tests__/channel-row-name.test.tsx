import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChMessagesApi } from '../api/types';
import type { ChConv } from '../model';
import { ConvRowButton } from '../inbox/ConvRowButton';

// W18 (preview walk, 11 Nov): the team chat's name was cut ("Demo University Golf — …"). The channel's row is marked
// `is-channel` and its name may take two lines; every other row keeps one line.

afterEach(cleanup);

const conv = (over: Partial<ChConv>): ChConv => ({
  id: 'c1', group: true, title: 'Demo University Golf — Varsity', subtitle: '', memberIds: [], memberCount: 9,
  unread: 0, lastAt: null, lastSenderId: null, lastText: '', creatorId: 'me', ...over,
});
const api = { convs: [], now: '2026-10-24T15:00:00.000Z', timeZone: 'America/New_York', clock: '12', people: {} } as unknown as ChMessagesApi;
const rowOf = (c: ChConv) => {
  const { container } = render(<ConvRowButton api={api} c={c} onOpen={() => {}} bind={{} as never} />);
  return container.querySelector('.ch-ms-row')!;
};

describe('W18 the team channel name is not cut', () => {
  it('the channel row is marked; a plain group is not', () => {
    expect(rowOf(conv({ channel: true } as Partial<ChConv>)).classList.contains('is-channel')).toBe(true);
    cleanup();
    expect(rowOf(conv({ id: 'c2', title: 'Travel squad' })).classList.contains('is-channel')).toBe(false);
  });

  it('both list sheets let the channel name wrap to two lines', () => {
    const read = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [file, sel] of [
      ['messages.css', '.ch-ms-row.is-channel .ch-ms-row__top b'],
      ['messages-inbox.css', '[data-ch-ms-v2] .ch-inb .ch-ms-row.is-channel .ch-ms-row__top b'],
    ] as const) {
      const body = [...read(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1]!.trim() === sel)?.[2] ?? '';
      expect(body).toMatch(/white-space:\s*normal/);
      expect(body).toMatch(/-webkit-line-clamp:\s*2/);
    }
  });
});
