'use client';

import { createGolfQualifier, setQualifierRoundCourses, updateGolfQualifierDetails, updateQualifierStatus } from '@/app/golf/actions/golf';
import { setQualifierEntrants, setQualifierSquadSize } from '@/app/golf/actions/qualifier-setup';
import { getCourseDetail, getTeamSavedCourses, listCoursesStrict } from '@/app/golf/actions/course-library';
import { advanceSelectionState, confirmQualifierSelection, removeQualifierCoachPick, setQualifierCoachPick } from '@/app/golf/actions/v3/qualifying';
import type { ServerResult } from '../../lib/use-action';
import { chTrail } from '../../lib/track';

/**
 * Every write and lookup the Qualifiers screens make, behind one interface so
 * the dev preview and the tests can stand in for the server. The live set
 * calls the existing server actions unchanged, plus the two setup actions
 * added for Edit (D-32).
 */

export type ChQCreateInput = Parameters<typeof createGolfQualifier>[0];

export interface ChQRoundCourseInput {
  roundNumber: number;
  courseId: string | null;
  courseName: string | null;
  teeId: string | null;
}

export interface ChQEditPlan {
  details: Parameters<typeof updateGolfQualifierDetails>[1];
  numRounds: number;
  roundCourses: ChQRoundCourseInput[] | null;
  /** Only when the squad changed. */
  squad: { total: number; coachPicks: number } | null;
  /** Only when the entrants changed. */
  playerIds: string[] | null;
}

export interface ChQCourseOption {
  id: string;
  name: string;
  place: string | null;
  par: number | null;
}
export interface ChQTeeOption {
  id: string;
  name: string;
  par: number | null;
  yards: number | null;
  holes: number;
}

export interface ChQWrites {
  create: (input: ChQCreateInput) => Promise<ServerResult<{ qualifierId: string }>>;
  saveEdit: (id: string, plan: ChQEditPlan) => Promise<ServerResult>;
  setStatus: (id: string, status: 'in_progress' | 'completed') => Promise<ServerResult>;
  /** Courses matching the search, the team's saved ones first when there is no search. Throws when the read fails. */
  courses: (query: string) => Promise<ChQCourseOption[]>;
  /** A course's tee sets. Throws when the read fails. */
  tees: (courseId: string) => Promise<ChQTeeOption[]>;
}

/**
 * Edit is up to four writes. They run in order and stop at the first that
 * fails, and the failure says what did save, so the coach knows one more Save
 * finishes the job (the feature doc's partial-save rule).
 */
export async function runEditPlan(
  id: string,
  plan: ChQEditPlan,
  api: {
    details: typeof updateGolfQualifierDetails;
    rounds: typeof setQualifierRoundCourses;
    squad: typeof setQualifierSquadSize;
    entrants: typeof setQualifierEntrants;
  },
): Promise<ServerResult> {
  const steps: Array<{ label: string; run: () => Promise<{ success: boolean; error?: string }> }> = [
    { label: 'the details', run: () => api.details(id, plan.details) },
    { label: 'the rounds and courses', run: () => api.rounds(id, plan.numRounds, plan.roundCourses ?? []) },
  ];
  if (plan.squad) steps.push({ label: 'the squad size', run: () => api.squad(id, plan.squad!) });
  if (plan.playerIds) steps.push({ label: 'the players', run: () => api.entrants(id, plan.playerIds!) });
  const saved: string[] = [];
  for (const step of steps) {
    const res = await step.run();
    if (!res.success) {
      const reason = res.error && res.error.length < 140 ? ` ${res.error}` : '';
      return {
        success: false,
        error: saved.length ? `Saved ${saved.join(' and ')}, but not ${step.label}.${reason} Save again to finish.` : `${cap(step.label)} didn’t save.${reason}`,
      };
    }
    saved.push(step.label);
  }
  return { success: true };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Round courses only ride along when the rounds editor was usable. When their
 * read failed, the plan sends none, and setQualifierRoundCourses keeps what is
 * stored (it only upserts what it is sent).
 */
export const LIVE_WRITES: ChQWrites = {
  create: (input) => createGolfQualifier(input),
  saveEdit: (id, plan) =>
    runEditPlan(id, plan, { details: updateGolfQualifierDetails, rounds: setQualifierRoundCourses, squad: setQualifierSquadSize, entrants: setQualifierEntrants }),
  setStatus: (id, status) => updateQualifierStatus(id, status),
  courses: async (query) => {
    const q = query.trim();
    const [library, saved] = await Promise.all([listCoursesStrict({ query: q || undefined, limit: 50 }), q ? Promise.resolve([]) : getTeamSavedCourses()]);
    const seen = new Set<string>();
    const out: ChQCourseOption[] = [];
    for (const c of [...saved.map((s) => s.course), ...library]) {
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ id: c.id, name: c.name, place: [c.city, c.state].filter(Boolean).join(', ') || null, par: c.total_par });
    }
    return out;
  },
  tees: async (courseId) => {
    const detail = await getCourseDetail(courseId);
    if (!detail) throw new Error('course detail unavailable');
    return detail.tees
      .filter((t) => !t.is_draft)
      .map((t) => ({ id: t.id, name: t.tee_name, par: t.total_par, yards: t.total_yards, holes: t.holes_count }));
  },
};

