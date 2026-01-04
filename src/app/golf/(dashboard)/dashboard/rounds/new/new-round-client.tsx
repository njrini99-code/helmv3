'use client';

import { useState, useEffect } from 'react';
import { ShineEffect } from '@/components/ui/shine-effect';
import { useRouter } from 'next/navigation';
import ShotTrackingComprehensive, { type HoleStats } from '@/components/golf/ShotTrackingComprehensive';
import { submitGolfRoundComprehensive, savePartialRound, deleteInProgressRound } from '@/app/golf/actions/golf';
import { HoleConfigurationForm } from '@/components/golf/HoleConfigurationForm';
import { RoundCompletionSummary } from '@/components/golf/RoundCompletionSummary';
import { SaveRoundModal } from '@/components/golf/SaveRoundModal';
import type { HoleConfig } from '@/lib/types/golf-course';
import { useRoundDraft } from '@/hooks/use-round-draft';

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

interface RoundSetupForm {
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

export default function NewRoundClient() {
  const router = useRouter();
  const { saveDraftDebounced, loadDraft, clearDraft, hasDraft, getDraftAge } = useRoundDraft();

  const [step, setStep] = useState<'setup' | 'holes' | 'tracking' | 'submitting'>('setup');
  const [setupData, setSetupData] = useState<RoundSetupForm>({
    courseName: '',
    courseCity: '',
    courseState: '',
    courseRating: '',
    courseSlope: '',
    teesPlayed: 'White',
    roundType: 'practice',
    roundDate: new Date().toISOString().split('T')[0]!,
  });
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [completedHoleStats, setCompletedHoleStats] = useState<HoleStats[]>([]);
  const [error, setError] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<RoundSummary | null>(null);
  const [showDraftRecovery, setShowDraftRecovery] = useState(false);
  const [draftAge, setDraftAge] = useState<number | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [savedRoundId, setSavedRoundId] = useState<string | null>(null);

  // Check for draft on mount
  useEffect(() => {
    if (hasDraft()) {
      const age = getDraftAge();
      setDraftAge(age);
      setShowDraftRecovery(true);
    }
  }, [hasDraft, getDraftAge]);

  // Auto-save draft whenever state changes
  useEffect(() => {
    // Don't save if we haven't started (still on setup with no data)
    if (step === 'setup' && !setupData.courseName) {
      return;
    }

    // Don't save while submitting
    if (step === 'submitting') {
      return;
    }

    // Save draft
    saveDraftDebounced({
      step,
      setupData,
      holes,
      completedHoleStats,
      currentHoleIndex,
    });
  }, [step, setupData, holes, completedHoleStats, currentHoleIndex, saveDraftDebounced]);

  const handleRestoreDraft = () => {
    const draft = loadDraft();
    if (!draft) {
      setShowDraftRecovery(false);
      return;
    }

    // Restore all state from draft
    setStep(draft.step);
    setSetupData(draft.setupData);
    setHoles(draft.holes);
    setCompletedHoleStats(draft.completedHoleStats);
    setCurrentHoleIndex(draft.currentHoleIndex);
    setShowDraftRecovery(false);
  };

  const handleStartFresh = () => {
    clearDraft();
    setShowDraftRecovery(false);
  };

  const handleSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData.courseName) {
      setError('Please enter a course name');
      return;
    }
    setStep('holes');
  };

  const handleHolesSave = (configuredHoles: HoleConfig[]) => {
    // Convert HoleConfig to Hole format
    const initialHoles: Hole[] = configuredHoles.map((h) => ({
      number: h.holeNumber,
      par: h.par,
      yardage: h.yardage,
      score: null,
    }));
    setHoles(initialHoles);
    setCompletedHoleStats([]);
    setStep('tracking');
  };

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
    setStep('submitting');
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

      console.log('Submitting round data:', roundData);
      const result = await submitGolfRoundComprehensive(roundData);
      if (!result.success) {
        throw new Error(result.error);
      }
      console.log('Round submitted successfully:', result);

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

      // Clear draft after successful submission
      clearDraft();

      // Show summary modal
      setSummaryData({
        id: result.success ? result.data.roundId : '',
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
      setStep('tracking'); // Change step back so modal can render
      setShowSummary(true);
    } catch (err) {
      console.error('Failed to submit round - Full error:', err);
      console.error('Error details:', JSON.stringify(err, null, 2));
      setError(err instanceof Error ? err.message : 'Failed to submit round');
      setStep('tracking');
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
        holeConfigs: holes.map(hole => ({
          holeNumber: hole.number,
          par: hole.par,
          yardage: hole.yardage,
        })),
      };

      const result = await savePartialRound(partialRoundData, savedRoundId || undefined);

      if (!result.success) {
        throw new Error(result.error);
      }
      setSavedRoundId(result.data.roundId);

      // Clear local draft since it's saved to database
      clearDraft();
      setShowExitModal(false);

      // Redirect to rounds page
      router.push('/golf/dashboard/rounds');
    } catch (err) {
      throw err; // Let modal handle error display
    }
  };

  const handleDeleteRound = async () => {
    if (savedRoundId) {
      // Delete from database if it exists
      await deleteInProgressRound(savedRoundId);
    }

    // Clear local draft
    clearDraft();
    setShowExitModal(false);

    // Redirect to rounds page
    router.push('/golf/dashboard/rounds');
  };

  // ============================================================================
  // SETUP STEP
  // ============================================================================
  if (step === 'setup') {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="relative glass-standard rounded-2xl overflow-hidden p-8">
            <ShineEffect />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2">
              New Round
            </h1>
            <p className="text-slate-500 text-sm mb-6">
              Track your round shot-by-shot for comprehensive stats
            </p>

            <form onSubmit={handleSetupSubmit} className="space-y-6">
              {/* Course Info */}
              <div>
                <h2 className="text-lg font-medium text-slate-900 mb-4">Course Information</h2>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="courseName" className="text-sm font-medium text-slate-700 block mb-2">
                      Course Name *
                    </label>
                    <input
                      id="courseName"
                      type="text"
                      value={setupData.courseName}
                      onChange={(e) => setSetupData({ ...setupData, courseName: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
                      placeholder="Pebble Beach Golf Links"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="courseCity" className="text-sm font-medium text-slate-700 block mb-2">
                        City
                      </label>
                      <input
                        id="courseCity"
                        type="text"
                        value={setupData.courseCity}
                        onChange={(e) => setSetupData({ ...setupData, courseCity: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
                        placeholder="Pebble Beach"
                      />
                    </div>
                    <div>
                      <label htmlFor="courseState" className="text-sm font-medium text-slate-700 block mb-2">
                        State
                      </label>
                      <input
                        id="courseState"
                        type="text"
                        value={setupData.courseState}
                        onChange={(e) => setSetupData({ ...setupData, courseState: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
                        placeholder="CA"
                        maxLength={2}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="courseRating" className="text-sm font-medium text-slate-700 block mb-2">
                        Rating
                      </label>
                      <input
                        id="courseRating"
                        type="number"
                        step="0.1"
                        value={setupData.courseRating}
                        onChange={(e) => setSetupData({ ...setupData, courseRating: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
                        placeholder="72.1"
                      />
                    </div>
                    <div>
                      <label htmlFor="courseSlope" className="text-sm font-medium text-slate-700 block mb-2">
                        Slope
                      </label>
                      <input
                        id="courseSlope"
                        type="number"
                        value={setupData.courseSlope}
                        onChange={(e) => setSetupData({ ...setupData, courseSlope: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
                        placeholder="133"
                        aria-label="Course slope rating"
                      />
                    </div>
                    <div>
                      <label htmlFor="teesPlayed" className="text-sm font-medium text-slate-700 block mb-2">
                        Tees
                      </label>
                      <select
                        id="teesPlayed"
                        value={setupData.teesPlayed}
                        onChange={(e) => setSetupData({ ...setupData, teesPlayed: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
                      >
                        <option>Championship</option>
                        <option>Black</option>
                        <option>Blue</option>
                        <option>White</option>
                        <option>Gold</option>
                        <option>Red</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Round Info */}
              <div>
                <h2 className="text-lg font-medium text-slate-900 mb-4">Round Details</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="roundType" className="text-sm font-medium text-slate-700 block mb-2">
                      Round Type
                    </label>
                    <select
                      id="roundType"
                      value={setupData.roundType}
                      onChange={(e) => setSetupData({ ...setupData, roundType: e.target.value as 'practice' | 'tournament' | 'qualifier' })}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
                    >
                      <option value="practice">Practice</option>
                      <option value="tournament">Tournament</option>
                      <option value="qualifier">Qualifier</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="roundDate" className="text-sm font-medium text-slate-700 block mb-2">
                      Date
                    </label>
                    <input
                      id="roundDate"
                      type="date"
                      value={setupData.roundDate}
                      onChange={(e) => setSetupData({ ...setupData, roundDate: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Stats Info Box */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <h3 className="font-medium text-green-800 mb-2">📊 Comprehensive Stats Tracking</h3>
                <p className="text-sm text-green-700">
                  This round will track 50+ statistics including driving distance, approach proximity,
                  putting efficiency, scrambling, and more. Use your rangefinder for accurate distances.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 font-medium text-white hover:bg-green-700 transition-colors shadow-sm shadow-green-950/10 ring-1 ring-green-700"
                >
                  Next: Configure Holes →
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // HOLES CONFIGURATION STEP
  // ============================================================================
  if (step === 'holes') {
    return (
      <div className="min-h-screen bg-[#FAF6F1]">
        <div className="max-w-lg mx-auto px-4 py-6">
          <HoleConfigurationForm
            courseName={setupData.courseName}
            onSave={handleHolesSave}
            onBack={() => setStep('setup')}
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // SUBMITTING STEP
  // ============================================================================
  if (step === 'submitting') {
    const totalScore = completedHoleStats.reduce((sum, h) => sum + h.score, 0);
    const totalPar = completedHoleStats.reduce((sum, h) => sum + h.par, 0);
    const toPar = totalScore - totalPar;

    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-20 h-20 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Saving Round...
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
  // TRACKING STEP
  // ============================================================================
  return (
    <>
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

      {/* Draft Recovery Modal */}
      {showDraftRecovery && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="mb-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 text-center mb-2">
                Resume Your Round?
              </h3>
              <p className="text-sm text-slate-600 text-center">
                We found a saved draft from {draftAge !== null && draftAge < 60 ? `${draftAge} minutes ago` : draftAge !== null ? `${Math.floor(draftAge / 60)} hours ago` : 'earlier'}.
                Would you like to continue where you left off?
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleStartFresh}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Start Fresh
              </button>
              <button
                onClick={handleRestoreDraft}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 font-medium text-white hover:bg-green-700 transition-colors shadow-sm shadow-green-950/10 ring-1 ring-green-700"
              >
                Resume Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
