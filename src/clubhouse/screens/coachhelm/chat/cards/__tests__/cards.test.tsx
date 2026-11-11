// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActionProposal } from '@/lib/coachhelm/v3/chat/action-types';
import { CAP_ROSTER, CAP_ROSTER_40, CAP_TASKS, type CapTask } from '../../../../../preview/fixtures-chat-capabilities';
import { BODY_TOOLS, CARD_PHASES, CARD_TOOLS, CardBody, cardCopy, type CardDensity, type CardPerson, type CardPhase } from '..';
import { AppLinkRow, CoachNoteChip, NotTracked, WorkedOut, computedSummary } from '../answers';
import { HandoffBody } from '../drafts';
import { clockRange, dayWords, namesIn } from '../facts';
import { WORK_KINDS } from '../work-words';

afterEach(cleanup);

/** Every stored plan the gallery has: each task's typical one and its cases (long, one recipient, forty, something missing). */
const CASES: Array<{ id: string; cap: CapTask; proposal: ActionProposal; roster: CardPerson[] }> = CAP_TASKS.flatMap((cap) => [
  { id: cap.tool, cap, proposal: cap.proposal, roster: CAP_ROSTER },
  ...Object.entries(cap.variants ?? {}).map(([name, v]) => ({ id: `${cap.tool} (${name})`, cap, proposal: v.proposal, roster: v.roster ?? CAP_ROSTER })),
]);

const receiptFor = (cap: CapTask, phase: CardPhase) => (phase === 'saved' ? cap.saved : phase === 'partial' ? (cap.partial ?? cap.saved) : phase === 'failed' ? cap.failed : phase === 'held' || phase === 'undoing' || phase === 'committing' ? { ...cap.saved, status: 'held' as const } : null);
const draw = (c: (typeof CASES)[number], phase: CardPhase = 'proposed', density: CardDensity = 'full', roster = c.roster) => render(<CardBody tool={c.cap.tool} proposal={c.proposal} receipt={receiptFor(c.cap, phase)} phase={phase} density={density} roster={roster} onAsk={() => undefined} />);

const SOURCE = join(process.cwd(), 'src/lib/coachhelm/v3/chat');
/** The task tools' names, read from the files that define them, so this lane needs no server module to know the list. */
function registeredTasks(): string[] {
  const names = (file: string, pattern: RegExp) => [...readFileSync(join(SOURCE, file), 'utf8').matchAll(pattern)].map((m) => m[1]!);
  return [...new Set([...names('create-tools.ts', /^\s+name: '([a-z_]+)',$/gm), ...names('tasks.ts', /^\s+name: '([a-z_]+)',$/gm), ...names('practice-draft.ts', /^\s+name: '(publish_[a-z_]+)',$/gm), ...names('tasks/event-tasks.ts', /^\s+name: '([a-z_]+)',$/gm)])];
}

describe('the catalogue covers the registry', () => {
  it('has words and a body for every task tool the engine defines, and for nothing else', () => {
    const tasks = registeredTasks().sort();
    expect(tasks.length).toBe(22);
    expect([...CARD_TOOLS].sort()).toEqual(tasks);
    expect([...BODY_TOOLS].sort()).toEqual(tasks);
    expect(CAP_TASKS.map((t) => t.tool).sort()).toEqual(tasks);
  });

  it('gives a tool it has not met the plan’s own words and every fact', () => {
    const proposal: ActionProposal = { action: 'Archive the season', summary: 'Fall 2026', facts: [{ label: 'Rounds', value: '212' }], affects: [], notifications: ['Nobody is told.'], missing: [], idempotency_key: 'k' };
    render(<CardBody tool="archive_season" proposal={proposal} receipt={null} phase="proposed" density="full" />);
    expect(cardCopy('archive_season', proposal).reach).toBe('private');
    expect(screen.getByText('Rounds')).toBeTruthy();
    expect(screen.getByText('212')).toBeTruthy();
  });
});

