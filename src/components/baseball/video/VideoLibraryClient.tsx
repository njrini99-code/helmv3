'use client';

// =============================================================================
// src/components/baseball/video/VideoLibraryClient.tsx
//
// ISLAND REBUILD onto "The Living Annual" kit (packet: island-videos; spec
// docs/baseball/design-system-living-annual.md §7). Main client for the Video
// Library — 5 views with working filters:
//
//   Library  — all team highlight/recruiting videos (flat grid); type filter +
//              search; my-videos toggle for players; standard upload/edit/delete.
//   Player   — grouped by player, collapsible sections, player search.
//   Event    — grouped by game event (game_id); ungrouped clips bucket;
//              shows honest empty state when no film has been tagged.
//   Tagged   — clips anchored to stat events (at-bat / pitch); filter by type.
//   Evidence — clips linked to CoachHelm signals; grouped by severity;
//              shows signal title + severity chip.
//
// All mutations go through server actions (video-classes.ts). Read data is
// passed as props from the server page (already fetched via server actions).
//
// HONESTY: if a view has no rows (baseball_video_events is empty, or no signal-
// linked clips exist), show a friendly plain-language empty state — never fail,
// never show fake zeros.
//
// KIT MIGRATION — the page header is now a `SectionMasthead` (green accent
// rule) and every one of the five views' empty/zero states routes through the
// shared `EmptyState` helper below, which is now a thin `EditorsLetter` wrapper
// — no more gradient icon circles, no yellow/amber pills. Player/Event group
// headers are `PaperCard` (reading surfaces, not glass tooling) with `Eyebrow`
// datelines. `FilterBar` / `TabBar` / the Tagged-view filter row stay on Glass
// (`Card variant="glass"`) — spec §4.3 names filters explicitly as the Glass
// family. Active tab + filter states now read team green, per the founder
// "more visible green" addendum. Signal-severity grouping reuses
// `signalSeverityPresentation` from VideoCard.tsx so both files agree on one
// severity → ink mapping.
//
// PRESENTATION ONLY — no change to state, handlers, server-action wiring, data
// shape, or which empty state renders when; only how each thing is drawn.
// =============================================================================

import * as React from 'react';
import { useState, useMemo, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion, m, AnimatePresence } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { VideoUpload } from '@/components/features/video-upload';
import { VideoPlayer } from '@/components/features/video-player';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/sonner';
import {
  IconPlus,
  IconSearch,
  IconFilter,
  IconUser,
  IconCalendar,
  IconBaseball,
  IconShieldAlert,
  IconChevronDown,
  IconChevronUp,
  IconLayoutGrid,
  IconLink,
  IconEye,
} from '@/components/icons';
import { cn, formatRelativeTime, getFullName } from '@/lib/utils';
import {
  DURATION,
  EASE_CINEMATIC,
  useReducedMotionGuard,
} from '@/lib/coachhelm/v3/motion';
import { PaperCard, EditorsLetter, SectionMasthead, Eyebrow, InkBadge } from '@/components/baseball/living-annual';
import { VideoCard, signalSeverityPresentation } from './VideoCard';
import {
  deleteMyVideo,
  setMyPrimaryVideo,
  updateMyVideo,
  incrementMyVideoView,
} from '@/app/baseball/actions/video-classes';
import type {
  LibraryReadModel,
  PlayerReadModel,
  EventReadModel,
  TaggedReadModel,
  EvidenceReadModel,
  LibraryVideo,
  TaggedClip,
  EvidenceClip,
  VideoPlayerRef,
} from '@/app/baseball/actions/videos';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoView = 'library' | 'player' | 'event' | 'tagged' | 'evidence';

export interface VideoLibraryClientProps {
  isCoach: boolean;
  activePlayerId: string | null;
  library: LibraryReadModel;
  players: PlayerReadModel;
  events: EventReadModel;
  tagged: TaggedReadModel;
  evidence: EvidenceReadModel;
  initialView?: VideoView;
}

