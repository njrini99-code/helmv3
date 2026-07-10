'use client';

// =============================================================================
// src/components/baseball/practice-planner/ScrimmagePanel.tsx
//
// Packet: practice-intel
//
// The "Controlled scrimmage" surface (V7) the Practice Planner mounts inside the
// editor. Owns scrimmage state + the save/publish-validation flow and renders the
// drag/drop ScrimmageLineupBuilder. A scrimmage is attached to the practice being
// edited; lineups are saved as a draft and only PUBLISH once the server-side
// validation passes (no duplicate field position, no batting-order dupes).
//
// Self-contained so the (already large) PracticePlannerClient only has to mount
// <ScrimmagePanel practiceId=... roster=... /> when a practice is open.
//
// GolfHelm cream/green primitives. No golf labels. No new palette.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Swords, Plus, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  getTeamScrimmages,
  saveScrimmage,
  publishScrimmage,
} from '@/app/baseball/actions/practice-scrimmage';
import type {
  LineupSlotInput,
  LineupValidationResult,
} from '@/lib/baseball/practice-validation';
import type {
  BaseballScrimmageMode,
  BaseballScrimmageWithDetail,
} from '@/lib/types/baseball-practice-deep';
import {
  ScrimmageLineupBuilder,
  type ScrimmageRosterPlayer,
} from './ScrimmageLineupBuilder';

interface ScrimmagePanelProps {
  /** The practice this scrimmage attaches to (must be saved first). */
  practiceId: string | null;
  roster: ScrimmageRosterPlayer[];
}

const MODE_OPTIONS: { value: BaseballScrimmageMode; label: string }[] = [
  { value: 'intrasquad', label: 'Intrasquad (Blue vs White)' },
  { value: 'situational', label: 'Situational' },
  { value: 'pitcher_live_ab', label: 'Pitcher live AB' },
  { value: 'defense_only', label: 'Defense only' },
  { value: 'bullpen_live', label: 'Bullpen live' },
];

