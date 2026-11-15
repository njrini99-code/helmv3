/**
 * Results import (launch readiness F-01), step three: what a read file means for one event. Pure.
 *
 * Our players: each name is matched to the roster (exact, close enough to check, or no match), each round in the file to
 * the event's round of that number, and each round set against what the event already holds for the player:
 *  - new: nothing there yet; the file's holes become a tournament card (or its total is entered);
 *  - same: the card or total already says this;
 *  - update: the file fills in what is missing (holes for an entered total that says the same, or holes a card still in
 *    progress hasn't got yet);
 *  - differs: the card or entered total says otherwise. The coach picks: use the official score or keep what is there.
 *    The official score corrects a card still in progress hole by hole (as hole scoring does); a submitted round is
 *    never changed, so its official score is entered as the event's score and the round stays in their rounds. The
 *    default is the official score when the totals differ, and the card when only the holes do (the team score is the
 *    same either way).
 * A player not playing the round (an alternate, or not in the lineup) is shown and skipped: the server refuses them.
 *
 * Other teams: their round scores come from the file's team rows, else from their players' scores by the event's
 * format (lowest N count), and go onto the field, adding teams the field doesn't have. When the file covers every
 * round for every team, places are saved too: the file's own positions where it has them, else the NCAA ladder
 * (standings.ts) when the event breaks ties the NCAA way.
 */

import { ncaaTeamTiebreak, placeField, type ChTourTeamTieInput } from '../standings';
import { formatOf, teamRound, type ChTourPlayerScore } from '../scoring';
import type { ChTourCourse, ChTourEvent, ChTourHoleLedger, ChTourPlayer, ChTourRound } from '../types';
import { keyOf, listOf, type ChFilePlayer, type ChFileRound, type ChPlace, type ChResultsRead, type ChResultStatus } from './results';

export type ChPlanAction = 'new' | 'same' | 'update' | 'differs' | 'skip';
export type ChPlanSkip = 'not_playing' | 'no_round' | 'no_score';

export interface ChPlanCard {
  total: number | null;
  /** Hole strokes, where the event holds the card's holes. */
  holes: Array<number | null> | null;
  /**
   * `open`: a linked card still in progress (kept hole by hole here, or being played), whose holes can be corrected as
   * hole scoring does; `submitted`: a finished round, never changed (D-82); `entered`: a total a coach entered.
   */
  kind: 'open' | 'submitted' | 'entered';
  status: ChResultStatus | 'dq_pending';
}

export interface ChPlanRound {
  roundNumber: number;
  roundEventId: string | null;
  /** The file's holes, cut to the event's holes per round; null with none. */
  holes: Array<number | null> | null;
  /** The holes' sum when every hole is there, else the file's written total. */
  total: number | null;
  status: ChResultStatus;
  card: ChPlanCard | null;
  action: ChPlanAction;
  skip: ChPlanSkip | null;
  /** Holes where the file and the card differ. */
  differsOn: number[];
  /** For `differs`: what the coach chose (default as the module says). */
  use: 'file' | 'card';
}

export type ChMatchHow = 'exact' | 'close' | 'picked' | 'none';

export interface ChPlanPlayer {
  key: string;
  fileName: string;
  team: string | null;
  playerId: string | null;
  how: ChMatchHow;
  /** Roster ids, likeliest first, for the picker. */
  candidates: string[];
  rounds: ChPlanRound[];
}

export interface ChPlanTeam {
  key: string;
  name: string;
  us: boolean;
  /** The field row it matches, or null: a team the field doesn't have yet. */
  fieldTeamId: string | null;
  bTeam: boolean;
  /** Round scores by event round (index 0 = round 1). Ours are shown from the file but never written. */
  rounds: Array<number | null>;
  total: number | null;
  place: ChPlace | null;
  from: 'file' | 'players';
  /** Whether to save it (the coach can leave a team out). */
  keep: boolean;
}

export interface ChImportPlan {
  players: ChPlanPlayer[];
  /** File names on our team that match no one: listed so a typo is seen, never saved. */
  teams: ChPlanTeam[];
  /** The round the file's unnamed round goes to, when it has one (`read.rounds` holds 0). */
  pickRound: number | null;
  places: 'file' | 'ladder' | 'none';
  warnings: string[];
}

