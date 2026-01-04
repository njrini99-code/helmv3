'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ShotTrackingComprehensive, { type HoleStats } from '@/components/golf/ShotTrackingComprehensive';
import { submitGolfRoundComprehensive, savePartialRound, deleteInProgressRound } from '@/app/golf/actions/golf';
import { RoundCompletionSummary } from '@/components/golf/RoundCompletionSummary';
import { SaveRoundModal } from '@/components/golf/SaveRoundModal';

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

interface RoundSetupData {
  courseName: string;
  courseCity: string;
  courseState: string;
  courseRating: string;
  courseSlope: string;
  teesPlayed: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
}

interface RoundSummary {
  id: string;
  courseName: string;
  roundDate: string;
  totalScore: number;
  totalToPar: number;
  totalPutts: number;
  fairwaysHit: number;
  fairwaysTotal: number;
  greensInReg: number;
  greensTotal: number;
  birdies: number;
  eagles: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
}

interface ContinueRoundClientProps {
  roundId: string;
  setupData: RoundSetupData;
  holes: Hole[];
  completedHoleStats: HoleStats[];
  startHoleIndex: number;
}

export default function ContinueRoundClient({
  roundId,
  setupData,
  holes: initialHoles,
  completedHoleStats: initialCompletedStats,
  startHoleIndex,
}: ContinueRoundClientProps) {
  const router = useRouter();

  const [currentHoleIndex, setCurrentHoleIndex] = useState(startHoleIndex);
  const [holes, setHoles] = useState<Hole[]>(initialHoles);
  const [completedHoleStats, setCompletedHoleStats] = useState<HoleStats[]>(initialCompletedStats);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<RoundSummary | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);

  const handleHoleComplete = async (holeIndex: number, holeStats: HoleStats) => {
    // Update holes with score
    const updatedHoles = [...holes];
    updatedHoles[holeIndex] = {
      ...updatedHoles[holeIndex]!,
      score: holeStats.score,
    };
    setHoles(updatedHoles);

    // Store completed hole stats
    const updatedStats = [...completedHoleStats];
    updatedStats[holeIndex] = holeStats;
    setCompletedHoleStats(updatedStats);

    // Move to next hole or finish
    if (holeIndex < holes.length - 1) {
      setCurrentHoleIndex(holeIndex + 1);
    } else {
      // All holes complete, submit round
      await handleRoundSubmit(updatedStats);
    }
  };

  const handleRoundSubmit = async (allHoleStats: HoleStats[]) => {
    setSubmitting(true);
    setError('');

    try {
      const roundData = {
        courseName: setupData.courseName,
        courseCity: setupData.courseCity || undefined,
        courseState: setupData.courseState || undefined,
        courseRating: setupData.courseRating ? parseFloat(setupData.courseRating) : undefined,
        courseSlope: setupData.courseSlope ? parseInt(setupData.courseSlope) : undefined,
        teesPlayed: setupData.teesPlayed || undefined,
        roundType: setupData.roundType,
        roundDate: setupData.roundDate,
        holes: allHoleStats,
      };

      console.log('[Continue Round] Submitting completed round:', roundData);
      const result = await submitGolfRoundComprehensive(roundData, roundId);
      console.log('[Continue Round] Round submitted successfully:', result);

      // Calculate summary stats
      const totalScore = allHoleStats.reduce((sum, h) => sum + h.score, 0);
      const totalPar = allHoleStats.reduce((sum, h) => sum + h.par, 0);
      const totalToPar = totalScore - totalPar;
      const totalPutts = allHoleStats.reduce((sum, h) => sum + h.putts, 0);
      const fairwaysHit = allHoleStats.reduce((sum, h) => sum + (h.fairwayHit ? 1 : 0), 0);
      const fairwaysTotal = allHoleStats.filter(h => h.par >= 4).length; // Par 4s and 5s
      const greensInReg = allHoleStats.reduce((sum, h) => sum + (h.greenInRegulation ? 1 : 0), 0);
      const greensTotal = allHoleStats.length;

      // Score distribution
      let eagles = 0;
      let birdies = 0;
      let pars = 0;
      let bogeys = 0;
      let doublePlus = 0;

      allHoleStats.forEach(hole => {
        const toPar = hole.score - hole.par;
        if (toPar <= -2) eagles++;
        else if (toPar === -1) birdies++;
        else if (toPar === 0) pars++;
        else if (toPar === 1) bogeys++;
        else doublePlus++;
      });

      // Show summary modal
      setSummaryData({
        id: result.success ? result.data.roundId : roundId,
        courseName: setupData.courseName,
        roundDate: setupData.roundDate,
        totalScore,
        totalToPar,
        totalPutts,
        fairwaysHit,
        fairwaysTotal,
        greensInReg,
        greensTotal,
        birdies,
        eagles,
        pars,
        bogeys,
        doublePlus,
      });
      setSubmitting(false);
      setShowSummary(true);
    } catch (err) {
      console.error('[Continue Round] Failed to submit round - Full error:', err);
      console.error('[Continue Round] Error details:', JSON.stringify(err, null, 2));
      setError(err instanceof Error ? err.message : 'Failed to submit round');
      setSubmitting(false);
    }
  };

  const handleSaveForLater = async () => {
    try {
      const partialRoundData = {
        courseName: setupData.courseName,
        courseCity: setupData.courseCity || undefined,
        courseState: setupData.courseState || undefined,
        courseRating: setupData.courseRating ? parseFloat(setupData.courseRating) : undefined,
        courseSlope: setupData.courseSlope ? parseInt(setupData.courseSlope) : undefined,
        teesPlayed: setupData.teesPlayed || undefined,
        roundType: setupData.roundType,
        roundDate: setupData.roundDate,
        currentHole: currentHoleIndex + 1, // Next hole player will resume on
        holesToPlay: holes.length as 9 | 18,
        holes: completedHoleStats,
      };

      console.log('[Continue Round] Saving partial round progress:', partialRoundData);
      const result = await savePartialRound(partialRoundData, roundId);

      if (!result.success) {
        throw new Error(result.error);
      }

      setShowExitModal(false);

      // Redirect to rounds page
      router.push('/golf/dashboard/rounds');
    } catch (err) {
      throw err; // Let modal handle error display
    }
  };

  const handleDeleteRound = async () => {
    console.log('[Continue Round] Deleting in-progress round:', roundId);
    await deleteInProgressRound(roundId);

    setShowExitModal(false);

    // Redirect to rounds page
    router.push('/golf/dashboard/rounds');
  };

  // ============================================================================
  // SUBMITTING STATE
  // ============================================================================
  if (submitting) {
    const totalScore = completedHoleStats.reduce((sum, h) => sum + h.score, 0);
    const totalPar = completedHoleStats.reduce((sum, h) => sum + h.par, 0);
    const toPar = totalScore - totalPar;

    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-20 h-20 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Completing Round...
          </h2>
          <p className="text-slate-600 mb-4">
            Score: {totalScore} ({toPar >= 0 ? '+' : ''}{toPar})
          </p>
          <p className="text-sm text-slate-500">
            Calculating your 50+ statistics...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // TRACKING VIEW
  // ============================================================================
  return (
    <>
      {/* Header Banner */}
      <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-900">
              Continuing Round
            </p>
            <p className="text-xs text-emerald-700">
              {setupData.courseName} • Starting on hole {startHoleIndex + 1}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-emerald-700">
              {completedHoleStats.filter(s => s !== undefined).length} of {holes.length} holes
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Shot Tracking */}
      <ShotTrackingComprehensive
        holes={holes}
        currentHoleIndex={currentHoleIndex}
        onHoleComplete={handleHoleComplete}
        onExit={() => setShowExitModal(true)}
      />

      {/* Save Round Modal */}
      <SaveRoundModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onSaveForLater={handleSaveForLater}
        onDelete={handleDeleteRound}
        currentHole={currentHoleIndex + 1}
        totalHoles={holes.length}
      />

      {/* Round Completion Summary Modal */}
      {showSummary && summaryData && (
        <RoundCompletionSummary
          summary={summaryData}
          onClose={() => setShowSummary(false)}
        />
      )}
    </>
  );
}
