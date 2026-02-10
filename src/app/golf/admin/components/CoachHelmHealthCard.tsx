'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminAreaChart } from './AdminChart';
import { cn } from '@/lib/utils';
import { IconSparkles } from '@/components/icons';

interface Props {
  coachhelm: AdminDashboardData['coachhelm'];
  coachhelmRoi?: AdminDashboardData['coachhelmRoi'];
}

export function CoachHelmHealthCard({ coachhelm, coachhelmRoi }: Props) {
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

      {/* CoachHelm ROI */}
      {coachhelmRoi && (coachhelmRoi.coachesUsingAI > 0 || coachhelmRoi.coachesNotUsingAI > 0) && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-warm-500 mb-2.5">CoachHelm ROI</h4>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-emerald-50/50 rounded-xl p-3">
              <p className="text-xs text-emerald-600 mb-0.5">AI Coaches</p>
              <p className="text-xl font-semibold text-emerald-700 tabular-nums">{coachhelmRoi.coachesUsingAI}</p>
              {coachhelmRoi.avgScoreAICoachPlayers != null && (
                <p className="text-[10px] text-emerald-500 mt-0.5">
                  Avg team score: {coachhelmRoi.avgScoreAICoachPlayers.toFixed(1)}
                </p>
              )}
            </div>
            <div className="bg-warm-50/50 rounded-xl p-3">
              <p className="text-xs text-warm-500 mb-0.5">Non-AI Coaches</p>
              <p className="text-xl font-semibold text-warm-700 tabular-nums">{coachhelmRoi.coachesNotUsingAI}</p>
              {coachhelmRoi.avgScoreNonAICoachPlayers != null && (
                <p className="text-[10px] text-warm-400 mt-0.5">
                  Avg team score: {coachhelmRoi.avgScoreNonAICoachPlayers.toFixed(1)}
                </p>
              )}
            </div>
          </div>
          {coachhelmRoi.scoreDifference != null && (
            <p className="text-xs text-center mt-2 text-warm-500">
              AI coach advantage: <span className="font-semibold text-emerald-600">{coachhelmRoi.scoreDifference.toFixed(1)} strokes</span>
            </p>
          )}
        </div>
      )}

      {/* Insights over time - area chart */}
      {insightChartData.length > 0 && (
        <div className="mb-5">
          <AdminAreaChart data={insightChartData} title="Insights Generated per Week" color="#16A34A" height={140} />
        </div>
      )}

      {/* Reviews over time - area chart */}
      {reviewChartData.length > 0 && (
        <div className="mb-5">
          <AdminAreaChart data={reviewChartData} title="Round Reviews per Week" color="#8B5CF6" height={140} />
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
                    <td className={cn(
                      'py-2 text-right tabular-nums',
                      m.accuracy_rate != null && m.accuracy_rate > 0.8 ? 'text-emerald-600 font-medium' :
                      m.accuracy_rate != null && m.accuracy_rate > 0.6 ? 'text-warm-600' :
                      'text-warm-400'
                    )}>
                      {m.accuracy_rate != null ? `${(m.accuracy_rate * 100).toFixed(1)}%` : '\u2014'}
                    </td>
                    <td className={cn(
                      'py-2 text-right tabular-nums',
                      m.calibration_score != null && m.calibration_score > 0.8 ? 'text-emerald-600 font-medium' :
                      m.calibration_score != null && m.calibration_score > 0.5 ? 'text-warm-600' :
                      'text-warm-400'
                    )}>
                      {m.calibration_score != null ? m.calibration_score.toFixed(2) : '\u2014'}
                    </td>
                    <td className="py-2 text-right text-warm-600 tabular-nums">
                      {m.predictions_made?.toLocaleString() ?? '\u2014'}
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
                    <td className={cn(
                      'py-2 text-right tabular-nums',
                      e.action_rate != null && e.action_rate > 0.5 ? 'text-emerald-600 font-medium' : 'text-warm-600'
                    )}>
                      {e.action_rate != null ? `${(e.action_rate * 100).toFixed(1)}%` : '\u2014'}
                    </td>
                    <td className={cn(
                      'py-2 text-right tabular-nums',
                      e.improvement_rate != null && e.improvement_rate > 0.5 ? 'text-emerald-600 font-medium' : 'text-warm-600'
                    )}>
                      {e.improvement_rate != null ? `${(e.improvement_rate * 100).toFixed(1)}%` : '\u2014'}
                    </td>
                    <td className={cn(
                      'py-2 text-right tabular-nums',
                      e.effectiveness_score != null && e.effectiveness_score > 0.7 ? 'text-emerald-600 font-medium' : 'text-warm-600'
                    )}>
                      {e.effectiveness_score != null ? e.effectiveness_score.toFixed(2) : '\u2014'}
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