// ── Manage selections ──

export type ChQSelectionStep = 'open' | 'scoring' | 'closed' | 'selected';

/**
 * The squad writes, on the live selection actions
 * (`src/app/golf/actions/v3/qualifying.ts`, EXISTING): the selection moves
 * open → scoring → closed → selected, one step at a time and never back.
 * Picks can be made once it is closed; confirming the squad sets the places
 * decided on score from the standings and tells the players.
 */
export interface ChQSelectionWrites {
  advance: (id: string, to: ChQSelectionStep) => Promise<ServerResult>;
  setPick: (id: string, playerId: string, reasoning: string) => Promise<ServerResult>;
  removePick: (id: string, playerId: string) => Promise<ServerResult>;
  /** `data.notified` is false when the squad committed but telling the players failed (Q-116). */
  confirm: (id: string) => Promise<ServerResult<{ notified: boolean }>>;
}

const STEPS: ChQSelectionStep[] = ['open', 'scoring', 'closed', 'selected'];

/**
 * Start selecting: step the selection to closed from wherever it is, one
 * step at a time, as the server requires. Stops at the first step refused.
 */
export async function startSelecting(id: string, from: ChQSelectionStep, advance: ChQSelectionWrites['advance']): Promise<ServerResult> {
  for (let i = STEPS.indexOf(from) + 1; i <= STEPS.indexOf('closed'); i++) {
    const res = await advance(id, STEPS[i]!);
    if (!(res.ok || res.success)) return res;
  }
  return { success: true };
}

/**
 * The selection actions' refusals are written for developers ("illegal
 * transition open → selected"). Each becomes words a coach can act on, or
 * null to fall back to the action's own hint.
 */
export function selectionReason(error: string | undefined): string | null {
  if (!error) return null;
  if (/not a coach|unauthori[sz]ed/i.test(error)) return 'Only this team’s coaches manage its squad.';
  if (/illegal transition/i.test(error)) return 'The squad moved on since this page loaded. Reload to see where it stands.';
  if (/picks locked/i.test(error)) return 'Picks open once you start selecting.';
  if (/slots filled/i.test(error)) return 'Every pick is taken. Remove one first.';
  if (/reasoning required/i.test(error)) return 'Say why you picked this player.';
  if (/not on this team/i.test(error)) return 'That player isn’t on this team.';
  if (/not entered in this qualifier/i.test(error)) return 'That player isn’t entered in this qualifier.';
  if (/could not verify the player is entered/i.test(error)) return 'The entrants couldn’t be checked just now. Try again.';
  if (/no entrant has a qualifying score/i.test(error)) return 'Nobody has a score in yet and no pick is made, so there is no squad to confirm.';
  if (/cannot confirm/i.test(error)) return 'Choose every pick, each with a reason, before confirming.';
  if (/could not verify|couldn.t confirm your roster/i.test(error)) return 'The roster couldn’t be checked just now. Try again.';
  if (/not found|not loadable/i.test(error)) return 'This qualifier couldn’t be found. It may have been deleted.';
  return null;
}

/** The coach sees the translated reason; the raw refusal stays in the error's breadcrumb trail for Sentry. */
const asResult = (r: { ok: boolean; error?: string }): ServerResult => {
  if (r.ok) return { success: true };
  if (r.error) chTrail('qualifiers selection refused', { reason: r.error.slice(0, 200) });
  return { success: false, error: selectionReason(r.error) ?? undefined };
};

export const LIVE_SELECTION_WRITES: ChQSelectionWrites = {
  advance: async (id, to) => asResult(await advanceSelectionState(id, to)),
  setPick: async (id, playerId, reasoning) => asResult(await setQualifierCoachPick(id, playerId, reasoning)),
  removePick: async (id, playerId) => asResult(await removeQualifierCoachPick(id, playerId)),
  confirm: async (id) => {
    const r = await confirmQualifierSelection(id);
    return r.ok ? { success: true, data: { notified: r.notified !== false } } : asResult(r);
  },
};
