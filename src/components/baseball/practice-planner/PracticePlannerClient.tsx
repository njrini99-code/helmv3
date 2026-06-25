'use client';

// =============================================================================
// src/components/baseball/practice-planner/PracticePlannerClient.tsx
//
// Wave 8 / packet: practice-planner
//
// Practice Planner Lite UI:
//   - Coaches (can_manage_practice) build practices from timed activity blocks
//     (stations) with per-block location + staff owner, save as DRAFT, then
//     PUBLISH (which optionally attaches a team-calendar event) + take
//     attendance.
//   - Players see only PUBLISHED practices as a read-only schedule (writes are
//     gated server-side; this UI hides the editor for non-staff).
//
// Design: GolfHelm primitives (Card / Button / EmptyState / skeletons) on the
// cream + helm-green system, glass cards, real empty/loading/error states.
// framer-motion is loaded via LazyMotion + domAnimation with reduced-motion
// respected. No black backgrounds.
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import {
  Clock,
  MapPin,
  Plus,
  Trash2,
  CalendarPlus,
  Eye,
  EyeOff,
  ClipboardList,
  CheckCircle2,
  UserCircle2,
  Ruler,
  Inbox,
  X,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';

import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import {
  getTeamPractices,
  savePractice,
  publishPractice,
  recordPracticeAttendance,
  getClassConflictsForPractice,
  type PracticeBlockInput,
  type AttendanceEntryInput,
  type ClassConflictSummary,
} from '@/app/baseball/actions/practice';
import type { PracticeValidationResult } from '@/lib/baseball/practice-validation';
import {
  getPracticeIntelligence,
  convertSignalToBlock,
} from '@/app/baseball/actions/practice-intelligence';
import type {
  BaseballPracticeWithDetail,
  BaseballPracticeAttendanceStatus,
} from '@/lib/types/baseball-practice';
import type {
  PracticeSignal,
  SuggestedPracticeBlock,
  BaseballBlockVisibility,
  BaseballScrimmageWithDetail,
} from '@/lib/types/baseball-practice-deep';
import { getPracticeObjectives, type PracticeObjectiveView } from '@/app/baseball/actions/practice-effectiveness';
import { TimeRailBuilder, type RailBlock } from './TimeRailBuilder';
import { PracticeIntelligenceBoard } from './PracticeIntelligenceBoard';
import { ScrimmagePanel } from './ScrimmagePanel';
import { BlockObjectiveEditor } from './BlockObjectiveEditor';
import { PracticeRecapPanel } from './PracticeRecapPanel';
import { PracticePrintExport } from './PracticePrintExport';
import type { ScrimmageRosterPlayer } from './ScrimmageLineupBuilder';

interface RosterPlayer {
  id: string;
  name: string;
  bats: string | null;
  throws: string | null;
  primaryPosition: string | null;
}

interface StaffCoach {
  id: string;
  name: string;
}

interface DraftBlock extends PracticeBlockInput {
  key: string;
}

/** Default visibility for a new block (player-visible unless coach hides it). */
const DEFAULT_VISIBILITY: BaseballBlockVisibility = 'player_visible';

const ATTENDANCE_OPTIONS: { value: BaseballPracticeAttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'limited', label: 'Limited' },
  { value: 'absent', label: 'Absent' },
  { value: 'excused', label: 'Excused' },
];

