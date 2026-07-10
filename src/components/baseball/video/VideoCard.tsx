'use client';

// =============================================================================
// src/components/baseball/video/VideoCard.tsx
//
// ISLAND REBUILD onto "The Living Annual" kit (packet: island-videos; spec
// docs/baseball/design-system-living-annual.md §7). Shared video card used
// across all 5 video library views. Handles two surface types:
//   - LibraryVideo (baseball_videos): player-uploaded highlights/reels
//   - TaggedClip (baseball_video_events): staff-anchored film queue clips
//
// The old `Card variant="glass"` is now `PaperCard` (spec §4.3 — browsing film
// is a reading surface, not live tooling). Every rainbow chip (Primary star,
// video-type/clip tags, review status, stat-linkage, tags) is an `InkBadge` /
// `PositionChip` in team (green) or neutral (graphite) tone — never a raw
// warm-*/primary-*/amber/orange pill. The one exception is the signal-severity
// chip on evidence clips, which carries `pursuit` (clay) ink — that mirrors the
// severity → ink mapping already established for CoachHelm signals
// (src/components/baseball/signals/signal-presentation.ts): §4.2 rule 2
// explicitly sanctions clay/oxblood for "hot signals," so this is the same
// carve-out, not a new one. Names render `font-annual` per the founder
// ADDENDUM 2 type law; body copy (descriptions/notes) stays on the existing
// sans, matching the addendum's "chrome/body labels stay on the existing sans"
// rule.
//
// PRESENTATION ONLY — no prop/behavior change: same handlers, same data shape,
// same hover-lift motion (src/lib/coachhelm/v3/motion), same a11y labels.
// =============================================================================

import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  IconPlay,
  IconStar,
  IconEdit,
  IconTrash,
  IconEye,
  IconLink,
  IconShieldAlert,
  IconBaseball,
  IconHash,
} from '@/components/icons';
import { cn, formatRelativeTime, getFullName } from '@/lib/utils';
import {
  DURATION,
  EASE_CINEMATIC,
  useReducedMotionGuard,
  liftHover,
} from '@/lib/coachhelm/v3/motion';
import { PaperCard, InkBadge, Eyebrow, PositionChip } from '@/components/baseball/living-annual';
import type { InkBadgeProps } from '@/components/baseball/living-annual';
import type { LibraryVideo, TaggedClip } from '@/app/baseball/actions/videos';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LibraryVideoCardProps {
  kind: 'library';
  video: LibraryVideo;
  showPlayer?: boolean;
  isOwner?: boolean;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetPrimary?: () => void;
  onShare?: () => void;
}

export interface TaggedClipCardProps {
  kind: 'tagged';
  clip: TaggedClip & { signal_title?: string | null; signal_severity?: string | null };
  showPlayer?: boolean;
  onView?: () => void;
}

export type VideoCardProps = LibraryVideoCardProps | TaggedClipCardProps;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type InkTone = NonNullable<InkBadgeProps['tone']>;
type InkVariant = NonNullable<InkBadgeProps['variant']>;

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Review-status stamp — same three states as before, recolored onto the ink
 *  system: `approved` is the fully-settled positive (team/solid), `reviewed`
 *  a lighter positive (team/soft), `needs_review` stays quiet (neutral/soft) —
 *  never the old amber "pending" pill. */
function reviewStatusPresentation(s: string | null): { label: string; tone: InkTone; variant: InkVariant } | null {
  switch (s) {
    case 'needs_review': return { label: 'Needs review', tone: 'neutral', variant: 'soft' };
    case 'reviewed': return { label: 'Reviewed', tone: 'team', variant: 'soft' };
    case 'approved': return { label: 'Approved', tone: 'team', variant: 'solid' };
    default: return null;
  }
}

/**
 * Signal-severity → ink, shared with VideoLibraryClient's evidence grouping so
 * the two surfaces agree on one mapping. Clay (`pursuit`), never red/amber/
 * orange — the same "hot signals" carve-out as signal-presentation.ts. Same
 * four branches as the original `severityPill`, recolored (not regrouped).
 */
export function signalSeverityPresentation(s: string | null): { tone: InkTone; variant: InkVariant } {
  switch (s) {
    case 'critical': return { tone: 'pursuit', variant: 'solid' };
    case 'high': return { tone: 'pursuit', variant: 'soft' };
    case 'medium': return { tone: 'neutral', variant: 'solid' };
    case 'low':
    default: return { tone: 'neutral', variant: 'soft' };
  }
}

/** Same ink-tinted-ground convention as `<InkBadge>` (color-mix over the lane
 *  var), but as a style object rather than the atom — the evidence chip pairs
 *  an icon with a full sentence (the signal title), not a small-caps stamp
 *  word, so it can't wear InkBadge's `uppercase text-microbadge` directly. */
