'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminBarChart } from './AdminChart';
import { IconSparkles } from '@/components/icons';

interface Props {
  coachhelm: AdminDashboardData['coachhelm'];
}

export function CoachHelmHealthCard({ coachhelm }: Props) {
  const insightChartData = coachhelm.insightsByWeek.map((w) => ({
    label: w.week.slice(5),
    value: w.count,
  }));

  const reviewChartData = coachhelm.reviewsByWeek.map((w) => ({
    label: w.week.slice(5),
    value: w.count,
  }));

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 bg-white/50 rounded-lg text-warm-500">
          <IconSparkles size={18} />
        </div>
        <h3 className="text-lg font-semibold text-warm-900">CoachHelm AI Health</h3>
      </div>

      {/* AI Platform stats */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">
            {coachhelm.totalReviewsAllTime.toLocaleString()}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">Reviews Total</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">
            {coachhelm.totalPatternsDetected.toLocaleString()}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">Patterns Found</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">
            {coachhelm.totalPredictionsMade.toLocaleString()}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">Predictions</p>
        </div>
      </div>

      {/* Adoption & generation quality */}
      <div className="grid grid-cols-2 gap-2.5 mb-5">
        <div className="bg-white/50 rounded-xl p-3">
          <p className="text-lg font-semibold text-warm-900 tabular-nums">{coachhelm.coachPhilosophyAdoption}%</p>
          <p className="text-[10px] text-warm-500 mt-0.5">Philosophy Adoption</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3">
          <p className="text-lg font-semibold text-warm-900 tabular-nums">{coachhelm.avgInsightsPerGeneration}</p>
          <p className="text-[10px] text-warm-500 mt-0.5">Avg Insights/Gen</p>
        </div>
      </div>

      {/* Insights over time */}
      {insightChartData.length > 0 && (
        <div className="mb-5">
          <AdminBarChart data={insightChartData} title="Insights Generated per Week" color="#16A34A" />
        </div>
      )}

      {/* Reviews over time */}
      {reviewChartData.length > 0 && (
        <div className="mb-5">
          <AdminBarChart data={reviewChartData} title="Round Reviews per Week" color="#8B5CF6" />
        </div>
      )}

      {/* Model Performance */}
      {coachhelm.modelPerformance.length > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-warm-500 mb-3">Model Performance</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-100">
                  <th className="text-left py-2 text-warm-500 font-medium">Model</th>
                  <th className="text-right py-2 text-warm-500 font-medium">Accuracy</th>
                  <th className="text-right py-2 text-warm-500 font-medium">Calibration</th>
                  <th className="text-right py-2 text-warm-500 font-medium">Predictions</th>
                </tr>
              </thead>
              <tbody>
                {coachhelm.modelPerformance.map((m, i) => (
                  <tr key={i} className="border-b border-warm-50">
                    <td className="py-2 text-warm-700">{m.model_type}</td>
                    <td className="py-2 text-right text-warm-600 tabular-nums">
                      {m.accuracy_rate != null ? `${(m.accuracy_rate * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 text-right text-warm-600 tabular-nums">
                      {m.calibration_score != null ? m.calibration_score.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 text-right text-warm-600 tabular-nums">
                      {m.predictions_made?.toLocaleString() ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Insight Effectiveness */}
      {coachhelm.insightEffectiveness.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-warm-500 mb-3">Insight Effectiveness</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-100">
                  <th className="text-left py-2 text-warm-500 font-medium">Type</th>
                  <th className="text-right py-2 text-warm-500 font-medium">Action Rate</th>
                  <th className="text-right py-2 text-warm-500 font-medium">Improvement</th>
                  <th className="text-right py-2 text-warm-500 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {coachhelm.insightEffectiveness.map((e, i) => (
                  <tr key={i} className="border-b border-warm-50">
                    <td className="py-2 text-warm-700">{e.insight_type}</td>
                    <td className="py-2 text-right text-warm-600 tabular-nums">
                      {e.action_rate != null ? `${(e.action_rate * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 text-right text-warm-600 tabular-nums">
                      {e.improvement_rate != null ? `${(e.improvement_rate * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 text-right text-warm-600 tabular-nums">
                      {e.effectiveness_score != null ? e.effectiveness_score.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {coachhelm.modelPerformance.length === 0 &&
        coachhelm.insightEffectiveness.length === 0 &&
        insightChartData.length === 0 && (
          <p className="text-sm text-warm-400">No CoachHelm data yet.</p>
        )}
    </div>
  );
}