function newKey() {
  return `b_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function fmtOffset(startMin: number, durationMin: number) {
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const mm = String(mins % 60).padStart(2, '0');
    return `${h}:${mm}`;
  };
  return `${fmt(startMin)} – ${fmt(startMin + durationMin)} (+${startMin}m)`;
}

/**
 * Practice-card-shaped skeleton — mirrors the real PracticeCard layout (title +
 * status pill, focus line, two block rows) so the loading state has no layout
 * shift when real content arrives.
 */
function PracticeCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative overflow-clip rounded-2xl border border-warm-200 bg-cream-50 p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="h-5 w-48 rounded bg-warm-200/60 skeleton-shimmer" />
            <div className="h-3 w-32 rounded bg-warm-100/60 skeleton-shimmer" />
          </div>
          <div className="h-7 w-20 rounded-lg bg-warm-100/60 skeleton-shimmer" />
        </div>
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-9 w-full rounded-xl bg-cream-50 skeleton-shimmer" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PracticePlannerClient() {
  const { user, player: ownPlayerProfile, loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();
  const prefersReduced = useReducedMotion();

  const isCoach = user?.role === 'coach';
  // The logged-in player's baseball_players.id, used to look up their own
  // attendance status when viewing a published practice as a player.
  const ownPlayerId = isCoach ? null : (ownPlayerProfile?.id ?? null);

  const [practices, setPractices] = useState<BaseballPracticeWithDetail[]>([]);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [staff, setStaff] = useState<StaffCoach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [editing, setEditing] = useState(false);
  const [editPracticeId, setEditPracticeId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [focus, setFocus] = useState('');
  const [blocks, setBlocks] = useState<DraftBlock[]>([]);
  const [saving, setSaving] = useState(false);

  // Calendar attach is now per-practice-card (state lives in PracticeCard).

  // Time-rail selection + live validation surfaced from the rail.
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [validation, setValidation] = useState<PracticeValidationResult | null>(null);

  // Practice Intelligence Board (signals -> blocks).
  const [signals, setSignals] = useState<PracticeSignal[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedPracticeBlock[]>([]);
  const [intelLoading, setIntelLoading] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  // Captured objectives for the practice being edited (the effectiveness engine's
  // SOURCE layer). Reloaded whenever the editor opens an existing practice or an
  // objective is added/removed.
  const [objectives, setObjectives] = useState<PracticeObjectiveView[]>([]);

  const loadObjectives = useCallback(async (practiceId: string | null) => {
    if (!practiceId) {
      setObjectives([]);
      return;
    }
    const res = await getPracticeObjectives({ practiceId });
    setObjectives(res.success ? (res.data ?? []) : []);
  }, []);

  // Class-conflict summary for the practice currently being edited.
  // Loaded best-effort when an existing practice is opened in the editor.
  // Never fabricated: if the fetch fails or the practice has no ID, byPlayer={}.
  const [classConflicts, setClassConflicts] = useState<ClassConflictSummary>({ byPlayer: {} });

  const loadClassConflicts = useCallback(async (practiceId: string | null) => {
    if (!practiceId) {
      setClassConflicts({ byPlayer: {} });
      return;
    }
    try {
      const res = await getClassConflictsForPractice({ practiceId });
      setClassConflicts(res.success && res.data ? res.data : { byPlayer: {} });
    } catch {
      // Non-fatal: leave byPlayer empty (no fake flags).
      setClassConflicts({ byPlayer: {} });
    }
  }, []);

  const loadPractices = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getTeamPractices();
    if (res.success) {
      setPractices(res.data ?? []);
    } else {
      setError(res.error ?? 'Could not load practices.');
    }
    setLoading(false);
  }, []);

  const loadRosterAndStaff = useCallback(async () => {
    if (!selectedTeamId) return;
    const supabase = createClient();

    const { data: members } = await supabase
      .from('baseball_team_members')
      .select(
        'player_id, player:baseball_players(id, first_name, last_name, bats, throws, primary_position)',
      )
      .eq('team_id', selectedTeamId);

    const players: RosterPlayer[] = (members ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => {
        const p = Array.isArray(m.player) ? m.player[0] : m.player;
        if (!p) return null;
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
        return {
          id: p.id as string,
          name,
          bats: (p.bats as string | null) ?? null,
          throws: (p.throws as string | null) ?? null,
          primaryPosition: (p.primary_position as string | null) ?? null,
        };
      })
      .filter((p): p is RosterPlayer => p !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    setRoster(players);

    const { data: coaches } = await supabase
      .from('baseball_team_coach_staff')
      .select('coach:baseball_coaches(id, first_name, last_name)')
      .eq('team_id', selectedTeamId);

    const staffList: StaffCoach[] = (coaches ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => {
        const co = Array.isArray(c.coach) ? c.coach[0] : c.coach;
        if (!co) return null;
        const name = [co.first_name, co.last_name].filter(Boolean).join(' ') || 'Coach';
        return { id: co.id as string, name };
      })
      .filter((c): c is StaffCoach => c !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    setStaff(staffList);
  }, [selectedTeamId]);

  const loadIntelligence = useCallback(async () => {
    setIntelLoading(true);
    try {
      const res = await getPracticeIntelligence();
      if (res.success && res.data) {
        setSignals(res.data.signals);
        setSuggestions(res.data.suggestions);
      }
    } catch {
      // Non-fatal: the board renders an empty state.
    } finally {
      setIntelLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void loadPractices();
    if (isCoach) {
      void loadRosterAndStaff();
      void loadIntelligence();
    }
  }, [authLoading, isCoach, loadPractices, loadRosterAndStaff, loadIntelligence]);

  // ---- Editor helpers -------------------------------------------------------

  const resetEditor = () => {
    setEditing(false);
    setEditPracticeId(null);
    setTitle('');
    setFocus('');
    setBlocks([]);
    setSelectedBlockKey(null);
    setValidation(null);
    setObjectives([]);
    setClassConflicts({ byPlayer: {} });
  };

  const startNew = () => {
    resetEditor();
    setEditing(true);
    const key = newKey();
    setBlocks([
      {
        key,
        startOffsetMin: 0,
        durationMin: 20,
        activity: '',
        location: null,
        coachOwnerId: null,
        visibility: DEFAULT_VISIBILITY,
        isMeasured: false,
      },
    ]);
    setSelectedBlockKey(key);
  };

  const startEdit = (p: BaseballPracticeWithDetail) => {
    setEditing(true);
    setEditPracticeId(p.id);
    setTitle(p.title);
    setFocus(p.focus ?? '');
    const mapped = p.blocks.map((b) => {
      // Deepened columns arrive on the row via the joined read; they are optional
      // until the 0200 migration lands, so probe tolerantly.
      const deep = b as typeof b & {
        description?: string | null;
        station_type?: string | null;
        group_label?: string | null;
        equipment?: string | null;
        measurement_target?: string | null;
        is_measured?: boolean;
        source_reason?: string | null;
        source_insight_id?: string | null;
        visibility?: BaseballBlockVisibility;
      };
      return {
        key: newKey(),
        startOffsetMin: b.start_offset_min,
        durationMin: b.duration_min,
        activity: b.activity,
        location: b.location,
        coachOwnerId: b.coach_owner_id,
        description: deep.description ?? null,
        stationType: deep.station_type ?? null,
        groupLabel: deep.group_label ?? null,
        equipment: deep.equipment ?? null,
        measurementTarget: deep.measurement_target ?? null,
        isMeasured: deep.is_measured ?? false,
        sourceReason: deep.source_reason ?? null,
        sourceInsightId: deep.source_insight_id ?? null,
        visibility: deep.visibility ?? DEFAULT_VISIBILITY,
      };
    });
    setBlocks(mapped);
    setSelectedBlockKey(mapped[0]?.key ?? null);
    void loadObjectives(p.id);
    void loadClassConflicts(p.id);
  };

  const addBlock = () => {
    const last = blocks[blocks.length - 1];
    const nextStart = last ? last.startOffsetMin + last.durationMin : 0;
    const key = newKey();
    setBlocks((b) => [
      ...b,
      {
        key,
        startOffsetMin: nextStart,
        durationMin: 20,
        activity: '',
        location: null,
        coachOwnerId: null,
        visibility: DEFAULT_VISIBILITY,
        isMeasured: false,
      },
    ]);
    setSelectedBlockKey(key);
  };

  const updateBlock = (key: string, patch: Partial<DraftBlock>) => {
    setBlocks((b) => b.map((blk) => (blk.key === key ? { ...blk, ...patch } : blk)));
  };

  const removeBlock = (key: string) => {
    setBlocks((b) => b.filter((blk) => blk.key !== key));
    setSelectedBlockKey((cur) => (cur === key ? null : cur));
  };

  const totalMinutes = useMemo(
    () => blocks.reduce((sum, b) => Math.max(sum, b.startOffsetMin + b.durationMin), 0),
    [blocks],
  );

  const canSave = title.trim().length > 0 && blocks.every((b) => b.activity.trim().length > 0);
  const selectedBlock = blocks.find((b) => b.key === selectedBlockKey) ?? null;

  // Roster shaped for the scrimmage builder (handedness + position eligibility).
  const scrimmageRoster: ScrimmageRosterPlayer[] = useMemo(
    () =>
      roster.map((p) => ({
        id: p.id,
        name: p.name,
        bats: p.bats,
        throws: p.throws,
        primaryPosition: p.primaryPosition,
        availability: 'available' as const,
      })),
    [roster],
  );

  // Persist the current editor draft and return the practice id (so the convert
  // flow can append a signal-derived block to a real, saved practice).
  const persistDraft = useCallback(async (): Promise<string | null> => {
    const res = await savePractice({
      practiceId: editPracticeId ?? undefined,
      title: title.trim() || 'Untitled practice',
      focus: focus.trim() || null,
      blocks: blocks.map(({ key: _key, ...rest }) => rest),
    });
    if (res.success && res.data?.practiceId) {
      if (!editPracticeId) setEditPracticeId(res.data.practiceId);
      return res.data.practiceId;
    }
    setError(res.error ?? 'Could not save practice.');
    return null;
  }, [blocks, editPracticeId, focus, title]);

  // Ensure the practice exists before an objective (which FKs to the practice) is
  // written. Objectives are attached at the PRACTICE level (block_id = null) on
  // purpose: practice blocks are stage-then-swapped on every save (new ids), and
  // block_id FKs ON DELETE CASCADE — a practice-level link survives a block
  // re-save, so a captured objective is never silently cascade-deleted.
  const ensureObjectiveParent = useCallback(
    async (): Promise<{ practiceId: string; blockId: string | null } | null> => {
      const id = editPracticeId ?? (await persistDraft());
      if (!id) return null;
      return { practiceId: id, blockId: null };
    },
    [editPracticeId, persistDraft],
  );

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const id = await persistDraft();
      if (id) {
        resetEditor();
        await loadPractices();
      }
    } catch {
      setError('Could not save practice.');
    } finally {
      setSaving(false);
    }
  };

  // Convert an Intelligence Board signal into a draft block on THIS practice.
  // The draft is saved first (so the appended block has a parent), then the
  // editor reloads the practice's blocks. Never publishes.
  const handleConvertSignal = async (suggestion: SuggestedPracticeBlock) => {
    setConvertingId(suggestion.sourceInsightId);
    setError(null);
    try {
      // Make sure the draft exists with its current blocks before appending.
      const practiceId = editing ? await persistDraft() : editPracticeId;
      if (!practiceId) {
        setError('Open or save a practice first.');
        return;
      }
      const res = await convertSignalToBlock({ practiceId, suggestion });
      if (!res.success) {
        setError(res.error ?? 'Could not convert signal.');
        return;
      }
      // Reload the practice's blocks into the editor + refresh the board.
      const practicesRes = await getTeamPractices();
      const refreshed = practicesRes.success
        ? (practicesRes.data ?? []).find((p) => p.id === practiceId)
        : undefined;
      if (refreshed) startEdit(refreshed);
      await loadIntelligence();
    } catch {
      setError('Could not convert signal.');
    } finally {
      setConvertingId(null);
    }
  };

  const handlePublishToggle = async (
    p: BaseballPracticeWithDetail,
    publish: boolean,
    calendar?: { date: string; startTime: string | null; endTime: string | null } | null,
  ) => {
    setError(null);
    try {
      const res = await publishPractice({
        practiceId: p.id,
        publish,
        calendar: publish && calendar?.date ? calendar : null,
      });
      if (res.success) {
        await loadPractices();
      } else {
        setError(res.error ?? 'Could not update publish state.');
      }
    } catch {
      setError('Could not update publish state.');
    }
  };

  // ---- Render ---------------------------------------------------------------

  if (authLoading || loading) {
    return (
      <>
        <Header title="Practice Planner" subtitle="Plan timed practices, stations & attendance" />
        <div className="space-y-4 p-6 lg:p-8">
          {[0, 1, 2].map((i) => (
            <PracticeCardSkeleton key={i} delay={i * 70} />
          ))}
        </div>
      </>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <Header
        title="Practice Planner"
        subtitle={isCoach ? 'Plan timed practices, stations & attendance' : 'Your published practice schedule'}
      >
        {isCoach && selectedTeamId && !editing && (
          <Button onClick={startNew} leftIcon={<Plus className="h-4 w-4" />}>
            New Practice
          </Button>
        )}
      </Header>

      <div className="p-6 lg:p-8 space-y-6">
        {error && (
          <m.div
            initial={prefersReduced ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            role="alert"
          >
            <Card className="border-error/30 bg-error/5">
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <p className="flex items-start gap-2 text-sm text-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                  className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-error/70 transition-colors hover:bg-error/10 hover:text-error"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          </m.div>
        )}

        {/* ---------- Editor (coach only) ---------- */}
        {isCoach && editing && (
          <m.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Card>
              <CardContent className="space-y-5 py-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Practice title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Tuesday — Defense & Baserunning"
                    className="rounded-xl border border-warm-200 bg-cream-50 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  <Input
                    label="Focus (optional)"
                    type="text"
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                    placeholder="Cutoffs, first-step reads"
                    className="rounded-xl border border-warm-200 bg-cream-50 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>

                {/* Time rail + block detail editor (left) and Intelligence Board (right) */}
                <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                  {/* LEFT: 5-min time rail + selected-block detail editor */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-warm-800">
                        Time rail{' '}
                        <span className="font-normal text-warm-500">({totalMinutes} min total)</span>
                      </h3>
                      <Button variant="ghost" onClick={addBlock} leftIcon={<Plus className="h-4 w-4" />}>
                        Add block
                      </Button>
                    </div>

                    <TimeRailBuilder
                      blocks={blocks as RailBlock[]}
                      selectedKey={selectedBlockKey}
                      onSelect={setSelectedBlockKey}
                      onValidation={setValidation}
                      onChange={(key, patch) => updateBlock(key, patch as Partial<DraftBlock>)}
                    />

                    {/* Selected block detail editor */}
                    {selectedBlock && (
                      <div className="rounded-2xl border border-warm-200 bg-cream-50/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-warm-600">
                            <ClipboardList className="h-3.5 w-3.5 text-primary-600" />
                            Block details
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeBlock(selectedBlock.key)}
                            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                            className="text-error"
                          >
                            Remove
                          </Button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-12">
                          <div className="sm:col-span-7">
                            <Input
                              label="Headline"
                              type="text"
                              value={selectedBlock.activity}
                              onChange={(e) => updateBlock(selectedBlock.key, { activity: e.target.value })}
                              placeholder="Two-strike chase station"
                              className="rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-5">
                            <Input
                              label="Station type"
                              type="text"
                              value={selectedBlock.stationType ?? ''}
                              onChange={(e) =>
                                updateBlock(selectedBlock.key, { stationType: e.target.value || null })
                              }
                              placeholder="hitting / defense / bullpen"
                              className="rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-12">
                            <Textarea
                              label="Description (optional)"
                              value={selectedBlock.description ?? ''}
                              onChange={(e) =>
                                updateBlock(selectedBlock.key, { description: e.target.value || null })
                              }
                              rows={2}
                              placeholder="Group A sees breaking balls below the zone; record swing/take decisions."
                              className="w-full resize-none rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-4">
                            <Input
                              label="Location"
                              type="text"
                              value={selectedBlock.location ?? ''}
                              onChange={(e) =>
                                updateBlock(selectedBlock.key, { location: e.target.value || null })
                              }
                              placeholder="Field 2 / Cage 1"
                              className="rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-4">
                            <Input
                              label="Group"
                              type="text"
                              value={selectedBlock.groupLabel ?? ''}
                              onChange={(e) =>
                                updateBlock(selectedBlock.key, { groupLabel: e.target.value || null })
                              }
                              placeholder="Hitters 1–6"
                              className="rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-4">
                            <NativeSelect
                              label="Staff owner"
                              value={selectedBlock.coachOwnerId ?? ''}
                              onChange={(e) =>
                                updateBlock(selectedBlock.key, { coachOwnerId: e.target.value || null })
                              }
                              className="rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
                              aria-label="Assigned staff"
                            >
                              <option value="">Staff…</option>
                              {staff.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </NativeSelect>
                          </div>
                          <div className="sm:col-span-4">
                            <Input
                              label="Equipment"
                              type="text"
                              value={selectedBlock.equipment ?? ''}
                              onChange={(e) =>
                                updateBlock(selectedBlock.key, { equipment: e.target.value || null })
                              }
                              placeholder="Machine, screens"
                              className="rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-4">
                            <NativeSelect
                              label="Visibility"
                              value={selectedBlock.visibility ?? DEFAULT_VISIBILITY}
                              onChange={(e) =>
                                updateBlock(selectedBlock.key, {
                                  visibility: e.target.value as BaseballBlockVisibility,
                                })
                              }
                              className="rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
                              aria-label="Block visibility"
                            >
                              <option value="player_visible">Players can see</option>
                              <option value="staff_only">Staff only</option>
                              <option value="restricted">Restricted</option>
                            </NativeSelect>
                          </div>
                          <div className="flex items-end sm:col-span-4">
                            <Checkbox
                              checked={selectedBlock.isMeasured ?? false}
                              onChange={(e) =>
                                updateBlock(selectedBlock.key, { isMeasured: e.target.checked })
                              }
                              label="Measured station"
                            />
                          </div>
                          {selectedBlock.isMeasured && (
                            <div className="sm:col-span-8">
                              <Input
                                label="Measurement target"
                                type="text"
                                value={selectedBlock.measurementTarget ?? ''}
                                onChange={(e) =>
                                  updateBlock(selectedBlock.key, {
                                    measurementTarget: e.target.value || null,
                                  })
                                }
                                placeholder="Track swing/take decisions"
                                className="rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
                              />
                            </div>
                          )}
                          {selectedBlock.sourceReason && (
                            <p className="sm:col-span-12 text-eyebrow text-primary-600">
                              {selectedBlock.sourceReason}
                            </p>
                          )}

                          {/* Measurable objectives — the effectiveness engine's
                              SOURCE layer (focus + target metric + players + reps).
                              Without this capture the engine has no input set. */}
                          <div className="sm:col-span-12">
                            <BlockObjectiveEditor
                              practiceId={editPracticeId}
                              blockId={null}
                              blockKey={selectedBlock.key}
                              roster={roster.map((p) => ({ id: p.id, name: p.name }))}
                              objectives={objectives}
                              onChanged={() => loadObjectives(editPracticeId)}
                              ensurePersisted={ensureObjectiveParent}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* RIGHT: Practice Intelligence Board (signals -> blocks) */}
                  <div className="rounded-2xl border border-warm-200 glass-standard p-4">
                    <PracticeIntelligenceBoard
                      signals={signals}
                      suggestions={suggestions}
                      canConvert={true}
                      onConvert={handleConvertSignal}
                      convertingId={convertingId}
                      loading={intelLoading}
                    />
                  </div>
                </div>

                {/* Controlled scrimmage builder (V7) — attaches to this practice. */}
                <ScrimmagePanel practiceId={editPracticeId} roster={scrimmageRoster} />

                <div className="flex items-center gap-3 pt-2">
                  <Button onClick={handleSave} isLoading={saving} disabled={!canSave}>
                    {editPracticeId ? 'Save changes' : 'Save draft'}
                  </Button>
                  <Button variant="ghost" onClick={resetEditor} disabled={saving}>
                    Cancel
                  </Button>
                  {!canSave && (
                    <span className="text-xs text-warm-500">
                      Add a title and an activity for every block to save.
                    </span>
                  )}
                  {canSave && validation && !validation.ok && (
                    <span className="text-xs text-amber-600">
                      {validation.errors.length} issue
                      {validation.errors.length === 1 ? '' : 's'} must be fixed before this practice can
                      be published.
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </m.div>
        )}

        {/* Calendar attach controls are now per-practice-card (inline in publish action). */}

        {/* ---------- Practice list ---------- */}
        {practices.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title={isCoach ? 'No practices yet' : 'No published practices'}
            description={
              isCoach
                ? 'Build your first practice with timed blocks, stations and staff assignments.'
                : 'When your coaches publish a practice plan, it will appear here.'
            }
            action={
              isCoach && selectedTeamId
                ? { label: 'New Practice', onClick: startNew }
                : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {practices.map((p, idx) => (
              <m.div
                key={p.id}
                initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  prefersReduced ? undefined : { duration: 0.25, delay: Math.min(idx * 0.04, 0.2) }
                }
              >
                <PracticeCard
                  practice={p}
                  isCoach={isCoach}
                  roster={roster}
                  ownPlayerId={ownPlayerId}
                  onEdit={() => startEdit(p)}
                  onPublishToggle={(publish, cal) => handlePublishToggle(p, publish, cal)}
                  onAttendanceSaved={loadPractices}
                  onError={setError}
                  // Conflicts loaded only for the practice currently open in the
                  // editor. For all other cards the map is empty (no fake flags).
                  classConflicts={
                    editPracticeId === p.id ? classConflicts : { byPlayer: {} }
                  }
                />
              </m.div>
            ))}
          </div>
        )}
      </div>
    </LazyMotion>
  );
}

// =============================================================================
// PracticeCard — one practice, with blocks + (coach) attendance.
// =============================================================================

/** Attendance status -> display label + color for the player self-status pill. */
const ATTENDANCE_STATUS_DISPLAY: Record<
  BaseballPracticeAttendanceStatus,
  { label: string; className: string }
> = {
  present: { label: 'Present', className: 'bg-primary-100 text-primary-700' },
  limited: { label: 'Limited', className: 'bg-amber-100 text-amber-700' },
  absent: { label: 'Absent', className: 'bg-red-100 text-red-700' },
  excused: { label: 'Excused', className: 'bg-warm-100 text-warm-600' },
};

function PracticeCard({
  practice,
  isCoach,
  roster,
  ownPlayerId,
  onEdit,
  onPublishToggle,
  onAttendanceSaved,
  onError,
  classConflicts,
}: {
  practice: BaseballPracticeWithDetail;
  isCoach: boolean;
  roster: RosterPlayer[];
  /** The logged-in player's baseball_players.id (null for coaches). */
  ownPlayerId: string | null;
  onEdit: () => void;
  onPublishToggle: (
    publish: boolean,
    calendar?: { date: string; startTime: string | null; endTime: string | null } | null,
  ) => void;
  onAttendanceSaved: () => void | Promise<void>;
  onError: (msg: string | null) => void;
  /** Class-conflict summary for this practice (empty map = no data / no conflicts). */
  classConflicts: ClassConflictSummary;
}) {
  const published = practice.status === 'published';
  const isBacklog = practice.is_backlog === true;
  const [takingAttendance, setTakingAttendance] = useState(false);
  const [savingAtt, setSavingAtt] = useState(false);

  // Per-card calendar attach (shown when coach is about to publish).
  const [showCalendarAttach, setShowCalendarAttach] = useState(false);
  const [calDate, setCalDate] = useState('');
  const [calStart, setCalStart] = useState('');
  const [calEnd, setCalEnd] = useState('');

  // Player's own attendance status for this practice (null = not yet marked).
  const ownAttendanceStatus = useMemo<BaseballPracticeAttendanceStatus | null>(() => {
    if (!ownPlayerId) return null;
    return practice.attendance.find((a) => a.player_id === ownPlayerId)?.status ?? null;
  }, [ownPlayerId, practice.attendance]);

  const initialAttendance = useMemo(() => {
    const map: Record<string, BaseballPracticeAttendanceStatus> = {};
    for (const a of practice.attendance) map[a.player_id] = a.status;
    return map;
  }, [practice.attendance]);

  const [attendance, setAttendance] =
    useState<Record<string, BaseballPracticeAttendanceStatus>>(initialAttendance);

  const handleSaveAttendance = async () => {
    setSavingAtt(true);
    onError(null);
    try {
      const entries: AttendanceEntryInput[] = Object.entries(attendance).map(([playerId, status]) => ({
        playerId,
        status,
      }));
      const res = await recordPracticeAttendance({ practiceId: practice.id, entries });
      if (res.success) {
        setTakingAttendance(false);
        await onAttendanceSaved();
      } else {
        onError(res.error ?? 'Could not save attendance.');
      }
    } catch {
      onError('Could not save attendance.');
    } finally {
      setSavingAtt(false);
    }
  };

  return (
    <Card
      className={
        isBacklog
          ? 'border-primary-200 bg-primary-50/30 transition-shadow hover:shadow-card-hover'
          : 'transition-shadow hover:shadow-card-hover'
      }
    >
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-warm-900">{practice.title}</h3>
              {isBacklog ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                  <Inbox className="h-3 w-3" />
                  Signal backlog
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    published
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-warm-100 text-warm-600'
                  }`}
                >
                  {published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {published ? 'Published' : 'Draft'}
                </span>
              )}
              {/* Player self-attendance pill (players only). */}
              {!isCoach && ownAttendanceStatus && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    ATTENDANCE_STATUS_DISPLAY[ownAttendanceStatus].className
                  }`}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  You: {ATTENDANCE_STATUS_DISPLAY[ownAttendanceStatus].label}
                </span>
              )}
              {/* Class-conflict badge (coach only, shown when conflict data is loaded). */}
              {isCoach && Object.keys(classConflicts.byPlayer).length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  {Object.keys(classConflicts.byPlayer).length} player
                  {Object.keys(classConflicts.byPlayer).length !== 1 ? 's' : ''} with class conflicts
                </span>
              )}
            </div>
            {practice.focus && <p className="mt-1 text-sm text-warm-500">{practice.focus}</p>}
            {isBacklog && (
              <p className="mt-1 text-xs text-primary-600">
                Blocks converted from CoachHelm signals. Drag these into a scheduled practice.
              </p>
            )}
          </div>

          {isCoach && (
            <div className="flex items-center gap-2">
              {!published && (
                <Button variant="ghost" onClick={onEdit}>
                  Edit
                </Button>
              )}
              {!isBacklog && !published && !showCalendarAttach && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCalendarAttach(true)}
                  leftIcon={<CalendarPlus className="h-4 w-4" />}
                >
                  Add to calendar
                </Button>
              )}
              {/* Export + share affordance — visible on published plans only */}
              {published && !isBacklog && (
                <PracticePrintExport practice={practice} />
              )}
              {!isBacklog && (
                <Button
                  variant={published ? 'outline' : 'primary'}
                  onClick={() =>
                    onPublishToggle(
                      !published,
                      !published && showCalendarAttach && calDate
                        ? { date: calDate, startTime: calStart || null, endTime: calEnd || null }
                        : null,
                    )
                  }
                  leftIcon={published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                >
                  {published ? 'Unpublish' : 'Publish'}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Calendar attach (inline, coach only, draft only) */}
        {isCoach && !published && !isBacklog && showCalendarAttach && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-2.5">
            <CalendarPlus className="h-4 w-4 shrink-0 text-primary-600" />
            <span className="text-xs font-medium text-warm-700">Add to calendar when publishing:</span>
            <Input
              type="date"
              value={calDate}
              onChange={(e) => setCalDate(e.target.value)}
              className="rounded-lg border border-warm-200 px-2 py-1 text-sm focus:border-primary-400 focus:outline-none"
              aria-label="Practice date"
            />
            <Input
              type="time"
              value={calStart}
              onChange={(e) => setCalStart(e.target.value)}
              aria-label="Start time"
              className="rounded-lg border border-warm-200 px-2 py-1 text-sm focus:border-primary-400 focus:outline-none"
            />
            <Input
              type="time"
              value={calEnd}
              onChange={(e) => setCalEnd(e.target.value)}
              aria-label="End time"
              className="rounded-lg border border-warm-200 px-2 py-1 text-sm focus:border-primary-400 focus:outline-none"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setShowCalendarAttach(false); setCalDate(''); setCalStart(''); setCalEnd(''); }}
              className="text-xs text-warm-400 hover:text-warm-600"
            >
              Remove
            </Button>
          </div>
        )}

        {/* Blocks timeline */}
        <ol className="space-y-2">
          {practice.blocks.length === 0 ? (
            <li className="text-sm text-warm-500">No blocks in this practice yet.</li>
          ) : (
            practice.blocks.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-warm-100 bg-cream-50/60 px-3 py-2 text-sm transition-colors hover:border-warm-200 hover:bg-cream-50"
              >
                <span className="inline-flex items-center gap-1.5 font-medium text-warm-800">
                  <Clock className="h-3.5 w-3.5 text-primary-600" />
                  {fmtOffset(b.start_offset_min, b.duration_min)}
                </span>
                <span className="font-medium text-warm-900">{b.activity}</span>
                {b.location && (
                  <span className="inline-flex items-center gap-1 text-warm-500">
                    <MapPin className="h-3.5 w-3.5" />
                    {b.location}
                  </span>
                )}
                {b.coach_owner_name && (
                  <span className="inline-flex items-center gap-1 text-warm-500">
                    <UserCircle2 className="h-3.5 w-3.5" />
                    {b.coach_owner_name}
                  </span>
                )}
              </li>
            ))
          )}
        </ol>

        {/* Attendance (coach only) */}
        {isCoach && (
          <div className="border-t border-warm-100 pt-4">
            {!takingAttendance ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setTakingAttendance(true)}
                  leftIcon={<CheckCircle2 className="h-4 w-4" />}
                >
                  Take attendance
                </Button>
                {practice.attendance.length > 0 && (
                  <span className="text-xs text-warm-500">
                    {practice.attendance.length} marked
                  </span>
                )}
              </div>
            ) : roster.length === 0 ? (
              <p className="text-sm text-warm-500">No players on the roster yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {roster.map((pl) => (
                    <div
                      key={pl.id}
                      className="flex items-center justify-between rounded-lg border border-warm-100 bg-cream-50/60 px-3 py-2"
                    >
                      <span className="text-sm text-warm-800">{pl.name}</span>
                      <NativeSelect
                        value={attendance[pl.id] ?? ''}
                        onChange={(e) =>
                          setAttendance((a) => ({
                            ...a,
                            [pl.id]: e.target.value as BaseballPracticeAttendanceStatus,
                          }))
                        }
                        className="rounded-lg border border-warm-200 px-2 py-1 text-sm focus:border-primary-400 focus:outline-none"
                        aria-label={`Attendance for ${pl.name}`}
                      >
                        <option value="" disabled>
                          Mark…
                        </option>
                        {ATTENDANCE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSaveAttendance}
                    isLoading={savingAtt}
                    disabled={Object.keys(attendance).length === 0}
                  >
                    Save attendance
                  </Button>
                  <Button variant="ghost" onClick={() => setTakingAttendance(false)} disabled={savingAtt}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Practice recap + effectiveness measurement (coach, published only) —
            the v10 human-entered completion flow that feeds the engine. */}
        {isCoach && published && (
          <PracticeRecapPanel
            practiceId={practice.id}
            roster={roster.map((p) => ({ id: p.id, name: p.name }))}
            onSaved={onAttendanceSaved}
          />
        )}

        {/* Player parity: published scrimmage lineup summary (player view). */}
        {!isCoach && published && (
          <PublishedScrimmageViewer practiceId={practice.id} />
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// PublishedScrimmageViewer — player-facing read of the published scrimmage
// lineup for this practice. Lazy-loaded on mount (no extra prop drilling).
// Shows ONLY published/completed scrimmages (draft scrimmages are staff-only).
// =============================================================================

function PublishedScrimmageViewer({ practiceId }: { practiceId: string }) {
  const [scrimmages, setScrimmages] = useState<BaseballScrimmageWithDetail[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { getTeamScrimmages: fetchScrimmages } = await import(
        '@/app/baseball/actions/practice-scrimmage'
      );
      const res = await fetchScrimmages();
      if (res.success) {
        setScrimmages(
          (res.data ?? []).filter(
            (s) => s.practice_id === practiceId && s.status !== 'draft',
          ),
        );
      }
      setLoaded(true);
    };
    void load();
  }, [practiceId]);

  if (!loaded || scrimmages.length === 0) return null;

  return (
    <div className="border-t border-warm-100 pt-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warm-500">
        <Ruler className="h-3.5 w-3.5 text-primary-600" />
        {scrimmages.length === 1 ? 'Scrimmage' : `Scrimmages (${scrimmages.length})`}
      </div>
      <ul className="space-y-2">
        {scrimmages.map((s) => {
          const isExpanded = expanded === s.id;
          const completed = s.status === 'completed';
          return (
            <li
              key={s.id}
              className="rounded-xl border border-warm-100 bg-cream-50/60 p-3"
            >
              <Button
                type="button"
                variant="ghost"
                className="flex w-full items-center justify-between gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                aria-expanded={isExpanded}
                onClick={() => setExpanded(isExpanded ? null : s.id)}
              >
                <div>
                  <span className="text-sm font-semibold text-warm-900">{s.title}</span>
                  <span className="ml-2 text-xs text-warm-400">
                    {s.mode.replace(/_/g, ' ')} · {s.slots.length} players
                    {completed && s.blue_score != null && (
                      <span className="ml-1 font-medium text-warm-700">
                        — Blue {s.blue_score} · White {s.white_score ?? '–'}
                        {s.innings_played != null ? ` (${s.innings_played} inn)` : ''}
                      </span>
                    )}
                  </span>
                </div>
                <span className="text-xs text-warm-400" aria-hidden>
                  {isExpanded ? '▲' : '▼'}
                </span>
              </Button>

              {isExpanded && s.slots.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {s.slots
                      .filter((sl) => sl.defensive_position && sl.defensive_position !== 'bench' && sl.defensive_position !== 'bullpen')
                      .sort((a, b) => (a.batting_order ?? 99) - (b.batting_order ?? 99))
                      .map((sl) => (
                        <div
                          key={sl.id}
                          className="flex items-center gap-1.5 rounded-lg border border-warm-100 glass-standard px-2 py-1"
                        >
                          <span className="text-micro font-bold text-warm-400">
                            {sl.defensive_position}
                          </span>
                          {sl.batting_order != null && (
                            <span className="text-micro tabular-nums text-warm-400">
                              #{sl.batting_order}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-warm-800">
                            {sl.player_name}
                          </span>
                          {sl.side && (
                            <span className={`text-microbadge font-semibold uppercase ${sl.side === 'blue' ? 'text-primary-600' : 'text-warm-500'}`}>
                              {sl.side}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                  {s.result_note && (
                    <p className="mt-1 text-xs italic text-warm-500">{s.result_note}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
