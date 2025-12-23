'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ShotTrackingComprehensive, { type HoleStats } from '@/components/golf/ShotTrackingComprehensive';
import { submitGolfRoundComprehensive } from '@/app/golf/actions/golf';

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

export default function NewRoundPage() {
  const router = useRouter();
  const [step, setStep] = useState<'setup' | 'tracking' | 'submitting'>('setup');
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
    initializeHoles();
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

      const result = await submitGolfRoundComprehensive(roundData);
      router.push(`/golf/dashboard/rounds/${result.id}`);
    } catch (err) {
      console.error('Failed to submit round:', err);
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
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
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
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
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
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
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
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
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
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
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
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
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
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
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
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
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
                  className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 font-medium text-white hover:bg-green-700 transition-colors"
                >
                  Start Round →
                </button>
              </div>
            </form>
          </div>
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
    <ShotTrackingComprehensive
      holes={holes}
      currentHoleIndex={currentHoleIndex}
      onHoleComplete={handleHoleComplete}
    />
  );
}
