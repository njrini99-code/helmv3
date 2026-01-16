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
  StrokesGainedResult,
} from '@/lib/types/golf';
import { formatStrokesGained, getStrokesGainedColor } from '@/lib/golf/strokes-gained';
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

    // If related to strokes gained, weight by impact
    if (area.related_strokes_gained_category) {
      const sgValue = stats.strokes_gained[area.related_strokes_gained_category];
      return baseScore * Math.abs(sgValue);
    }

    return baseScore;
  };

  // Sort by priority
  const sortedWeakAreas = [...weakAreas].sort((a, b) => getPriorityScore(b) - getPriorityScore(a));

  // Practice recommendations based on weak areas
  const getPracticeRecommendations = () => {
    const recommendations: { category: string; drills: string[]; time: string }[] = [];

    if (criticalAreas.length > 0) {
      const criticalDrills = criticalAreas.flatMap(a => a.recommended_drills.slice(0, 2));
      recommendations.push({
        category: 'Priority Focus',
        drills: [...new Set(criticalDrills)].slice(0, 4),
        time: '45+ min',
      });
    }

    if (moderateAreas.length > 0) {
      const moderateDrills = moderateAreas.flatMap(a => a.recommended_drills.slice(0, 1));
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
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Well-Rounded Game</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
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
        <h2 className="text-xl font-semibold text-gray-900">Development Focus Areas</h2>
        <p className="text-sm text-gray-500">
          Based on your stats analysis, focus on these areas to improve your game
        </p>
      </div>

      {/* Priority Overview */}
      <div className="grid grid-cols-3 gap-4">
        <Card className={criticalAreas.length > 0 ? 'border-red-200' : 'opacity-50'}>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-red-600">{criticalAreas.length}</div>
            <div className="text-sm text-gray-500">Critical Issues</div>
          </CardContent>
        </Card>
        <Card className={moderateAreas.length > 0 ? 'border-yellow-200' : 'opacity-50'}>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-yellow-600">{moderateAreas.length}</div>
            <div className="text-sm text-gray-500">Moderate Issues</div>
          </CardContent>
        </Card>
        <Card className={minorAreas.length > 0 ? 'border-blue-200' : 'opacity-50'}>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{minorAreas.length}</div>
            <div className="text-sm text-gray-500">Minor Issues</div>
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
                expandedArea === area.area ? 'border-green-500' : 'border-gray-200'
              )}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedArea(expandedArea === area.area ? null : area.area)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
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
                    <div className="font-medium text-gray-900">{area.area}</div>
                    <div className="text-sm text-gray-500">
                      Current: {area.current_value.toFixed(2)} | Target: {area.target_value.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {hasGoal(area) && (
                    <Badge variant="outline" className="text-green-600 border-green-200">
                      Goal Set
                    </Badge>
                  )}
                  <svg
                    className={cn(
                      'w-5 h-5 text-gray-400 transition-transform',
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
                <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
                  <div className="py-4 space-y-4">
                    {/* Progress bar */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">Progress to Target</span>
                        <span className="font-medium">
                          {Math.max(0, Math.min(100, ((area.target_value - area.current_value) / area.target_value) * 100)).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{
                            width: `${Math.max(0, Math.min(100, ((area.target_value - area.current_value) / area.target_value) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Estimated time */}
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Estimated improvement time: <strong>{area.estimated_improvement_time}</strong></span>
                    </div>

                    {/* Recommended drills */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Recommended Drills</h4>
                      <div className="space-y-2">
                        {area.recommended_drills.map((drill, j) => (
                          <div key={j} className="flex items-center gap-2 text-sm">
                            <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-medium">
                              {j + 1}
                            </span>
                            <span className="text-gray-700">{drill}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2">
                      {!hasGoal(area) && onCreateGoal && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onCreateGoal(area)}
                        >
                          Set as Goal
                        </Button>
                      )}
                      {onAddToPlan && (
                        <Button
                          variant="outline"
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
                        : 'bg-gray-100 text-gray-700'
                    )}
                  >
                    {rec.time}
                  </Badge>
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{rec.category}</h4>
                  <ul className="mt-1 space-y-1">
                    {rec.drills.map((drill, j) => (
                      <li key={j} className="text-sm text-gray-600">
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
            {statGoals.map((goal, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">{goal.metric}</div>
                  <div className="text-sm text-gray-500">
                    {goal.current_value?.toFixed(2) || '-'} → {goal.target_value.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-green-600">
                    {goal.progress_percentage.toFixed(0)}%
                  </div>
                  {goal.deadline && (
                    <div className="text-xs text-gray-400">
                      Due {new Date(goal.deadline).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DevelopmentIntegration;
