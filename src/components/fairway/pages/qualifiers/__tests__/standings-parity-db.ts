/**
 * The fake database and Supabase client behind the qualifier standings parity harness
 * (standings-parity-harness.tsx). Kept apart from the harness, with no imports, so a test can mock
 * `@/lib/supabase/*` onto `parityClient()` without a cycle through the components it renders.
 */
export interface ParityQualifier {
  id: string;
  team_id: string;
  status: string;
  is_test: boolean;
  num_rounds: number;
  start_date: string;
  end_date: string | null;
  selection_state: string;
  selection_slots_total: number;
  selection_slots_coach_pick: number;
}

export interface ParityEntry {
  player_id: string;
  /** The stored aggregate production's live board falls back to for a player with no completed round. */
  rounds_completed?: number | null;
  total_score?: number | null;
  total_to_par?: number | null;
  position?: number | null;
  created_at?: string | null;
}

export interface ParityRound {
  id: string;
  player_id: string;
  qualifier_id: string | null;
  status: string;
  is_test: boolean;
  round_type?: string | null;
  qualifier_round_number: number | null;
  total_score: number | null;
  score_to_par: number | null;
  holes_played: number | null;
  round_date: string;
}

export interface ParityFixture {
  qualifier: ParityQualifier;
  entries: ParityEntry[];
  rounds: ParityRound[];
  selections?: Array<{ player_id: string; selection_type: 'top_score' | 'coach_pick' }>;
}

/** Where a player stands against the cut. `in`: a place on score (or, once confirmed, in the squad). */
export type ParityCut = 'in' | 'tie' | 'bubble' | 'out';

export interface Standing {
  playerId: string;
  scored: boolean;
  /** The position as drawn ("T2", "3"); null for an unscored row, or a pipeline that draws none (the workspace). */
  label: string | null;
  /** 0-based order among the scored rows. */
  order: number | null;
  played: number;
  total: number | null;
  toPar: number | null;
  /** The average as drawn, one decimal; null for none or a pipeline that has none. */
  avg: string | null;
  cut: ParityCut | null;
}

type Row = Record<string, unknown>;

let db: Record<string, Row[]> = {};

/** Load a fixture into the fake database. The player's name is their id, so name order is id order everywhere. */
export function seed(fx: ParityFixture): void {
  const player = (id: string) => ({ id, first_name: id, last_name: '', graduation_year: null, avatar_url: null });
  const entries = fx.entries.map((e, i) => ({
    id: `entry-${i.toString().padStart(4, '0')}`,
    qualifier_id: fx.qualifier.id,
    player_id: e.player_id,
    position: e.position ?? null,
    rounds_completed: e.rounds_completed ?? 0,
    total_score: e.total_score ?? null,
    total_to_par: e.total_to_par ?? null,
    score: e.total_score ?? null,
    is_tied: false,
    status: 'active',
    notes: null,
    round_id: null,
    created_at: e.created_at ?? null,
    updated_at: null,
    player: player(e.player_id),
  }));
  db = {
    golf_qualifiers: [
      {
        ...fx.qualifier,
        name: `Qualifier ${fx.qualifier.id}`,
        description: null,
        course_name: null,
        course_id: null,
        rules: null,
        entry_deadline: null,
        spots_available: null,
        target_tournament_id: null,
        course: null,
        entries,
      },
    ],
    golf_qualifier_entries: entries,
    golf_rounds: fx.rounds.map((r) => ({ course_name: null, ...r })),
    golf_qualifier_selections: (fx.selections ?? []).map((s) => ({
      qualifier_id: fx.qualifier.id,
      selected_at: null,
      selected_by_user_id: null,
      coach_reasoning: null,
      ...s,
    })),
    golf_qualifier_round_courses: [],
    golf_course_tees: [],
    golf_holes: [],
  };
}

function query(table: string) {
  const eqs: Array<[string, unknown]> = [];
  const ins: Array<[string, unknown[]]> = [];
  const orders: Array<{ col: string; ascending: boolean; nullsFirst: boolean }> = [];
  let range: [number, number] | null = null;
  let limit: number | null = null;
  const rows = (): Row[] => {
    let out = (db[table] ?? []).filter((r) => eqs.every(([c, v]) => r[c] === v) && ins.every(([c, vs]) => vs.includes(r[c])));
    if (orders.length) {
      out = out
        .map((r, i) => ({ r, i }))
        .sort((a, b) => {
          for (const o of orders) {
            const x = a.r[o.col] as number | string | null;
            const y = b.r[o.col] as number | string | null;
            if (x === y) continue;
            if (x == null) return o.nullsFirst ? -1 : 1;
            if (y == null) return o.nullsFirst ? 1 : -1;
            return (x < y ? -1 : 1) * (o.ascending ? 1 : -1);
          }
          return a.i - b.i;
        })
        .map((x) => x.r);
    }
    if (range) out = out.slice(range[0], range[1] + 1);
    if (limit != null) out = out.slice(0, limit);
    return out;
  };
  const chain = {
    select: () => chain,
    eq: (c: string, v: unknown) => (eqs.push([c, v]), chain),
    in: (c: string, vs: unknown[]) => (ins.push([c, vs]), chain),
    order: (col: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) => {
      const ascending = o.ascending ?? true;
      orders.push({ col, ascending, nullsFirst: o.nullsFirst ?? !ascending });
      return chain;
    },
    range: (a: number, b: number) => ((range = [a, b]), chain),
    limit: (n: number) => ((limit = n), chain),
    single: async () => {
      const r = rows();
      return r.length === 1 ? { data: r[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null, count: null }).then(ok, bad),
  };
  return chain;
}

/** The fake client every pipeline reads through. */
export function parityClient() {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    from: (table: string) => query(table),
    // No selection-reasons function: the reader falls back to the column, as before the D-35 migration.
    rpc: async (name: string) => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } }),
    channel: () => channel,
    removeChannel: () => undefined,
    auth: { getUser: async () => ({ data: { user: { id: 'coach-user' } }, error: null }) },
  };
}