const VIDEO_TYPES = [
  { value: 'game_footage', label: 'Game Footage' },
  { value: 'skills_video', label: 'Skills Video' },
  { value: 'bullpen', label: 'Bullpen Session' },
  { value: 'batting_practice', label: 'Batting Practice' },
  { value: 'fielding', label: 'Fielding Drills' },
  { value: 'running', label: '60-Yard Dash / Running' },
  { value: 'throwing', label: 'Throwing / Arm Strength' },
  { value: 'highlight_reel', label: 'Highlight Reel' },
  { value: 'showcase', label: 'Showcase Event' },
  { value: 'other', label: 'Other' },
];

const VIEWS: { id: VideoView; label: string; icon: React.ReactNode }[] = [
  { id: 'library', label: 'Library', icon: <IconLayoutGrid size={14} aria-hidden /> },
  { id: 'player', label: 'Player', icon: <IconUser size={14} aria-hidden /> },
  { id: 'event', label: 'Event', icon: <IconCalendar size={14} aria-hidden /> },
  { id: 'tagged', label: 'Tagged', icon: <IconBaseball size={14} aria-hidden /> },
  { id: 'evidence', label: 'Evidence', icon: <IconShieldAlert size={14} aria-hidden /> },
];

/** Shared pill styling for the type/anchor filter chips (FilterBar's type
 *  panel + TaggedView's "Anchored to" row) — active reads team green, inactive
 *  stays a quiet hairline-outlined chip. One helper so the two rows agree. */
