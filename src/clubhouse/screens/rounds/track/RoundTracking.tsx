'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Check, CloudOff, Smartphone, Table2, X } from 'lucide-react';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { useShotTracking, type ShotTrackingPorts, type ShotTrackingProps } from '@/hooks/golf/use-shot-tracking';
import type { ShotRecord } from '@/lib/types/golf';
import type { DataGapAsk } from '@/lib/coachhelm/data-gap/asks';
import { isRoundStartMoment } from '@/lib/golf/data-prompts/recovery';
import { frontierIndex } from '@/lib/golf/round-session/play-order';
import { calculateHoleStats } from '@/lib/utils/shot-helpers';
import type { ChRoundType, ChTeeColor } from '../../../data/rounds-shape';
import { haptic } from '../../../lib/haptics';
import { usePhoneImmersive, usePhoneTabsHidden } from '../../../shell/phone-chrome';
import { Icon } from '../../../ui/Icon';
import { ScoreMark } from '../../../ui/ScoreMark';
import { Spinner } from '../../../ui/Spinner';
import { TeeSwatch, TYPE_LABEL } from '../parts';
import { CourseView } from './CourseView';
import { PuttMissPrompt, RecoveryPrompt } from './DataPrompts';
import { HoleReview } from './HoleReview';
import { heroDistance, scoreName, shotKind } from './labels';
import { HoleMap, ShotLog, TrackStrip } from './parts';
import { EditShotSheet, PenaltySheet, UnsavedSheet } from './sheets';
import { ShotEntry } from './ShotEntry';
import { useChPuttPrompt, useChRecoveryPrompt } from './use-data-prompts';
import { useWakeLock } from './use-wake-lock';
import '../../../styles/rounds-track.css';

/** The round this screen is scoring, for its top bar. */
export interface ChTrackingRound {
  course: string;
  teeLabel: string | null;
  teeColor: ChTeeColor | null;
  type: ChRoundType | null;
}

export type RoundTrackingProps = ShotTrackingProps & {
  round: ChTrackingRound;
  /** Opens the round's scorecard (the round screen owns it). Without it the button isn't drawn. */
  onOpenScorecard?: () => void;
  /** A finished hole's shots, for the course view's ‹ › (the round screen already holds them). Without it other holes show no shots. */
  holeShots?: (index: number) => ShotRecord[] | null;
  /** Opens the finished round to post it, once every hole is in (CH-11910). Drawn as the shot review's footer action. */
  onReviewRound?: () => void;
  /**
   * CoachHelm Slice 8a (`coachhelm_data_gap_prompt_v1`): the player's open putt-miss asks (`loadDataGapAsks`). Absent or
   * empty (the flag off), nothing is asked (CH-11960).
   */
  dataGapAsks?: readonly DataGapAsk[];
  /** CoachHelm Slice 8b (`coachhelm_data_prompts_v2`): ask after a tee shot into the rough or an 'other' lie (CH-11961). */
  recoveryPrompt?: boolean;
  /** Drawn first in the entry card at the round's start only (first hole in play order, no shot yet): the course nudge, CH-11962. */
  startPrompt?: ReactNode;
};

// CH-11706: going to another hole is a selection tick. Module-level, so the
// hook's navigation callbacks keep their identity (ShotTrackingPorts).
const PORTS: ShotTrackingPorts = { haptic: () => haptic('select') };

// "Round saved" only for a server acknowledgement. A save held on the device (offline, waiting on another save, or
// refused until a reload) says where the shots are instead (swap audit R-1), and so does a shot the server has not
// acknowledged yet whose device copy landed ("syncing": the send is on its way). Nothing is said about a shot whose
// device copy failed: there is no true word for it.
const SAVE_WORDS = {
  saving: 'Saving round',
  saved: 'Round saved',
  error: 'Not synced yet, retrying',
  device: 'Saved on this phone',
  syncing: 'Saved on this phone · syncing',
} as const;

