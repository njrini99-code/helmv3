'use client';

// =============================================================================
// src/components/baseball/video/VideoCard.tsx
//
// Shared video card used across all 5 video library views.
// Handles two surface types:
//   - LibraryVideo (baseball_videos): player-uploaded highlights/reels
//   - TaggedClip (baseball_video_events): staff-anchored film queue clips
//
// Design: California-modern × neo-futurism — cream bg, helm-green accent,
// glass card, warm neutrals, hover lift (no scale), accessibility labels.
// =============================================================================

import { LazyMotion, domAnimation, m } from 'framer-motion';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function reviewStatusLabel(s: string | null): { label: string; cls: string } | null {
  if (!s) return null;
  switch (s) {
    case 'needs_review': return { label: 'Needs review', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    case 'reviewed': return { label: 'Reviewed', cls: 'bg-primary-50 text-primary-700 border-primary-200' };
    case 'approved': return { label: 'Approved', cls: 'bg-primary-100 text-primary-800 border-primary-200' };
    default: return null;
  }
}

function severityPill(s: string | null) {
  if (!s) return null;
  switch (s) {
    case 'critical': return 'bg-red-100 text-red-700 border-red-200';
    case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'low': return 'bg-warm-100 text-warm-600 border-warm-200';
    default: return 'bg-warm-100 text-warm-600 border-warm-200';
  }
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
      className="relative group w-full text-left appearance-none bg-transparent border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-xl"
      onClick={onClick}
      aria-label={`Play ${title}`}
    >
      <div className="relative aspect-video rounded-xl overflow-hidden bg-warm-100">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : src ? (
          <div className="w-full h-full flex items-center justify-center bg-warm-100">
            <IconPlay size={32} className="text-warm-300" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-warm-50">
            <span className="text-xs text-warm-400">No preview</span>
          </div>
        )}

        {/* Play overlay */}
        {(src || thumbnail) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
            <div className="w-14 h-14 rounded-full glass-standard flex items-center justify-center shadow-lg">
              <IconPlay size={24} className="text-warm-900 ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Duration badge */}
      {duration && duration > 0 && (
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/75 text-white text-xs font-medium rounded tabular-nums">
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
    <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-warm-100">
      <Avatar
        name={getFullName(player.first_name, player.last_name)}
        src={player.avatar_url ?? undefined}
        size="xs"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-warm-900 truncate">
          {getFullName(player.first_name, player.last_name)}
        </p>
        <p className="text-xs text-warm-500">
          {[player.primary_position, player.jersey_number ? `#${player.jersey_number}` : null, player.grad_year]
            .filter(Boolean)
            .join(' · ')}
        </p>
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
      <LazyMotion features={domAnimation}>
        <m.div
          whileHover={reduce ? undefined : liftHover}
          transition={{ duration: DURATION.short, ease: EASE_CINEMATIC }}
        >
          <Card
            variant="glass"
            className="transition-shadow duration-200 hover:shadow-card-hover"
          >
            <CardContent className="p-3 sm:p-4 space-y-3">
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
                  <h3 className="flex-1 font-semibold text-warm-900 text-sm sm:text-base leading-snug min-w-0 line-clamp-2">
                    {title}
                  </h3>
                  {video.is_primary && (
                    <Badge
                      variant="success"
                      className="flex-shrink-0 flex items-center gap-1 text-xs"
                    >
                      <IconStar size={10} />
                      Primary
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {video.video_type && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warm-100 text-warm-600 border border-warm-200 capitalize">
                      {video.video_type.replace(/_/g, ' ')}
                    </span>
                  )}
                  {video.is_clip && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warm-100 text-warm-600 border border-warm-200">
                      Clip
                    </span>
                  )}
                </div>

                {video.description && (
                  <p className="text-xs sm:text-sm text-warm-600 leading-relaxed line-clamp-2">
                    {video.description}
                  </p>
                )}

                <div className="flex items-center gap-3 text-xs text-warm-400 pt-0.5">
                  {video.created_at && (
                    <span>{formatRelativeTime(video.created_at)}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <IconEye size={12} />
                    {video.view_count ?? 0}
                  </span>
                </div>
              </div>

              {/* Owner actions */}
              {isOwner && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-warm-100 flex-wrap">
                  {onEdit && (
                    <Button variant="secondary" size="sm" onClick={onEdit} className="h-8 px-2.5 text-xs">
                      <IconEdit size={13} />
                      <span className="hidden sm:inline ml-1">Edit</span>
                    </Button>
                  )}
                  {onSetPrimary && !video.is_primary && (
                    <Button variant="secondary" size="sm" onClick={onSetPrimary} className="h-8 px-2.5 text-xs">
                      <IconStar size={13} />
                      <span className="hidden sm:inline ml-1">Set Primary</span>
                    </Button>
                  )}
                  {onShare && video.url && (
                    <Button variant="secondary" size="sm" onClick={onShare} className="h-8 px-2.5 text-xs">
                      <IconLink size={13} />
                      <span className="hidden sm:inline ml-1">Share</span>
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onDelete}
                      className="h-8 px-2.5 text-xs text-red-600 hover:text-red-700 hover:border-red-200"
                    >
                      <IconTrash size={13} />
                      <span className="hidden sm:inline ml-1">Delete</span>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </m.div>
      </LazyMotion>
    );
  }

  // ---- Tagged / Evidence clip variant ----
  const { clip, showPlayer, onView } = props;
  const title = clip.clip_title ?? `${(clip.video_type ?? 'clip').replace(/_/g, ' ')} clip`;
  const reviewStatus = reviewStatusLabel(clip.review_status);

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        whileHover={reduce ? undefined : liftHover}
        transition={{ duration: DURATION.short, ease: EASE_CINEMATIC }}
      >
        <Card
          variant="glass"
          className="transition-shadow duration-200 hover:shadow-card-hover"
        >
          <CardContent className="p-3 sm:p-4 space-y-3">
            <VideoThumb
              src={clip.video_url}
              thumbnail={clip.thumbnail_url}
              title={title}
              duration={clip.duration_seconds}
              onClick={onView}
            />

            {showPlayer && clip.player && <PlayerStrip player={clip.player} />}

            <div className="space-y-1.5">
              <h3 className="font-semibold text-warm-900 text-sm sm:text-base leading-snug line-clamp-2">
                {title}
              </h3>

              {/* Signal evidence chip */}
              {clip.signal_title && (
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium',
                    severityPill(clip.signal_severity ?? null),
                  )}
                >
                  <IconShieldAlert size={12} />
                  <span className="truncate">{clip.signal_title}</span>
                </div>
              )}

              {/* Stat linkage chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {clip.plate_appearance_id && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warm-100 text-warm-600 border border-warm-200">
                    <IconBaseball size={11} />
                    At-bat
                  </span>
                )}
                {clip.pitch_event_id && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warm-100 text-warm-600 border border-warm-200">
                    <IconHash size={11} />
                    Pitch
                  </span>
                )}
                {clip.source_vendor && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-100">
                    {clip.source_vendor}
                  </span>
                )}
                {reviewStatus && (
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                      reviewStatus.cls,
                    )}
                  >
                    {reviewStatus.label}
                  </span>
                )}
              </div>

              {/* Tags */}
              {clip.tags.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {clip.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 bg-warm-50 text-warm-500 text-xs rounded border border-warm-100"
                    >
                      {tag}
                    </span>
                  ))}
                  {clip.tags.length > 4 && (
                    <span className="text-xs text-warm-400">+{clip.tags.length - 4}</span>
                  )}
                </div>
              )}

              {clip.notes && (
                <p className="text-xs text-warm-600 leading-relaxed line-clamp-2 italic">
                  {clip.notes}
                </p>
              )}

              <div className="flex items-center gap-3 text-xs text-warm-400 pt-0.5">
                <span>{formatRelativeTime(clip.created_at)}</span>
                {clip.source_confidence != null && (
                  <span>
                    {Math.round(clip.source_confidence * 100)}% confidence
                  </span>
                )}
              </div>
            </div>

            {onView && (
              <div className="pt-1 border-t border-warm-100">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onView}
                  className="h-8 px-2.5 text-xs"
                >
                  <IconPlay size={13} className="mr-1" />
                  Play clip
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </m.div>
    </LazyMotion>
  );
}