describe('every body draws every state, from the real plan and receipt types', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    for (const density of ['full', 'compact'] as const) {
      for (const phase of CARD_PHASES) {
        const { container, unmount } = draw(c, phase, density);
        const body = container.querySelector(`[data-ch-card-body="${c.cap.tool}"]`);
        expect(body, `${c.id} ${phase} ${density}`).toBeTruthy();
        // Read first: what will happen and who is affected. The group is named by that sentence.
        expect(body!.getAttribute('aria-label')!.length).toBeGreaterThan(8);
        // The shell owns every button that decides anything. A body has only disclosures.
        for (const b of within(body as HTMLElement).queryAllByRole('button')) expect(b.textContent + (b.getAttribute('aria-label') ?? '')).toMatch(/Show|Hide|Set it/);
        expect(body!.querySelector('a')).toBeNull();
        unmount();
      }
    }
  });
});

describe('a card that sends to players always shows who and the words', () => {
  const sending = CASES.filter((c) => cardCopy(c.cap.tool, c.proposal).reach === 'sends');

  it('is every task whose plan says somebody is told', () => {
    expect(sending.map((c) => c.cap.tool)).toEqual(expect.arrayContaining(['create_event', 'create_recurring_practice', 'create_qualifier', 'create_goal', 'create_focus_area', 'create_task', 'create_team_announcement', 'publish_practice_plan', 'send_message', 'send_event_reminder']));
  });

  it.each(sending.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const { container } = draw(c);
    const reach = container.querySelector('.ch-akc-reach[data-reach="sends"]')!;
    expect(within(reach as HTMLElement).getByText('Sends')).toBeTruthy();
    // Who: people by name, or the plain statement that the plan does not name them. Never neither.
    const named = c.proposal.affects.filter((a) => a.kind === 'player').map((a) => a.label);
    const coins = reach.querySelector('.ch-akc-people__line');
    const lede = reach.querySelector('.ch-akc-reach__lede')!.textContent!;
    const gap = /does not list who|not named in the plan/.test(reach.textContent!);
    expect(!!coins || gap || named.some((n) => lede.includes(n)) || /Sends to [A-Z]/.test(lede), `${c.id}: recipients`).toBe(true);
    // The words: in the reader's frame, or the plain statement that the plan does not carry them. Never a made-up preview.
    const words = container.querySelector('.ch-akc-notice, .ch-akc-bubble');
    const none = container.querySelector('.ch-akc-nowords');
    expect(!!words !== !!none, `${c.id}: words, or the statement that there are none, and not both`).toBe(true);
  });

  it('prints a sent message whole, however long, and says how much is under the fold', () => {
    const long = CASES.find((c) => c.id === 'create_team_announcement (long)')!;
    const { container } = draw(long);
    const message = long.proposal.facts.find((f) => f.label === 'Message')!.value;
    expect(container.querySelector('.ch-akc-notice .ch-akc-clamp__t')!.textContent).toBe(message);
    const key = screen.getByRole('button', { name: new RegExp(`Show the whole message · ${message.length.toLocaleString('en-US')} characters`) });
    expect(key.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(key);
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps every one of forty recipients one tap away, by name', () => {
    const forty = CASES.find((c) => c.id === 'send_event_reminder (forty)')!;
    draw(forty);
    expect(screen.queryByText('Quinn Marlowe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show all 40/ }));
    for (const p of CAP_ROSTER_40) expect(screen.getByText(p.name)).toBeTruthy();
  });

  it('names one recipient in full, with no count and no key', () => {
    draw(CASES.find((c) => c.id === 'send_event_reminder (one)')!);
    expect(screen.getAllByText(/Theo Marchetti/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('shows the reminder exactly as it arrives, and who will not get it', () => {
    const c = CASES.find((x) => x.id === 'send_event_reminder')!;
    const { container } = draw(c);
    const notice = container.querySelector('.ch-akc-notice')!;
    expect(notice.textContent).toBe('Reminder: Short-game practiceThu, Nov 12, 3:00 PM at Short-game area, Ridgeline GC');
    expect(screen.getByText(/Owen Park \(no account yet\)/)).toBeTruthy();
  });

  it('says so in the state: sending, sent, not sent', () => {
    const c = CASES.find((x) => x.id === 'create_task')!;
    expect(draw(c, 'proposed').container.textContent).toContain('Sends to 4 players, in the app');
    cleanup();
    expect(draw(c, 'saved').container.textContent).toContain('Sent to 4 players, in the app');
    cleanup();
    for (const phase of ['undone', 'cancelled', 'superseded', 'failed', 'expired'] as const) {
      const { container, unmount } = draw(c, phase);
      expect(container.querySelector('.ch-akc-reach .ch-badge')!.textContent).toBe('Not sent');
      expect(container.textContent).toContain('Not sent. It would have gone to 4 players.');
      unmount();
    }
  });
});

describe('nothing reaches a card that the plan did not put there', () => {
  it('draws only the people the plan names, whatever roster it is handed', () => {
    const three = CASES.find((c) => c.id === 'create_team_announcement (one)')!;
    const { container } = draw(three, 'proposed', 'full', CAP_ROSTER_40);
    const namedInPlan = three.proposal.affects.map((a) => a.label);
    for (const p of CAP_ROSTER_40.filter((x) => !namedInPlan.includes(x.name))) expect(container.textContent).not.toContain(p.name);
  });

  it('puts in a player-facing preview only the words the player gets', () => {
    for (const c of CASES) {
      const { container, unmount } = draw(c);
      for (const notice of container.querySelectorAll('.ch-akc-notice, .ch-akc-bubble')) {
        // Coach-only facts never sit inside the frame that shows what a player receives.
        for (const f of c.proposal.facts.filter((x) => /Will not get it|Replaces|Urgency|Acknowledgement|How|Status|Not marked|Changes a mark/.test(x.label))) expect(notice.textContent, `${c.id}: ${f.label}`).not.toContain(f.value);
      }
      unmount();
    }
  });

  it('never frames a coach-only thing as something a player receives', () => {
    for (const c of CASES.filter((x) => cardCopy(x.cap.tool, x.proposal).reach === 'private')) {
      const { container, unmount } = draw(c);
      expect(container.querySelector('.ch-akc-notice, .ch-akc-bubble'), c.id).toBeNull();
      expect(container.querySelector('.ch-akc-reach[data-reach="sends"]'), c.id).toBeNull();
      unmount();
    }
    for (const tool of ['set_availability_note', 'create_recruit', 'add_blocked_time']) expect(cardCopy(tool, CAP_TASKS.find((t) => t.tool === tool)!.proposal).reach).toBe('private');
  });

  it('says a private note is the coach’s alone, and a removed one has no key', () => {
    render(<CoachNoteChip note={{ op: 'saved', note_id: 'n1', text: 'Qualifying is 54 holes.' }} onRemove={() => undefined} />);
    expect(screen.getByText('Only you. Players never see notes.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove the note: Qualifying is 54 holes.' })).toBeTruthy();
    cleanup();
    render(<CoachNoteChip note={{ op: 'removed', note_id: 'n1', text: 'Qualifying is 54 holes.' }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('what a coach must be told, card by card', () => {
  const of = (id: string) => CASES.find((c) => c.id === id)!;

  it('puts the lock’s warning first and offers it no Undo', () => {
    const { container } = draw(of('lock_lineup'));
    expect(container.querySelector('[data-ch-card-body]')!.firstElementChild!.textContent).toBe('This locks the moment you press. There is no Undo.');
    expect(cardCopy('lock_lineup', of('lock_lineup').proposal).immediate).toBe(true);
    expect(screen.getByText('The plan does not show the lineup. Open the tournament to check it first.')).toBeTruthy();
  });

  it('marks what the coach still has to give, and asks for it only while the card is open', () => {
    const c = of('create_recurring_practice (missing)');
    draw(c);
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set it' })).toBeTruthy();
    cleanup();
    draw(c, 'held');
    expect(screen.queryByRole('button', { name: 'Set it' })).toBeNull();
  });

  it('draws every date of a series in Ask, and the first four with the rest one tap away in quick chat', () => {
    const c = of('create_recurring_practice (missing)');
    expect(draw(c, 'proposed', 'full').container.querySelectorAll('.ch-akc-days .ch-akc-tile').length).toBe(26);
    cleanup();
    const { container } = draw(c, 'proposed', 'compact');
    expect(container.querySelectorAll('.ch-akc-days .ch-akc-tile').length).toBe(4);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 26' }));
    expect(container.querySelectorAll('.ch-akc-days .ch-akc-tile').length).toBe(26);
  });

  it('says a mark changes, and who is left alone', () => {
    draw(of('record_attendance'));
    expect(screen.getByText(/Jonah Okafor: Present now, Late after/)).toBeTruthy();
    expect(screen.getByText('1 player on the roster is left as they are.')).toBeTruthy();
    expect(screen.getAllByText('Nothing is sent to players.').length).toBeGreaterThan(0);
  });

  it('keeps the earlier note and says so', () => {
    draw(of('add_round_note'));
    expect(screen.getByText('Good patience on the back nine. The par save on 14 is the shot of the day.')).toBeTruthy();
    expect(screen.getByText('The earlier note stays. This goes under it.')).toBeTruthy();
  });

  it('writes the hold line from the plan: saves, sends, posts', () => {
    expect(cardCopy('create_event', of('create_event').proposal).hold(8)).toBe('Not saved yet. Saves in 8 seconds, then 6 people are told.');
    expect(cardCopy('add_blocked_time', of('add_blocked_time').proposal).hold(3)).toBe('Not saved yet. Saves in 3 seconds.');
    expect(cardCopy('send_event_reminder', of('send_event_reminder').proposal).hold(1)).toBe('Not sent yet. Sends in 1 second to 5 people.');
    expect(cardCopy('create_event', of('create_event (quiet)').proposal).reach).toBe('visible');
    expect(cardCopy('create_focus_area', of('create_focus_area').proposal).badge).toBe('Proposed');
  });
});

describe('the small forms', () => {
  it('draws a poll draft as a poll, with what it will not do', () => {
    render(<HandoffBody handoff={{ kind: 'poll', players: [], title: 'Poll for Travel squad', thread: 'Travel squad', draft: '', poll: { question: 'Which time?', options: ['7:10 AM', '12:40 PM'] } }} density="full" />);
    expect(screen.getByText('Nothing is posted until you press Send in Messages.')).toBeTruthy();
    expect(screen.getByText('Which time?')).toBeTruthy();
    expect(screen.getByText(/Names show on votes/)).toBeTruthy();
  });

  it('draws a link, a calculation and “not tracked” without a tool name or code', () => {
    const { container } = render(
      <>
        <AppLinkRow link={{ label: 'Open Roster requests', href: '/golf/dashboard/roster?tab=requests' }} />
        <WorkedOut computed={{ method: 'Averaged each player’s putts per round, then ranked them.', players: 14, reads: 14, rounds: 212 }} />
        <NotTracked part={{ what: 'club used off the tee', nearest: ['Fairways hit'] }} />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Open Roster requests' }).getAttribute('href')).toBe('/golf/dashboard/roster?tab=requests');
    expect(computedSummary(14, 4)).toBe('14 reads · 1 calculation · 4s');
    expect(container.textContent).not.toMatch(/get_|code_execution|query_team_data|summarise_data/);
  });

  it('never shows a tool name on the work line', () => {
    for (const kind of WORK_KINDS) for (const w of kind.words) expect(w).not.toMatch(/[a-z]_[a-z]/);
  });

  it('reads the planners’ own strings', () => {
    expect(namesIn('Eli Brandt, Jonah Okafor and Priya Natarajan')).toEqual(['Eli Brandt', 'Jonah Okafor', 'Priya Natarajan']);
    expect(namesIn('Owen Park (no account yet)')).toEqual(['Owen Park']);
    expect(clockRange('15:00', '17:30')).toBe('3 to 5:30 PM');
    expect(clockRange('11:00', '13:00')).toBe('11 AM to 1 PM');
    expect(dayWords('2026-11-12')).toMatch(/Thu.*12.*Nov|Thu.*Nov.*12/);
    expect(dayWords('Fri, Nov 14')).toBe('Fri, Nov 14');
  });
});