export function ScrimmagePanel({ practiceId, roster }: ScrimmagePanelProps) {
  const [scrimmages, setScrimmages] = useState<BaseballScrimmageWithDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state for the active scrimmage.
  const [editing, setEditing] = useState(false);
  const [scrimmageId, setScrimmageId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<BaseballScrimmageMode>('intrasquad');
  const [notes, setNotes] = useState('');
  const [slots, setSlots] = useState<LineupSlotInput[]>([]);
  const [validation, setValidation] = useState<LineupValidationResult | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTeamScrimmages();
      if (res.success) {
        // Only show scrimmages attached to this practice (or unattached drafts).
        const all = res.data ?? [];
        setScrimmages(
          practiceId ? all.filter((s) => s.practice_id === practiceId) : all,
        );
      } else {
        setError(res.error ?? 'Could not load scrimmages.');
      }
    } finally {
      setLoading(false);
    }
  }, [practiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetEditor = () => {
    setEditing(false);
    setScrimmageId(null);
    setTitle('');
    setMode('intrasquad');
    setNotes('');
    setSlots([]);
    setValidation(null);
  };

  const startNew = () => {
    resetEditor();
    setEditing(true);
    setTitle('Controlled scrimmage');
  };

  const startEdit = (s: BaseballScrimmageWithDetail) => {
    setEditing(true);
    setScrimmageId(s.id);
    setTitle(s.title);
    setMode(s.mode);
    setNotes(s.notes ?? '');
    setSlots(
      s.slots.map((slot) => ({
        playerId: slot.player_id,
        side: slot.side,
        defensivePosition: slot.defensive_position,
        battingOrder: slot.batting_order,
        inningStart: slot.inning_start,
        inningEnd: slot.inning_end,
        note: slot.note,
      })),
    );
  };

  const handleSave = async () => {
    if (!practiceId) {
      setError('Save the practice first, then build a scrimmage.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await saveScrimmage({
        scrimmageId: scrimmageId ?? undefined,
        practiceId,
        title,
        mode,
        notes: notes.trim() || null,
        slots,
      });
      if (res.success) {
        resetEditor();
        await load();
      } else {
        setError(res.error ?? 'Could not save scrimmage.');
      }
    } catch {
      setError('Could not save scrimmage.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishToggle = async (s: BaseballScrimmageWithDetail, publish: boolean) => {
    setError(null);
    const res = await publishScrimmage({ scrimmageId: s.id, publish });
    if (res.success) await load();
    else setError(res.error ?? 'Could not update publish state.');
  };

  return (
    <div className="space-y-4 rounded-2xl border border-warm-200 bg-cream-50/70 p-4">
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-warm-800">
          <Swords className="h-4 w-4 text-primary-600" />
          Controlled scrimmage
        </h3>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={startNew}
            disabled={!practiceId}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            New scrimmage
          </Button>
        )}
      </div>

      {!practiceId && (
        <p className="text-xs text-warm-500">
          Save this practice first to attach a scrimmage to it.
        </p>
      )}

      {error && <p className="text-xs text-error">{error}</p>}

      {/* Editor */}
      {editing && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="text"
              label="Scrimmage title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Select
              label="Mode"
              value={mode}
              onChange={(v) => setMode(v as BaseballScrimmageMode)}
              options={MODE_OPTIONS}
            />
          </div>

          <Textarea
            label="Coach notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Goals for this scrimmage, matchups to watch, focus areas."
          />

          <ScrimmageLineupBuilder
            mode={mode}
            roster={roster}
            slots={slots}
            onChange={setSlots}
            onValidation={setValidation}
          />

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSave} isLoading={saving} disabled={!title.trim()}>
              {scrimmageId ? 'Save scrimmage' : 'Save draft'}
            </Button>
            <Button variant="ghost" onClick={resetEditor} disabled={saving}>
              Cancel
            </Button>
            {/* Living Annual ink: clay (`pursuit`) warning, never raw amber. */}
            {validation && !validation.ok && (
              <span className="text-xs text-pursuit">
                {validation.errors.length} conflict
                {validation.errors.length === 1 ? '' : 's'} must be resolved before publishing.
              </span>
            )}
          </div>
        </div>
      )}

      {/* List */}
      {!editing && (
        <>
          {loading ? (
            <div className="h-16 animate-pulse rounded-xl bg-warm-100/70" />
          ) : scrimmages.length === 0 ? (
            <EmptyState
              icon={<Swords className="h-6 w-6" />}
              title="No scrimmage yet"
              description="Build a drag/drop lineup for an intrasquad, situational, or live-AB scrimmage."
            />
          ) : (
            <ul className="space-y-2">
              {scrimmages.map((s) => {
                const published = s.status === 'published';
                const completed = s.status === 'completed';
                const hasScore =
                  completed && (s.blue_score != null || s.white_score != null);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warm-200 bg-cream-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-warm-900">{s.title}</span>
                        {completed ? (
                          <Badge
                            tone="primary"
                            appearance="soft"
                            size="sm"
                            icon={<CheckCircle2 className="h-3 w-3" />}
                          >
                            Completed
                          </Badge>
                        ) : (
                          <Badge
                            tone={published ? 'primary' : 'neutral'}
                            appearance="soft"
                            size="sm"
                            icon={published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          >
                            {published ? 'Published' : 'Draft'}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-warm-500">
                        {s.mode.replace(/_/g, ' ')} · {s.slots.length} assigned
                        {hasScore && (
                          <span className="ml-2 font-medium text-warm-700">
                            Blue {s.blue_score ?? '–'} · White {s.white_score ?? '–'}
                            {s.innings_played != null && ` · ${s.innings_played} inn`}
                          </span>
                        )}
                      </span>
                      {s.notes && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-warm-400">{s.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!published && !completed && (
                        <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>
                          Edit
                        </Button>
                      )}
                      {!completed && (
                        <Button
                          variant={published ? 'outline' : 'primary'}
                          size="sm"
                          onClick={() => handlePublishToggle(s, !published)}
                        >
                          {published ? 'Unpublish' : 'Publish'}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
