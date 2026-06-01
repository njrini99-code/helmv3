'use client';

/**
 * ============================================================================
 * Fairway · Team · FairwayTeamInfo  (PLAYER view · ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the PLAYER side of /golf/dashboard/team — the legacy
 * `TeamInfoPlayer`. PRESENTATION-ONLY and READ-ONLY: the player view has no
 * mutations. It DISPLAYS the same five regions the legacy page passed down,
 * verbatim, with no fabrication and honest emptiness (em-dash / EmptyState):
 *
 *   • Head coach        — name + avatar (deterministic colored initials fallback)
 *   • Announcements     — most-recent 3, "View all" → /dashboard/announcements
 *   • My tasks          — pending tasks, "View all" → /dashboard/tasks
 *   • Team roster       — first 5 teammates, "View full roster" → /dashboard/roster
 *   • Team info         — season · roster size · established
 *
 * Tokens / primitives ONLY — no glass, no warm-* / primary-* / amber-* / red-*
 * legacy classes, no surface-matte / surface-stone.
 * ========================================================================== */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  ViewHeader,
  Surface,
  Button,
  Avatar,
  Chip,
  StatusPill,
  EmptyState,
} from '@/components/fairway';
import {
  IconUsers,
  IconMail,
  IconUser,
  IconClipboardList,
} from '@/components/icons';
import { tintFor } from '@/components/fairway/pages/calendar/FairwayCalendarMemberRail';

/* ---------------------------------------------------------------------------
 * Props — mirror the legacy TeamInfoPlayer loader output EXACTLY
 * ------------------------------------------------------------------------- */

export interface FairwayTeamInfoProps {
  team: {
    id: string;
    name: string;
    season: string | null;
    created_at: string | null;
  };
  coach: {
    full_name: string | null;
    avatar_url?: string | null;
  } | null;
  roster: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    handicap: number | null;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    content: string | null;
    created_at: string | null;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    status: string | null;
    priority: string | null;
  }>;
}

const EM_DASH = '—';

function fullName(first: string | null, last: string | null): string {
  return `${first ?? ''} ${last ?? ''}`.trim();
}

function initials(first: string | null, last: string | null): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || EM_DASH;
}

