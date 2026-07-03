'use client';

// =============================================================================
// src/components/baseball/practice-planner/PracticeRecapPanel.tsx
//
// Packet: qa-screens (BaseballHelm — Practice Recap / block-completion flow)
//
// THE PRACTICE RECAP / COMPLETION FLOW the v10 delta mandates:
//   "Practice recaps may exist only as human-entered completion notes and
//    effectiveness measurement, not generated narrative summary." (v10 delta L23)
//
// This is the post-practice WORKSPACE that closes the source -> signal -> action
// -> review loop the v7 §Practice Recap spec defines (kept by v10). It is composed
// as three deliberate sections, not a uniform card grid:
//
//   1. COMPLETION — per objective (the SOURCE node, BlockObjectiveEditor) the
//      coach records HOW WELL it was completed:
//        - completion_status: completed | partial | skipped | not run
//        - reps_completed + reps_graded_correct (V7 "how well they completed it")
//        - notes + video_url (V7 "video links")
//      and can convert any objective into an ASSIGNED PLAYER TASK (V7 "assign
//      player task") so a partial/skip becomes a real follow-up, not a dead note.
//
//   2. SCRIMMAGE — score the controlled scrimmage(s) attached to this practice
//      (V7 "score scrimmage"). A development-side outing tally, never an official
//      game; closing it out dates the outing for the engine + Stats Lab.
//
//   3. MEASURE — on save, persists via savePracticeRecap() and AUTO-RUNS the
//      effectiveness engine, so the coach immediately sees how many objectives
//      became measurable. Honest by construction — the engine returns measured:0
//      / too-early when data is thin; it never fabricates a read.
//
// PALETTE: cream + helm-green GolfHelm primitives. No golf labels. No navy/amber.
// =============================================================================

import { useCallback, useEffect, useState, useTransition } from 'react';
import { ClipboardCheck, Sparkles, Video, Swords, ListChecks, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  getPracticeObjectives,
  savePracticeRecap,
  assignRecapTask,
  type PracticeObjectiveView,
  type RecapEntryInput,
} from '@/app/baseball/actions/practice-effectiveness';
import {
  getTeamScrimmages,
  recordScrimmageResult,
} from '@/app/baseball/actions/practice-scrimmage';
import { getBaseballMetricLabel } from '@/lib/coachhelm/baseball/metrics/registry';
import type { BaseballObjectiveCompletionStatus } from '@/lib/types/baseball-practice-effectiveness';
import type { BaseballScrimmageWithDetail } from '@/lib/types/baseball-practice-deep';
import { NativeSelect } from '@/components/ui/native-select';

interface RecapRosterPlayer {
  id: string;
  name: string;
}

interface Props {
  practiceId: string;
  /** Roster for the "assign follow-up task" picker (optional; falls back to objective players). */
  roster?: RecapRosterPlayer[];
  /** Called after a recap save so the parent can refresh practice state. */
  onSaved?: () => void | Promise<void>;
}

interface DraftEntry {
  completionStatus: BaseballObjectiveCompletionStatus;
  repsCompleted: string;
  repsGradedCorrect: string;
  notes: string;
  videoUrl: string;
}

interface ScrimmageDraft {
  blueScore: string;
  whiteScore: string;
  inningsPlayed: string;
  resultNote: string;
}

const STATUS_OPTIONS: { value: BaseballObjectiveCompletionStatus; label: string }[] = [
  { value: 'completed', label: 'Completed' },
  { value: 'partial', label: 'Partial' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'planned', label: 'Not run' },
];

function toDraft(o: PracticeObjectiveView): DraftEntry {
  return {
    completionStatus: o.completionStatus,
    repsCompleted: o.repsCompleted != null ? String(o.repsCompleted) : '',
    repsGradedCorrect: o.repsGradedCorrect != null ? String(o.repsGradedCorrect) : '',
    notes: o.notes ?? '',
    videoUrl: o.videoUrl ?? '',
  };
}

function toScrimDraft(s: BaseballScrimmageWithDetail): ScrimmageDraft {
  return {
    blueScore: s.blue_score != null ? String(s.blue_score) : '',
    whiteScore: s.white_score != null ? String(s.white_score) : '',
    inningsPlayed: s.innings_played != null ? String(s.innings_played) : '',
    resultNote: s.result_note ?? '',
  };
}

