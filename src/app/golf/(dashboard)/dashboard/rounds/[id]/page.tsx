import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import { Metadata } from 'next';
import { generateRoundRecap } from '@/app/golf/actions/round-recap';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { formatDateOnlyFull } from '@/lib/golf/date-only';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayRoundDetail } from '@/components/fairway/pages/rounds/FairwayRoundDetail';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: round } = await supabase
    .from('golf_rounds')
    .select('course_name, round_date, total_score, score_to_par')
    .eq('id', id)
    .maybeSingle();

  if (!round) {
    return {
      title: 'Round Details | Helm Sports',
      description: 'View golf round details and scorecard',
    };
  }

  const scoreToPar = round.score_to_par || 0;
  const scoreDisplay = scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar;

  return {
    title: `${round.course_name} - ${round.total_score || '--'} (${scoreDisplay}) | Helm Sports`,
    // `round_date` is a date-only column; `new Date(iso).toLocaleDateString()`
    // reads it back in the ambient zone and prints the previous day anywhere
    // west of UTC. This runs server-side (UTC on Vercel) so it happens to be
    // right in production today, which is exactly why it would rot silently.
    description: `Round details from ${round.course_name} on ${formatDateOnlyFull(round.round_date)} - Score: ${round.total_score || '--'} (${scoreDisplay})`,
  };
}

// Matches the actual golf_rounds schema
interface RoundWithDetails {
  id: string;
  player_id: string;
  course_name: string | null;
  course_city: string | null;
  course_state: string | null;
  course_rating: number | null;
  course_slope: number | null;
  tees_played: string | null;
  round_type: string | null;
  // Read so the type editor can open on the round's REAL current linkage. A
  // qualifier round is one because of `qualifier_id`, not because of
  // `round_type` — see actions/round-type.ts.
  qualifier_id: string | null;
  qualifier_round_number: number | null;
  round_date: string;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  notes: string | null;
  front_nine: number | null;
  back_nine: number | null;
  player: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}