export interface ChPlanContext {
  event: ChTourEvent;
  players: readonly ChTourPlayer[];
  ledger: ChTourHoleLedger | null;
  courses: Record<string, ChTourCourse>;
  /** Our team's name, for finding our rows in a file with every team. */
  teamName: string | null;
}

// ── Names ────────────────────────────────────────────────────────────────────────────────────────────────────

const NICK: Record<string, string> = {
  will: 'william', bill: 'william', billy: 'william', liam: 'william', bob: 'robert', rob: 'robert', bobby: 'robert', mike: 'michael', matt: 'matthew', chris: 'christopher', nick: 'nicholas', alex: 'alexander', andy: 'andrew', drew: 'andrew', tom: 'thomas', tommy: 'thomas', jim: 'james', jimmy: 'james', jamie: 'james', joe: 'joseph', joey: 'joseph', dan: 'daniel', danny: 'daniel', dave: 'david', ben: 'benjamin', sam: 'samuel', jake: 'jacob', josh: 'joshua', tony: 'anthony', ed: 'edward', eddie: 'edward', ted: 'edward', charlie: 'charles', chuck: 'charles', zach: 'zachary', zack: 'zachary', nate: 'nathan', jon: 'jonathan', johnny: 'john', jack: 'john', greg: 'gregory', jeff: 'jeffrey', steve: 'steven', pat: 'patrick', kate: 'katherine', katie: 'katherine', kathy: 'katherine', liz: 'elizabeth', beth: 'elizabeth', lizzie: 'elizabeth', jen: 'jennifer', jenny: 'jennifer', maddie: 'madison', abby: 'abigail', ally: 'allison', meg: 'margaret', maggie: 'margaret', becky: 'rebecca', vicky: 'victoria', tori: 'victoria', gabby: 'gabrielle', em: 'emily', emmy: 'emily',
};
const given = (s: string) => NICK[s] ?? s;

export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

