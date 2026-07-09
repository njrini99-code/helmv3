'use client';

// =============================================================================
// src/components/baseball/video/VideoLibraryClient.tsx
//
// Main client for the Video Library — 5 views with working filters:
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
// =============================================================================

import * as React from 'react';
import { useState, useMemo, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
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
  IconVideo,
  IconPlus,
  IconSearch,
  IconFilter,
  IconUser,
  IconUsers,
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
import { VideoCard } from './VideoCard';
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
  { id: 'library', label: 'Library', icon: <IconLayoutGrid size={14} /> },
  { id: 'player', label: 'Player', icon: <IconUser size={14} /> },
  { id: 'event', label: 'Event', icon: <IconCalendar size={14} /> },
  { id: 'tagged', label: 'Tagged', icon: <IconBaseball size={14} /> },
  { id: 'evidence', label: 'Evidence', icon: <IconShieldAlert size={14} /> },
];

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
      className="flex items-center gap-1 p-1 bg-warm-100/80 rounded-xl overflow-x-auto scrollbar-hide"
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
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
              active
                ? 'bg-cream-50 text-warm-900 shadow-sm'
                : 'text-warm-500 hover:text-warm-800',
            )}
          >
            {icon}
            {label}
            {counts[id] > 0 && (
              <span
                className={cn(
                  'ml-0.5 min-w-[18px] h-[18px] rounded-full text-xs flex items-center justify-center tabular-nums',
                  active
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-warm-200 text-warm-500',
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
// Filter bar (search + type)
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
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                hasFilter
                  ? 'bg-primary-50 text-primary-700 border-primary-200'
                  : 'glass-subtle text-warm-600 hover:border-warm-300',
              )}
              aria-expanded={showPanel}
            >
              <IconFilter size={14} />
              {hasFilter ? 'Filtered' : 'Filter'}
            </Button>
          )}
        </div>

        {showPanel && showTypeFilter && onTypeFilter && (
          <div className="mt-3 pt-3 border-t border-warm-100">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium text-warm-500 mr-0.5">Type:</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onTypeFilter('')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                  !typeFilter
                    ? 'bg-primary-100 text-primary-700 border-primary-200'
                    : 'bg-cream-50 text-warm-600 border-warm-200 hover:border-warm-300',
                )}
              >
                All
              </Button>
              {VIDEO_TYPES.map((vt) => (
                <Button
                  key={vt.value}
                  type="button"
                  variant="ghost"
                  onClick={() => onTypeFilter(vt.value)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                    typeFilter === vt.value
                      ? 'bg-primary-100 text-primary-700 border-primary-200'
                      : 'bg-cream-50 text-warm-600 border-warm-200 hover:border-warm-300',
                  )}
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
// Empty states
// ---------------------------------------------------------------------------

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card variant="glass">
      <CardContent className="py-16 flex flex-col items-center text-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center">
          {icon}
        </div>
        <h3 className="text-base font-semibold tracking-tight text-warm-900">{title}</h3>
        <p className="text-sm text-warm-500 max-w-sm leading-relaxed">{body}</p>
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  );
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
          <div className="flex items-center gap-3 px-3 py-2.5 bg-warm-50 rounded-xl">
            <Avatar
              name={getFullName(video.player.first_name, video.player.last_name)}
              src={video.player.avatar_url ?? undefined}
              size="sm"
            />
            <div>
              <p className="font-medium text-warm-900 text-sm">
                {getFullName(video.player.first_name, video.player.last_name)}
              </p>
              <p className="text-xs text-warm-500">
                {video.player.primary_position}
                {video.player.grad_year ? ` · Class of ${video.player.grad_year}` : ''}
              </p>
            </div>
          </div>
        )}
        {video.description && (
          <p className="text-sm text-warm-600 leading-relaxed">{video.description}</p>
        )}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 text-sm text-warm-400 flex-wrap">
            {video.video_type && (
              <span className="px-2 py-0.5 rounded-full bg-warm-100 text-warm-600 text-xs border border-warm-200 capitalize">
                {video.video_type.replace(/_/g, ' ')}
              </span>
            )}
            {video.created_at && <span>{formatRelativeTime(video.created_at)}</span>}
            {video.view_count != null && (
              <span className="flex items-center gap-1">
                <IconEye size={13} /> {video.view_count}
              </span>
            )}
          </div>
          {onShare && video.url && (
            <Button variant="secondary" size="sm" onClick={onShare}>
              <IconLink size={13} />
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
        icon={<IconVideo size={28} className="text-primary-600" />}
        title={isCoach ? 'No videos yet' : 'No videos yet'}
        body={
          isCoach
            ? 'Videos uploaded by your players will appear here.'
            : 'Upload your first highlight video to showcase your skills.'
        }
        action={
          !isCoach ? (
            <Button onClick={() => setShowUpload(true)}>
              <IconPlus size={16} className="mr-1" />
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
            <IconPlus size={15} className="mr-1" />
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
          icon={<IconSearch size={24} className="text-warm-400" />}
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
            <LazyMotion key={video.id} features={domAnimation}>
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
          <div className="flex justify-end gap-2 pt-4 border-t border-warm-100">
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
        icon={<IconUsers size={28} className="text-primary-600" />}
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
          icon={<IconSearch size={24} className="text-warm-400" />}
          title="No players match"
          body={`No players match "${search}".`}
          action={<Button variant="secondary" onClick={() => setSearch('')}>Clear</Button>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((group) => {
            const isOpen = expanded.has(group.player.id);
            return (
              <Card key={group.player.id} variant="glass">
                <CardContent className="p-0">
                  {/* Group header */}
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full flex items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-2xl"
                    onClick={() => toggle(group.player.id)}
                    aria-expanded={isOpen}
                  >
                    <Avatar
                      name={getFullName(group.player.first_name, group.player.last_name)}
                      src={group.player.avatar_url ?? undefined}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-warm-900 truncate">
                        {getFullName(group.player.first_name, group.player.last_name)}
                      </p>
                      <p className="text-xs text-warm-500">
                        {[
                          group.player.primary_position,
                          group.player.jersey_number ? `#${group.player.jersey_number}` : null,
                          group.player.grad_year,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-warm-500">
                        {group.video_count} video{group.video_count !== 1 ? 's' : ''}
                      </span>
                      {isOpen ? (
                        <IconChevronUp size={16} className="text-warm-400" />
                      ) : (
                        <IconChevronDown size={16} className="text-warm-400" />
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
                        <div className="px-4 pb-4 pt-1 border-t border-warm-100">
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
                </CardContent>
              </Card>
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
        icon={<IconCalendar size={28} className="text-primary-600" />}
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
          icon={<IconCalendar size={28} className="text-warm-400" />}
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
              <Card key={group.game_id} variant="glass">
                <CardContent className="p-0">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full flex items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-2xl"
                    onClick={() => toggle(group.game_id)}
                    aria-expanded={isOpen}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <IconCalendar size={18} className="text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-warm-900 truncate">
                        {group.opponent_name
                          ? `vs. ${group.opponent_name}`
                          : `Game · ${group.game_date}`}
                      </p>
                      <p className="text-xs text-warm-500">
                        {[
                          group.game_date,
                          group.home_away,
                          scoreDisplay ? `Final: ${scoreDisplay}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-warm-500">
                        {group.clip_count} clip{group.clip_count !== 1 ? 's' : ''}
                      </span>
                      {isOpen ? (
                        <IconChevronUp size={16} className="text-warm-400" />
                      ) : (
                        <IconChevronDown size={16} className="text-warm-400" />
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
                        <div className="px-4 pb-4 pt-1 border-t border-warm-100">
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
                </CardContent>
              </Card>
            );
          })}

          {/* Ungrouped clips */}
          {data.ungroupedClips.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-warm-500 mb-2 ml-1">
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
        icon={<IconBaseball size={28} className="text-primary-600" />}
        title="No tagged clips yet"
        body="When film is tagged to at-bats or pitch events by staff, it will appear here linked to the specific stat events. No clips have been tagged for this team yet."
      />
    );
  }

  if (data.clips.length === 0) {
    return (
      <EmptyState
        icon={<IconBaseball size={28} className="text-warm-400" />}
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
              <span className="text-xs text-warm-500 font-medium">Anchored to:</span>
              {(['', 'at_bat', 'pitch'] as const).map((f) => (
                <Button
                  key={f}
                  type="button"
                  variant="ghost"
                  onClick={() => setTypeFilter(f)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                    typeFilter === f
                      ? 'bg-primary-100 text-primary-700 border-primary-200'
                      : 'bg-cream-50 text-warm-600 border-warm-200 hover:border-warm-300',
                  )}
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
          icon={<IconSearch size={24} className="text-warm-400" />}
          title="No clips match"
          body="Try adjusting the search or filter."
          action={<Button variant="secondary" onClick={() => { setSearch(''); setTypeFilter(''); }}>Clear</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((clip, i) => (
            <LazyMotion key={clip.id} features={domAnimation}>
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
        icon={<IconShieldAlert size={28} className="text-primary-600" />}
        title="No evidence clips yet"
        body="When staff link video clips to CoachHelm signals as supporting evidence, they will appear here. No clips have been linked to signals yet."
      />
    );
  }

  if (data.clips.length === 0) {
    return (
      <EmptyState
        icon={<IconShieldAlert size={28} className="text-warm-400" />}
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
          icon={<IconSearch size={24} className="text-warm-400" />}
          title="No clips match"
          body="Try clearing the search."
          action={<Button variant="secondary" onClick={() => setSearch('')}>Clear</Button>}
        />
      ) : (
        SEVERITY_ORDER.map((sev) => {
          const clips = bySeverity.get(sev);
          if (!clips?.length) return null;
          const sevLabel = sev.charAt(0).toUpperCase() + sev.slice(1);
          const sevCls =
            sev === 'critical'
              ? 'text-red-700 bg-red-50 border-red-200'
              : sev === 'high'
              ? 'text-orange-700 bg-orange-50 border-orange-200'
              : sev === 'medium'
              ? 'text-amber-700 bg-amber-50 border-amber-200'
              : 'text-warm-600 bg-warm-50 border-warm-200';

          return (
            <section key={sev}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
                    sevCls,
                  )}
                >
                  <IconShieldAlert size={12} />
                  {sevLabel}
                </span>
                <span className="text-xs text-warm-400">{clips.length} clip{clips.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {clips.map((clip, i) => (
                  <LazyMotion key={clip.id} features={domAnimation}>
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
      <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-semibold text-warm-900">Video Library</h1>
          <p className="mt-1 text-body-sm text-warm-500">{headerSubtitle}</p>
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Tab bar */}
        <div className="mb-5">
          <TabBar activeView={activeView} onChange={setActiveView} counts={counts} />
        </div>

        {/* Panel */}
        <LazyMotion features={domAnimation}>
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
