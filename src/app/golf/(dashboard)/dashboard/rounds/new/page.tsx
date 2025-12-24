'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ShotTrackingComprehensive, { type HoleStats } from '@/components/golf/ShotTrackingComprehensive';
import { submitGolfRoundComprehensive } from '@/app/golf/actions/golf';
import { HoleConfigurationForm } from '@/components/golf/HoleConfigurationForm';
import { RoundCompletionSummary } from '@/components/golf/RoundCompletionSummary';
import type { HoleConfig } from '@/lib/types/golf-course';

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

// Default course layout (can be customized per course later)
const DEFAULT_HOLES: { par: number; yardage: number }[] = [
  { par: 4, yardage: 385 }, { par: 5, yardage: 520 }, { par: 3, yardage: 175 },
  { par: 4, yardage: 410 }, { par: 4, yardage: 395 }, { par: 4, yardage: 425 },
  { par: 3, yardage: 185 }, { par: 5, yardage: 545 }, { par: 4, yardage: 440 },
  { par: 4, yardage: 405 }, { par: 4, yardage: 380 }, { par: 3, yardage: 160 },
  { par: 5, yardage: 530 }, { par: 4, yardage: 420 }, { par: 4, yardage: 390 },
  { par: 3, yardage: 195 }, { par: 4, yardage: 435 }, { par: 5, yardage: 555 },
];

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

export default function NewRoundPage() {
  const router = useRouter();
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

  // Initialize 18 holes with default pars/yardages
  const initializeHoles = () => {
    const initialHoles: Hole[] = DEFAULT_HOLES.map((h, i) => ({
      number: i + 1,
      par: h.par,
      yardage: h.yardage,
      score: null,
    }));
    setHoles(initialHoles);
    setCompletedHoleStats([]);
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

      // Show summary modal
      setSummaryData({
        id: result.id,
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

  // ============================================================================
  // SETUP STEP
  // ============================================================================
  if (step === 'setup') {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
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
                    <label className="text-sm font-medium text-slate-700 block mb-2">
                      Course Name *
                    </label>
                    <input
                      type="text"
                      value={setupData.courseName}
                      onChange={(e) => setSetupData({ ...setupData, courseName: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-transparent outline-none"
                      placeholder="Pebble Beach Golf Links"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-2">
                        City
                      </label>
                      <input
                        type="text"
                        value={setupData.courseCity}
                        onChange={(e) => setSetupData({ ...setupData, courseCity: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-transparent outline-none"
                        placeholder="Pebble Beach"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-2">
                        State
                      </label>
                      <input
                        type="text"
                        value={setupData.courseState}
                        onChange={(e) => setSetupData({ ...setupData, courseState: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-transparent outline-none"
                        placeholder="CA"
                        maxLength={2}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-2">
                        Rating
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={setupData.courseRating}
                        onChange={(e) => setSetupData({ ...setupData, courseRating: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-transparent outline-none"
                        placeholder="72.1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-2">
                        Slope
                      </label>
                      <input
                        type="number"
                        value={setupData.courseSlope}
                        onChange={(e) => setSetupData({ ...setupData, courseSlope: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-transparent outline-none"
                        placeholder="133"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-2">
                        Tees
                      </label>
                      <select
                        value={setupData.teesPlayed}
                        onChange={(e) => setSetupData({ ...setupData, teesPlayed: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-transparent outline-none"
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
                    <label className="text-sm font-medium text-slate-700 block mb-2">
                      Round Type
                    </label>
                    <select
                      value={setupData.roundType}
                      onChange={(e) => setSetupData({ ...setupData, roundType: e.target.value as any })}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-transparent outline-none"
                    >
                      <option value="practice">Practice</option>
                      <option value="tournament">Tournament</option>
                      <option value="qualifier">Qualifier</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-2">
                      Date
                    </label>
                    <input
                      type="date"
                      value={setupData.roundDate}
                      onChange={(e) => setSetupData({ ...setupData, roundDate: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-transparent outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Stats Info Box */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <h3 className="font-medium text-emerald-800 mb-2">📊 Comprehensive Stats Tracking</h3>
                <p className="text-sm text-emerald-700">
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
                  className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 font-medium text-white hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700"
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
