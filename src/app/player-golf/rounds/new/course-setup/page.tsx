'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { HoleConfigurationForm } from '@/components/golf/HoleConfigurationForm';
import { createCourse } from '@/app/golf/actions/courses';
import type { HoleConfig } from '@/lib/types/golf-course';

export default function CourseSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<'details' | 'holes'>('details');
  const [saving, setSaving] = useState(false);

  // Course details state
  const [courseName, setCourseName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [courseRating, setCourseRating] = useState('72.0');
  const [slopeRating, setSlopeRating] = useState('113');
  const [teeName, setTeeName] = useState('');

  const roundType = searchParams.get('type') || 'practice';

  async function handleSaveHoles(holes: HoleConfig[]) {
    setSaving(true);

    try {
      // Create the course with holes
      const result = await createCourse({
        name: courseName,
        city: city || null,
        state: state || null,
        courseRating: courseRating ? parseFloat(courseRating) : null,
        slopeRating: slopeRating ? parseInt(slopeRating) : null,
        teeName: teeName || null,
        holes,
      });

      if (!result.success) {
        alert(result.error || 'Failed to save course');
        setSaving(false);
        return;
      }

      // Store course data in sessionStorage to pass back to new round page
      const courseData = {
        courseId: result.courseId,
        courseName,
        city,
        state,
        teeName,
        courseRating: parseFloat(courseRating),
        slopeRating: parseInt(slopeRating),
        holes,
      };
      sessionStorage.setItem('newCourseData', JSON.stringify(courseData));

      // Return to new round page - it will read from sessionStorage
      router.push('/player-golf/round/new');

    } catch (error) {
      console.error('Error saving course:', error);
      alert('Failed to save course');
      setSaving(false);
    }
  }

  const canProceedToHoles = () => {
    return courseName.trim().length > 0 && teeName.trim().length > 0;
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-lg mx-auto px-4 py-6">

        {saving ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-2 border-emerald-600
                            border-t-transparent rounded-full mb-4" />
            <p className="text-slate-600">Saving course...</p>
          </div>
        ) : step === 'details' ? (
          // Step 1: Course Details Form
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <h2 className="text-lg font-semibold text-slate-900">New Course</h2>
              <div className="w-16" />
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4 shadow-sm shadow-emerald-950/5 ring-1 ring-slate-100">
              <div>
                <h3 className="text-xl font-semibold text-slate-900 mb-1">Course Details</h3>
                <p className="text-sm text-slate-500">Enter the basic information about this course</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Course Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g., Pebble Beach Golf Links"
                  className="w-full px-4 py-3 rounded-lg border border-slate-200
                             focus:ring-2 focus:ring-emerald-600 focus:border-transparent
                             text-slate-900 placeholder:text-slate-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g., Pebble Beach"
                    className="w-full px-4 py-3 rounded-lg border border-slate-200
                               focus:ring-2 focus:ring-emerald-600 focus:border-transparent
                               text-slate-900 placeholder:text-slate-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    State
                  </label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g., CA"
                    className="w-full px-4 py-3 rounded-lg border border-slate-200
                               focus:ring-2 focus:ring-emerald-600 focus:border-transparent
                               text-slate-900 placeholder:text-slate-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tee Box Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={teeName}
                  onChange={(e) => setTeeName(e.target.value)}
                  placeholder="e.g., Blue Tees, Championship"
                  className="w-full px-4 py-3 rounded-lg border border-slate-200
                             focus:ring-2 focus:ring-emerald-600 focus:border-transparent
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
                    className="w-full px-4 py-3 rounded-lg border border-slate-200
                               focus:ring-2 focus:ring-emerald-600 focus:border-transparent
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
                    className="w-full px-4 py-3 rounded-lg border border-slate-200
                               focus:ring-2 focus:ring-emerald-600 focus:border-transparent
                               text-slate-900 transition-colors"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('holes')}
              disabled={!canProceedToHoles()}
              className="w-full py-4 bg-emerald-600 text-white font-semibold rounded-lg
                         hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next: Configure Holes
            </button>
          </div>
        ) : (
          // Step 2: Hole Configuration
          <HoleConfigurationForm
            courseName={courseName}
            onSave={handleSaveHoles}
            onBack={() => setStep('details')}
          />
        )}
      </div>
    </div>
  );
}
