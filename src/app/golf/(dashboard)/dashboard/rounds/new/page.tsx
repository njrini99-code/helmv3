'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ShotTrackingFinal from '@/components/golf/ShotTrackingFinal';
import { submitGolfRound } from '@/app/golf/actions/golf';
import type { ShotRecord } from '@/lib/types/golf';

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

export default function NewRoundPage() {
  const router = useRouter();
  const [step, setStep] = useState<'setup' | 'tracking'>('setup');
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
  const [holeShots, setHoleShots] = useState<ShotRecord[][]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Initialize 18 holes with default pars
  const initializeHoles = () => {
    const defaultHoles: Hole[] = Array.from({ length: 18 }, (_, i) => ({
      number: i + 1,
      par: i < 4 || (i >= 9 && i < 13) ? 4 : i === 2 || i === 11 ? 3 : 5,
      yardage: i < 4 || (i >= 9 && i < 13) ? 370 : i === 2 || i === 11 ? 180 : 520,
      score: null,
    }));
    setHoles(defaultHoles);
    setHoleShots(Array(18).fill([]));
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

  const handleHoleComplete = (holeIndex: number, score: number, shots: ShotRecord[]) => {
    const updatedHoles = [...holes];
    const hole = updatedHoles[holeIndex];
    updatedHoles[holeIndex] = {
      number: hole.number,
      par: hole.par,
      yardage: hole.yardage,
      score,
    };
    setHoles(updatedHoles);

    const updatedShots = [...holeShots];
    updatedShots[holeIndex] = shots;
    setHoleShots(updatedShots);

    // Move to next hole or finish
    if (holeIndex < holes.length - 1) {
      setCurrentHoleIndex(holeIndex + 1);
    } else {
      // All holes complete, submit round
      handleRoundSubmit(updatedHoles);
    }
  };

  const handleRoundSubmit = async (completedHoles: Hole[]) => {
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
        holes: completedHoles.map(hole => ({
          holeNumber: hole.number,
          par: hole.par,
          score: hole.score || hole.par,
          putts: undefined,
          fairwayHit: undefined,
          greenInRegulation: undefined,
          penalties: 0,
        })),
      };

      const result = await submitGolfRound(roundData);
      router.push(`/golf/dashboard/rounds/${result.id}`);
    } catch (err) {
      console.error('Failed to submit round:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit round');
      setSubmitting(false);
    }
  };

  if (step === 'setup') {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-6">
              New Round
            </h1>

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
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100"
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
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100"
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
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100"
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
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100"
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
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100"
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
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100"
                      >
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
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100"
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
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100"
                      required
                    />
                  </div>
                </div>
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
                  Start Round
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Tracking step
  if (submitting) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Submitting round...</p>
        </div>
      </div>
    );
  }

  return (
    <ShotTrackingFinal
      holes={holes}
      currentHoleIndex={currentHoleIndex}
      onHoleComplete={handleHoleComplete}
    />
  );
}
