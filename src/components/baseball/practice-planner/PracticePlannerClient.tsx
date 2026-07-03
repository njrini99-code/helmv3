'use client';

// =============================================================================
// src/components/baseball/practice-planner/PracticePlannerClient.tsx
//
// Wave 8 / packet: practice-planner
// MIGRATED to "The Living Annual" kit (design-system-living-annual.md §6 —
// practice · Class B · L): a `SectionMasthead` replaces the old chrome
// `Header`, the editor + every practice record renders as a `PaperCard` (the
// block detail editor nests a second PaperCard inside it — double-bezel), the
// publish/backlog/attendance pills are `InkBadge` ink stamps (never a colored
// pill), and every list settles in via the shared `Reveal` interaction layer.
//
// This is a PRESENTATION migration only. Every data flow is preserved
// verbatim:
//   - Coaches (can_manage_practice) build practices from timed activity blocks
//     (stations) with per-block location + staff owner, save as DRAFT, then
//     PUBLISH (which optionally attaches a team-calendar event) + take
//     attendance.
//   - Players see only PUBLISHED practices as a read-only schedule (writes are
//     gated server-side; this UI hides the editor for non-staff).
//
// HONEST STATES (spec §7, "no yellow warning boxes"): the practice list empty
// state renders through `EmptyIssue`, publish-validation issues render as a
// quiet `InkBadge` + `HairlineRule` (never amber text), and the dismissible
// load-error banner is a quiet editorial line (never a red/yellow box).
//
// The seven practice-planner sub-components (TimeRailBuilder,
// PracticeIntelligenceBoard, ScrimmagePanel, BlockObjectiveEditor,
// PracticeRecapPanel, PracticePrintExport, ScrimmageLineupBuilder) are OUT OF
// SCOPE for this pass (a separate W16 task) — they keep their existing
// cream/green chrome and are mounted as-is, nested inside the new PaperCard
// surfaces (their own bordered boxes read as the inner half of the
// double-bezel).
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
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

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
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
import {
  SectionMasthead,
  Eyebrow,
  HairlineRule,
  InkBadge,
  PaperCard,
  EmptyIssue,
  Reveal,
  StatReadout,
} from '@/components/baseball/living-annual';
import type { InkBadgeProps } from '@/components/baseball/living-annual';
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

// Shared field chrome for the form primitives (Input/Textarea/NativeSelect) —
// reskins the container only; the form components themselves are unchanged.
const FIELD_CLASS =
  'rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm text-text-primary focus:border-grade-plus focus:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus/40';
const FIELD_CLASS_SM =
  'rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] px-2 py-1.5 text-sm text-text-primary focus:border-grade-plus focus:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus/40';

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
 * Practice-card-shaped skeleton — mirrors the real PaperCard practice record
 * (title + status stamp, focus line, two block rows) so the loading state has
 * no layout shift when real content arrives. Shimmer, not a spinner.
 */
function PracticeCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <PaperCard className="p-5 sm:p-6" grain={false}>
      <div
        className="absolute inset-0 skeleton-shimmer pointer-events-none"
        style={{ animationDelay: `${delay}ms` }}
      />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="h-5 w-48 rounded bg-[color:var(--hairline)]/50 skeleton-shimmer" />
            <div className="h-3 w-32 rounded bg-[color:var(--hairline)]/30 skeleton-shimmer" />
          </div>
          <div className="h-7 w-20 rounded-fw-md bg-[color:var(--hairline)]/30 skeleton-shimmer" />
        </div>
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-9 w-full rounded-fw-md bg-[color:var(--hairline)]/20 skeleton-shimmer" />
          ))}
        </div>
      </div>
    </PaperCard>
  );
}

