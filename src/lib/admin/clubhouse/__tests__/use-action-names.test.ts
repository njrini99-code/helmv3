import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BridgeGraph } from '../graph';
import { actionCallNames } from '../graph';
import { actionIndex } from '../resolve';

/**
 * Every `useAction` name the client sends (`act`) is read back to its action through the graph: the page manifest's
 * `useAction` becomes `graph.actions[id].useActionNames`, and `actionIndex` maps each name to its ACT- ID. A name that
 * resolves nowhere lands on the Bridge with no action and no outcome code, so this scans src/clubhouse for every
 * useAction, useSaveAction and useChange call and holds the names to the graph.
 */

const ROOT = process.cwd();
const CALL = /\b(useAction|useSaveAction|useChange)\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(/g;

/**
 * Sent by a call but not yet in any page's action contract: the contract has no action for it, or (calendar.saveEvent)
 * one name covers two actions (publish and edit). Shrink only: wiring one means adding it to its page manifest's
 * `useAction` and taking it off here; the test fails while a wired name is still listed.
 */
const NOT_IN_A_CONTRACT = new Set([
  // P001: the bell's held notifications.
  'bell.deliverHeld',
  // P003: availability and email invites have no ACT row.
  'roster.availabilityReason',
  'roster.emailPlayerInvites',
  'roster.setAvailability',
  // P005 and P013: answering a focus-area proposal.
  'stats.acceptFocusArea',
  'stats.declineFocusArea',
  'coachhelm.acceptFocusArea',
  'coachhelm.declineFocusArea',
  // P006: one save is both PUBLISH-EVENT and EDIT-EVENT; files and feed links have no ACT row.
  'calendar.saveEvent',
  'calendar.openFile',
  'calendar.regenerateFeed',
  'calendar.removeFeed',
  // P008.
  'settings.approveAssistant',
  'settings.createStaffInvite',
  'settings.declineAssistant',
  'settings.livePrefs',
  'settings.saveCourseLocation',
  // P009: giving a tied player a place.
  'qualifiers.chooseTie',
  // P010.
  'hub.editTrip',
  // P011: recovering a round that did not save.
  'rounds.recover.discard',
  'rounds.recover.resume',
  'rounds.recover.retry',
  // P012: exams, class status and the team's term and breaks.
  'classes.addExam',
  'classes.deliver',
  'classes.noClass',
  'classes.noClassUndo',
  'classes.removeAll',
  'classes.removeExam',
  'classes.share',
  'classes.statusEnabled',
  'classes.tag',
  'addTeamBreak',
  'removeTeamBreak',
  'saveTeamTerm',
  // P013: the player file.
  'coachhelm.file.saveIntent',
  'coachhelm.reads.focus',
  'coachhelm.reads.mark',
  // P016: the tournament screens are not in the contract yet (their actions list no component).
  'tournaments.create',
  'tournaments.dismissLink',
  'tournaments.hole',
  'tournaments.lineup.lock',
  'tournaments.lineup.publish',
  'tournaments.lineup.save',
  'tournaments.link',
  'tournaments.reflection',
  'tournaments.roundStatus',
  'tournaments.score',
  'tournaments.update',
]);

/** The two wrappers that pass their caller's name through (each caller's literal is scanned at the call). */
const PASS_THROUGH = ['src/clubhouse/screens/settings/parts.tsx: name', 'src/clubhouse/screens/stats/Goals.tsx: name'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name);
    if (d.isDirectory()) return d.name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [path] : [];
  });
}

/** The first argument of each call: its string literals (a ternary gives two), or the bare expression. */
function scan(): { names: Map<string, string[]>; dynamic: string[] } {
  const names = new Map<string, string[]>();
  const dynamic: string[] = [];
  for (const path of sourceFiles(join(ROOT, 'src/clubhouse'))) {
    const file = relative(ROOT, path);
    const s = readFileSync(path, 'utf8');
    for (const m of s.matchAll(CALL)) {
      // The hooks' own declarations, imports and comments are not calls.
      if (/function\s+$|import[^;]*$/.test(s.slice(Math.max(0, m.index - 40), m.index))) continue;
      if (/^\s*(\*|\/\/|\/\*)/.test(s.slice(s.lastIndexOf('\n', m.index) + 1, m.index))) continue;
      let arg = '';
      let depth = 0;
      for (let i = m.index + m[0].length; i < s.length; i++) {
        const c = s[i]!;
        if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) {
          if (depth === 0) break;
          depth--;
        } else if (c === ',' && depth === 0) break;
        arg += c;
      }
      const literals = [...arg.matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => (x[1] ?? x[2])!);
      if (!literals.length) dynamic.push(`${file}: ${arg.trim()}`);
      for (const name of literals) names.set(name, [...(names.get(name) ?? []), file]);
    }
  }
  return { names, dynamic };
}

describe('useAction names resolve through the Bridge graph', () => {
  const graph = JSON.parse(readFileSync(join(ROOT, 'docs/clubhouse/generated/bridge-graph.json'), 'utf8')) as BridgeGraph;
  const index = actionIndex(graph);
  const { names, dynamic } = scan();

  it('finds the calls', () => {
    expect(names.size).toBeGreaterThan(100);
    expect(dynamic.sort()).toEqual(PASS_THROUGH);
  });

  it('reads every name sent back to one action, apart from the ones no contract has yet', () => {
    const unresolved = [...names.keys()].filter((n) => !index.has(n) && !NOT_IN_A_CONTRACT.has(n)).map((n) => `${n} (${names.get(n)!.join(', ')})`);
    expect(unresolved).toEqual([]);
  });

  it('lists only names that are still sent and still unresolved (the list only shrinks)', () => {
    expect([...NOT_IN_A_CONTRACT].filter((n) => !names.has(n))).toEqual([]);
    expect([...NOT_IN_A_CONTRACT].filter((n) => index.has(n))).toEqual([]);
  });

  it('names no action under a name the client no longer sends', () => {
    const stale = Object.entries(graph.actions).flatMap(([id, a]) => actionCallNames(a).filter((n) => !names.has(n)).map((n) => `${id}: ${n}`));
    expect(stale).toEqual([]);
  });

  it('gives each name one action, and never an ACT- ID', () => {
    const owners = new Map<string, string[]>();
    for (const [id, a] of Object.entries(graph.actions)) for (const n of actionCallNames(a)) owners.set(n, [...(owners.get(n) ?? []), id]);
    expect([...owners].filter(([, ids]) => ids.length > 1)).toEqual([]);
    expect([...owners.keys()].filter((n) => n.startsWith('ACT-'))).toEqual([]);
  });

  it('resolves a few names to the actions their calls are', () => {
    expect(index.get('hub.uncompleteTask')).toBe('ACT-P010-COMPLETE-TASK');
    expect(index.get('stats.abandonGoal')).toBe('ACT-P005-CHANGE-GOAL');
    expect(index.get('roster.coachNote')).toBe('ACT-P003-SAVE-NOTE');
    expect(index.get('rounds.discard')).toBe('ACT-P011-DISCARD');
    expect(index.get('rounds.discardRound')).toBe('ACT-P011-DISCARD-ROUND');
  });
});
