'use client';

import Link from 'next/link';
import { ArrowRight, ClipboardList } from 'lucide-react';
import { CoachHelmShell } from './CoachHelmShell';
import { DataTable, type ColumnDef } from '@/components/fairway/data-table';
import { InstrumentPanel, InstrumentCluster, Readout } from '@/components/fairway/instrument';
import { Button } from '@/components/fairway/controls/button';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { PlayerIdentity } from '@/components/fairway/controls/PlayerIdentity';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { coachHelmRoutes } from '@/lib/coachhelm/fairway-routes';
import type { RoundReviewWithDetails } from '@/lib/types/golf';

export interface FairwayReviewsWorkspaceProps {
  reviews: RoundReviewWithDetails[];
  signalCount?: number | null;
  className?: string;
}

type ReviewRow = {
  id: string;
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  courseName: string;
  roundDate: string;
  score: number | null;
  status: 'draft' | 'coach_review' | 'complete';
  roundId: string;
};

function reviewStatus(raw: RoundReviewWithDetails): ReviewRow['status'] {
  const ext = (raw as { patterns_detected?: { status?: string } | null }).patterns_detected;
  const s = ext?.status ?? 'draft';
  if (s === 'complete' || s === 'completed') return 'complete';
  if (s === 'coach_review') return 'coach_review';
  return 'draft';
}

function toRows(reviews: RoundReviewWithDetails[]): ReviewRow[] {
  return reviews.map((r) => {
    const round = r.round;
    const player = round?.player;
    const profile = player?.profile;
    const first = profile?.first_name ?? player?.first_name ?? '';
    const last = profile?.last_name ?? player?.last_name ?? '';
    return {
      id: r.id,
      playerId: player?.id ?? '',
      playerName: `${first} ${last}`.trim() || 'Player',
      avatarUrl: profile?.avatar_url ?? player?.avatar_url ?? null,
      courseName: round?.course_name ?? round?.course?.name ?? 'Round',
      roundDate: round?.round_date ?? r.created_at,
      score: round?.total_score ?? null,
      status: reviewStatus(r),
      roundId: round?.id ?? '',
    };
  });
}

const columns: ColumnDef<ReviewRow, unknown>[] = [
  {
    id: 'player',
    header: 'Player',
    cell: ({ row }) => (
      <PlayerIdentity
        name={row.original.playerName}
        avatarUrl={row.original.avatarUrl}
        meta={row.original.courseName}
        size="sm"
      />
    ),
  },
  {
    id: 'date',
    header: 'Date',
    accessorFn: (r) => r.roundDate,
    cell: ({ row }) => (
      <span className="font-fw-sans text-body-sm text-text-secondary tabular-nums">
        {new Date(row.original.roundDate).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}
      </span>
    ),
  },
  {
    id: 'score',
    header: 'Score',
    cell: ({ row }) => (
      <span className="font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">
        {row.original.score ?? '—'}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const tone =
        row.original.status === 'complete'
          ? 'success'
          : row.original.status === 'coach_review'
            ? 'warning'
            : 'neutral';
      const label =
        row.original.status === 'complete'
          ? 'Complete'
          : row.original.status === 'coach_review'
            ? 'Needs coach'
            : 'Draft';
      return <StatusPill tone={tone}>{label}</StatusPill>;
    },
  },
  {
    id: 'action',
    header: '',
    cell: ({ row }) => (
      <Button asChild variant="secondary" size="sm">
        <Link href={`/golf/dashboard/rounds/${row.original.roundId}/review`}>
          Open
          <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
        </Link>
      </Button>
    ),
  },
];

export function FairwayReviewsWorkspace({
  reviews,
  signalCount,
  className,
}: FairwayReviewsWorkspaceProps) {
  const rows = toRows(reviews);
  const pending = rows.filter((r) => r.status !== 'complete');
  const complete = rows.length - pending.length;

  return (
    <CoachHelmShell
      active="reviews"
      role="coach"
      signalCount={signalCount}
      title="Round Reviews"
      description="Completed rounds waiting for coach review — open, annotate, and turn takeaways into focus areas."
      className={className}
    >
      <div className="flex flex-col gap-6">
        <InstrumentCluster
          primary={
            <InstrumentPanel depth="raised" padding="md" as="section" header="Queue">
              <Readout
                size="lg"
                label="Needs review"
                display={String(pending.length)}
                state={pending.length === 0 ? 'awaiting' : 'live'}
                awaitingLabel="All caught up"
              />
            </InstrumentPanel>
          }
          secondary={[
            <InstrumentPanel key="done" depth="inset" padding="md" as="section" header="Completed">
              <Readout size="md" label="Reviewed" display={String(complete)} />
            </InstrumentPanel>,
          ]}
        />

        {rows.length === 0 ? (
          <EmptyState
            variant="subtle"
            icon={ClipboardList}
            title="No rounds to review yet"
            description="When players finish rounds with shot tracking, they'll appear here for your post-round review."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href={coachHelmRoutes.teamBrief}>Back to brief</Link>
              </Button>
            }
          />
        ) : (
          <InstrumentPanel depth="inset" padding="none" as="section" header="Review queue">
            <DataTable columns={columns} data={rows} />
          </InstrumentPanel>
        )}
      </div>
    </CoachHelmShell>
  );
}