export function PracticePlannerClient() {
  const { user, player: ownPlayerProfile, loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();

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
      .select('coach:baseball_coaches(id, full_name)')
      .eq('team_id', selectedTeamId);

    const staffList: StaffCoach[] = (coaches ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => {
        const co = Array.isArray(c.coach) ? c.coach[0] : c.coach;
        if (!co) return null;
        const name = (co.full_name as string | null)?.trim() || 'Coach';
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
      <div className="mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6 lg:px-8">
        <SectionMasthead
          eyebrow={isCoach ? 'BUILD & PUBLISH' : 'YOUR SCHEDULE'}
          title="Practice Planner"
        />
        <div className="mt-8 space-y-4">
          {[0, 1, 2].map((i) => (
            <PracticeCardSkeleton key={i} delay={i * 70} />
          ))}
        </div>
      </div>
    );
  }

  const mastheadActions =
    isCoach && selectedTeamId && !editing ? (
      <Button onClick={startNew} leftIcon={<Plus className="h-4 w-4" />}>
        New Practice
      </Button>
    ) : undefined;

  return (
    <div className="mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6 lg:px-8">
      <SectionMasthead
        eyebrow={isCoach ? 'BUILD & PUBLISH' : 'YOUR SCHEDULE'}
        title="Practice Planner"
        actions={mastheadActions}
      />

      <div className="mt-8 space-y-6">
        {/* Quiet editorial error line — never a red/yellow box (spec §7). */}
        {error && (
          <Reveal>
            <div role="alert" className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <HairlineRule ink="hairline" className="mb-2 w-10" />
                <p className="flex items-start gap-2 font-annual text-body-sm text-text-secondary">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
                  <span>{error}</span>
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                className="-mr-1 -mt-0.5 shrink-0 rounded-fw-sm p-1 text-text-tertiary hover:text-text-secondary"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Reveal>
        )}

        {/* ---------- Editor (coach only) ---------- */}
        {isCoach && editing && (
          <Reveal>
            <PaperCard className="space-y-5 p-5 sm:p-6" registrationTick>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Practice title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Tuesday — Defense & Baserunning"
                  className={FIELD_CLASS}
                />
                <Input
                  label="Focus (optional)"
                  type="text"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="Cutoffs, first-step reads"
                  className={FIELD_CLASS}
                />
              </div>

              {/* Time rail + block detail editor (left) and Intelligence Board (right) */}
              <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                {/* LEFT: 5-min time rail + selected-block detail editor */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Eyebrow ink="team" className="inline-flex items-baseline gap-1.5">
                      Time rail
                      <span className="normal-case tracking-normal font-normal text-text-tertiary">
                        (<StatReadout value={totalMinutes} className="text-text-tertiary" ariaLabel="minutes total" /> min total)
                      </span>
                    </Eyebrow>
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

                  {/* Selected block detail editor — nested PaperCard (double-bezel). */}
                  {selectedBlock && (
                    <PaperCard className="p-4" grain={false}>
                      <div className="mb-3 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-eyebrow font-semibold uppercase tracking-[0.14em] text-grade-plus">
                          <ClipboardList className="h-3.5 w-3.5" />
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
                            className={FIELD_CLASS_SM}
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
                            className={FIELD_CLASS_SM}
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
                            className={cn(FIELD_CLASS_SM, 'w-full resize-none')}
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
                            className={FIELD_CLASS_SM}
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
                            className={FIELD_CLASS_SM}
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <NativeSelect
                            label="Staff owner"
                            value={selectedBlock.coachOwnerId ?? ''}
                            onChange={(e) =>
                              updateBlock(selectedBlock.key, { coachOwnerId: e.target.value || null })
                            }
                            className={FIELD_CLASS_SM}
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
                            className={FIELD_CLASS_SM}
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
                            className={FIELD_CLASS_SM}
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
                              className={FIELD_CLASS_SM}
                            />
                          </div>
                        )}
                        {selectedBlock.sourceReason && (
                          <p className="sm:col-span-12 font-annual text-eyebrow font-semibold uppercase tracking-[0.14em] text-grade-plus">
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
                    </PaperCard>
                  )}
                </div>

                {/* RIGHT: Practice Intelligence Board (signals -> blocks) — nested
                    PaperCard (double-bezel). */}
                <PaperCard className="p-4" grain={false}>
                  <PracticeIntelligenceBoard
                    signals={signals}
                    suggestions={suggestions}
                    canConvert={true}
                    onConvert={handleConvertSignal}
                    convertingId={convertingId}
                    loading={intelLoading}
                  />
                </PaperCard>
              </div>

              {/* Controlled scrimmage builder (V7) — attaches to this practice. */}
              <ScrimmagePanel practiceId={editPracticeId} roster={scrimmageRoster} />

              <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--hairline)] pt-4">
                <Button onClick={handleSave} isLoading={saving} disabled={!canSave}>
                  {editPracticeId ? 'Save changes' : 'Save draft'}
                </Button>
                <Button variant="ghost" onClick={resetEditor} disabled={saving}>
                  Cancel
                </Button>
                {!canSave && (
                  <span className="font-annual text-caption text-text-tertiary">
                    Add a title and an activity for every block to save.
                  </span>
                )}
                {canSave && validation && !validation.ok && (
                  <div className="flex items-center gap-2">
                    <HairlineRule ink="hairline" className="w-6" />
                    <InkBadge
                      label={`${validation.errors.length} ISSUE${validation.errors.length === 1 ? '' : 'S'}`}
                      tone="neutral"
                      variant="solid"
                    />
                    <span className="font-annual text-caption text-text-tertiary">
                      must be fixed before this practice can be published.
                    </span>
                  </div>
                )}
              </div>
            </PaperCard>
          </Reveal>
        )}

        {/* Calendar attach controls are now per-practice-card (inline in publish action). */}

        {/* ---------- Practice list ---------- */}
        {practices.length === 0 ? (
          <EmptyIssue
            variant="generic"
            ink="team"
            action={
              isCoach && selectedTeamId ? (
                <Button onClick={startNew} leftIcon={<Plus className="h-4 w-4" />}>
                  New Practice
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <Eyebrow ink="team">{isCoach ? 'Practices' : 'Your schedule'}</Eyebrow>
              <span className="font-annual text-caption text-text-tertiary">
                <StatReadout value={practices.length} className="text-text-tertiary" ariaLabel="practice plans" />{' '}
                {practices.length === 1 ? 'plan' : 'plans'}
              </span>
            </div>
            <div className="space-y-4">
              {practices.map((p, idx) => (
                <Reveal key={p.id} staggerIndex={Math.min(idx, 10)}>
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
                </Reveal>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PracticeCard — one practice record, with blocks + (coach) attendance.
// =============================================================================

/** Attendance status -> display label + ink tone for the player self-status stamp. */
const ATTENDANCE_STATUS_DISPLAY: Record<
  BaseballPracticeAttendanceStatus,
  { label: string; tone: NonNullable<InkBadgeProps['tone']> }
> = {
  present: { label: 'Present', tone: 'team' },
  limited: { label: 'Limited', tone: 'neutral' },
  absent: { label: 'Absent', tone: 'neutral' },
  excused: { label: 'Excused', tone: 'neutral' },
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

  const conflictCount = Object.keys(classConflicts.byPlayer).length;

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
    <PaperCard className="space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-annual text-h3 text-text-primary">{practice.title}</h3>
            {isBacklog ? (
              <span className="inline-flex items-center gap-1">
                <Inbox className="h-3 w-3 text-grade-plus" />
                <InkBadge label="Signal backlog" tone="team" variant="solid" />
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                {published ? (
                  <Eye className="h-3 w-3 text-grade-plus" />
                ) : (
                  <EyeOff className="h-3 w-3 text-text-tertiary" />
                )}
                <InkBadge
                  label={published ? 'Published' : 'Draft'}
                  tone={published ? 'team' : 'neutral'}
                />
              </span>
            )}
            {/* Player self-attendance stamp (players only). */}
            {!isCoach && ownAttendanceStatus && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-text-tertiary" />
                <InkBadge
                  label={`You: ${ATTENDANCE_STATUS_DISPLAY[ownAttendanceStatus].label}`}
                  tone={ATTENDANCE_STATUS_DISPLAY[ownAttendanceStatus].tone}
                />
              </span>
            )}
            {/* Class-conflict stamp (coach only, shown when conflict data is loaded). */}
            {isCoach && conflictCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-text-tertiary" />
                <InkBadge
                  label={`${conflictCount} PLAYER${conflictCount !== 1 ? 'S' : ''} · CLASS CONFLICT`}
                  tone="neutral"
                  variant="solid"
                />
              </span>
            )}
          </div>
          {practice.focus && (
            <p className="mt-1 font-annual text-body-sm text-text-secondary">{practice.focus}</p>
          )}
          {isBacklog && (
            <p className="mt-1 font-annual text-body-sm text-grade-plus">
              Blocks converted from CoachHelm signals. Drag these into a scheduled practice.
            </p>
          )}
        </div>

        {isCoach && (
          <div className="flex flex-wrap items-center gap-2">
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
            {published && !isBacklog && <PracticePrintExport practice={practice} />}
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
        <div className="flex flex-wrap items-center gap-2 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] px-3 py-2.5">
          <CalendarPlus className="h-4 w-4 shrink-0 text-grade-plus" />
          <span className="font-annual text-caption font-medium text-text-secondary">
            Add to calendar when publishing:
          </span>
          <Input
            type="date"
            value={calDate}
            onChange={(e) => setCalDate(e.target.value)}
            className={FIELD_CLASS_SM}
            aria-label="Practice date"
          />
          <Input
            type="time"
            value={calStart}
            onChange={(e) => setCalStart(e.target.value)}
            aria-label="Start time"
            className={FIELD_CLASS_SM}
          />
          <Input
            type="time"
            value={calEnd}
            onChange={(e) => setCalEnd(e.target.value)}
            aria-label="End time"
            className={FIELD_CLASS_SM}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => { setShowCalendarAttach(false); setCalDate(''); setCalStart(''); setCalEnd(''); }}
            className="font-annual text-caption text-text-tertiary hover:text-text-secondary"
          >
            Remove
          </Button>
        </div>
      )}

      {/* Blocks timeline */}
      <ol className="divide-y divide-[color:var(--hairline)]">
        {practice.blocks.length === 0 ? (
          <li className="py-2 font-annual text-body-sm text-text-tertiary">No blocks in this practice yet.</li>
        ) : (
          practice.blocks.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 font-annual text-body-sm"
            >
              <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                <Clock className="h-3.5 w-3.5 text-grade-plus" />
                {fmtOffset(b.start_offset_min, b.duration_min)}
              </span>
              <span className="font-medium text-text-primary">{b.activity}</span>
              {b.location && (
                <span className="inline-flex items-center gap-1 text-text-tertiary">
                  <MapPin className="h-3.5 w-3.5" />
                  {b.location}
                </span>
              )}
              {b.coach_owner_name && (
                <span className="inline-flex items-center gap-1 text-text-tertiary">
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
        <div className="border-t border-[color:var(--hairline)] pt-4">
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
                <span className="font-annual text-caption text-text-tertiary">
                  <StatReadout value={practice.attendance.length} className="text-text-tertiary" ariaLabel="players marked" /> marked
                </span>
              )}
            </div>
          ) : roster.length === 0 ? (
            <p className="font-annual text-body-sm text-text-tertiary">No players on the roster yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {roster.map((pl) => (
                  <div
                    key={pl.id}
                    className="flex items-center justify-between rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] px-3 py-2"
                  >
                    <span className="font-annual text-body-sm text-text-primary">{pl.name}</span>
                    <NativeSelect
                      value={attendance[pl.id] ?? ''}
                      onChange={(e) =>
                        setAttendance((a) => ({
                          ...a,
                          [pl.id]: e.target.value as BaseballPracticeAttendanceStatus,
                        }))
                      }
                      className={FIELD_CLASS_SM}
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
      {!isCoach && published && <PublishedScrimmageViewer practiceId={practice.id} />}
    </PaperCard>
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
    <div className="border-t border-[color:var(--hairline)] pt-4">
      <Eyebrow ink="team" className="mb-2 inline-flex items-center gap-1.5">
        <Ruler className="h-3.5 w-3.5" />
        {scrimmages.length === 1 ? 'Scrimmage' : `Scrimmages (${scrimmages.length})`}
      </Eyebrow>
      <ul className="space-y-2">
        {scrimmages.map((s) => {
          const isExpanded = expanded === s.id;
          const completed = s.status === 'completed';
          return (
            <li
              key={s.id}
              className="rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3"
            >
              <Button
                type="button"
                variant="ghost"
                aria-expanded={isExpanded}
                onClick={() => setExpanded(isExpanded ? null : s.id)}
                className="flex w-full items-center justify-between gap-2 rounded-fw-md px-1 py-0.5 text-left"
              >
                <div className="min-w-0">
                  <span className="font-annual text-body-sm font-semibold text-text-primary">{s.title}</span>
                  <span className="ml-2 font-annual text-caption text-text-tertiary">
                    {s.mode.replace(/_/g, ' ')} · {s.slots.length} players
                    {completed && s.blue_score != null && (
                      <span className="ml-1 font-medium text-text-secondary">
                        — Blue {s.blue_score} · White {s.white_score ?? '–'}
                        {s.innings_played != null ? ` (${s.innings_played} inn)` : ''}
                      </span>
                    )}
                  </span>
                </div>
                <span className="text-text-tertiary" aria-hidden>
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
                          className="flex items-center gap-1.5 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] px-2 py-1"
                        >
                          <span className="font-annual text-microbadge font-bold text-text-tertiary">
                            {sl.defensive_position}
                          </span>
                          {sl.batting_order != null && (
                            <span className="font-annual text-microbadge tabular-nums text-text-tertiary">
                              #{sl.batting_order}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate font-annual text-caption font-medium text-text-primary">
                            {sl.player_name}
                          </span>
                          {sl.side && (
                            <span
                              className={cn(
                                'font-annual text-microbadge font-semibold uppercase',
                                sl.side === 'blue' ? 'text-grade-plus' : 'text-text-tertiary',
                              )}
                            >
                              {sl.side}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                  {s.result_note && (
                    <p className="mt-1 font-annual text-caption italic text-text-tertiary">{s.result_note}</p>
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
