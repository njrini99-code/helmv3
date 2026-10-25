import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../../__tests__/dialog-polyfill';

/**
 * Ask (P013, design call "Ask": "an answer that names a read should link to the Player page"). When an answer's evidence names a
 * player's reads (`get_player_insights`), each read opens that player's Deep dive on the coach Player page, on that read (CH-13914).
 * Only for a player on the coach's own team; an id the roster does not hold is drawn as a row with no link.
 */

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
// Marks a client link so a plain anchor and next/link can be told apart.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} data-next-link="" {...rest}>
      {children}
    </a>
  ),
}));

import { coachReadHref } from '../../../../data/coachhelm-views-shape';
import { evidenceBlocks, readsOf } from '../../../../data/coachhelm-chat-thread';
import { ASK_EV_READS, ASK_EV_READS_OTHER, ASK_MSGS_READS, ASK_MSGS_READS_OTHER, ASK_PLAYERS } from '../../../../preview/fixtures-ask-thread';
import { ToastProvider } from '../../../../ui/Toast';
import { AskThread, type AskThreadProps } from '../Thread';

const wrap = (node: ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const show = (over: Partial<AskThreadProps> = {}) =>
  render(
    wrap(
      <AskThread
        messages={ASK_MSGS_READS}
        busy={false}
        error={null}
        offline={false}
        phone={false}
        players={ASK_PLAYERS}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        onNewChat={vi.fn()}
        evidenceFocus={null}
        onOpenEvidence={vi.fn()}
        {...over}
      />,
    ),
  );
const reads = () => document.querySelector('[data-ch-code="CH-13914"]') as HTMLElement;

afterEach(cleanup);

describe('the reads an answer names', () => {
  it('are their own block, read from the tool’s detail: the player, and each read’s id, title, area and value', () => {
    expect(readsOf(ASK_EV_READS.detail)).toEqual({
      playerId: 'p-jonah',
      rows: [
        { id: 'in-slope', title: 'Downhill putts, 4 to 6 feet', category: 'putting', value: '41%' },
        { id: 'in-pen', title: 'Penalties off the tee', category: 'course_management', value: '1.1' },
        { id: 'in-app', title: 'Approach from 125 to 175 yards', category: 'approach', value: '27 ft' },
      ],
    });
    const [block] = evidenceBlocks(ASK_EV_READS);
    expect(block).toMatchObject({ kind: 'reads', playerId: 'p-jonah', title: '3 open signals for Jonah Okafor.' });
    // The same rows as a table, for View as table and a screen reader.
    expect(block?.kind === 'reads' && block.table.rows[1]).toEqual(['Penalties off the tee', 'Course management', '1.1']);
  });

  it('a detail that is not that shape is not a reads block (no player id, no list, or rows with no id or title)', () => {
    expect(readsOf(null)).toBeNull();
    expect(readsOf({ insights: [{ insight_id: 'a', title: 'A' }] })).toBeNull();
    expect(readsOf({ player: { player_id: 'p-jonah' }, rounds: [] })).toBeNull();
    expect(readsOf({ player: { player_id: 'p-jonah' }, insights: [{ title: 'No id' }, { insight_id: 'x' }] })).toBeNull();
  });

  it('CH-13914 for a player on the team, each read opens his Deep dive on that read, as a client link', () => {
    show();
    const links = within(reads()).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/golf/dashboard/coachhelm?view=deep-dive&player=p-jonah&insight=in-slope',
      '/golf/dashboard/coachhelm?view=deep-dive&player=p-jonah&insight=in-pen',
      '/golf/dashboard/coachhelm?view=deep-dive&player=p-jonah&insight=in-app',
    ]);
    expect(links.every((a) => a.hasAttribute('data-next-link'))).toBe(true);
    expect(links[0]!.textContent).toBe('PuttingDownhill putts, 4 to 6 feet41%');
  });

  it('CH-13914 an id the coach’s roster does not hold gets no link: the reads are drawn as rows', () => {
    show({ messages: ASK_MSGS_READS_OTHER });
    expect(within(reads()).queryAllByRole('link')).toHaveLength(0);
    expect(within(reads()).getByText('Penalties off the tee')).toBeTruthy();
    expect(coachReadHref('p-not-on-team', 'in-pen', ASK_PLAYERS)).toBeNull();
    expect(evidenceBlocks(ASK_EV_READS_OTHER)[0]).toMatchObject({ kind: 'reads', playerId: 'p-not-on-team' });
  });

  it('an empty id or read never makes an address', () => {
    expect(coachReadHref('', 'in-pen', ASK_PLAYERS)).toBeNull();
    expect(coachReadHref('p-jonah', '', ASK_PLAYERS)).toBeNull();
    expect(coachReadHref('p-jonah', 'in/odd', ASK_PLAYERS)).toBe('/golf/dashboard/coachhelm?view=deep-dive&player=p-jonah&insight=in%2Fodd');
  });

  it('View as table shows the same reads as a table', async () => {
    show();
    const fig = reads().closest('figure') as HTMLElement;
    await userEvent.click(within(fig).getByRole('button', { name: 'View as table' }));
    expect(within(fig).getAllByRole('row').map((r) => r.textContent)).toEqual(['ReadAreaValue', 'Downhill putts, 4 to 6 feetPutting41%', 'Penalties off the teeCourse management1.1', 'Approach from 125 to 175 yardsApproach27 ft']);
  });

  it('a link that does not lead to the Deep dive is never drawn for a read (no Stats link, no plain anchor)', () => {
    show();
    for (const a of within(reads()).getAllByRole('link')) expect(a.getAttribute('href')).toMatch(/^\/golf\/dashboard\/coachhelm\?view=deep-dive&player=/);
    expect(screen.getAllByRole('figure')).toHaveLength(1);
  });
});