/** How alike two people's names are, 0 to 1: 1 the same, 0.95 first and last the same, 0.85 a nickname or a typo. */
export function nameScore(fileName: string, rosterName: string): number {
  const a = keyOf(fileName);
  const b = keyOf(rosterName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = a.split(' ');
  const tb = b.split(' ');
  const [fa, la] = [ta[0]!, ta[ta.length - 1]!];
  const [fb, lb] = [tb[0]!, tb[tb.length - 1]!];
  if (fa === fb && la === lb) return 0.95;
  if (la === lb) {
    if (given(fa) === given(fb)) return 0.9;
    if (fa.length >= 2 && fb.length >= 2 && (fa.startsWith(fb) || fb.startsWith(fa))) return 0.85;
    if (fa.length === 1 && fb.startsWith(fa)) return 0.8;
  }
  const ratio = 1 - editDistance(a, b) / Math.max(a.length, b.length);
  return ratio >= 0.85 ? Math.min(0.84, ratio) : 0;
}

const EXACT = 0.95;
const CLOSE = 0.8;

/** Each file name's roster match, one roster player per name at most (the better score keeps them). */
export function matchNames(fileNames: readonly string[], roster: readonly ChTourPlayer[]): Array<{ playerId: string | null; how: ChMatchHow; candidates: string[] }> {
  const ranked = fileNames.map((n) =>
    roster
      .map((p) => ({ id: p.id, s: nameScore(n, p.name) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s || x.id.localeCompare(y.id)),
  );
  const out = ranked.map((r) => {
    const top = r[0];
    // Two roster players equally likely is not a match.
    const clear = top && (r[1] == null || r[1].s < top.s);
    const how: ChMatchHow = top && clear && top.s >= EXACT ? 'exact' : top && clear && top.s >= CLOSE ? 'close' : 'none';
    return { playerId: how === 'none' ? null : top!.id, how, candidates: r.map((x) => x.id), score: top?.s ?? 0 };
  });
  // One roster player per file name: the weaker claim loses its match.
  for (let i = 0; i < out.length; i += 1) {
    for (let j = 0; j < out.length; j += 1) {
      if (i === j || !out[i]!.playerId || out[i]!.playerId !== out[j]!.playerId) continue;
      const loser = out[i]!.score < out[j]!.score || (out[i]!.score === out[j]!.score && i > j) ? i : j;
      out[loser] = { ...out[loser]!, playerId: null, how: 'none' };
    }
  }
  return out.map(({ playerId, how, candidates }) => ({ playerId, how, candidates }));
}

const teamKey = (s: string) =>
  keyOf(s)
    .replace(/\b(the|university|univ|of|college|state univ|golf|team|mens|womens|men s|women s)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Whether a file's team name is a field team's ("Demo Univ." and "Demo University"). */
export function sameTeam(a: string, b: string): boolean {
  const x = teamKey(a);
  const y = teamKey(b);
  if (!x || !y) return keyOf(a) === keyOf(b);
  return x === y || (Math.min(x.length, y.length) >= 4 && 1 - editDistance(x, y) / Math.max(x.length, y.length) >= 0.85);
}

const isBTeam = (name: string) => /(?:^|\s)(?:b|b team|\(b\)|ii)$/i.test(name.trim()) || /\bb[- ]team\b/i.test(name);

// ── Rounds ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Whether a player plays a round (in its lineup or as an individual), as the event knows it. */
export function playsRound(event: ChTourEvent, playerId: string, roundNumber: number): boolean {
  const row = event.playerRounds.find((p) => p.playerId === playerId && p.roundNumber === roundNumber);
  if (row) return row.role !== 'alternate';
  return event.entries.some((e) => e.playerId === playerId && e.role !== 'alternate');
}

/** The round the file's unnamed round most likely is: the first with no scores of ours, else the last started. */
export function defaultPickRound(event: ChTourEvent): number | null {
  const scored = new Set(event.playerRounds.filter((p) => p.total != null).map((p) => p.roundNumber));
  const open = event.rounds.find((r) => !scored.has(r.number));
  return open?.number ?? event.rounds[event.rounds.length - 1]?.number ?? null;
}

/** Hole pars for a round: the course's, cut to the event's holes per round; null when the course has none. */
export function roundPars(round: ChTourRound | undefined, courses: Record<string, ChTourCourse>, holes: 9 | 18): number[] | null {
  const course = round ? courses[round.courseId] : undefined;
  const pars = course?.holes.slice(0, holes).map((h) => h.par) ?? [];
  return pars.length === holes && pars.every((p) => p >= 3 && p <= 6) ? pars : null;
}

function cardOf(ctx: ChPlanContext, playerId: string, roundNumber: number): ChPlanCard | null {
  const pr = ctx.event.playerRounds.find((p) => p.playerId === playerId && p.roundNumber === roundNumber);
  if (!pr || (pr.total == null && !pr.roundId && pr.status === 'ok')) return null;
  const ledger = ctx.ledger?.cards.find((c) => c.playerId === playerId && c.roundNumber === roundNumber);
  return {
    total: pr.total,
    holes: ledger ? ledger.holes.map((h) => h.strokes) : null,
    kind: pr.roundId ? (pr.cardOpen === false ? 'submitted' : 'open') : 'entered',
    status: pr.status,
  };
}

function fileRound(r: ChFileRound, holes: 9 | 18): { holes: Array<number | null> | null; total: number | null; status: ChResultStatus } {
  const cut = r.holes ? Array.from({ length: holes }, (_, i) => r.holes![i] ?? null) : null;
  const any = cut?.some((h) => h != null) ? cut : null;
  const full = any && any.every((h) => h != null);
  return { holes: any, total: full ? any.reduce<number>((a, b) => a + (b ?? 0), 0) : r.total, status: r.status };
}

/** What one of our player's rounds in the file does to the event. */
export function planRound(ctx: ChPlanContext, playerId: string | null, roundNumber: number, r: ChFileRound): ChPlanRound {
  const round = ctx.event.rounds.find((x) => x.number === roundNumber);
  const f = fileRound(r, ctx.event.format.holes);
  const base: ChPlanRound = { roundNumber, roundEventId: round?.roundEventId ?? null, ...f, card: null, action: 'skip', skip: null, differsOn: [], use: 'file' };
  if (!round) return { ...base, skip: 'no_round' };
  if (f.total == null && !f.holes && f.status === 'ok') return { ...base, skip: 'no_score' };
  if (!playerId) return base;
  if (!playsRound(ctx.event, playerId, roundNumber)) return { ...base, skip: 'not_playing' };
  const card = cardOf(ctx, playerId, roundNumber);
  if (!card) return { ...base, card, action: 'new' };
  const differsOn = f.holes && card.holes ? f.holes.flatMap((h, i) => (h != null && card.holes![i] != null && h !== card.holes![i] ? [i + 1] : [])) : [];
  const sameTotal = f.total != null && card.total === f.total;
  const sameStatus = card.status === f.status;
  const fileFull = !!f.holes && f.holes.every((h) => h != null);
  const cardFull = !!card.holes && card.holes.every((h) => h != null);
  const sameHoles = !f.holes || (!!card.holes && differsOn.length === 0 && (!fileFull || cardFull));
  if (sameTotal && sameStatus && sameHoles) return { ...base, card, action: 'same' };
  // Filling in: holes for an entered total that says the same, or holes a card still in progress hasn't got yet.
  const fillsOnly = card.kind === 'open' && differsOn.length === 0 && sameStatus && (card.total == null || sameTotal);
  if (fillsOnly || (card.kind === 'entered' && (sameTotal || card.total == null) && sameStatus)) return { ...base, card, action: 'update', differsOn };
  return { ...base, card, action: 'differs', differsOn, use: sameTotal && sameStatus ? 'card' : 'file' };
}

// ── The plan ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Which file team is ours: the one most of whose players are on our roster, else the one named like us. */
export function ourTeamKey(read: ChResultsRead, ctx: ChPlanContext): string | null {
  const counts = new Map<string, number>();
  const matched = matchNames(
    read.players.map((p) => p.name),
    ctx.players,
  );
  read.players.forEach((p, i) => {
    if (matched[i]!.how === 'none') return;
    const k = keyOf(p.team ?? '');
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] > 0) return best[0];
  const named = ctx.teamName ?? ctx.event.field?.teams.find((t) => t.us)?.name ?? null;
  const byName = named ? [...read.teams.map((t) => t.name), ...read.players.map((p) => p.team ?? '')].find((n) => n && sameTeam(n, named)) : undefined;
  return byName ? keyOf(byName) : null;
}

const resolveRound = (n: number, pick: number | null) => (n === 0 ? pick : n);

export function buildPlan(read: ChResultsRead, ctx: ChPlanContext, opts: { pickRound?: number | null; picks?: Record<string, string | null> } = {}): ChImportPlan {
  const ev = ctx.event;
  const warnings = [...read.warnings];
  const pickRound = read.rounds.includes(0) ? (opts.pickRound ?? defaultPickRound(ev)) : null;
  const usKey = ourTeamKey(read, ctx);
  const ours = read.players.filter((p) => usKey == null || keyOf(p.team ?? '') === usKey);
  const matched = matchNames(
    ours.map((p) => p.name),
    ctx.players,
  );

  const players: ChPlanPlayer[] = ours.map((p, i) => {
    const m = matched[i]!;
    const picked = opts.picks && p.key in opts.picks ? opts.picks[p.key]! : undefined;
    const playerId = picked !== undefined ? picked : m.playerId;
    const how: ChMatchHow = picked !== undefined ? (picked ? 'picked' : 'none') : m.how;
    const rounds = Object.entries(p.rounds)
      .map(([n, r]) => ({ n: resolveRound(Number(n), pickRound), r }))
      .filter((x): x is { n: number; r: ChFileRound } => x.n != null)
      .sort((a, b) => a.n - b.n)
      .map(({ n, r }) => planRound(ctx, playerId, n, r));
    return { key: p.key, fileName: p.name, team: p.team, playerId, how, candidates: m.candidates, rounds };
  });

  const beyond = read.rounds.filter((n) => n > 0 && !ev.rounds.some((r) => r.number === n));
  if (beyond.length) warnings.push(`The file has ${listOf(beyond.map((n) => `round ${n}`))}, which this event doesn’t, so ${beyond.length === 1 ? 'it is' : 'they are'} left out.`);

  // Hole pars: the file's par row against the course's.
  const firstRound = ev.rounds[0];
  const pars = roundPars(firstRound, ctx.courses, ev.format.holes);
  if (read.pars && pars && read.pars.some((p, i) => p != null && pars[i] != null && p !== pars[i])) {
    warnings.push('The file’s pars differ from the course’s. Check the course and tees on the event before saving.');
  }
  if (read.holes && !pars) warnings.push('The course has no hole pars yet, so holes can’t be saved. Round totals are saved instead.');

  const teams = planTeams(read, ctx, usKey, pickRound);
  const places = placesOf(read, ctx, teams, usKey, pickRound);
  if (places.places !== 'none') for (const t of teams) t.place = places.byKey.get(t.key) ?? t.place;
  return { players, teams, pickRound, places: places.places, warnings };
}

function playerScores(team: readonly ChFilePlayer[], roundNumber: number, pick: number | null): ChTourPlayerScore[] {
  return team.flatMap((p) => {
    const entry = Object.entries(p.rounds).find(([n]) => resolveRound(Number(n), pick) === roundNumber)?.[1];
    if (!entry) return [];
    const holes = entry.holes;
    const total = holes && holes.length && holes.every((h) => h != null) ? holes.reduce<number>((a, b) => a + (b ?? 0), 0) : entry.total;
    return [{ playerId: p.key, role: 'lineup' as const, slot: null, total, status: entry.status }];
  });
}

function planTeams(read: ChResultsRead, ctx: ChPlanContext, usKey: string | null, pick: number | null): ChPlanTeam[] {
  const ev = ctx.event;
  const format = formatOf(ev.format.kind, ev.format.players, ev.format.counting, ev.format.holes);
  const names = new Map<string, string>();
  for (const t of read.teams) names.set(t.key, t.name);
  for (const p of read.players) if (p.team) names.set(keyOf(p.team), names.get(keyOf(p.team)) ?? p.team);
  const field = ev.field?.teams ?? [];
  return [...names.entries()].map(([key, name]) => {
    const us = key === usKey;
    const fileTeam = read.teams.find((t) => t.key === key);
    const squad = read.players.filter((p) => keyOf(p.team ?? '') === key);
    let from: ChPlanTeam['from'] = 'file';
    const rounds = ev.rounds.map((r) => {
      const written = fileTeam ? Object.entries(fileTeam.rounds).find(([n]) => resolveRound(Number(n), pick) === r.number)?.[1] : undefined;
      if (written != null) return written;
      if (!squad.length) return null;
      from = 'players';
      const tr = teamRound(playerScores(squad, r.number, pick), format, r.par);
      return tr.kind === 'complete' ? tr.total : null;
    });
    const complete = rounds.length > 0 && rounds.every((v) => v != null);
    const total = complete ? rounds.reduce<number>((a, b) => a + (b ?? 0), 0) : (fileTeam?.total ?? null);
    const fieldRow = us ? (field.find((f) => f.us) ?? null) : (field.find((f) => !f.us && sameTeam(f.name, name)) ?? null);
    const pos = fileTeam?.pos ?? null;
    return { key, name, us, fieldTeamId: fieldRow?.id ?? null, bTeam: fieldRow ? fieldRow.squad === 'B' : isBTeam(name), rounds, total, place: pos, from, keep: true };
  });
}

/** Places for the whole field, when the file is a finished result: the file's own, else the NCAA ladder. */
function placesOf(read: ChResultsRead, ctx: ChPlanContext, teams: readonly ChPlanTeam[], usKey: string | null, pick: number | null): { places: ChImportPlan['places']; byKey: Map<string, ChPlace> } {
  const none = { places: 'none' as const, byKey: new Map<string, ChPlace>() };
  const ev = ctx.event;
  if (teams.length < 2 || !teams.every((t) => t.rounds.every((v) => v != null))) return none;
  if (teams.every((t) => t.place != null)) return { places: 'file', byKey: new Map(teams.map((t) => [t.key, t.place!])) };
  if (ev.tiebreak !== 'ncaa') return none;
  // The ladder needs every team's players: dropped scores and each round's counting scores.
  const format = formatOf(ev.format.kind, ev.format.players, ev.format.counting, ev.format.holes);
  const rows: ChTourTeamTieInput[] = [];
  for (const t of teams) {
    const squad = read.players.filter((p) => keyOf(p.team ?? '') === t.key);
    if (!squad.length) return none;
    let dropped = 0;
    const countingByRound: number[][] = [];
    for (const r of ev.rounds) {
      const scores = playerScores(squad, r.number, pick);
      const tr = teamRound(scores, format, r.par);
      if (tr.kind !== 'complete') return none;
      dropped += tr.droppedTotal ?? 0;
      countingByRound.push(tr.counting.map((id) => scores.find((s) => s.playerId === id)!.total!));
    }
    rows.push({ id: t.key, total: t.total, droppedTotal: dropped, countingByRound });
  }
  void usKey;
  const placed = placeField(rows, 'ncaa', ncaaTeamTiebreak);
  return { places: 'ladder', byKey: new Map(placed.filter((p) => p.place != null).map((p) => [p.id, { n: p.place!, tied: p.tied }])) };
}

// ── What is saved ────────────────────────────────────────────────────────────────────────────────────────────

export interface ChImportCardInput {
  roundEventId: string;
  playerId: string;
  /** The round's day on the team's clock (a new card's round date). */
  date: string;
  /** Hole strokes for a card (null holes are left as they are), or null to enter a total. */
  holes: Array<number | null> | null;
  pars: number[] | null;
  total: number | null;
  status: ChResultStatus;
  /** Replace what is there (an entered total, or a player's card with the official score). */
  replace: boolean;
}

export interface ChImportTeamInput {
  fieldTeamId: string | null;
  name: string;
  us: boolean;
  bTeam: boolean;
  rounds: Array<{ n: number; total: number }>;
  place: ChPlace | null;
  total: number | null;
}

export interface ChImportInput {
  tournamentId: string;
  cards: ChImportCardInput[];
  teams: ChImportTeamInput[];
}

/** The rows a plan saves, as the server action takes them. */
export function importInput(plan: ChImportPlan, ctx: ChPlanContext): ChImportInput {
  const ev = ctx.event;
  const cards: ChImportCardInput[] = [];
  for (const p of plan.players) {
    if (!p.playerId) continue;
    for (const r of p.rounds) {
      if (!r.roundEventId) continue;
      const write = r.action === 'new' || r.action === 'update' || (r.action === 'differs' && r.use === 'file');
      if (!write) continue;
      const round = ev.rounds.find((x) => x.number === r.roundNumber);
      const pars = roundPars(round, ctx.courses, ev.format.holes);
      // A submitted round is never written: the official score is entered instead (their round stays theirs).
      const asCard = !!r.holes && !!pars && r.card?.kind !== 'submitted';
      if (!asCard && r.total == null && r.status === 'ok') continue;
      cards.push({ roundEventId: r.roundEventId, playerId: p.playerId, date: round?.date ?? ev.startDate, holes: asCard ? r.holes : null, pars: asCard ? pars : null, total: asCard ? null : r.total, status: r.status, replace: r.action !== 'new' });
    }
  }
  const teams: ChImportTeamInput[] = plan.teams
    .filter((t) => t.keep)
    .map((t) => ({
      fieldTeamId: t.fieldTeamId,
      name: t.name.slice(0, 80),
      us: t.us,
      bTeam: t.bTeam,
      // Our team's scores are our players' cards: never written onto the field.
      rounds: t.us ? [] : t.rounds.flatMap((v, i) => (v != null && v >= 60 && v <= 800 ? [{ n: i + 1, total: v }] : [])),
      place: plan.places === 'none' ? null : t.place,
      total: plan.places === 'none' || t.us ? null : t.total,
    }))
    .filter((t) => t.us ? t.place != null || t.fieldTeamId == null : t.rounds.length > 0 || t.place != null);
  return { tournamentId: ev.id, cards, teams };
}

/** Counts for the check step's summary and the Save button. */
export function planCounts(plan: ChImportPlan): { cards: number; same: number; differs: number; skipped: number; unmatched: number; teams: number; newTeams: number } {
  const rounds = plan.players.filter((p) => p.playerId).flatMap((p) => p.rounds);
  return {
    cards: rounds.filter((r) => r.action === 'new' || r.action === 'update' || (r.action === 'differs' && r.use === 'file')).length,
    same: rounds.filter((r) => r.action === 'same').length,
    differs: rounds.filter((r) => r.action === 'differs').length,
    skipped: rounds.filter((r) => r.action === 'skip').length,
    unmatched: plan.players.filter((p) => !p.playerId).length,
    teams: plan.teams.filter((t) => t.keep && !t.us && t.rounds.some((v) => v != null)).length,
    newTeams: plan.teams.filter((t) => t.keep && !t.us && !t.fieldTeamId).length,
  };
}
