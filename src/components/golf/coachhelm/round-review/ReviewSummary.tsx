'use client';

import { RoundReview } from '@/lib/coachhelm/types';

interface ReviewSummaryProps {
  review: RoundReview;
}

export function ReviewSummary({ review }: ReviewSummaryProps) {
  return (
    <div
      className="rounded-xl border border-primary-200 bg-primary-50/55 p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.6s both' }}
    >
      <h3 className="text-sm font-medium text-warm-900 mb-3 flex items-center gap-2">
        <span className="text-lg">🧠</span>
        CoachHelm Summary
      </h3>

      {/* Main summary */}
      <div className="prose prose-sm prose-slate max-w-none mb-4">
        {review.summary.split('\n\n').map((paragraph, index) => (
          <p key={index} className="text-warm-700 leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Primary takeaway */}
      <div className="p-3 bg-primary-100/50 rounded-lg border border-primary-200 mb-3">
        <div className="text-xs font-medium text-primary-700 mb-1">Key Takeaway</div>
        <p className="text-sm font-medium text-primary-900">{review.primaryTakeaway}</p>
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