function severityChipTint(s: string | null): { textClass: string; style: { backgroundColor: string; borderColor?: string } } {
  const { tone, variant } = signalSeverityPresentation(s);
  const varRef = tone === 'pursuit' ? 'var(--pursuit-ink)' : 'var(--grade-avg)';
  const solid = variant === 'solid';
  return {
    textClass: tone === 'pursuit' ? 'text-pursuit' : 'text-text-secondary',
    style: {
      backgroundColor: `color-mix(in oklch, ${varRef} ${solid ? 16 : 8}%, transparent)`,
      borderColor: solid ? `color-mix(in oklch, ${varRef} 32%, transparent)` : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Thumbnail / play-button area
// ---------------------------------------------------------------------------

interface ThumbProps {
  src: string | null;
  thumbnail?: string | null;
  title: string;
  duration?: number | null;
  onClick?: () => void;
}

function VideoThumb({ src, thumbnail, title, duration, onClick }: ThumbProps) {
  return (
    <Button
      variant="ghost"
      type="button"
      className="group relative w-full appearance-none rounded-card border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus focus-visible:ring-offset-2"
      onClick={onClick}
      aria-label={`Play ${title}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-card bg-[var(--paper-canvas)]">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : src ? (
          <div className="flex h-full w-full items-center justify-center bg-[var(--paper-canvas)]">
            <IconPlay size={32} className="text-text-tertiary" aria-hidden />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--paper-canvas)]">
            <span className="text-xs text-text-tertiary">No preview</span>
          </div>
        )}

        {/* Play overlay */}
        {(src || thumbnail) && (
          <div className="absolute inset-0 flex items-center justify-center rounded-card bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--paper)]/90 shadow-lg">
              <IconPlay size={24} className="ml-0.5 text-text-primary" aria-hidden />
            </div>
          </div>
        )}
      </div>

      {/* Duration badge */}
      {duration && duration > 0 && (
        <div className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
          {formatDuration(duration)}
        </div>
      )}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Player strip (shown when showPlayer=true)
// ---------------------------------------------------------------------------

function PlayerStrip({ player }: { player: NonNullable<LibraryVideo['player']> }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 border-b border-[color:var(--hairline)] pb-2.5">
      <Avatar
        name={getFullName(player.first_name, player.last_name)}
        src={player.avatar_url ?? undefined}
        size="xs"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-annual text-sm font-medium text-text-primary">
          {getFullName(player.first_name, player.last_name)}
        </p>
        <Eyebrow
          ink="muted"
          items={[
            player.primary_position,
            player.jersey_number ? `#${player.jersey_number}` : null,
            player.grad_year ? String(player.grad_year) : null,
          ]}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported VideoCard
// ---------------------------------------------------------------------------

export function VideoCard(props: VideoCardProps) {
  const reduce = useReducedMotionGuard();

  // ---- Library variant ----
  if (props.kind === 'library') {
    const { video, showPlayer, isOwner, onView, onEdit, onDelete, onSetPrimary, onShare } = props;
    const title = video.title;

    return (
      <LazyMotion features={loadFeatures}>
        <m.div
          whileHover={reduce ? undefined : liftHover}
          transition={{ duration: DURATION.short, ease: EASE_CINEMATIC }}
        >
          <PaperCard className="transition-shadow duration-200 hover:shadow-card-hover">
            <div className="space-y-3 p-3 sm:p-4">
              <VideoThumb
                src={video.url}
                thumbnail={video.thumbnail_url}
                title={title}
                duration={video.duration}
                onClick={onView}
              />

              {showPlayer && video.player && <PlayerStrip player={video.player} />}

              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 font-annual text-sm font-semibold leading-snug text-text-primary line-clamp-2 sm:text-base">
                    {title}
                  </h3>
                  {video.is_primary && (
                    <span className="flex flex-shrink-0 items-center gap-1">
                      <IconStar size={10} className="text-grade-plus" aria-hidden />
                      <InkBadge label="Primary" tone="team" variant="solid" />
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {video.video_type && (
                    <InkBadge label={video.video_type.replace(/_/g, ' ')} tone="neutral" />
                  )}
                  {video.is_clip && <InkBadge label="Clip" tone="neutral" />}
                </div>

                {video.description && (
                  <p className="text-xs leading-relaxed text-text-secondary line-clamp-2 sm:text-sm">
                    {video.description}
                  </p>
                )}

                <div className="flex items-center gap-3 pt-0.5 text-xs text-text-tertiary">
                  {video.created_at && (
                    <span>{formatRelativeTime(video.created_at)}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <IconEye size={12} aria-hidden />
                    {video.view_count ?? 0}
                  </span>
                </div>
              </div>

              {/* Owner actions */}
              {isOwner && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-[color:var(--hairline)] pt-1">
                  {onEdit && (
                    <Button variant="secondary" size="sm" onClick={onEdit} className="h-8 px-2.5 text-xs">
                      <IconEdit size={13} aria-hidden />
                      <span className="ml-1 hidden sm:inline">Edit</span>
                    </Button>
                  )}
                  {onSetPrimary && !video.is_primary && (
                    <Button variant="secondary" size="sm" onClick={onSetPrimary} className="h-8 px-2.5 text-xs">
                      <IconStar size={13} aria-hidden />
                      <span className="ml-1 hidden sm:inline">Set Primary</span>
                    </Button>
                  )}
                  {onShare && video.url && (
                    <Button variant="secondary" size="sm" onClick={onShare} className="h-8 px-2.5 text-xs">
                      <IconLink size={13} aria-hidden />
                      <span className="ml-1 hidden sm:inline">Share</span>
                    </Button>
                  )}
                  {onDelete && (
                    <Button variant="danger" size="sm" onClick={onDelete} className="h-8 px-2.5 text-xs">
                      <IconTrash size={13} aria-hidden />
                      <span className="ml-1 hidden sm:inline">Delete</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </PaperCard>
        </m.div>
      </LazyMotion>
    );
  }

  // ---- Tagged / Evidence clip variant ----
  const { clip, showPlayer, onView } = props;
  const title = clip.clip_title ?? `${(clip.video_type ?? 'clip').replace(/_/g, ' ')} clip`;
  const reviewStatus = reviewStatusPresentation(clip.review_status);

  return (
    <LazyMotion features={loadFeatures}>
      <m.div
        whileHover={reduce ? undefined : liftHover}
        transition={{ duration: DURATION.short, ease: EASE_CINEMATIC }}
      >
        <PaperCard className="transition-shadow duration-200 hover:shadow-card-hover">
          <div className="space-y-3 p-3 sm:p-4">
            <VideoThumb
              src={clip.video_url}
              thumbnail={clip.thumbnail_url}
              title={title}
              duration={clip.duration_seconds}
              onClick={onView}
            />

            {showPlayer && clip.player && <PlayerStrip player={clip.player} />}

            <div className="space-y-1.5">
              <h3 className="font-annual text-sm font-semibold leading-snug text-text-primary line-clamp-2 sm:text-base">
                {title}
              </h3>

              {/* Signal evidence chip */}
              {clip.signal_title && (() => {
                const tint = severityChipTint(clip.signal_severity ?? null);
                return (
                  <div
                    className={cn('flex items-center gap-1.5 rounded-fw-md border px-2.5 py-1.5 text-xs font-medium', tint.textClass)}
                    style={tint.style}
                  >
                    <IconShieldAlert size={12} aria-hidden />
                    <span className="truncate">{clip.signal_title}</span>
                  </div>
                );
              })()}

              {/* Stat linkage chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                {clip.plate_appearance_id && (
                  <span className="inline-flex items-center gap-1">
                    <IconBaseball size={11} className="text-text-tertiary" aria-hidden />
                    <InkBadge label="At-bat" tone="neutral" />
                  </span>
                )}
                {clip.pitch_event_id && (
                  <span className="inline-flex items-center gap-1">
                    <IconHash size={11} className="text-text-tertiary" aria-hidden />
                    <InkBadge label="Pitch" tone="neutral" />
                  </span>
                )}
                {clip.source_vendor && (
                  <InkBadge label={clip.source_vendor} tone="neutral" />
                )}
                {reviewStatus && (
                  <InkBadge label={reviewStatus.label} tone={reviewStatus.tone} variant={reviewStatus.variant} />
                )}
              </div>

              {/* Tags */}
              {clip.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {clip.tags.slice(0, 4).map((tag) => (
                    <PositionChip key={tag} label={tag} size="sm" />
                  ))}
                  {clip.tags.length > 4 && (
                    <span className="text-xs text-text-tertiary">+{clip.tags.length - 4}</span>
                  )}
                </div>
              )}

              {clip.notes && (
                <p className="text-xs italic leading-relaxed text-text-secondary line-clamp-2">
                  {clip.notes}
                </p>
              )}

              <div className="flex items-center gap-3 pt-0.5 text-xs text-text-tertiary">
                <span>{formatRelativeTime(clip.created_at)}</span>
                {clip.source_confidence != null && (
                  <span>
                    {Math.round(clip.source_confidence * 100)}% confidence
                  </span>
                )}
              </div>
            </div>

            {onView && (
              <div className="border-t border-[color:var(--hairline)] pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onView}
                  className="h-8 px-2.5 text-xs"
                >
                  <IconPlay size={13} className="mr-1" aria-hidden />
                  Play clip
                </Button>
              </div>
            )}
          </div>
        </PaperCard>
      </m.div>
    </LazyMotion>
  );
}
