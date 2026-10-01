'use client';

import { Check, CloudOff, Smartphone, Table2, X } from 'lucide-react';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { useShotTracking, type ShotTrackingPorts, type ShotTrackingProps } from '@/hooks/golf/use-shot-tracking';
import { calculateHoleStats } from '@/lib/utils/shot-helpers';
import type { ChRoundType, ChTeeColor } from '../../../data/rounds-shape';
import { haptic } from '../../../lib/haptics';
import { usePhoneTabsHidden } from '../../../shell/phone-chrome';
import { Icon } from '../../../ui/Icon';
import { ScoreMark } from '../../../ui/ScoreMark';
import { TeeSwatch, TYPE_LABEL } from '../parts';
import { HoleReview } from './HoleReview';
import { heroDistance, scoreName, shotKind } from './labels';
import { HoleMap, ShotLog, TrackStrip } from './parts';
import { EditShotSheet, PenaltySheet, UnsavedSheet } from './sheets';
import { ShotEntry } from './ShotEntry';
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
};

// CH-11706: going to another hole is a selection tick. Module-level, so the
// hook's navigation callbacks keep their identity (ShotTrackingPorts).
const PORTS: ShotTrackingPorts = { haptic: () => haptic('select') };

// "Round saved" only for a server acknowledgement. A save held on the device (offline, waiting on another save, or
// refused until a reload) says where the shots are instead (swap audit R-1).
const SAVE_WORDS = { saving: 'Saving round', saved: 'Round saved', error: 'Not synced yet, retrying', device: 'Saved on this phone' } as const;

/**
 * The shot screen, Clubhouse's renderer (board `rounds-track.jsx`). All of its
 * logic is useShotTracking, shared with the Fairway screen: recording a shot,
 * the hole-out checkpoint and its retry, undo, penalties, edits, and moving
 * between holes. The round screen around it owns the round: it passes the
 * holes, moves to the next hole once one is saved, and owns Exit, the
 * scorecard and submitting (see `round-sheets.tsx`).
 */
export function RoundTracking(props: RoundTrackingProps) {
  const { round, holes, currentHoleIndex, onExit, onNavigateToHole, onOpenScorecard, onAutoSave, statusSlot } = props;
  const t = useShotTracking(props, PORTS);
  // A round is a full-screen flow on the phone: Exit and Scorecard are in its own top bar.
  usePhoneTabsHidden(true);
  const { distancePref } = useDistanceUnits();
  const hole = t.currentHole;

  if (!hole) {
    return (
      <div className="ch-rt ch-rt--empty" role="alert" data-ch-code="CH-11207">
        <p>This hole didn&rsquo;t load. Go back to Rounds and continue the round from there.</p>
      </div>
    );
  }

  const holedOut = t.shotHistory.length > 0 && t.shotHistory[t.shotHistory.length - 1]?.result === 'hole';
  const frontier = holes.findIndex((h) => h.score === null);
  const backTo = holedOut && !!onNavigateToHole && frontier >= 0 && frontier !== currentHoleIndex ? { index: frontier, number: holes[frontier]!.number } : null;
  const stats = holedOut ? calculateHoleStats(t.shotHistory, hole) : null;
  const far = heroDistance(t.distanceToHole, t.distanceUnit, distancePref);
  const saveState = t.autoSaveStatus === 'idle' && t.autoSaveHeldOnDevice ? 'device' : t.autoSaveStatus;
  const meta = [round.teeLabel && `${round.teeLabel} tees`, round.type && TYPE_LABEL[round.type]].filter(Boolean).join(' · ');

  return (
    <div className="ch-rt" data-ui="clubhouse">
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
          <b>{round.course}</b>
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
            <span>Scorecard</span>
          </button>
        ) : (
          <span />
        )}
      </header>
      {statusSlot}
      {onAutoSave && saveState !== 'idle' && (
        // CH-11901: the round's background save, in words (retrying on its own when it fails).
        <p className={'ch-rt-sync is-' + saveState} role="status" data-ch-code="CH-11901">
          {saveState === 'error' ? (
            <Icon icon={CloudOff} size={13} />
          ) : saveState === 'saved' ? (
            <Icon icon={Check} size={13} />
          ) : saveState === 'device' ? (
            <Icon icon={Smartphone} size={13} />
          ) : (
            <span className="ch-rt-spin ch-rt-spin--sm" aria-hidden="true" />
          )}
          {SAVE_WORDS[saveState]}
        </p>
      )}
      <TrackStrip holes={holes} current={currentHoleIndex} onJump={onNavigateToHole ? t.handleNavigateToHole : undefined} />

      <div className="ch-rt-body">
        <section className="ch-rt-hero" aria-label={`Hole ${hole.number}`}>
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
          </div>
          <HoleMap hole={hole} shots={t.shotHistory} pending={!holedOut} />
          <ShotLog shots={t.shotHistory} pref={distancePref} />
        </section>

        {holedOut ? (
          <HoleReview
            hole={hole}
            shots={t.shotHistory}
            pref={distancePref}
            checkpointStatus={t.holeCheckpointStatus}
            backTo={backTo}
            showUndoConfirm={t.showUndoConfirm}
            undoSaving={t.undoSaving}
            undoError={t.state.undoError}
            dispatch={t.dispatch}
            onEditShot={t.handleEditShot}
            onNavigateToHole={t.handleNavigateToHole}
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
          />
        )}
      </div>

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
      {t.showEditModal && t.editingShot && t.editFormData && (
        <EditShotSheet
          open
          shot={t.editingShot}
          form={t.editFormData}
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
    </div>
  );
}