/**
 * The shot screen, Clubhouse's renderer (board `rounds-track.jsx`). All of its
 * logic is useShotTracking, shared with the Fairway screen: recording a shot,
 * the hole-out checkpoint and its retry, undo, penalties, edits, and moving
 * between holes. The round screen around it owns the round: it passes the
 * holes, moves to the next hole once one is saved, and owns Exit, the
 * scorecard and submitting (see `round-sheets.tsx`).
 */
export function RoundTracking(props: RoundTrackingProps) {
  const { round, holes, currentHoleIndex, onExit, onNavigateToHole, onOpenScorecard, onAutoSave, statusSlot, holeShots, onReviewRound, startHole = 1, dataGapAsks, recoveryPrompt = false, startPrompt } = props;
  const t = useShotTracking(props, PORTS);
  // The one-tap data prompts (CoachHelm Slice 8a, 8b): their session state lives here, beside the engine, so it survives the
  // entry's re-key on every shot and the move between holes. Each is null when it has nothing to ask.
  const puttAsk = useChPuttPrompt({ asks: dataGapAsks, holeNumber: t.currentHole?.number, shotHistory: t.shotHistory, onTag: t.handleTagPuttMiss });
  const recoveryAsk = useChRecoveryPrompt({ enabled: recoveryPrompt, holeNumber: t.currentHole?.number, shotHistory: t.shotHistory, onTag: t.handleTagRecovery });
  const editOpen = !!(t.showEditModal && t.editingShot && t.editFormData);
  const [lastEdit, setLastEdit] = useState<{ shot: NonNullable<typeof t.editingShot>; form: NonNullable<typeof t.editFormData> } | null>(null);
  if (editOpen && (lastEdit?.shot !== t.editingShot || lastEdit?.form !== t.editFormData)) setLastEdit({ shot: t.editingShot!, form: t.editFormData! });
  // A round is a full-screen flow on the phone (P011-D1): Exit and Scorecard are in its own top bar, so the shell's top
  // bar and bell go (rounds-track.css hides them while this is up) and the tab bar goes.
  usePhoneTabsHidden(true);
  usePhoneImmersive(true);
  // On the course the screen stays on between shots (wave 9, owner decision A); a no-op where it isn't supported.
  useWakeLock();
  const { distancePref } = useDistanceUnits();
  const [courseOpen, setCourseOpen] = useState(false);
  const hole = t.currentHole;
  // The engine says "saved" for two seconds, then goes quiet. The line stays on "Round saved" for as long as what is on
  // screen is exactly what the server acknowledged: the same hole and the same shot list (the engine replaces the list
  // on every shot, edit, undo and hole change, so any of those drops the claim until the next acknowledgement).
  const [acked, setAcked] = useState<{ hole: number; shots: ShotRecord[] } | null>(null);
  if (t.autoSaveStatus === 'saved' && hole && (acked?.hole !== hole.number || acked.shots !== t.shotHistory)) {
    setAcked({ hole: hole.number, shots: t.shotHistory });
  }
  // The hole just holed out, while its save runs. The round screen moves on to the next hole only once that save has
  // landed (the shared engine navigates after the checkpoint), so a move away from it that the player didn't make
  // (`jump` below clears it) is the save succeeding: the new hole says so ("Hole 4 saved · Birdie") in place of "No
  // shots yet" for a few seconds, or until its first shot.
  const [savingHole, setSavingHole] = useState<{ index: number; words: string } | null>(null);
  const [savedNote, setSavedNote] = useState<{ index: number; words: string } | null>(null);
  // The hole the player asked to leave (the strip, Back to hole): its save, if it lands, is not announced.
  const [leftHole, setLeftHole] = useState<number | null>(null);
  useEffect(() => {
    if (!savedNote) return;
    const id = window.setTimeout(() => setSavedNote(null), 4000);
    return () => window.clearTimeout(id);
  }, [savedNote]);

  if (!hole) {
    return (
      <div className="ch-rt ch-rt--empty" role="alert" data-ch-code="CH-11207">
        <p>This hole didn&rsquo;t load. Go back to Rounds and continue the round from there.</p>
      </div>
    );
  }

  const holedOut = t.shotHistory.length > 0 && t.shotHistory[t.shotHistory.length - 1]?.result === 'hole';
  // The next hole to play, in play order (a shotgun start's wraps past the card's last hole).
  const frontier = frontierIndex(holes.length, startHole, (i) => holes[i]!.score !== null);
  const backTo = holedOut && !!onNavigateToHole && frontier >= 0 && frontier !== currentHoleIndex ? { index: frontier, number: holes[frontier]!.number } : null;
  const stats = holedOut ? calculateHoleStats(t.shotHistory, hole) : null;
  if (leftHole !== null && leftHole !== currentHoleIndex) setLeftHole(null);
  if (stats && t.holeCheckpointStatus === 'saving' && leftHole !== currentHoleIndex) {
    const words = `Hole ${hole.number} saved · ${scoreName(stats.score, hole.par)}`;
    if (savingHole?.index !== currentHoleIndex || savingHole.words !== words) setSavingHole({ index: currentHoleIndex, words });
  } else if (savingHole && savingHole.index !== currentHoleIndex) {
    setSavingHole(null);
    setSavedNote({ index: currentHoleIndex, words: savingHole.words });
  }
  const jump = onNavigateToHole
    ? (index: number) => {
        // The player's own move to another hole says nothing about the save, even when the move lands a render later
        // (the unsaved-shots sheet asks first).
        setLeftHole(currentHoleIndex);
        setSavingHole(null);
        setSavedNote(null);
        t.handleNavigateToHole(index);
      }
    : undefined;
  const far = heroDistance(t.distanceToHole, t.distanceUnit, distancePref);
  const liveState = t.autoSaveStatus !== 'idle' ? t.autoSaveStatus : t.autoSaveHeldOnDevice ? 'device' : t.autoSaveSyncing ? 'syncing' : 'idle';
  const heldSaved = liveState === 'idle' && acked?.hole === hole.number && acked.shots === t.shotHistory ? 'saved' : liveState;
  // While a holed hole is being saved, or after that save failed ("kept on this device", CH-11003), the line never says
  // "Round saved": the hole's own save is the truth then. Device, syncing and retrying still agree with it, so they stay.
  const saveState = heldSaved === 'saved' && t.holeCheckpointStatus !== 'idle' ? 'idle' : heldSaved;
  const meta = [round.teeLabel && `${round.teeLabel} tees`, round.type && TYPE_LABEL[round.type]].filter(Boolean).join(' · ');
  const atStart = !!startPrompt && isRoundStartMoment({ holeScores: holes.map((h) => h.score), currentHoleIndex, startHole, shotCount: t.shotHistory.length });
  const prompts =
    puttAsk || recoveryAsk || atStart ? (
      <>
        {atStart && startPrompt}
        {puttAsk && <PuttMissPrompt prompt={puttAsk} pref={distancePref} />}
        {recoveryAsk && <RecoveryPrompt prompt={recoveryAsk} />}
      </>
    ) : undefined;

  return (
    <div className="ch-rt-q">
      <main className="ch-rt" data-ui="clubhouse">
        <header className="ch-rt-top">
          {onExit ? (
            <button type="button" className="ch-rt-pill" onClick={onExit}>
              <Icon icon={X} size={16} />
              <span>Exit</span>
            </button>
          ) : (
            <span />
          )}
          <div className="ch-rt-top__c">
            <h1>
              {round.course}
              <span className="ch-sr-only">, hole {hole.number}</span>
            </h1>
            {meta && (
              <span>
                <TeeSwatch color={round.teeColor} />
                {meta}
              </span>
            )}
          </div>
          {onOpenScorecard ? (
            <button type="button" className="ch-rt-pill ch-rt-pill--card" onClick={onOpenScorecard} aria-label="Scorecard">
              <Icon icon={Table2} size={16} />
              <span className="ch-rt-pill__l">Scorecard</span>
              <span className="ch-rt-pill__s" aria-hidden="true">
                Card
              </span>
            </button>
          ) : (
            <span />
          )}
        </header>
        {statusSlot}
        <TrackStrip holes={holes} current={currentHoleIndex} startHole={startHole} onJump={jump} />

        <div className="ch-rt-body">
          <section className="ch-rt-hero" aria-label={`Hole ${hole.number}`}>
            {/* Board 3: the drawn hole is the hero; tapping it opens the course view (board 3b). */}
            <button type="button" className="ch-rt-hero__map" aria-haspopup="dialog" aria-label={`Course view of hole ${hole.number}`} onClick={() => setCourseOpen(true)}>
              <HoleMap hole={hole} shots={t.shotHistory} pending={!holedOut} frame="wide" />
              <HoleMap hole={hole} shots={t.shotHistory} pending={!holedOut} frame="tall" />
            </button>
            <div className="ch-rt-hero__main">
              <div className="ch-rt-hero__k">
                <b className="ch-rt-hno">
                  <em>Hole</em>
                  {hole.number}
                </b>
                <span className="ch-rt-hmeta">
                  <b>Par {hole.par}</b>
                  {hole.yardage ? (
                    <i>
                      {heroDistance(hole.yardage, 'yards', distancePref).figure} {distancePref === 'meters' ? 'm' : 'yds'}
                    </i>
                  ) : null}
                </span>
              </div>
              <div className="ch-rt-hero__foot">
                {stats ? (
                  <div className="ch-rt-hero__done">
                    <ScoreMark score={stats.score} par={hole.par} />
                    <div>
                      <b>{scoreName(stats.score, hole.par)}</b>
                      <span>
                        {stats.score} strokes · {stats.putts} putt{stats.putts === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="ch-rt-hero__dist">
                    <span className="ch-rt-hero__shot">
                      Shot {t.currentShot}
                      <em>{shotKind(t.shotType)}</em>
                    </span>
                    <b>{far.figure}</b>
                    <em>{far.words}</em>
                  </div>
                )}
                {onAutoSave && saveState !== 'idle' && (
                  // CH-11901: where the round's shots are, beside the readout (board 3), in words: retrying on its own
                  // when a save fails, and never "saved" before the server said so.
                  <p className={'ch-rt-sync is-' + saveState} role="status" data-ch-code="CH-11901">
                    {saveState === 'error' ? (
                      <Icon icon={CloudOff} size={13} />
                    ) : saveState === 'saved' ? (
                      <Icon icon={Check} size={13} />
                    ) : saveState === 'device' || saveState === 'syncing' ? (
                      <Icon icon={Smartphone} size={13} />
                    ) : (
                      <Spinner size="sm" />
                    )}
                    <span>{SAVE_WORDS[saveState]}</span>
                  </p>
                )}
              </div>
            </div>
            {/* Mid-hole a recorded shot opens from the log (Fairway's shot pills); once holed, the hole review is the one way in. */}
            <ShotLog
              shots={t.shotHistory}
              pref={distancePref}
              onEdit={holedOut ? undefined : t.handleEditShot}
              editDisabled={t.undoSaving || t.editSaving}
              saved={savedNote?.index === currentHoleIndex ? savedNote.words : null}
            />
          </section>

          {holedOut ? (
            <HoleReview
              hole={hole}
              shots={t.shotHistory}
              pref={distancePref}
              checkpointStatus={t.holeCheckpointStatus}
              backTo={backTo}
              onReviewRound={frontier < 0 ? onReviewRound : undefined}
              showUndoConfirm={t.showUndoConfirm}
              undoSaving={t.undoSaving}
              undoError={t.state.undoError}
              dispatch={t.dispatch}
              onEditShot={t.handleEditShot}
              onNavigateToHole={jump ?? t.handleNavigateToHole}
              onRetryCheckpoint={t.handleRetryHoleCheckpoint}
              onUndoLastShot={t.handleUndoLastShot}
            />
          ) : (
            <ShotEntry
              key={`${hole.number}:${t.currentShot}`}
              currentHole={hole}
              currentShot={t.currentShot}
              shotHistory={t.shotHistory}
              isTeeShot={t.isTeeShot}
              isPutting={t.isPutting}
              isApproachOrAroundGreen={t.isApproachOrAroundGreen}
              usedDriver={t.usedDriver}
              resultOfShot={t.resultOfShot}
              missDirection={t.missDirection}
              puttBreak={t.puttBreak}
              puttSlope={t.puttSlope}
              puttMissTags={t.puttMissTags}
              approachMissDirection={t.approachMissDirection}
              distanceToHole={t.distanceToHole}
              distanceUnit={t.distanceUnit}
              distanceAfterShot={t.distanceAfterShot}
              distanceAfterUnit={t.distanceAfterUnit}
              undoSaving={t.undoSaving}
              showUndoConfirm={t.showUndoConfirm}
              undoError={t.state.undoError}
              distanceInputRef={t.distanceInputRef}
              dispatch={t.dispatch}
              pref={distancePref}
              ready={t.isReadyForNextShot()}
              onResultSelect={t.handleResultSelect}
              onNextShot={t.handleNextShot}
              onAddPenalty={t.handleAddPenalty}
              onUndoLastShot={t.handleUndoLastShot}
              tapIn={t.tapIn}
              onTapIn={t.handleTapIn}
              prompts={prompts}
            />
          )}
        </div>

        <CourseView
          open={courseOpen}
          onClose={() => setCourseOpen(false)}
          holes={holes}
          current={currentHoleIndex}
          shotsFor={(i) => (i === currentHoleIndex ? t.shotHistory : (holeShots?.(i) ?? null))}
          pending={holedOut ? null : { shot: t.currentShot, kind: t.shotType }}
          ball={{ value: t.distanceToHole, unit: t.distanceUnit }}
          pref={distancePref}
        />
        <UnsavedSheet open={t.pendingNavHoleIndex !== null} onStay={() => t.setPendingNavHoleIndex(null)} onDiscard={t.confirmDiscardAndNavigate} />
        <PenaltySheet
          open={t.showPenaltyModal}
          holeNumber={hole.number}
          penaltyType={t.penaltyType}
          penaltyOrigin={t.state.penaltyOrigin}
          lastEnteredShot={t.shotHistory[t.shotHistory.length - 1] ?? null}
          currentLie={t.currentLie}
          currentDistance={t.distanceToHole}
          currentUnit={t.distanceUnit}
          pref={distancePref}
          dispatch={t.dispatch}
          onConfirm={t.confirmPenalty}
        />
        {/* Mounted once a shot has been edited and kept, so closing slides the sheet out (useDialogLifetime) instead of
            dropping it in one frame (audit A-18); the last shot and form stay while it leaves. */}
        {lastEdit && (
          <EditShotSheet
            open={editOpen}
            shot={lastEdit.shot}
            form={lastEdit.form}
            hole={{ holeNumber: hole.number, par: hole.par, yardage: hole.yardage }}
            shots={t.shotHistory}
            showDeleteConfirm={t.showDeleteConfirm}
            saving={t.editSaving}
            error={t.editError}
            dispatch={t.dispatch}
            onClose={t.handleCloseEditModal}
            onSave={t.handleSaveEditedShot}
            onDelete={t.handleDeleteShot}
          />
        )}
      </main>
    </div>
  );
}