export default async function RoundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  const supabase = await createClient();

  // Fetch round with player avatar
  const { data: round, error } = await supabase
    .from('golf_rounds')
    .select(`
      *,
      player:golf_players(first_name, last_name, avatar_url)
    `)
    .eq('id', id)
    .maybeSingle();

  // `error || !round` collapsed two different answers into a 404. A round that
  // does not exist is genuinely not found; a round we failed to READ is not.
  if (error) {
    await logServerError(
      `[round detail] round read failed — would have 404'd a round that exists: ${describeError(error)}`,
      { action: 'roundDetail.round', featureArea: 'round_tracking', roundId: id },
    );
    throw new Error("Couldn't load this round. Please try again.");
  }

  if (!round) {
    notFound();
  }

  const roundData = {
    ...round,
    player: Array.isArray(round.player) ? round.player[0] : round.player,
  } as unknown as RoundWithDetails;

  // Check if coach has access by verifying round's player is on their team
  let isCoach = false;
  if (coach?.organization_id && roundData.player_id) {
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

    if (teamId) {
      const { data: teamMembership, error: membershipError } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('player_id', roundData.player_id)
        .maybeSingle();

      // This read is an ACCESS decision, so failing closed is correct and is
      // kept — a failed check must never grant access. What was wrong is that
      // it failed closed SILENTLY: `isCoach` stayed false and the coach was
      // redirected to the dashboard with no explanation, for their own
      // player's round. Deny, but say we could not check, and record it.
      if (membershipError) {
        await logServerError(
          `[round detail] coach access check failed — denying access, but this is an outage and not a permission problem: ${describeError(membershipError)}`,
          { action: 'roundDetail.coachAccessCheck', featureArea: 'round_tracking', roundId: id },
        );
        throw new Error("Couldn't verify your access to this round. Please try again.");
      }

      isCoach = !!teamMembership;
    }
  }
  const isOwnRound = player && roundData.player_id === player.id;

  if (!isCoach && !isOwnRound) {
    redirect('/golf/dashboard');
  }

  // An unfinished round goes to the scoring screen, for everyone.
  //
  // Reverted 2026-08-31, same day it shipped. The previous version sent only
  // PLAYERS here and let a coach through to the detail page, so a coach could
  // re-type a live round. Measured before reverting: NO coach surface anywhere
  // in the product lists or links an in-progress round. All four coach-facing
  // reads in dashboard-data.ts filter `.eq('status','completed')`, and every
  // in_progress read in golf.ts is player-scoped (savePartialRound,
  // deleteInProgressRound, getNextQualifierRoundNumber). The exception was
  // reachable only by typing a URL.
  //
  // So it bought nothing and widened what a coach can touch, which the owner
  // ruled against directly: coaches deal with submitted rounds. The lifecycle
  // guard still permits re-typing a live round (20260830120000) — that
  // capability is simply unused until a surface exists that should use it,
  // which is the right order.
  if (round.status === 'in_progress') {
    redirect(`/golf/dashboard/rounds/continue/${id}`);
  }

  // The owning player OR a coach of their team may retype the round. Deliberately
  // includes the player: the coach's question was "can they edit on their end?",
  // and `golf_rounds_update` (RLS) already permits the owning player to write
  // both `round_type` and `qualifier_id`. Anyone who reached this line is
  // already one of the two, so this is exactly the page's own access rule.
  const canChangeType = isCoach || !!isOwnRound;

  const playerName = roundData.player
    ? `${roundData.player.first_name || ''} ${roundData.player.last_name || ''}`.trim()
    : 'Unknown Player';

  // Generate (or fetch cached) AI round recap. Server action persists the
  // result on first call so subsequent visits are instant. Failure here
  // never blocks the page render — recap stays null.
  //
  // Skipped for a round still in progress. Those reach this page now (a coach
  // opening a live round to change its type), and there is nothing to recap
  // yet: the action would spend an LLM call on a partial scorecard and then
  // fail to persist it anyway, because the lifecycle guard's `round_recap`
  // branch only permits the write when the round is already completed.
  let aiRecap: string | null = null;
  try {
    if (round.status === 'completed') {
      const result = await generateRoundRecap(id);
      aiRecap = result.recap;
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[round-detail] recap generation failed:', err);
    }
  }

  // Re-skin the SAME resolved data: the round + aiRecap above, plus a
  // read-only fetch of the honest golf_holes layer and the persisted
  // golf_round_reviews.round_stats. No writes.
  const { data: holesRows, error: holesError } = await supabase
    .from('golf_holes')
    .select('hole_number, par, score, putts, fairway_hit, gir, penalty_strokes, yardage')
    .eq('round_id', id)
    .order('hole_number', { ascending: true });

  // The scorecard IS this page. A failed read gave the same empty array as a
  // round with no holes recorded, so eighteen holes of entered data rendered as
  // a blank card — and a player looking at their own round would reasonably
  // conclude it had been lost. Throwing reaches the dashboard error boundary,
  // which offers a retry; a blank scorecard offers nothing.
  //
  // A genuinely hole-less round (an old summary-only entry) still renders
  // empty, because that read succeeds and returns [].
  if (holesError) {
    void logServerError(
      `[round detail] holes read failed for round ${id}: ${describeError(holesError)}`,
      { action: 'roundDetail.load', featureArea: 'rounds' },
      'error',
    );
    throw new Error("Couldn't load this round's scorecard. Please try again.");
  }

  const { data: reviewRow, error: reviewError } = await supabase
    .from('golf_round_reviews')
    .select('round_stats')
    .eq('round_id', id)
    .maybeSingle();

  // The review layer is additive — the scorecard stands without it — so this
  // degrades rather than throws. It is logged because "no review yet" and
  // "the review could not be read" look identical on screen, and only one of
  // them is worth a coach's attention.
  if (reviewError) {
    void logServerError(
      `[round detail] review read failed for round ${id}; derived stats will be missing: ${describeError(reviewError)}`,
      { action: 'roundDetail.load', featureArea: 'rounds' },
      'warning',
    );
  }

  // ── Qualifiers this round's player could attach the round to ──────────────
  // Only the ones they are ENTERED in and which are not completed — the two
  // conditions `updateRoundType` re-checks server-side. Offering any other
  // qualifier would be a dead end dressed as a choice.
  //
  // Degrades rather than throws: an empty list makes the editor say "not
  // entered in any open qualifier" instead of taking the whole page down, and
  // the practice/tournament choices still work without it.
  let qualifierOptions: Array<{
    id: string;
    name: string;
    numRounds: number;
    takenRoundNumbers: number[];
    playerEntered: boolean;
    isCompleted: boolean;
  }> = [];
  // An empty list has two very different causes, and saying "this team has no
  // open qualifier" when the read simply failed is a confident false statement
  // of exactly the kind this repo keeps recording.
  let qualifierReadFailed = false;
  if (canChangeType && roundData.player_id) {
    const { data: entryRows, error: entriesError } = await supabase
      .from('golf_qualifier_entries')
      .select('qualifier:golf_qualifiers(id, name, num_rounds, status)')
      .eq('player_id', roundData.player_id);

    if (entriesError) {
      void logServerError(
        `[round detail] qualifier options read failed for round ${id}; the type editor will offer no qualifier to attach to: ${describeError(entriesError)}`,
        { action: 'roundDetail.qualifierOptions', featureArea: 'rounds' },
        'warning',
      );
    }

    type QualifierRow = {
      id: string;
      name: string | null;
      num_rounds: number | null;
      status: string | null;
    };

    const entered = (entryRows ?? [])
      .map((row) => {
        const q = (row as { qualifier?: unknown }).qualifier;
        return (Array.isArray(q) ? q[0] : q) as QualifierRow | null | undefined;
      })
      // Completed qualifiers are included deliberately — see the coach's
      // instruction recorded in 20260831180000. The editor marks them.
      .filter((q): q is QualifierRow => Boolean(q && q.id));

    const enteredIds = new Set(entered.map((q) => q.id));

    // A coach also gets the team's OTHER open qualifiers — the ones this
    // player is not entered in yet.
    //
    // Without this, "change a practice round into a qualifier round" was
    // impossible for exactly the players who most needed it: a player with no
    // entry row saw an EMPTY dropdown and a message telling them a coach must
    // add them — which the coach was already reading. Measured 2026-08-31 on
    // one production team, two players held six practice rounds between them
    // and zero qualifier entries.
    //
    // Coach-only because RLS INSERT on golf_qualifier_entries is coach-only:
    // offering a player a qualifier they cannot be entered into would rebuild
    // the same dead end one step further in. The action re-checks both the
    // role and the team, and creates the entry on save.
    let teamOpen: QualifierRow[] = [];
    // Scoped by the ROUND's team, not the coach's cookie team. Those are not
    // the same thing: coach access here is granted by the round's PLAYER being
    // a member of the cookie team, while the RPC gates the qualifier against
    // `golf_rounds.team_id`. Measured 2026-08-31, production holds 12 rounds
    // whose `team_id` is not a membership of their own player, plus 8 with no
    // team at all — so offering the cookie team's qualifiers would let a coach
    // pick one the write then refuses, after the player had been entered into
    // it. Ask the same question the enforcement asks.
    const roundTeamId = (round as { team_id?: string | null }).team_id ?? null;
    if (isCoach && roundTeamId) {
      const { data: teamRows, error: teamQualError } = await supabase
        .from('golf_qualifiers')
        .select('id, name, num_rounds, status')
        .eq('team_id', roundTeamId);

      if (teamQualError) {
        qualifierReadFailed = true;
        void logServerError(
          `[round detail] team qualifier read failed for round ${id}; the type editor will only offer qualifiers this player is already entered in: ${describeError(teamQualError)}`,
          { action: 'roundDetail.teamQualifiers', featureArea: 'rounds' },
          'warning',
        );
      }

      teamOpen = ((teamRows ?? []) as QualifierRow[]).filter((q) => !enteredIds.has(q.id));
    }

    qualifierOptions = [...entered, ...teamOpen].map((q) => ({
      id: q.id,
      name: q.name ?? 'Qualifier',
      numRounds: q.num_rounds ?? 1,
      takenRoundNumbers: [] as number[],
      playerEntered: enteredIds.has(q.id),
      isCompleted: q.status === 'completed',
    }));

    // Which slots this player's OTHER rounds already occupy.
    //
    // Without this the editor offered every round number and defaulted to 1 —
    // and a player fixing a mis-tapped round has usually already recorded the
    // qualifier's earlier rounds, so 1 is precisely the slot that is not free.
    // Every save then failed on the action's clash check with no way to see
    // which numbers were available. That is the 2026-08-30 "players still
    // cannot edit round type after the round" report: not a permission
    // problem, a picker that could only offer a losing move.
    //
    // Excludes THIS round, so a round already sitting in slot 2 does not read
    // its own slot as taken. Mirrors the action's clash query, including its
    // `abandoned` exclusion.
    if (qualifierOptions.length > 0) {
      const { data: takenRows, error: takenError } = await supabase
        .from('golf_rounds')
        .select('qualifier_id, qualifier_round_number')
        .eq('player_id', roundData.player_id)
        .in('qualifier_id', qualifierOptions.map((q) => q.id))
        .neq('status', 'abandoned')
        .neq('id', id);

      if (takenError) {
        // Degrade to "nothing known taken" rather than dropping the editor:
        // the action still refuses a real clash, so the worst case is the old
        // behaviour (a save that fails with an explanation), not a bad write.
        void logServerError(
          `[round detail] taken qualifier slots read failed for round ${id}; the type editor may offer a slot that is already used: ${describeError(takenError)}`,
          { action: 'roundDetail.takenSlots', featureArea: 'rounds' },
          'warning',
        );
      }

      const byQualifier = new Map<string, number[]>();
      for (const row of takenRows ?? []) {
        if (!row.qualifier_id || typeof row.qualifier_round_number !== 'number') continue;
        const list = byQualifier.get(row.qualifier_id) ?? [];
        list.push(row.qualifier_round_number);
        byQualifier.set(row.qualifier_id, list);
      }
      for (const option of qualifierOptions) {
        option.takenRoundNumbers = byQualifier.get(option.id) ?? [];
      }
    }
  }

  const reviewStats = (reviewRow?.round_stats ?? null) as
    | {
        areasForImprovement?: Array<{ area: string; recommendation: string }> | null;
        recommendations?: string[] | null;
        momentumData?: Array<{ hole: number; rollingScoreToPar: number }> | null;
      }
    | null;

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayRoundDetail
        round={{
          id: roundData.id,
          course_name: roundData.course_name,
          round_date: roundData.round_date,
          round_type: roundData.round_type,
          total_score: roundData.total_score,
          score_to_par: roundData.score_to_par,
          total_putts: roundData.total_putts,
          total_fairways: roundData.total_fairways,
          total_fairways_hit: roundData.total_fairways_hit,
          total_gir: roundData.total_gir,
          total_gir_possible: roundData.total_gir_possible,
          front_nine: roundData.front_nine,
          back_nine: roundData.back_nine,
          holes_played: (roundData as { holes_played?: number | null }).holes_played ?? null,
        }}
        holes={holesRows ?? []}
        aiRecap={aiRecap}
        reviewStats={reviewStats}
        playerName={playerName}
        isCoach={isCoach}
        viewerIsOwner={!!isOwnRound}
        canChangeType={canChangeType}
        currentQualifierId={roundData.qualifier_id}
        currentQualifierRoundNumber={roundData.qualifier_round_number}
        qualifierOptions={qualifierOptions}
        viewerIsCoach={isCoach}
        qualifierReadFailed={qualifierReadFailed}
      />
    </div>
  );
}