function formatDate(value: string | null): string {
  if (!value) return EM_DASH;
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/* ---------------------------------------------------------------------------
 * Section heading — quiet eyebrow + icon, matching the masthead voice
 * ------------------------------------------------------------------------- */

function SectionTitle({
  icon,
  children,
  action,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-fw-display text-h3 text-text-primary">
        <span className="text-text-tertiary" aria-hidden>
          {icon}
        </span>
        {children}
      </h2>
      {action ? (
        <Button
          asChild
          variant="ghost"
          size="sm"
          rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
        >
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ColoredInitialsAvatar — deterministic warm-tinted initials (no photo path).
 * Mirrors the roster avatar treatment.
 * ------------------------------------------------------------------------- */

function ColoredInitialsAvatar({
  seed,
  glyph,
  name,
  size = 'md',
}: {
  seed: string;
  glyph: string;
  name: string;
  size?: 'md' | 'lg';
}) {
  const tint = tintFor(seed);
  const dim = size === 'lg' ? 'h-12 w-12 text-body' : 'h-10 w-10 text-body-sm';
  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-fw-sans font-semibold uppercase ring-1 ring-inset ring-border-subtle',
        dim,
      )}
      style={{ backgroundColor: tint.bg, color: tint.text }}
    >
      <span aria-hidden={!!name}>{glyph}</span>
      {name ? <span className="sr-only">{name}</span> : null}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * FairwayTeamInfo
 * ------------------------------------------------------------------------- */

export function FairwayTeamInfo({
  team,
  coach,
  roster,
  announcements,
  tasks = [],
}: FairwayTeamInfoProps) {
  const pendingTasks = tasks.filter((t) => t.status !== 'completed');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const rosterCount = roster.length;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-10">
      <ViewHeader
        eyebrow="Team"
        title={team.name || 'Team'}
        description="Your program — coach, announcements, tasks, and roster all in one place."
        meta={
          <>
            <span>{team.season || 'Season not set'}</span>
            <span aria-hidden>·</span>
            <span>
              {rosterCount} {rosterCount === 1 ? 'player' : 'players'}
            </span>
          </>
        }
        className="mb-8"
      />

      <div className="flex flex-col gap-10">
        {/* ── Head coach ───────────────────────────────────────────────── */}
        <section>
          <SectionTitle icon={<IconUser size={18} />}>Head coach</SectionTitle>
          <Surface elevation="border" padding="md">
            {coach ? (
              <div className="flex items-center gap-4">
                {coach.avatar_url ? (
                  <Avatar src={coach.avatar_url} name={coach.full_name} size="lg" />
                ) : (
                  <ColoredInitialsAvatar
                    seed={coach.full_name || team.id}
                    glyph={(coach.full_name?.[0] || 'C').toUpperCase()}
                    name={coach.full_name || 'Coach'}
                    size="lg"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate font-fw-sans text-body font-semibold text-text-primary">
                    {coach.full_name || EM_DASH}
                  </p>
                  <p className="font-fw-sans text-caption text-text-tertiary">
                    Head coach
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState
                variant="subtle"
                icon={null}
                title="No coach assigned yet"
                description="Your team coach will appear here once set."
              />
            )}
          </Surface>
        </section>

        {/* ── Announcements ────────────────────────────────────────────── */}
        <section>
          <SectionTitle
            icon={<IconMail size={18} />}
            action={{ label: 'View all', href: '/golf/dashboard/announcements' }}
          >
            Announcements
          </SectionTitle>
          {announcements.length === 0 ? (
            <Surface elevation="border" padding="md">
              <EmptyState
                variant="subtle"
                icon={null}
                title="No announcements yet"
                description="Team announcements from your coach will show up here."
              />
            </Surface>
          ) : (
            <div className="flex flex-col gap-3">
              {announcements.slice(0, 3).map((a) => (
                <Surface key={a.id} elevation="border" padding="md">
                  <h3 className="font-fw-sans text-body font-semibold text-text-primary">
                    {a.title}
                  </h3>
                  {a.content ? (
                    <p className="mt-1 line-clamp-2 font-fw-sans text-body-sm text-text-secondary">
                      {a.content}
                    </p>
                  ) : null}
                  <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
                    {a.created_at ? formatDate(a.created_at) : EM_DASH}
                  </p>
                </Surface>
              ))}
            </div>
          )}
        </section>

        {/* ── My tasks ─────────────────────────────────────────────────── */}
        <section>
          <SectionTitle
            icon={<IconClipboardList size={18} />}
            action={{ label: 'View all', href: '/golf/dashboard/tasks' }}
          >
            My tasks
          </SectionTitle>
          {pendingTasks.length === 0 && completedTasks.length === 0 ? (
            <Surface elevation="border" padding="md">
              <EmptyState
                variant="subtle"
                icon={null}
                title="No tasks assigned yet"
                description="Tasks your coach assigns to you will appear here."
              />
            </Surface>
          ) : pendingTasks.length === 0 ? (
            <Surface elevation="border" padding="md">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-accent-50 text-accent-700">
                  <IconClipboardList size={16} />
                </span>
                <p className="font-fw-sans text-body-sm font-medium text-accent-700">
                  All tasks completed
                </p>
              </div>
            </Surface>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingTasks.slice(0, 3).map((task) => {
                const showPriority =
                  task.priority && task.priority !== 'normal';
                const urgent =
                  task.priority === 'high' || task.priority === 'urgent';
                return (
                  <Surface key={task.id} elevation="border" padding="md">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-fw-warning"
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-fw-sans text-body-sm font-semibold text-text-primary">
                          {task.title}
                        </h3>
                        {task.description ? (
                          <p className="mt-0.5 line-clamp-1 font-fw-sans text-caption text-text-secondary">
                            {task.description}
                          </p>
                        ) : null}
                        {task.due_date ? (
                          <p className="mt-1 font-fw-sans text-caption text-text-tertiary">
                            Due{' '}
                            {new Date(task.due_date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        ) : null}
                      </div>
                      {showPriority ? (
                        <StatusPill
                          tone={urgent ? 'danger' : 'neutral'}
                          size="sm"
                          dot={false}
                          className="flex-shrink-0 uppercase tracking-[0.06em]"
                        >
                          {task.priority}
                        </StatusPill>
                      ) : null}
                    </div>
                  </Surface>
                );
              })}
              {pendingTasks.length > 3 ? (
                <p className="pt-1 text-center font-fw-sans text-caption text-text-tertiary">
                  +{pendingTasks.length - 3} more pending{' '}
                  {pendingTasks.length - 3 === 1 ? 'task' : 'tasks'}
                </p>
              ) : null}
            </div>
          )}
        </section>

        {/* ── Team roster ──────────────────────────────────────────────── */}
        <section>
          <SectionTitle
            icon={<IconUsers size={18} />}
            action={{ label: 'View full roster', href: '/golf/dashboard/roster' }}
          >
            Team roster
          </SectionTitle>
          <Surface elevation="border" padding={rosterCount === 0 ? 'md' : 'sm'}>
            {rosterCount === 0 ? (
              <EmptyState
                variant="subtle"
                icon={null}
                title="No players on the roster yet"
                description="Teammates will appear here once they join the team."
              />
            ) : (
              <div className="flex flex-col">
                {roster.slice(0, 5).map((player) => {
                  const name = fullName(player.first_name, player.last_name) || EM_DASH;
                  const hasHandicap = player.handicap !== null;
                  const scratchOrBetter =
                    hasHandicap && (player.handicap as number) <= 0;
                  return (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 rounded-fw-md px-3 py-2.5"
                    >
                      {player.avatar_url ? (
                        <Avatar src={player.avatar_url} name={name} size="md" />
                      ) : (
                        <ColoredInitialsAvatar
                          seed={player.id}
                          glyph={initials(player.first_name, player.last_name)}
                          name={name}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-fw-sans text-body font-medium text-text-primary">
                          {name}
                        </p>
                      </div>
                      {hasHandicap ? (
                        <Chip
                          tone={scratchOrBetter ? 'success' : 'neutral'}
                          size="sm"
                          className="flex-shrink-0 font-fw-mono tabular-nums"
                        >
                          {player.handicap} HCP
                        </Chip>
                      ) : (
                        <span className="flex-shrink-0 font-fw-sans text-caption text-text-tertiary">
                          {EM_DASH}
                        </span>
                      )}
                    </div>
                  );
                })}
                {rosterCount > 5 ? (
                  <p className="px-3 py-2 text-center font-fw-sans text-caption text-text-tertiary">
                    +{rosterCount - 5} more{' '}
                    {rosterCount - 5 === 1 ? 'player' : 'players'}
                  </p>
                ) : null}
              </div>
            )}
          </Surface>
        </section>

        {/* ── Team info ────────────────────────────────────────────────── */}
        <section>
          <SectionTitle icon={<IconUsers size={18} />}>Team info</SectionTitle>
          <Surface elevation="border" padding="md">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
              <div>
                <dt className="font-fw-sans text-caption text-text-tertiary">
                  Season
                </dt>
                <dd className="mt-0.5 font-fw-sans text-body font-medium text-text-primary">
                  {team.season || EM_DASH}
                </dd>
              </div>
              <div>
                <dt className="font-fw-sans text-caption text-text-tertiary">
                  Roster size
                </dt>
                <dd className="mt-0.5 font-fw-sans text-body font-medium text-text-primary tabular-nums">
                  {rosterCount} {rosterCount === 1 ? 'player' : 'players'}
                </dd>
              </div>
              <div>
                <dt className="font-fw-sans text-caption text-text-tertiary">
                  Established
                </dt>
                <dd className="mt-0.5 font-fw-sans text-body font-medium text-text-primary">
                  {formatDate(team.created_at)}
                </dd>
              </div>
            </dl>
          </Surface>
        </section>
      </div>
    </div>
  );
}

export default FairwayTeamInfo;
