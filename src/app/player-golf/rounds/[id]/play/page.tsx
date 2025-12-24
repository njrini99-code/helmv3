'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ShotTrackingComprehensive, { type HoleStats } from '@/components/golf/ShotTrackingComprehensive';
import { LiveScorecard } from '@/components/golf/LiveScorecard';
import { getCourseWithHoles } from '@/app/golf/actions/courses';
import { submitGolfRoundComprehensive } from '@/app/golf/actions/golf';
import type { HoleConfig } from '@/lib/types/golf-course';

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

interface RoundInfo {
  id: string;
  courseName: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  courseId?: string;
}

export default function PlayRoundPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roundId = params.id as string;

  // Check for courseId in query params (from course selection flow)
  const courseIdParam = searchParams.get('courseId');
  const roundTypeParam = searchParams.get('type') as 'practice' | 'tournament' | 'qualifier' | null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roundInfo, setRoundInfo] = useState<RoundInfo | null>(null);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [completedHoleStats, setCompletedHoleStats] = useState<HoleStats[]>([]);

  // LiveScorecard state
  const [showFullScorecard, setShowFullScorecard] = useState(false);

  // Load round data on mount
  useEffect(() => {
    loadRoundData();
  }, [roundId, courseIdParam]);

  async function loadRoundData() {
    const supabase = createClient();

    // If courseId is provided in query params, load course data
    if (courseIdParam) {
      try {
        const { course, holes: courseHoles } = await getCourseWithHoles(courseIdParam);

        if (course && courseHoles.length === 18) {
          setHoles(courseHoles.map(h => ({
            number: h.hole_number,
            par: h.par,
            yardage: h.yardage,
            score: null,
          })));
          setRoundInfo({
            id: (typeof roundId === 'string' ? roundId : roundId?.[0]) || 'new',
            courseName: course.name,
            roundType: roundTypeParam || 'practice',
            roundDate: new Date().toISOString().split('T')[0]!,
            courseRating: course.course_rating ?? undefined,
            courseSlope: course.slope_rating ?? undefined,
            teesPlayed: course.default_tee_name ?? undefined,
            courseId: course.id,
          });
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('Error loading course:', err);
        // Fall through to default loading
      }
    }

    // Check if this is a "new" round or existing
    if (roundId === 'new') {
      // Demo data for new round - 18 holes
      setHoles([
        { number: 1, par: 4, yardage: 370, score: null },
        { number: 2, par: 3, yardage: 185, score: null },
        { number: 3, par: 5, yardage: 520, score: null },
        { number: 4, par: 4, yardage: 390, score: null },
        { number: 5, par: 4, yardage: 410, score: null },
        { number: 6, par: 3, yardage: 175, score: null },
        { number: 7, par: 5, yardage: 550, score: null },
        { number: 8, par: 4, yardage: 405, score: null },
        { number: 9, par: 4, yardage: 380, score: null },
        { number: 10, par: 4, yardage: 415, score: null },
        { number: 11, par: 3, yardage: 165, score: null },
        { number: 12, par: 5, yardage: 530, score: null },
        { number: 13, par: 4, yardage: 400, score: null },
        { number: 14, par: 4, yardage: 385, score: null },
        { number: 15, par: 3, yardage: 190, score: null },
        { number: 16, par: 5, yardage: 545, score: null },
        { number: 17, par: 4, yardage: 420, score: null },
        { number: 18, par: 4, yardage: 395, score: null },
      ]);
      setRoundInfo({
        id: 'new',
        courseName: 'Practice Round',
        roundType: roundTypeParam || 'practice',
        roundDate: new Date().toISOString().split('T')[0],
      });
      setLoading(false);
      return;
    }

    // Load existing round data
    try {
      const { data: round, error: roundError } = await supabase
        .from('golf_rounds')
        .select('id, course_id, course_name, round_type, round_date, course_rating, course_slope, tees_played')
        .eq('id', roundId)
        .single();

      if (roundError || !round) {
        setError('Round not found');
        setLoading(false);
        return;
      }

      // If round has a course_id, load course data
      if (round.course_id) {
        try {
          const { course, holes: courseHoles } = await getCourseWithHoles(round.course_id);
          if (course && courseHoles.length === 18) {
            setHoles(courseHoles.map(h => ({
              number: h.hole_number,
              par: h.par,
              yardage: h.yardage,
              score: null,
            })));
          }
        } catch (err) {
          console.error('Error loading course data:', err);
        }
      }

      setRoundInfo({
        id: round.id,
        courseName: round.course_name,
        roundType: round.round_type as 'practice' | 'tournament' | 'qualifier',
        roundDate: round.round_date,
        courseRating: round.course_rating ?? undefined,
        courseSlope: round.course_slope ?? undefined,
        teesPlayed: round.tees_played ?? undefined,
        courseId: round.course_id ?? undefined,
      });

      // Load holes if they exist
      const { data: existingHoles } = await supabase
        .from('golf_holes')
        .select('hole_number, par, yardage, score')
        .eq('round_id', roundId)
        .order('hole_number');

      if (existingHoles && existingHoles.length > 0) {
        setHoles(existingHoles.map(h => ({
          number: h.hole_number,
          par: h.par,
          yardage: h.yardage || 400,
          score: h.score,
        })));
        // Find first incomplete hole
        const firstIncomplete = existingHoles.findIndex(h => h.score === null);
        setCurrentHoleIndex(firstIncomplete === -1 ? 0 : firstIncomplete);
      } else if (holes.length === 0) {
        // Default 18 holes if none exist and no course loaded
        setHoles([
          { number: 1, par: 4, yardage: 370, score: null },
          { number: 2, par: 3, yardage: 185, score: null },
          { number: 3, par: 5, yardage: 520, score: null },
          { number: 4, par: 4, yardage: 390, score: null },
          { number: 5, par: 4, yardage: 410, score: null },
          { number: 6, par: 3, yardage: 175, score: null },
          { number: 7, par: 5, yardage: 550, score: null },
          { number: 8, par: 4, yardage: 405, score: null },
          { number: 9, par: 4, yardage: 380, score: null },
          { number: 10, par: 4, yardage: 415, score: null },
          { number: 11, par: 3, yardage: 165, score: null },
          { number: 12, par: 5, yardage: 530, score: null },
          { number: 13, par: 4, yardage: 400, score: null },
          { number: 14, par: 4, yardage: 385, score: null },
          { number: 15, par: 3, yardage: 190, score: null },
          { number: 16, par: 5, yardage: 545, score: null },
          { number: 17, par: 4, yardage: 420, score: null },
          { number: 18, par: 4, yardage: 395, score: null },
        ]);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading round:', err);
      setError('Failed to load round');
      setLoading(false);
    }
  }

  const handleHoleComplete = async (holeIndex: number, stats: HoleStats) => {
    console.log('Hole complete:', {
      holeIndex,
      holeNumber: stats.holeNumber,
      score: stats.score,
      putts: stats.putts,
      fairwayHit: stats.fairwayHit,
      gir: stats.greenInRegulation,
      drivingDistance: stats.drivingDistance,
      approachProximity: stats.approachProximity,
      firstPuttDistance: stats.firstPuttDistance,
      totalShots: stats.shots.length
    });

    // Store the completed hole stats
    const updatedHoleStats = [...completedHoleStats];
    updatedHoleStats[holeIndex] = stats;
    setCompletedHoleStats(updatedHoleStats);

    // Update score in display state
    const updatedHoles = [...holes];
    const currentHole = updatedHoles[holeIndex];
    if (currentHole) {
      currentHole.score = stats.score;
      setHoles(updatedHoles);
    }

    // Move to next hole or finish round
    if (holeIndex < 17) {
      setCurrentHoleIndex(holeIndex + 1);
      console.log(`Moving to hole ${holeIndex + 2}`);
    } else {
      // Round complete - save everything to database
      await saveCompleteRound(updatedHoleStats);
    }
  };

  const saveCompleteRound = async (allHoleStats: HoleStats[]) => {
    if (!roundInfo) return;

    setSaving(true);
    setError(null);

    try {
      // Calculate totals for display
      const totalScore = allHoleStats.reduce((sum, h) => sum + h.score, 0);
      const totalPar = allHoleStats.reduce((sum, h) => sum + h.par, 0);
      const toPar = totalScore - totalPar;

      console.log('Saving complete round:', {
        totalScore,
        toPar,
        holesCount: allHoleStats.length,
        courseId: roundInfo.courseId,
      });

      // Call server action to save to database
      const savedRound = await submitGolfRoundComprehensive({
        courseName: roundInfo.courseName,
        roundType: roundInfo.roundType,
        roundDate: roundInfo.roundDate,
        courseRating: roundInfo.courseRating,
        courseSlope: roundInfo.courseSlope,
        teesPlayed: roundInfo.teesPlayed,
        courseId: roundInfo.courseId, // Include course ID if available
        holes: allHoleStats,
      });

      console.log('Round saved successfully:', savedRound.id);

      // Show completion message and redirect
      alert(`Round complete!\n\nTotal Score: ${totalScore} (${toPar >= 0 ? '+' : ''}${toPar})\n\nYour stats have been saved.`);
      router.push('/player-golf/rounds');
    } catch (err) {
      console.error('Failed to save round:', err);
      setError('Failed to save round. Please try again.');
      setSaving(false);
    }
  };

  // Convert completed holes to scorecard format
  const scorecardHoles: HoleConfig[] = holes.map(h => ({
    holeNumber: h.number,
    par: h.par,
    yardage: h.yardage,
  }));

  const scorecardScores = holes.map(hole => {
    const completed = completedHoleStats.find(h => h.holeNumber === hole.number);
    return {
      holeNumber: hole.number,
      score: completed?.score ?? hole.score ?? null,
      putts: completed?.putts ?? null,
      fairwayHit: completed?.fairwayHit ?? null,
      greenInRegulation: completed?.greenInRegulation ?? null,
    };
  });

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600">Loading round...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !saving) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Error</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/player-golf')}
            className="px-6 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Saving state overlay
  if (saving) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-3 border-green-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-lg font-semibold text-slate-900">Saving your round...</p>
          <p className="text-slate-500 mt-1">Please wait while we save all your shots and stats.</p>
        </div>
      </div>
    );
  }

  const currentHole = holes[currentHoleIndex];

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      {/* Header with Scorecard Toggle */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-semibold text-slate-900">{roundInfo?.courseName || 'Golf Round'}</h1>
              {currentHole && (
                <p className="text-xs text-slate-500">
                  Hole {currentHole.number} • Par {currentHole.par} • {currentHole.yardage} yds
                </p>
              )}
            </div>
            <button
              onClick={() => setShowFullScorecard(!showFullScorecard)}
              className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              title="Toggle scorecard"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Full Scorecard (collapsible) */}
      {showFullScorecard && (
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-lg mx-auto p-4">
            <LiveScorecard
              holes={scorecardHoles}
              scores={scorecardScores}
              currentHole={currentHoleIndex + 1}
              onHoleSelect={(num) => setCurrentHoleIndex(num - 1)}
            />
          </div>
        </div>
      )}

      {/* Compact Scorecard (always visible when full scorecard is hidden) */}
      {!showFullScorecard && (
        <div className="max-w-lg mx-auto px-4 py-2">
          <LiveScorecard
            holes={scorecardHoles}
            scores={scorecardScores}
            currentHole={currentHoleIndex + 1}
            onHoleSelect={(num) => setCurrentHoleIndex(num - 1)}
            compact
          />
        </div>
      )}

      {/* Shot Tracker */}
      <div className="pb-20">
        <ShotTrackingComprehensive
          holes={holes}
          currentHoleIndex={currentHoleIndex}
          onHoleComplete={handleHoleComplete}
        />
      </div>
    </div>
  );
}
