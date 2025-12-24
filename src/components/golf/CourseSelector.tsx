'use client';

import { useState, useEffect } from 'react';
import { getSavedCourses } from '@/app/golf/actions/courses';
import type { GolfCourse } from '@/lib/types/golf-course';

interface CourseSelectorProps {
  onSelectCourse: (course: GolfCourse | null) => void;
  onCreateNew: () => void;
  selectedCourseId?: string;
}

export function CourseSelector({
  onSelectCourse,
  onCreateNew,
  selectedCourseId
}: CourseSelectorProps) {
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    const savedCourses = await getSavedCourses();
    setCourses(savedCourses);
    setLoading(false);
  }

  const filteredCourses = courses.filter(course =>
    course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search saved courses..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 pl-10 border border-slate-200 rounded-lg
                     focus:ring-2 focus:ring-emerald-600 focus:border-transparent
                     bg-white text-slate-900"
        />
        <svg
          className="absolute left-3 top-3.5 h-5 w-5 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Create New Course Button */}
      <button
        onClick={onCreateNew}
        className="w-full p-4 border-2 border-dashed border-emerald-300 rounded-lg
                   text-emerald-600 font-medium hover:bg-emerald-50 transition-colors
                   flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 4v16m8-8H4" />
        </svg>
        Add New Course
      </button>

      {/* Saved Courses Grid */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-600
                          border-t-transparent rounded-full" />
        </div>
      ) : filteredCourses.length > 0 ? (
        <div className="grid gap-3">
          {filteredCourses.map(course => (
            <button
              key={course.id}
              onClick={() => onSelectCourse(course)}
              className={`p-4 rounded-lg border text-left transition-all
                ${selectedCourseId === course.id
                  ? 'border-emerald-500 bg-emerald-50 shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-600'
                  : 'border-slate-200 bg-white hover:border-emerald-300 shadow-sm shadow-slate-950/5 ring-1 ring-slate-100'
                }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-slate-900">{course.name}</h3>
                  {course.city && (
                    <p className="text-sm text-slate-500">
                      {course.city}{course.state ? `, ${course.state}` : ''}
                    </p>
                  )}
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium text-slate-900">
                    Par {course.total_par}
                  </div>
                  <div className="text-slate-500">
                    {course.total_yardage?.toLocaleString()} yds
                  </div>
                </div>
              </div>

              {(course.course_rating || course.slope_rating) && (
                <div className="mt-2 pt-2 border-t border-slate-100 flex gap-4 text-xs text-slate-500">
                  {course.course_rating && (
                    <span>Rating: {course.course_rating}</span>
                  )}
                  {course.slope_rating && (
                    <span>Slope: {course.slope_rating}</span>
                  )}
                  {course.default_tee_name && (
                    <span className="ml-auto">{course.default_tee_name} Tees</span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          {searchQuery ? 'No courses match your search' : 'No saved courses yet'}
        </div>
      )}
    </div>
  );
}
