'use client';

import { RoundReview } from '@/lib/coachhelm/types';

interface ReviewSummaryProps {
  review: RoundReview;
}

export function ReviewSummary({ review }: ReviewSummaryProps) {
  return (
    <div
      className="rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-white p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.6s both' }}
    >
      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <span className="text-lg">🧠</span>
        CoachHelm Summary
      </h3>

      {/* Main summary */}
      <div className="prose prose-sm prose-slate max-w-none mb-4">
        {review.summary.split('\n\n').map((paragraph, index) => (
          <p key={index} className="text-slate-700 leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Primary takeaway */}
      <div className="p-3 bg-green-100/50 rounded-lg border border-green-200 mb-3">
        <div className="text-xs font-medium text-green-700 mb-1">Key Takeaway</div>
        <p className="text-sm font-medium text-green-900">{review.primaryTakeaway}</p>
      </div>

      {/* Next practice priority */}
      {review.nextPracticePriority && (
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="text-xs font-medium text-amber-700 mb-1">Next Practice Priority</div>
          <p className="text-sm font-medium text-amber-900">{review.nextPracticePriority}</p>
        </div>
      )}
    </div>
  );
}