export function PracticeRecapPanel({ practiceId, roster, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [objectives, setObjectives] = useState<PracticeObjectiveView[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [scrimmages, setScrimmages] = useState<BaseballScrimmageWithDetail[]>([]);
  const [scrimDrafts, setScrimDrafts] = useState<Record<string, ScrimmageDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // The objective whose "assign follow-up task" composer is open (one at a time).
  const [taskForObjective, setTaskForObjective] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [objRes, scrimRes] = await Promise.all([
      getPracticeObjectives({ practiceId }),
      getTeamScrimmages(),
    ]);
    if (objRes.success) {
      const objs = objRes.data ?? [];
      setObjectives(objs);
      const d: Record<string, DraftEntry> = {};
      for (const o of objs) d[o.id] = toDraft(o);
      setDrafts(d);
    } else {
      setError(objRes.error ?? 'Could not load objectives.');
    }
    // Only the scrimmages attached to THIS practice are scoreable here, and
    // only once they have been published (a draft scrimmage has not happened).
    const attached = scrimRes.success
      ? (scrimRes.data ?? []).filter(
          (s) => s.practice_id === practiceId && s.status !== 'draft',
        )
      : [];
    setScrimmages(attached);
    const sd: Record<string, ScrimmageDraft> = {};
    for (const s of attached) sd[s.id] = toScrimDraft(s);
    setScrimDrafts(sd);
    setLoading(false);
  }, [practiceId]);

  useEffect(() => {
    if (open && objectives.length === 0 && scrimmages.length === 0 && !loading) void load();
  // load is stable (useCallback + practiceId), open gate prevents double-fetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load]);

  const patch = (id: string, p: Partial<DraftEntry>) =>
    setDrafts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, ...p } };
    });

  const patchScrim = (id: string, p: Partial<ScrimmageDraft>) =>
    setScrimDrafts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, ...p } };
    });

  const handleSave = () => {
    setError(null);
    setResultMsg(null);
    startSaving(async () => {
      const entries: RecapEntryInput[] = objectives.map((o) => {
        const d = drafts[o.id] ?? toDraft(o);
        return {
          objectiveId: o.id,
          completionStatus: d.completionStatus,
          repsCompleted: d.repsCompleted.trim() === '' ? null : Number(d.repsCompleted),
          repsGradedCorrect: d.repsGradedCorrect.trim() === '' ? null : Number(d.repsGradedCorrect),
          notes: d.notes.trim() || null,
          videoUrl: d.videoUrl.trim() || null,
        };
      });
      const res = await savePracticeRecap({ practiceId, entries, autoMeasure: true });
      if (!res.success) {
        setError(res.error ?? 'Could not save the recap.');
        return;
      }
      const eff = res.effectiveness;
      setResultMsg(
        eff && eff.measured + eff.improved + eff.worse + eff.tooEarly + eff.insufficient > 0
          ? `Recap saved. CoachHelm measured ${eff.measured} association(s) · ${eff.improved} improved · ${eff.worse} regressed · ${eff.tooEarly} too early.`
          : 'Recap saved. Not enough later game/scrimmage/practice data to measure transfer yet — re-measure after the next outing.',
      );
      await load();
      await onSaved?.();
    });
  };

  // Score (or reopen) one scrimmage. Independent of the recap save so a coach can
  // close out the outing the moment it ends without filling in every objective.
  const handleScoreScrimmage = (scrimmageId: string, reopen = false) => {
    setError(null);
    startSaving(async () => {
      const d = scrimDrafts[scrimmageId];
      const res = await recordScrimmageResult(
        reopen
          ? { scrimmageId, recordResult: false }
          : {
              scrimmageId,
              recordResult: true,
              blueScore: d?.blueScore.trim() ? Number(d.blueScore) : null,
              whiteScore: d?.whiteScore.trim() ? Number(d.whiteScore) : null,
              inningsPlayed: d?.inningsPlayed.trim() ? Number(d.inningsPlayed) : null,
              resultNote: d?.resultNote.trim() || null,
            },
      );
      if (!res.success) {
        setError(res.error ?? 'Could not save the scrimmage result.');
        return;
      }
      await load();
      await onSaved?.();
    });
  };

  return (
    <div className="border-t border-warm-100 pt-4">
      {!open ? (
        <Button
          variant="ghost"
          onClick={() => setOpen(true)}
          leftIcon={<ClipboardCheck className="h-4 w-4" />}
        >
          Practice recap
        </Button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-warm-800">
              <ClipboardCheck className="h-4 w-4 text-primary-600" />
              Practice recap — completion, scrimmage &amp; effectiveness
            </span>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isSaving}>
              Close
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-warm-500">
            Record how each objective was completed and score any controlled
            scrimmage. CoachHelm measures whether the focus transferred to later
            performance — it never writes a generated summary. Only completed or
            partial objectives are measured.
          </p>

          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-warm-100" />
              ))}
            </div>
          ) : error ? (
            <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : (
            <>
              {/* ---------- SECTION 1: objective completion ---------- */}
              <section className="space-y-2.5">
                <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warm-500">
                  <ListChecks className="h-3.5 w-3.5 text-primary-600" />
                  Block completion
                </h4>

                {objectives.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-warm-200 bg-cream-50 px-4 py-6 text-center">
                    <p className="text-sm text-warm-600">No objectives to recap.</p>
                    <p className="mt-1 text-xs text-warm-400">
                      Add a measurable objective to a block in the editor first — that
                      is what CoachHelm measures transfer against.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2.5">
                    {objectives.map((o) => {
                      const d = drafts[o.id];
                      if (!d) return null;
                      const run =
                        d.completionStatus === 'completed' || d.completionStatus === 'partial';
                      const taskOpen = taskForObjective === o.id;
                      return (
                        <li key={o.id} className="rounded-xl border border-warm-100 bg-cream-50/60 p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-warm-800">{o.focusArea}</p>
                              <p className="text-micro text-warm-400">
                                {o.targetMetric
                                  ? getBaseballMetricLabel(o.targetMetric)
                                  : 'Completion only'}
                                {o.playerIds.length > 0 && ` · ${o.playerIds.length} player(s)`}
                                {o.repsPlanned != null && ` · ${o.repsPlanned} reps planned`}
                              </p>
                            </div>
                            <NativeSelect
                              value={d.completionStatus}
                              onChange={(e) =>
                                patch(o.id, {
                                  completionStatus: e.target.value as BaseballObjectiveCompletionStatus,
                                })
                              }
                              aria-label={`Completion status for ${o.focusArea}`}
                              className="rounded-lg border border-warm-200 bg-cream-50 px-2 py-1 text-sm focus:border-primary-400 focus:outline-none"
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </NativeSelect>
                          </div>

                          {/* Reps + grading — only relevant when the block was run. */}
                          {run && (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <label className="block" htmlFor={`reps-completed-${o.id}`}>
                                <span className="mb-1 block text-micro font-medium text-warm-600">
                                  Reps done
                                </span>
                                <Input
                                  id={`reps-completed-${o.id}`}
                                  type="number"
                                  min={0}
                                  value={d.repsCompleted}
                                  onChange={(e) => patch(o.id, { repsCompleted: e.target.value })}
                                  className="w-full min-h-0 rounded-lg px-2 py-1 text-sm"
                                />
                              </label>
                              <label className="block" htmlFor={`reps-correct-${o.id}`}>
                                <span className="mb-1 block text-micro font-medium text-warm-600">
                                  Reps correct
                                </span>
                                <Input
                                  id={`reps-correct-${o.id}`}
                                  type="number"
                                  min={0}
                                  value={d.repsGradedCorrect}
                                  onChange={(e) => patch(o.id, { repsGradedCorrect: e.target.value })}
                                  className="w-full min-h-0 rounded-lg px-2 py-1 text-sm"
                                />
                              </label>
                              <label className="col-span-2 block" htmlFor={`video-url-${o.id}`}>
                                <span className="mb-1 block text-micro font-medium text-warm-600">
                                  Video link (optional)
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <Video className="h-3.5 w-3.5 shrink-0 text-warm-400" />
                                  <Input
                                    id={`video-url-${o.id}`}
                                    type="url"
                                    value={d.videoUrl}
                                    onChange={(e) => patch(o.id, { videoUrl: e.target.value })}
                                    placeholder="https://…"
                                    className="w-full min-h-0 rounded-lg px-2 py-1 text-sm"
                                  />
                                </div>
                              </label>
                            </div>
                          )}

                          <label className="mt-2 block" htmlFor={`notes-${o.id}`}>
                            <span className="mb-1 block text-micro font-medium text-warm-600">
                              Completion notes (optional)
                            </span>
                            <Textarea
                              id={`notes-${o.id}`}
                              value={d.notes}
                              onChange={(e) => patch(o.id, { notes: e.target.value })}
                              rows={2}
                              placeholder="What you actually saw — what to repeat or change next time."
                              className="w-full rounded-lg px-2 py-1.5 text-sm"
                            />
                          </label>

                          {/* Assign follow-up task (V7 "assign player task"). */}
                          <div className="mt-2">
                            {!taskOpen ? (
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setTaskForObjective(o.id)}
                                haptic="none"
                                className="min-h-0 gap-1 p-0 text-micro font-medium text-primary-600 hover:bg-transparent hover:text-primary-700"
                              >
                                <Plus className="h-3 w-3" />
                                Assign follow-up task
                              </Button>
                            ) : (
                              <RecapTaskComposer
                                objective={o}
                                roster={roster ?? []}
                                onClose={() => setTaskForObjective(null)}
                                onError={setError}
                              />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* ---------- SECTION 2: score the scrimmage(s) ---------- */}
              {scrimmages.length > 0 && (
                <section className="space-y-2.5">
                  <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warm-500">
                    <Swords className="h-3.5 w-3.5 text-primary-600" />
                    Score the scrimmage
                  </h4>
                  <ul className="space-y-2.5">
                    {scrimmages.map((s) => {
                      const d = scrimDrafts[s.id];
                      if (!d) return null;
                      const completed = s.status === 'completed';
                      return (
                        <li key={s.id} className="rounded-xl border border-warm-100 bg-cream-50/60 p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-warm-800">{s.title}</p>
                              <p className="text-micro text-warm-400">
                                {s.mode.replace(/_/g, ' ')} · {s.slots.length} assigned
                                {completed && ' · scored'}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <label className="block" htmlFor={`blue-score-${s.id}`}>
                              <span className="mb-1 block text-micro font-medium text-warm-600">
                                Blue / offense
                              </span>
                              <Input
                                id={`blue-score-${s.id}`}
                                type="number"
                                min={0}
                                value={d.blueScore}
                                onChange={(e) => patchScrim(s.id, { blueScore: e.target.value })}
                                className="w-full min-h-0 rounded-lg px-2 py-1 text-sm"
                              />
                            </label>
                            <label className="block" htmlFor={`white-score-${s.id}`}>
                              <span className="mb-1 block text-micro font-medium text-warm-600">
                                White / defense
                              </span>
                              <Input
                                id={`white-score-${s.id}`}
                                type="number"
                                min={0}
                                value={d.whiteScore}
                                onChange={(e) => patchScrim(s.id, { whiteScore: e.target.value })}
                                className="w-full min-h-0 rounded-lg px-2 py-1 text-sm"
                              />
                            </label>
                            <label className="block" htmlFor={`innings-played-${s.id}`}>
                              <span className="mb-1 block text-micro font-medium text-warm-600">
                                Innings
                              </span>
                              <Input
                                id={`innings-played-${s.id}`}
                                type="number"
                                min={0}
                                value={d.inningsPlayed}
                                onChange={(e) => patchScrim(s.id, { inningsPlayed: e.target.value })}
                                className="w-full min-h-0 rounded-lg px-2 py-1 text-sm"
                              />
                            </label>
                          </div>
                          <label className="mt-2 block" htmlFor={`result-note-${s.id}`}>
                            <span className="mb-1 block text-micro font-medium text-warm-600">
                              Outing note (optional)
                            </span>
                            <Textarea
                              id={`result-note-${s.id}`}
                              value={d.resultNote}
                              onChange={(e) => patchScrim(s.id, { resultNote: e.target.value })}
                              rows={2}
                              placeholder="Who threw well, situational outcomes, what to carry into the next outing."
                              className="w-full rounded-lg px-2 py-1.5 text-sm"
                            />
                          </label>
                          <div className="mt-2 flex items-center gap-2">
                            <Button size="sm" onClick={() => handleScoreScrimmage(s.id)} isLoading={isSaving}>
                              {completed ? 'Update score' : 'Save score'}
                            </Button>
                            {completed && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleScoreScrimmage(s.id, true)}
                                disabled={isSaving}
                              >
                                Reopen
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {resultMsg && (
                <div className="flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50/60 px-3 py-2.5 text-sm text-primary-800">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                  <span>{resultMsg}</span>
                </div>
              )}

              {objectives.length > 0 && (
                <div className="flex items-center gap-2 border-t border-warm-100 pt-3">
                  <Button onClick={handleSave} isLoading={isSaving}>
                    Save recap &amp; measure
                  </Button>
                  <Button variant="ghost" onClick={() => setOpen(false)} disabled={isSaving}>
                    Cancel
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// RecapTaskComposer — inline "assign player task" form for one objective. Posts
// to assignRecapTask (capability-enforced, source-linked to the objective).
// =============================================================================

function RecapTaskComposer({
  objective,
  roster,
  onClose,
  onError,
}: {
  objective: PracticeObjectiveView;
  roster: RecapRosterPlayer[];
  onClose: () => void;
  onError: (msg: string | null) => void;
}) {
  const [title, setTitle] = useState(`Follow-up: ${objective.focusArea}`);
  const [dueDate, setDueDate] = useState('');
  // Default the assignee set to the objective's players; coach can adjust.
  const [selected, setSelected] = useState<Set<string>>(new Set(objective.playerIds));
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    onError(null);
    startTransition(async () => {
      const ids = [...selected];
      const res = await assignRecapTask({
        objectiveId: objective.id,
        practiceId: objective.practiceId,
        title,
        dueDate: dueDate || null,
        playerIds: ids.length > 0 ? ids : undefined,
      });
      if (!res.success) {
        onError(res.error ?? 'Could not assign the task.');
        return;
      }
      setDone(true);
    });
  };

  if (done) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-primary-100 bg-primary-50/60 px-3 py-2 text-micro text-primary-700">
        <span>Follow-up task assigned.</span>
        <Button type="button" variant="ghost" onClick={onClose} haptic="none" className="min-h-0 p-0 font-medium hover:bg-transparent hover:underline">
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg glass-standard p-2.5">
      <label className="block" htmlFor={`task-title-${objective.id}`}>
        <span className="mb-1 block text-micro font-medium text-warm-600">Task title</span>
        <Input
          id={`task-title-${objective.id}`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full min-h-0 rounded-lg px-2 py-1 text-sm"
        />
      </label>
      <label className="block" htmlFor={`task-due-${objective.id}`}>
        <span className="mb-1 block text-micro font-medium text-warm-600">Due (optional)</span>
        <Input
          id={`task-due-${objective.id}`}
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="min-h-0 rounded-lg px-2 py-1 text-sm"
        />
      </label>

      {roster.length > 0 ? (
        <div>
          <span className="mb-1 block text-micro font-medium text-warm-600">Assign to</span>
          <div className="flex flex-wrap gap-1.5">
            {roster.map((p) => {
              const on = selected.has(p.id);
              return (
                <Button
                  key={p.id}
                  type="button"
                  variant="ghost"
                  onClick={() => toggle(p.id)}
                  haptic="none"
                  className={`min-h-0 rounded-full border px-2.5 py-0.5 text-micro font-normal ${
                    on
                      ? 'border-primary-300 bg-primary-100 text-primary-700 hover:bg-primary-100'
                      : 'border-warm-200 bg-cream-50 text-warm-600 hover:bg-warm-50'
                  }`}
                >
                  {p.name}
                </Button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-micro text-warm-400">
          Assigning to the {objective.playerIds.length} player(s) on this objective.
        </p>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        <Button size="sm" onClick={submit} isLoading={isPending} disabled={!title.trim()}>
          Assign task
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