function filterChipClass(active: boolean): string {
  return cn(
    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
    active
      ? 'border-grade-plus/40 bg-grade-plus/15 text-grade-plus'
      : 'border-[color:var(--hairline)] bg-[var(--paper)] text-text-secondary hover:text-text-primary',
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function TabBar({
  activeView,
  onChange,
  counts,
}: {
  activeView: VideoView;
  onChange: (v: VideoView) => void;
  counts: Record<VideoView, number>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Video library views"
      className="flex items-center gap-1 overflow-x-auto rounded-xl bg-[var(--paper-canvas)] p-1 scrollbar-hide"
    >
      {VIEWS.map(({ id, label, icon }) => {
        const active = id === activeView;
        return (
          <Button
            key={id}
            role="tab"
            aria-selected={active}
            aria-controls={`video-panel-${id}`}
            id={`video-tab-${id}`}
            type="button"
            variant="ghost"
            onClick={() => onChange(id)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus',
              active
                ? 'bg-[var(--paper)] text-grade-plus shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            {icon}
            {label}
            {counts[id] > 0 && (
              <span
                className={cn(
                  'ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full text-xs tabular-nums',
                  active
                    ? 'bg-grade-plus/15 text-grade-plus'
                    : 'bg-[color:var(--hairline)] text-text-tertiary',
                )}
              >
                {counts[id]}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter bar (search + type) — Glass surface: spec §4.3 names filters
// explicitly in the Glass family, so this stays `Card variant="glass"`.
// ---------------------------------------------------------------------------

function FilterBar({
  search,
  onSearch,
  typeFilter,
  onTypeFilter,
  showTypeFilter = true,
  placeholder = 'Search videos...',
}: {
  search: string;
  onSearch: (v: string) => void;
  typeFilter?: string;
  onTypeFilter?: (v: string) => void;
  showTypeFilter?: boolean;
  placeholder?: string;
}) {
  const [showPanel, setShowPanel] = useState(false);
  const hasFilter = showTypeFilter && !!typeFilter;

  return (
    <Card variant="glass" className="mb-5">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={placeholder}
              leftIcon={<IconSearch size={16} />}
              clearable
              onClear={() => onSearch('')}
            />
          </div>
          {showTypeFilter && onTypeFilter && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowPanel((p) => !p)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-all',
                hasFilter
                  ? 'border-grade-plus/40 bg-grade-plus/10 text-grade-plus'
                  : 'border-[color:var(--hairline)] bg-[color:var(--paper)] text-text-secondary hover:text-text-primary',
              )}
              aria-expanded={showPanel}
            >
              <IconFilter size={14} aria-hidden />
              {hasFilter ? 'Filtered' : 'Filter'}
            </Button>
          )}
        </div>

        {showPanel && showTypeFilter && onTypeFilter && (
          <div className="mt-3 border-t border-[color:var(--hairline)] pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-xs font-medium text-text-tertiary">Type:</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onTypeFilter('')}
                className={filterChipClass(!typeFilter)}
              >
                All
              </Button>
              {VIDEO_TYPES.map((vt) => (
                <Button
                  key={vt.value}
                  type="button"
                  variant="ghost"
                  onClick={() => onTypeFilter(vt.value)}
                  className={filterChipClass(typeFilter === vt.value)}
                >
                  {vt.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty states — every zero/empty surface routes through `<EditorsLetter>`
// (spec §7 empty-state doctrine: "no yellow warning boxes anywhere"). This
// replaces the old gradient-icon-circle card; `action` (when the caller has
// one, e.g. "Upload First Video" / "Clear filters") is preserved 1:1.
// ---------------------------------------------------------------------------

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return <EditorsLetter ink="team" title={title} body={body} action={action} />;
}

// ---------------------------------------------------------------------------
// Video viewer modal
// ---------------------------------------------------------------------------

interface VideoModalProps {
  open: boolean;
  video: {
    url: string | null;
    thumbnail?: string | null;
    title: string;
    description?: string | null;
    created_at?: string | null;
    view_count?: number | null;
    video_type?: string | null;
    player?: VideoPlayerRef | null;
    is_clip?: boolean | null;
    clip_start_time?: number | null;
    clip_end_time?: number | null;
  } | null;
  onClose: () => void;
  onShare?: () => void;
}

function VideoModal({ open, video, onClose, onShare }: VideoModalProps) {
  if (!video) return null;
  return (
    <Modal open={open} onClose={onClose} title={video.title} size="xl">
      <div className="space-y-4">
        {video.url && (
          <VideoPlayer
            src={video.url}
            thumbnail={video.thumbnail ?? null}
            title={video.title}
            autoPlay
            clipStart={video.clip_start_time ?? undefined}
            clipEnd={video.clip_end_time ?? undefined}
          />
        )}
        {video.player && (
          <div className="flex items-center gap-3 rounded-xl bg-[var(--paper-canvas)] px-3 py-2.5">
            <Avatar decorative
              name={getFullName(video.player.first_name, video.player.last_name)}
              src={video.player.avatar_url ?? undefined}
              size="sm"
            />
            <div>
              <p className="font-annual text-sm font-medium text-text-primary">
                {getFullName(video.player.first_name, video.player.last_name)}
              </p>
              <p className="text-xs text-text-secondary">
                {video.player.primary_position}
                {video.player.grad_year ? ` · Class of ${video.player.grad_year}` : ''}
              </p>
            </div>
          </div>
        )}
        {video.description && (
          <p className="text-sm leading-relaxed text-text-secondary">{video.description}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm text-text-tertiary">
            {video.video_type && (
              <InkBadge label={video.video_type.replace(/_/g, ' ')} tone="neutral" />
            )}
            {video.created_at && <span>{formatRelativeTime(video.created_at)}</span>}
            {video.view_count != null && (
              <span className="flex items-center gap-1">
                <IconEye size={13} aria-hidden /> {video.view_count}
              </span>
            )}
          </div>
          {onShare && video.url && (
            <Button variant="secondary" size="sm" onClick={onShare}>
              <IconLink size={13} aria-hidden />
              <span className="ml-1">Share</span>
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ===========================================================================
// View: Library
// ===========================================================================

function LibraryView({
  data,
  isCoach,
  activePlayerId,
  onMutated,
}: {
  data: LibraryReadModel;
  isCoach: boolean;
  activePlayerId: string | null;
  onMutated: () => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [viewing, setViewing] = useState<LibraryVideo | null>(null);
  const [editing, setEditing] = useState<LibraryVideo | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', video_type: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LibraryVideo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [, startTransition] = useTransition();
  const { showToast } = useToast();
  const reduce = useReducedMotionGuard();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.videos.filter((v) => {
      const matchSearch =
        !q ||
        v.title.toLowerCase().includes(q) ||
        (v.description?.toLowerCase().includes(q) ?? false) ||
        (v.player
          ? getFullName(v.player.first_name, v.player.last_name).toLowerCase().includes(q)
          : false);
      const matchType = !typeFilter || v.video_type === typeFilter;
      return matchSearch && matchType;
    });
  }, [data.videos, search, typeFilter]);

  const handleView = useCallback(
    (video: LibraryVideo) => {
      setViewing(video);
      void incrementMyVideoView({ videoId: video.id }).catch(() => {});
    },
    [],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteMyVideo({ videoId: deleteTarget.id });
      if (!res.success) { showToast(res.error ?? 'Failed to delete video', 'error'); return; }
      showToast('Video deleted', 'success');
      startTransition(onMutated);
    } catch { showToast('Failed to delete video', 'error'); }
    finally { setDeleting(false); setDeleteTarget(null); }
  }, [deleteTarget, showToast, onMutated]);

  const handleEditSave = useCallback(async () => {
    if (!editing || !editForm.title.trim()) return;
    setSaving(true);
    try {
      const res = await updateMyVideo({
        videoId: editing.id,
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        videoType: editForm.video_type || null,
      });
      if (!res.success) { showToast(res.error ?? 'Failed to update video', 'error'); return; }
      showToast('Video updated', 'success');
      setEditing(null);
      startTransition(onMutated);
    } catch { showToast('Failed to update video', 'error'); }
    finally { setSaving(false); }
  }, [editing, editForm, showToast, onMutated]);

  const handleSetPrimary = useCallback(
    async (videoId: string) => {
      const res = await setMyPrimaryVideo({ videoId });
      if (!res.success) { showToast('Failed to set primary', 'error'); return; }
      showToast('Primary video updated', 'success');
      startTransition(onMutated);
    },
    [showToast, onMutated],
  );

  const handleShare = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  }, [showToast]);

  if (data.videos.length === 0 && !showUpload) {
    return (
      <EmptyState
        title={isCoach ? 'No videos yet' : 'No videos yet'}
        body={
          isCoach
            ? 'Videos uploaded by your players will appear here.'
            : 'Upload your first highlight video to showcase your skills.'
        }
        action={
          !isCoach ? (
            <Button onClick={() => setShowUpload(true)}>
              <IconPlus size={16} className="mr-1" aria-hidden />
              Upload First Video
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {!isCoach && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowUpload((p) => !p)}>
            <IconPlus size={15} className="mr-1" aria-hidden />
            {showUpload ? 'Cancel' : 'Upload Video'}
          </Button>
        </div>
      )}

      {showUpload && !isCoach && (
        <VideoUpload
          onUploadComplete={() => { setShowUpload(false); startTransition(onMutated); }}
          onCancel={() => setShowUpload(false)}
        />
      )}

      <FilterBar
        search={search}
        onSearch={setSearch}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        placeholder={isCoach ? 'Search by player or title…' : 'Search videos…'}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No videos match"
          body={`No videos match "${search}"${typeFilter ? ' with this type filter' : ''}.`}
          action={
            <Button variant="secondary" onClick={() => { setSearch(''); setTypeFilter(''); }}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((video, i) => (
            <LazyMotion key={video.id} features={loadFeatures}>
              <m.div
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.medium, ease: EASE_CINEMATIC, delay: Math.min(i * 0.04, 0.3) }}
              >
                <VideoCard
                  kind="library"
                  video={video}
                  showPlayer={isCoach}
                  isOwner={!isCoach && video.player_id === activePlayerId}
                  onView={() => handleView(video)}
                  onEdit={!isCoach && video.player_id === activePlayerId ? () => {
                    setEditing(video);
                    setEditForm({ title: video.title, description: video.description ?? '', video_type: video.video_type ?? '' });
                  } : undefined}
                  onDelete={!isCoach && video.player_id === activePlayerId ? () => setDeleteTarget(video) : undefined}
                  onSetPrimary={!isCoach && video.player_id === activePlayerId ? () => handleSetPrimary(video.id) : undefined}
                  onShare={video.url ? () => handleShare(video.url!) : undefined}
                />
              </m.div>
            </LazyMotion>
          ))}
        </div>
      )}

      {/* View video modal */}
      <VideoModal
        open={!!viewing}
        video={viewing ? {
          url: viewing.url,
          thumbnail: viewing.thumbnail_url,
          title: viewing.title,
          description: viewing.description,
          created_at: viewing.created_at,
          view_count: viewing.view_count,
          video_type: viewing.video_type,
          player: viewing.player,
          is_clip: viewing.is_clip,
          clip_start_time: viewing.clip_start_time,
          clip_end_time: viewing.clip_end_time,
        } : null}
        onClose={() => setViewing(null)}
        onShare={viewing?.url ? () => handleShare(viewing.url!) : undefined}
      />

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Video" size="md">
        <div className="space-y-4">
          <Input
            label="Title *"
            value={editForm.title}
            onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g., Fall Scrimmage Highlights"
          />
          <Select
            label="Video Type"
            options={VIDEO_TYPES}
            value={editForm.video_type}
            onChange={(v) => setEditForm((f) => ({ ...f, video_type: v }))}
            placeholder="Select type (optional)"
          />
          <Textarea
            label="Description"
            value={editForm.description}
            onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Add context about this video…"
            rows={3}
          />
          <div className="flex justify-end gap-2 border-t border-[color:var(--hairline)] pt-4">
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleEditSave} isLoading={saving} disabled={!editForm.title.trim()}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Video"
        message="Are you sure you want to delete this video? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ===========================================================================
// View: Player
// ===========================================================================

function PlayerView({ data }: { data: PlayerReadModel }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<LibraryVideo | null>(null);
  const { showToast } = useToast();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return data.groups;
    return data.groups.filter((g) =>
      getFullName(g.player.first_name, g.player.last_name).toLowerCase().includes(q),
    );
  }, [data.groups, search]);

  const toggle = useCallback((playerId: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(playerId)) { n.delete(playerId); } else { n.add(playerId); }
      return n;
    });
  }, []);

  if (data.groups.length === 0) {
    return (
      <EmptyState
        title="No player videos yet"
        body="When players upload videos, they will be grouped here by player."
      />
    );
  }

  return (
    <div className="space-y-5">
      <FilterBar
        search={search}
        onSearch={setSearch}
        showTypeFilter={false}
        placeholder="Search by player name…"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No players match"
          body={`No players match "${search}".`}
          action={<Button variant="secondary" onClick={() => setSearch('')}>Clear</Button>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((group) => {
            const isOpen = expanded.has(group.player.id);
            return (
              <PaperCard key={group.player.id} className="p-0">
                {/* Group header */}
                <Button
                  type="button"
                  variant="ghost"
                  className="flex w-full items-center gap-3 rounded-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus"
                  onClick={() => toggle(group.player.id)}
                  aria-expanded={isOpen}
                >
                  <Avatar decorative
                    name={getFullName(group.player.first_name, group.player.last_name)}
                    src={group.player.avatar_url ?? undefined}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-annual font-semibold text-text-primary">
                      {getFullName(group.player.first_name, group.player.last_name)}
                    </p>
                    <Eyebrow
                      ink="muted"
                      items={[
                        group.player.primary_position,
                        group.player.jersey_number ? `#${group.player.jersey_number}` : null,
                        group.player.grad_year ? String(group.player.grad_year) : null,
                      ]}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-secondary">
                      {group.video_count} video{group.video_count !== 1 ? 's' : ''}
                    </span>
                    {isOpen ? (
                      <IconChevronUp size={16} className="text-text-tertiary" aria-hidden />
                    ) : (
                      <IconChevronDown size={16} className="text-text-tertiary" aria-hidden />
                    )}
                  </div>
                </Button>

                {/* Expanded grid */}
                <AnimatePresence>
                  {isOpen && (
                    <m.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: EASE_CINEMATIC }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[color:var(--hairline)] px-4 pb-4 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
                          {group.videos.map((video) => (
                            <VideoCard
                              key={video.id}
                              kind="library"
                              video={video}
                              showPlayer={false}
                              isOwner={false}
                              onView={() => setViewing(video)}
                              onShare={
                                video.url
                                  ? async () => {
                                      try {
                                        await navigator.clipboard.writeText(video.url!);
                                        showToast('Link copied', 'success');
                                      } catch {
                                        showToast('Could not copy link', 'error');
                                      }
                                    }
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>
              </PaperCard>
            );
          })}
        </div>
      )}

      <VideoModal
        open={!!viewing}
        video={viewing ? {
          url: viewing.url,
          thumbnail: viewing.thumbnail_url,
          title: viewing.title,
          description: viewing.description,
          created_at: viewing.created_at,
          view_count: viewing.view_count,
          video_type: viewing.video_type,
          player: viewing.player,
          is_clip: viewing.is_clip,
          clip_start_time: viewing.clip_start_time,
          clip_end_time: viewing.clip_end_time,
        } : null}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

// ===========================================================================
// View: Event
// ===========================================================================

function EventView({ data }: { data: EventReadModel }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<TaggedClip | null>(null);

  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return data.groups;
    return data.groups.filter((g) =>
      (g.opponent_name?.toLowerCase().includes(q) ?? false) ||
      g.game_date.includes(q),
    );
  }, [data.groups, search]);

  if (!data.hasVideoEvents) {
    return (
      <EmptyState
        title="No tagged film yet"
        body="Once staff link clips to game events using the film tagging tools, they will be grouped here by game. No clips have been tagged for this team yet."
      />
    );
  }

  const toggle = (gameId: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(gameId)) { n.delete(gameId); } else { n.add(gameId); }
      return n;
    });
  };

  return (
    <div className="space-y-5">
      <FilterBar
        search={search}
        onSearch={setSearch}
        showTypeFilter={false}
        placeholder="Search by opponent or date…"
      />

      {data.groups.length === 0 && data.ungroupedClips.length === 0 ? (
        <EmptyState
          title="No game-linked clips"
          body="No clips have been anchored to a game yet."
        />
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const isOpen = expanded.has(group.game_id);
            const scoreDisplay =
              group.our_score != null && group.opponent_score != null
                ? `${group.our_score}–${group.opponent_score}`
                : null;

            return (
              <PaperCard key={group.game_id} className="p-0">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex w-full items-center gap-3 rounded-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus"
                  onClick={() => toggle(group.game_id)}
                  aria-expanded={isOpen}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-grade-plus/10">
                    <IconCalendar size={18} className="text-grade-plus" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-annual font-semibold text-text-primary">
                      {group.opponent_name
                        ? `vs. ${group.opponent_name}`
                        : `Game · ${group.game_date}`}
                    </p>
                    <Eyebrow
                      ink="muted"
                      items={[
                        group.game_date,
                        group.home_away,
                        scoreDisplay ? `Final: ${scoreDisplay}` : null,
                      ]}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-secondary">
                      {group.clip_count} clip{group.clip_count !== 1 ? 's' : ''}
                    </span>
                    {isOpen ? (
                      <IconChevronUp size={16} className="text-text-tertiary" aria-hidden />
                    ) : (
                      <IconChevronDown size={16} className="text-text-tertiary" aria-hidden />
                    )}
                  </div>
                </Button>

                <AnimatePresence>
                  {isOpen && (
                    <m.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: EASE_CINEMATIC }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[color:var(--hairline)] px-4 pb-4 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
                          {group.clips.map((clip) => (
                            <VideoCard
                              key={clip.id}
                              kind="tagged"
                              clip={clip}
                              showPlayer
                              onView={() => setViewing(clip)}
                            />
                          ))}
                        </div>
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>
              </PaperCard>
            );
          })}

          {/* Ungrouped clips */}
          {data.ungroupedClips.length > 0 && (
            <div>
              <h3 className="mb-2 ml-1 text-sm font-semibold text-text-secondary">
                Clips without a game ({data.ungroupedClips.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.ungroupedClips.map((clip) => (
                  <VideoCard
                    key={clip.id}
                    kind="tagged"
                    clip={clip}
                    showPlayer
                    onView={() => setViewing(clip)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {viewing && (
        <VideoModal
          open={!!viewing}
          video={{
            url: viewing.video_url,
            thumbnail: viewing.thumbnail_url,
            title: viewing.clip_title ?? 'Clip',
            player: viewing.player,
          }}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// View: Tagged
// ===========================================================================

function TaggedView({ data }: { data: TaggedReadModel }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'at_bat' | 'pitch' | ''>('');
  const [viewing, setViewing] = useState<TaggedClip | null>(null);
  const reduce = useReducedMotionGuard();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.clips.filter((c) => {
      const matchSearch =
        !q ||
        (c.clip_title?.toLowerCase().includes(q) ?? false) ||
        (c.tags.some((t) => t.toLowerCase().includes(q))) ||
        (c.player
          ? getFullName(c.player.first_name, c.player.last_name).toLowerCase().includes(q)
          : false);
      const matchType =
        !typeFilter ||
        (typeFilter === 'at_bat' && !!c.plate_appearance_id) ||
        (typeFilter === 'pitch' && !!c.pitch_event_id);
      return matchSearch && matchType;
    });
  }, [data.clips, search, typeFilter]);

  if (!data.hasVideoEvents) {
    return (
      <EmptyState
        title="No tagged clips yet"
        body="When film is tagged to at-bats or pitch events by staff, it will appear here linked to the specific stat events. No clips have been tagged for this team yet."
      />
    );
  }

  if (data.clips.length === 0) {
    return (
      <EmptyState
        title="No stat-linked clips"
        body="No clips have been anchored to at-bats or pitch events yet."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card variant="glass" className="mb-5">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by player, title, or tag…"
                leftIcon={<IconSearch size={15} />}
                clearable
                onClear={() => setSearch('')}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-text-tertiary">Anchored to:</span>
              {(['', 'at_bat', 'pitch'] as const).map((f) => (
                <Button
                  key={f}
                  type="button"
                  variant="ghost"
                  onClick={() => setTypeFilter(f)}
                  className={filterChipClass(typeFilter === f)}
                >
                  {f === '' ? 'All' : f === 'at_bat' ? 'At-bat' : 'Pitch'}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="No clips match"
          body="Try adjusting the search or filter."
          action={<Button variant="secondary" onClick={() => { setSearch(''); setTypeFilter(''); }}>Clear</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((clip, i) => (
            <LazyMotion key={clip.id} features={loadFeatures}>
              <m.div
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.medium, ease: EASE_CINEMATIC, delay: Math.min(i * 0.04, 0.3) }}
              >
                <VideoCard
                  kind="tagged"
                  clip={clip}
                  showPlayer
                  onView={() => setViewing(clip)}
                />
              </m.div>
            </LazyMotion>
          ))}
        </div>
      )}

      {viewing && (
        <VideoModal
          open={!!viewing}
          video={{ url: viewing.video_url, thumbnail: viewing.thumbnail_url, title: viewing.clip_title ?? 'Clip', player: viewing.player }}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// View: Evidence
// ===========================================================================

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

function EvidenceView({ data }: { data: EvidenceReadModel }) {
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<EvidenceClip | null>(null);
  const reduce = useReducedMotionGuard();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return data.clips;
    return data.clips.filter(
      (c) =>
        (c.signal_title?.toLowerCase().includes(q) ?? false) ||
        (c.clip_title?.toLowerCase().includes(q) ?? false) ||
        (c.player
          ? getFullName(c.player.first_name, c.player.last_name).toLowerCase().includes(q)
          : false),
    );
  }, [data.clips, search]);

  // Group by severity
  const bySeverity = useMemo(() => {
    const map = new Map<string, EvidenceClip[]>();
    for (const clip of filtered) {
      const sev = clip.signal_severity ?? 'info';
      const arr = map.get(sev) ?? [];
      arr.push(clip);
      map.set(sev, arr);
    }
    return map;
  }, [filtered]);

  if (!data.hasVideoEvents) {
    return (
      <EmptyState
        title="No evidence clips yet"
        body="When staff link video clips to CoachHelm signals as supporting evidence, they will appear here. No clips have been linked to signals yet."
      />
    );
  }

  if (data.clips.length === 0) {
    return (
      <EmptyState
        title="No signal-linked clips"
        body="No clips have been linked to CoachHelm signals as evidence yet."
      />
    );
  }

  return (
    <div className="space-y-6">
      <FilterBar
        search={search}
        onSearch={setSearch}
        showTypeFilter={false}
        placeholder="Search by signal or player…"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No clips match"
          body="Try clearing the search."
          action={<Button variant="secondary" onClick={() => setSearch('')}>Clear</Button>}
        />
      ) : (
        SEVERITY_ORDER.map((sev) => {
          const clips = bySeverity.get(sev);
          if (!clips?.length) return null;
          const sevLabel = sev.charAt(0).toUpperCase() + sev.slice(1);
          const { tone: sevTone, variant: sevVariant } = signalSeverityPresentation(sev);

          return (
            <section key={sev}>
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <IconShieldAlert size={12} className={sevTone === 'pursuit' ? 'text-pursuit' : 'text-text-secondary'} aria-hidden />
                  <InkBadge label={sevLabel} tone={sevTone} variant={sevVariant} />
                </span>
                <span className="text-xs text-text-tertiary">{clips.length} clip{clips.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {clips.map((clip, i) => (
                  <LazyMotion key={clip.id} features={loadFeatures}>
                    <m.div
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: DURATION.medium, ease: EASE_CINEMATIC, delay: Math.min(i * 0.04, 0.3) }}
                    >
                      <VideoCard
                        kind="tagged"
                        clip={{ ...clip, signal_title: clip.signal_title, signal_severity: clip.signal_severity }}
                        showPlayer
                        onView={() => setViewing(clip)}
                      />
                    </m.div>
                  </LazyMotion>
                ))}
              </div>
            </section>
          );
        })
      )}

      {viewing && (
        <VideoModal
          open
          video={{ url: viewing.video_url, thumbnail: viewing.thumbnail_url, title: viewing.clip_title ?? 'Clip', player: viewing.player }}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Root component
// ===========================================================================

export function VideoLibraryClient({
  isCoach,
  activePlayerId,
  library,
  players,
  events,
  tagged,
  evidence,
  initialView = 'library',
}: VideoLibraryClientProps) {
  const [activeView, setActiveView] = useState<VideoView>(initialView);
  const reduce = useReducedMotionGuard();
  const router = useRouter();

  // Tab counts (honest: show 0 for views with no data)
  const counts: Record<VideoView, number> = {
    library: library.totalCount,
    player: players.totalPlayers,
    event: events.totalClips,
    tagged: tagged.totalCount,
    evidence: evidence.totalCount,
  };

  // Honest header subtitle: derive from the real clip count, never a fixed
  // number. The old copy read "Team film — 5 views" (meaning 5 organizational
  // tabs), which reads as a play/view count and directly contradicted the
  // "No videos yet" empty state below it on a library with zero clips.
  const totalClips = library.totalCount;
  const headerSubtitle = isCoach
    ? totalClips > 0
      ? `Team film · ${totalClips} ${totalClips === 1 ? 'clip' : 'clips'}`
      : 'Team film and tagged clips'
    : 'Your videos and team film';

  // Mutations (upload / edit / delete / set-primary) call revalidatePath()
  // server-side, but this client component's props are only re-fetched when the
  // router actually re-renders the server tree — router.refresh() triggers that
  // re-fetch so the grid reflects the mutation instead of staying stale until a
  // manual reload.
  const handleMutated = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <>
      <div className="border-b border-[color:var(--hairline)] px-6 pb-5 pt-6 lg:px-8 lg:pt-8">
        <SectionMasthead title="Video Library" ink="team">
          <p className="text-body-sm text-text-secondary">{headerSubtitle}</p>
        </SectionMasthead>
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Tab bar */}
        <div className="mb-5">
          <TabBar activeView={activeView} onChange={setActiveView} counts={counts} />
        </div>

        {/* Panel */}
        <LazyMotion features={loadFeatures}>
          <AnimatePresence mode="wait">
            <m.div
              key={activeView}
              role="tabpanel"
              id={`video-panel-${activeView}`}
              aria-labelledby={`video-tab-${activeView}`}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.short, ease: EASE_CINEMATIC }}
            >
              {activeView === 'library' && (
                <LibraryView
                  data={library}
                  isCoach={isCoach}
                  activePlayerId={activePlayerId}
                  onMutated={handleMutated}
                />
              )}
              {activeView === 'player' && <PlayerView data={players} />}
              {activeView === 'event' && <EventView data={events} />}
              {activeView === 'tagged' && <TaggedView data={tagged} />}
              {activeView === 'evidence' && <EvidenceView data={evidence} />}
            </m.div>
          </AnimatePresence>
        </LazyMotion>
      </div>
    </>
  );
}
