'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconChevronLeft, IconChevronRight, IconCheck } from '@/components/icons';
import { getRecentCourses, getCourseFromRound, type RecentCourse } from '../../actions/courses';
import { createRound } from '../../actions/rounds';
import { createRoundDevMode } from '../../actions/rounds-dev';
import { CourseSelector } from '@/components/golf/CourseSelector';
import { getSavedCourses, getCourseWithHoles } from '@/app/golf/actions/courses';
import type { GolfCourse } from '@/lib/types/golf-course';

type RoundType = 'practice' | 'qualifying' | 'tournament';
type StartingHole = 1 | 10 | 'shotgun';

interface HoleData {
  hole: number;
  par: number;
  yardage: number;
}

export default function NewRoundPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(0); // Start at 0 for course selection
  const [loading, setLoading] = useState(false);

  // Course Selection (NEW - Step 0)
  const [selectedCourse, setSelectedCourse] = useState<GolfCourse | null>(null);
  const [useNewCourse, setUseNewCourse] = useState(false);

  // Step 1: Course Name
  const [courseName, setCourseName] = useState('');
  const [courseCity, setCourseCity] = useState('');
  const [courseState, setCourseState] = useState('');
  const [recentCourses, setRecentCourses] = useState<RecentCourse[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Step 2: Tee Box Name
  const [teeBoxName, setTeeBoxName] = useState('');

  // Step 3: Holes Data (Front 9 & Back 9)
  const [holesData, setHolesData] = useState<HoleData[]>(
    Array.from({ length: 18 }, (_, i) => ({
      hole: i + 1,
      par: 4,
      yardage: 0,
    }))
  );

  // Step 4: Course Rating
  const [courseRating, setCourseRating] = useState<string>('72.0');

  // Step 5: Slope Rating
  const [slopeRating, setSlopeRating] = useState<string>('113');

  // Step 6: Round Type
  const [roundType, setRoundType] = useState<RoundType>('practice');

  // Step 7: Starting Hole
  const [startingHole, setStartingHole] = useState<StartingHole>(1);

  // Load recent courses on mount
  useEffect(() => {
    async function loadRecentCourses() {
      try {
        const courses = await getRecentCourses();
        setRecentCourses(courses);
      } catch (error) {
        console.error('Error loading recent courses:', error);
      } finally {
        setLoadingRecent(false);
      }
    }
    loadRecentCourses();
  }, []);

  // Auto-populate from course creation (uses sessionStorage instead of DB query)
  useEffect(() => {
    const newCourseDataStr = sessionStorage.getItem('newCourseData');
    if (!newCourseDataStr) return;

    try {
      const newCourseData = JSON.parse(newCourseDataStr);

      // Populate all fields directly from the data the user just entered
      setSelectedCourse({ id: newCourseData.courseId } as GolfCourse);
      setCourseName(newCourseData.courseName);
      setCourseCity(newCourseData.city || '');
      setCourseState(newCourseData.state || '');
      setTeeBoxName(newCourseData.teeName || '');
      setCourseRating(newCourseData.courseRating?.toString() || '72.0');
      setSlopeRating(newCourseData.slopeRating?.toString() || '113');

      // Load hole data directly from what they configured
      const loadedHoles = newCourseData.holes.map((h: any) => ({
        hole: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
      }));
      setHolesData(loadedHoles);

      // Skip to round type (step 4)
      setCurrentStep(4);

      // Clear sessionStorage after using
      sessionStorage.removeItem('newCourseData');
    } catch (error) {
      console.error('Error loading course data from sessionStorage:', error);
      sessionStorage.removeItem('newCourseData');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle selecting a saved course
  const handleSelectSavedCourse = async (course: GolfCourse | null) => {
    if (!course) return;

    try {
      setLoading(true);
      const { course: courseData, holes } = await getCourseWithHoles(course.id);

      if (!courseData || holes.length !== 18) {
        throw new Error('Invalid course data');
      }

      setSelectedCourse(courseData);
      setCourseName(courseData.name);
      setCourseCity(courseData.city || '');
      setCourseState(courseData.state || '');
      setTeeBoxName(courseData.default_tee_name || '');
      setCourseRating(courseData.course_rating?.toString() || '72.0');
      setSlopeRating(courseData.slope_rating?.toString() || '113');

      // Load hole data
      const loadedHoles = holes.map(h => ({
        hole: h.hole_number,
        par: h.par,
        yardage: h.yardage,
      }));
      setHolesData(loadedHoles);

      // Skip to round type (step 6 in original flow, now step 4)
      setCurrentStep(4);
    } catch (error) {
      console.error('Error loading course:', error);
      alert('Failed to load course data');
    } finally {
      setLoading(false);
    }
  };

  // Handle creating new course
  const handleCreateNewCourse = () => {
    // Navigate to course setup page
    const params = new URLSearchParams({
      type: roundType,
      returnTo: '/player-golf/round/new'
    });
    router.push(`/player-golf/rounds/new/course-setup?${params.toString()}`);
  };

  // Handle manual entry (skip saved courses)
  const handleManualEntry = () => {
    setUseNewCourse(true);
    setCurrentStep(1);
  };

  // Handle selecting a recent course
  const handleSelectRecentCourse = async (course: RecentCourse) => {
    try {
      setLoading(true);
      const roundData = await getCourseFromRound(course.course_name, course.tees_played);

      setCourseName(course.course_name);
      setTeeBoxName(course.tees_played);

      // Load hole data from golf_holes
      if (roundData.golf_holes && roundData.golf_holes.length > 0) {
        const loadedHoles = roundData.golf_holes.map((gh: any) => ({
          hole: gh.hole_number,
          par: gh.par,
          yardage: 0, // Yardage not stored in golf_holes
        }));
        setHolesData(loadedHoles);
      }

      // Auto-advance to step 3 (holes data)
      setCurrentStep(3);
    } catch (error) {
      console.error('Error loading course data:', error);
      // On error, just set the name and let user continue manually
      setCourseName(course.course_name);
      setTeeBoxName(course.tees_played);
      setCurrentStep(2);
    } finally {
      setLoading(false);
    }
  };

  // Handle hole data change
  const updateHoleData = (holeIndex: number, field: 'par' | 'yardage', value: number) => {
    const updated = [...holesData];
    const currentHole = updated[holeIndex];
    if (!currentHole) return;

    updated[holeIndex] = {
      hole: currentHole.hole,
      par: field === 'par' ? value : currentHole.par,
      yardage: field === 'yardage' ? value : currentHole.yardage,
    };
    setHolesData(updated);
  };

  // Validation functions
  const canProceedFromStep1 = () => courseName.trim().length > 0;
  const canProceedFromStep2 = () => teeBoxName.trim().length > 0;
  const canProceedFromStep3 = () => {
    // All holes must have yardage > 0
    return holesData.every(h => h.yardage > 0 && h.par > 0);
  };
  const canProceedFromStep4 = () => {
    const rating = parseFloat(courseRating);
    return !isNaN(rating) && rating >= 67.0 && rating <= 77.0;
  };
  const canProceedFromStep5 = () => {
    const slope = parseInt(slopeRating);
    return !isNaN(slope) && slope >= 55 && slope <= 155;
  };

  // Handle final round creation
  const handleCreateRound = async () => {
    try {
      setLoading(true);

      const roundData = {
        courseName,
        courseCity,
        courseState,
        teesPlayed: teeBoxName,
        courseRating: parseFloat(courseRating),
        courseSlope: parseInt(slopeRating),
        roundType,
        startingHole,
        roundDate: new Date().toISOString().split('T')[0]!,
        holes: holesData,
        courseId: selectedCourse?.id, // Include course ID if from saved course
      };

      // Try dev mode first (no auth required)
      let round;
      try {
        console.log('Attempting DEV MODE round creation (no auth)...');
        round = await createRoundDevMode(roundData);
        console.log('✅ DEV MODE: Round created successfully!', round.id);
      } catch (devError) {
        console.log('DEV MODE failed, trying authenticated mode...', devError);
        // Fall back to authenticated mode
        round = await createRound(roundData);
      }

      // Navigate to the round tracking page
      router.push(`/player-golf/round/${round.id}`);
    } catch (error) {
      console.error('Error creating round:', error);
      const errorMessage = (error as Error).message;
      alert('Failed to create round: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    } else {
      handleCreateRound();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return true; // Course selection
      case 1: return canProceedFromStep1();
      case 2: return canProceedFromStep2();
      case 3: return canProceedFromStep3();
      case 4: return true; // Round type
      case 5: return true; // Starting hole
      case 6: return true; // Confirmation
      default: return false;
    }
  };

  const getTotalSteps = () => {
    // If using saved course: skip steps 1-3, so 4 total steps (course select, round type, starting hole, confirm)
    // If manual entry: all 7 steps
    return selectedCourse ? 4 : 7;
  };

  const getCurrentStepDisplay = () => {
    if (selectedCourse) {
      // Adjusted numbering for saved course flow
      if (currentStep === 0) return 1;
      if (currentStep === 4) return 2;
      if (currentStep === 5) return 3;
      if (currentStep === 6) return 4;
    }
    return currentStep + 1;
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Start New Round</h1>
          <span className="text-sm leading-relaxed text-slate-500">
            Step {getCurrentStepDisplay()} of {getTotalSteps()}
          </span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-900 transition-all duration-300"
            style={{ width: `${(getCurrentStepDisplay() / getTotalSteps()) * 100}%` }}
          />
        </div>
      </div>

      <Card glass>
        <CardContent className="p-8">
          {/* Step 0: Course Selection */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-2">Select Course</h2>
                <p className="text-sm leading-relaxed text-slate-500">
                  Choose a saved course or enter course details manually
                </p>
              </div>

              <CourseSelector
                onSelectCourse={handleSelectSavedCourse}
                onCreateNew={handleCreateNewCourse}
                selectedCourseId={selectedCourse?.id}
              />

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-slate-500">or</span>
                </div>
              </div>

              <button
                onClick={handleManualEntry}
                className="w-full p-4 border border-slate-200 rounded-xl
                           text-slate-700 font-medium hover:bg-slate-50 transition-colors"
              >
                Enter Course Details Manually
              </button>
            </div>
          )}

          {/* Step 1: Course Name */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-2">Enter Course Name</h2>
                <p className="text-sm leading-relaxed text-slate-500">
                  What course are you playing today?
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Course Name
                </label>
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g., Pebble Beach Golf Links"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200
                             focus:border-green-500 focus:ring-2 focus:ring-green-100
                             text-slate-900 placeholder:text-slate-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    City (Optional)
                  </label>
                  <input
                    type="text"
                    value={courseCity}
                    onChange={(e) => setCourseCity(e.target.value)}
                    placeholder="e.g., Pebble Beach"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-slate-900 placeholder:text-slate-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    State (Optional)
                  </label>
                  <input
                    type="text"
                    value={courseState}
                    onChange={(e) => setCourseState(e.target.value)}
                    placeholder="e.g., CA"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-slate-900 placeholder:text-slate-400 transition-colors"
                  />
                </div>
              </div>

              {/* Recently Played Courses */}
              {!loadingRecent && recentCourses.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-3">Recently Played</h3>
                  <div className="space-y-2">
                    {recentCourses.map((course, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectRecentCourse(course)}
                        className="w-full text-left p-4 rounded-lg border border-slate-200
                                   hover:border-green-500 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{course.course_name}</p>
                            <p className="text-sm leading-relaxed text-slate-500">
                              {course.tees_played} • Par {course.total_par} • Last played {new Date(course.last_played).toLocaleDateString()}
                            </p>
                          </div>
                          <IconChevronRight className="text-slate-400" size={20} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Tee Box Name */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-2">Enter Tee Box</h2>
                <p className="text-sm leading-relaxed text-slate-500">
                  Which tees are you playing from?
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tee Box Name
                </label>
                <input
                  type="text"
                  value={teeBoxName}
                  onChange={(e) => setTeeBoxName(e.target.value)}
                  placeholder="e.g., Blue Tees, Championship, Men's"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200
                             focus:border-green-500 focus:ring-2 focus:ring-green-100
                             text-slate-900 placeholder:text-slate-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Course Rating
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={courseRating}
                    onChange={(e) => setCourseRating(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-slate-900 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Slope Rating
                  </label>
                  <input
                    type="number"
                    value={slopeRating}
                    onChange={(e) => setSlopeRating(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-slate-900 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Holes Data (Side-by-Side) */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-2">Enter Par and Yardage</h2>
                <p className="text-sm leading-relaxed text-slate-500">
                  Enter par and yardage for each hole
                </p>
              </div>

              <div className="grid grid-cols-2 gap-8">
                {/* Front 9 */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Front 9</h3>
                  <div className="space-y-2">
                    <div className="grid grid-cols-[60px_80px_1fr] gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-200">
                      <div>Hole</div>
                      <div>Par</div>
                      <div>Yardage</div>
                    </div>
                    {holesData.slice(0, 9).map((hole, idx) => (
                      <div key={hole.hole} className="grid grid-cols-[60px_80px_1fr] gap-2 items-center">
                        <div className="text-sm font-medium text-slate-900">{hole.hole}</div>
                        <input
                          type="number"
                          min="3"
                          max="6"
                          value={hole.par}
                          onChange={(e) => updateHoleData(idx, 'par', parseInt(e.target.value) || 3)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200
                                     focus:border-green-500 focus:ring-1 focus:ring-green-100
                                     text-sm text-slate-900 transition-colors"
                        />
                        <input
                          type="number"
                          min="0"
                          max="700"
                          value={hole.yardage || ''}
                          onChange={(e) => updateHoleData(idx, 'yardage', parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200
                                     focus:border-green-500 focus:ring-1 focus:ring-green-100
                                     text-sm text-slate-900 transition-colors"
                        />
                      </div>
                    ))}
                    <div className="grid grid-cols-[60px_80px_1fr] gap-2 pt-2 border-t border-slate-200 font-semibold text-sm">
                      <div className="text-slate-500">Out</div>
                      <div className="text-slate-900">{holesData.slice(0, 9).reduce((sum, h) => sum + h.par, 0)}</div>
                      <div className="text-slate-900">{holesData.slice(0, 9).reduce((sum, h) => sum + h.yardage, 0)}</div>
                    </div>
                  </div>
                </div>

                {/* Back 9 */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Back 9</h3>
                  <div className="space-y-2">
                    <div className="grid grid-cols-[60px_80px_1fr] gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-200">
                      <div>Hole</div>
                      <div>Par</div>
                      <div>Yardage</div>
                    </div>
                    {holesData.slice(9, 18).map((hole, idx) => (
                      <div key={hole.hole} className="grid grid-cols-[60px_80px_1fr] gap-2 items-center">
                        <div className="text-sm font-medium text-slate-900">{hole.hole}</div>
                        <input
                          type="number"
                          min="3"
                          max="6"
                          value={hole.par}
                          onChange={(e) => updateHoleData(idx + 9, 'par', parseInt(e.target.value) || 3)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200
                                     focus:border-green-500 focus:ring-1 focus:ring-green-100
                                     text-sm text-slate-900 transition-colors"
                        />
                        <input
                          type="number"
                          min="0"
                          max="700"
                          value={hole.yardage || ''}
                          onChange={(e) => updateHoleData(idx + 9, 'yardage', parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200
                                     focus:border-green-500 focus:ring-1 focus:ring-green-100
                                     text-sm text-slate-900 transition-colors"
                        />
                      </div>
                    ))}
                    <div className="grid grid-cols-[60px_80px_1fr] gap-2 pt-2 border-t border-slate-200 font-semibold text-sm">
                      <div className="text-slate-500">In</div>
                      <div className="text-slate-900">{holesData.slice(9, 18).reduce((sum, h) => sum + h.par, 0)}</div>
                      <div className="text-slate-900">{holesData.slice(9, 18).reduce((sum, h) => sum + h.yardage, 0)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">Total Par</p>
                    <p className="text-2xl font-bold text-slate-900">{holesData.reduce((sum, h) => sum + h.par, 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">Total Yardage</p>
                    <p className="text-2xl font-bold text-slate-900">{holesData.reduce((sum, h) => sum + h.yardage, 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">Holes Complete</p>
                    <p className="text-2xl font-bold text-slate-900">{holesData.filter(h => h.yardage > 0).length}/18</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Round Type */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-2">Select Round Type</h2>
                <p className="text-sm leading-relaxed text-slate-500">
                  What type of round is this?
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { value: 'practice', label: 'Practice Round', description: 'Casual play, not for handicap' },
                  { value: 'qualifying', label: 'Qualifying Round', description: 'Counts toward your handicap' },
                  { value: 'tournament', label: 'Tournament Round', description: 'Competition play' },
                ].map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setRoundType(type.value as RoundType)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      roundType === type.value
                        ? 'border-green-600 bg-slate-50'
                        : 'border-slate-200 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{type.label}</p>
                        <p className="text-sm leading-relaxed text-slate-500 mt-1">{type.description}</p>
                      </div>
                      {roundType === type.value && (
                        <div className="w-6 h-6 rounded-full bg-slate-900 flex items-center justify-center">
                          <IconCheck className="text-white" size={16} />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Starting Hole */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-2">Select Starting Hole</h2>
                <p className="text-sm leading-relaxed text-slate-500">
                  Where will you begin your round?
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { value: 1, label: 'Hole 1', description: 'Traditional front-to-back' },
                  { value: 10, label: 'Hole 10', description: 'Starting on the back nine' },
                  { value: 'shotgun', label: 'Shotgun Start', description: 'Starting from assigned hole' },
                ].map((start) => (
                  <button
                    key={start.value}
                    onClick={() => setStartingHole(start.value as StartingHole)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      startingHole === start.value
                        ? 'border-green-600 bg-slate-50'
                        : 'border-slate-200 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{start.label}</p>
                        <p className="text-sm leading-relaxed text-slate-500 mt-1">{start.description}</p>
                      </div>
                      {startingHole === start.value && (
                        <div className="w-6 h-6 rounded-full bg-slate-900 flex items-center justify-center">
                          <IconCheck className="text-white" size={16} />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 6: Confirmation */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-2">Review & Confirm</h2>
                <p className="text-sm leading-relaxed text-slate-500">
                  Please review your round details before starting
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-6 space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Course</p>
                    <p className="text-base font-semibold text-slate-900">{courseName}</p>
                    {(courseCity || courseState) && (
                      <p className="text-sm text-slate-500">{courseCity}{courseState ? `, ${courseState}` : ''}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Tees</p>
                    <p className="text-base font-semibold text-slate-900">{teeBoxName}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Par</p>
                    <p className="text-base font-semibold text-slate-900">{holesData.reduce((sum, h) => sum + h.par, 0)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Yardage</p>
                    <p className="text-base font-semibold text-slate-900">{holesData.reduce((sum, h) => sum + h.yardage, 0)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Rating</p>
                    <p className="text-base font-semibold text-slate-900">{courseRating}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Slope</p>
                    <p className="text-base font-semibold text-slate-900">{slopeRating}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Round Type</p>
                    <p className="text-base font-semibold text-slate-900 capitalize">{roundType}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Starting Hole</p>
                    <p className="text-base font-semibold text-slate-900">
                      {startingHole === 'shotgun' ? 'Shotgun' : `Hole ${startingHole}`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-sm leading-relaxed text-slate-900">
                  <strong>Ready to start?</strong> Your round will be created and you'll begin tracking shots on Hole {startingHole === 'shotgun' ? '1' : startingHole}.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="secondary"
          onClick={currentStep === 0 ? () => router.back() : prevStep}
          disabled={loading}
        >
          <IconChevronLeft size={18} />
          {currentStep === 0 ? 'Cancel' : 'Back'}
        </Button>
        <Button
          onClick={nextStep}
          disabled={!canProceed() || loading}
          className="flex items-center gap-2"
        >
          {currentStep === 6 ? (loading ? 'Creating...' : 'Start Round') : 'Next'}
          {currentStep < 6 && <IconChevronRight size={18} />}
        </Button>
      </div>
    </div>
  );
}
