'use client';

/**
 * Development Plan Integration
 *
 * Connects golf stats with player development plans:
 * - Shows weak areas with improvement suggestions
 * - Links stats to development goals
 * - Provides practice recommendations
 * - Tracks progress against targets
 */

import { useState } from 'react';
import type {
  PlayerStats,
  WeakAreaIdentification,
  StatGoal,
} from '@/lib/types/golf';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface DevelopmentIntegrationProps {
  stats: PlayerStats;
  weakAreas: WeakAreaIdentification[];
  statGoals?: StatGoal[];
  onCreateGoal?: (weakArea: WeakAreaIdentification) => void;
  onAddToPlan?: (weakArea: WeakAreaIdentification) => void;
  className?: string;
}

export function DevelopmentIntegration({
  stats,
  weakAreas,
  statGoals = [],
  onCreateGoal,
  onAddToPlan,
  className,
}: DevelopmentIntegrationProps) {
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  // Group weak areas by severity
  const criticalAreas = weakAreas.filter(a => a.severity === 'critical');
  const moderateAreas = weakAreas.filter(a => a.severity === 'moderate');
  const minorAreas = weakAreas.filter(a => a.severity === 'minor');

  // Check if a weak area has an associated goal
  const hasGoal = (area: WeakAreaIdentification) => {
    return statGoals.some(g => g.metric.toLowerCase().includes(area.area.toLowerCase()));
  };

  // Get improvement priority score
  const getPriorityScore = (area: WeakAreaIdentification): number => {
    const severityScores = { critical: 3, moderate: 2, minor: 1 };
    const baseScore = severityScores[area.severity] || 1;

    // Weight by difference from benchmark
    const gap = Math.abs(area.value - area.benchmark);
    return baseScore * (1 + gap);
  };

  // Sort by priority
  const sortedWeakAreas = [...weakAreas].sort((a, b) => getPriorityScore(b) - getPriorityScore(a));

  // Practice recommendations based on weak areas
  const getPracticeRecommendations = () => {
    const recommendations: { category: string; drills: string[]; time: string }[] = [];

    if (criticalAreas.length > 0) {
      // Generate drills from recommendations
      const criticalDrills = criticalAreas.map(a => a.recommendation);
      recommendations.push({
        category: 'Priority Focus',
        drills: [...new Set(criticalDrills)].slice(0, 4),
        time: '45+ min',
      });
    }

    if (moderateAreas.length > 0) {
      const moderateDrills = moderateAreas.map(a => a.recommendation);
      recommendations.push({
        category: 'Secondary Focus',
        drills: [...new Set(moderateDrills)].slice(0, 3),
        time: '20-30 min',
      });
    }

    // Add maintenance for areas that aren't weak
    const sgCategories = ['sg_off_tee', 'sg_approach', 'sg_around_green', 'sg_putting'] as const;
    const strongCategories = sgCategories.filter(cat => stats.strokes_gained[cat] >= 0.2);

    if (strongCategories.length > 0) {
      recommendations.push({
        category: 'Maintenance',
        drills: strongCategories.map(cat => `${cat.replace('sg_', '').replace('_', ' ')} consistency drill`),
        time: '15 min',
      });
    }

    return recommendations;
  };

  const practiceRecommendations = getPracticeRecommendations();

  if (weakAreas.length === 0) {
    return (
      <div className={cn('', className)}>
        <Card>
          <CardContent className="py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-warm-900 mb-2">Well-Rounded Game</h3>
            <p className="text-sm text-warm-500 max-w-md mx-auto">
              No significant weak areas identified. Continue with balanced practice to maintain
              your performance across all categories.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-warm-900">Development Focus Areas</h2>
        <p className="text-sm text-warm-500">
          Based on your stats analysis, focus on these areas to improve your game
        </p>
      </div>

      {/* Priority Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={criticalAreas.length > 0 ? 'border-red-200' : 'opacity-50'}>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-red-600">{criticalAreas.length}</div>
            <div className="text-sm text-warm-500">Critical Issues</div>
          </CardContent>
        </Card>
        <Card className={moderateAreas.length > 0 ? 'border-yellow-200' : 'opacity-50'}>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-yellow-600">{moderateAreas.length}</div>
            <div className="text-sm text-warm-500">Moderate Issues</div>
          </CardContent>
        </Card>
        <Card className={minorAreas.length > 0 ? 'border-blue-200' : 'opacity-50'}>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{minorAreas.length}</div>
            <div className="text-sm text-warm-500">Minor Issues</div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Weak Areas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Improvement Areas</CardTitle>
          <CardDescription>Click to expand for detailed recommendations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedWeakAreas.map((area, i) => (
            <div
              key={i}
              className={cn(
                'border rounded-lg overflow-hidden transition-all',
                expandedArea === area.area ? 'border-primary-500' : 'border-warm-200'
              )}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedArea(expandedArea === area.area ? null : area.area)}
                className="w-full flex items-center justify-between p-4 hover:bg-warm-50 active:bg-warm-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    className={cn(
                      area.severity === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : area.severity === 'moderate'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-blue-100 text-blue-700'
                    )}
                  >
                    {area.severity}
                  </Badge>
                  <div className="text-left">
                    <div className="font-medium text-warm-900">{area.area}</div>
                    <div className="text-sm text-warm-500">
                      Current: {area.value.toFixed(2)} | Benchmark: {area.benchmark.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {hasGoal(area) && (
                    <Badge variant="secondary" className="text-primary-600 border-primary-200">
                      Goal Set
                    </Badge>
                  )}
                  <svg
                    className={cn(
                      'w-5 h-5 text-warm-400 transition-transform',
                      expandedArea === area.area && 'rotate-180'
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded Content */}
              {expandedArea === area.area && (
                <div className="px-4 pb-4 border-t border-warm-100 bg-warm-50">
                  <div className="py-4 space-y-4">
                    {/* Gap from benchmark */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-warm-500">Gap from Benchmark</span>
                        <span className="font-medium">
                          {Math.abs(area.value - area.benchmark).toFixed(2)}
                        </span>
                      </div>
                      <div className="h-2 bg-warm-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full"
                          style={{
                            width: `${Math.max(0, Math.min(100, (area.value / area.benchmark) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Recommendation */}
                    <div>
                      <h4 className="text-sm font-medium text-warm-700 mb-2">Recommendation</h4>
                      <div className="text-sm text-warm-600 bg-white p-3 rounded-lg border border-warm-200">
                        {area.recommendation}
                      </div>
                    </div>

                    {/* Metric details */}
                    <div className="flex items-center gap-2 text-sm text-warm-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <span>Metric: <strong>{area.metric}</strong></span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2">
                      {!hasGoal(area) && onCreateGoal && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onCreateGoal(area)}
                        >
                          Set as Goal
                        </Button>
                      )}
                      {onAddToPlan && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onAddToPlan(area)}
                        >
                          Add to Dev Plan
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Practice Recommendations */}
      {practiceRecommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommended Practice Session</CardTitle>
            <CardDescription>Structure your practice time for maximum improvement</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {practiceRecommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-20">
                  <Badge
                    className={cn(
                      rec.category === 'Priority Focus'
                        ? 'bg-red-100 text-red-700'
                        : rec.category === 'Secondary Focus'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-warm-100 text-warm-700'
                    )}
                  >
                    {rec.time}
                  </Badge>
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-warm-900">{rec.category}</h4>
                  <ul className="mt-1 space-y-1">
                    {rec.drills.map((drill, j) => (
                      <li key={j} className="text-sm text-warm-600">
                        • {drill}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Active Goals */}
      {statGoals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Stat Goals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statGoals.map((goal, i) => {
              // Calculate progress percentage based on current vs target
              const progressPct = goal.current_value !== undefined && goal.target_value !== 0
                ? Math.max(0, Math.min(100, (goal.current_value / goal.target_value) * 100))
                : 0;
              return (
                <div key={i} className="flex items-center justify-between p-3 bg-warm-50 rounded-lg">
                  <div>
                    <div className="font-medium text-warm-900">{goal.metric}</div>
                    <div className="text-sm text-warm-500">
                      {goal.current_value?.toFixed(2) || '-'} → {goal.target_value.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-primary-600">
                      {progressPct.toFixed(0)}%
                    </div>
                    {goal.deadline && (
                      <div className="text-xs text-warm-400">
                        Due {new Date(goal.deadline).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DevelopmentIntegration;
