'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconSearch, IconChevronRight, IconMapPin } from '@/components/icons';
import { SAMPLE_COURSES } from '../../actions/courses';

export default function NewRoundPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  const filteredCourses = SAMPLE_COURSES.filter(course =>
    course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.state.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartRound = () => {
    if (selectedCourse) {
      // In production, this would create a round via server action
      // For now, just navigate to the round tracking page
      router.push(`/golf/round/${selectedCourse}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Start New Round</h1>
          <p className="text-slate-500 mt-1">Select a course to begin tracking your round</p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search courses by name or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200
                         focus:border-green-500 focus:ring-2 focus:ring-green-100
                         text-slate-900 placeholder:text-slate-400 transition-colors"
            />
          </div>
        </div>

        {/* Course List */}
        <div className="space-y-3 mb-8">
          {filteredCourses.length > 0 ? (
            filteredCourses.map((course) => (
              <button
                key={course.id}
                onClick={() => setSelectedCourse(course.id)}
                className={`w-full text-left transition-all ${
                  selectedCourse === course.id
                    ? 'ring-2 ring-green-600'
                    : ''
                }`}
              >
                <Card className={`hover:border-green-200 hover:shadow-md cursor-pointer ${
                  selectedCourse === course.id ? 'border-green-600' : ''
                }`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">
                          {course.name}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-slate-500">
                          <div className="flex items-center gap-1">
                            <IconMapPin size={16} />
                            <span>{course.city}, {course.state}</span>
                          </div>
                          <span>•</span>
                          <span>Par {course.par}</span>
                          {course.rating && (
                            <>
                              <span>•</span>
                              <span>Rating {course.rating}</span>
                            </>
                          )}
                          {course.slope && (
                            <>
                              <span>•</span>
                              <span>Slope {course.slope}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedCourse === course.id
                          ? 'border-green-600 bg-green-600'
                          : 'border-slate-300'
                      }`}>
                        {selectedCourse === course.id && (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <IconSearch size={48} className="mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  No courses found
                </h3>
                <p className="text-sm text-slate-500">
                  Try searching with a different term
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Add Custom Course */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">
                  Can't find your course?
                </h3>
                <p className="text-xs text-slate-500">
                  Add a custom course to get started
                </p>
              </div>
              <Button variant="secondary" size="sm">
                Add Custom Course
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-between sticky bottom-0 bg-[#FAF6F1] py-4 border-t border-slate-200">
          <Button
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            onClick={handleStartRound}
            disabled={!selectedCourse}
            className="flex items-center gap-2"
          >
            Start Round
            <IconChevronRight size={18} />
          </Button>
        </div>
      </div>
  );
}
