'use client';

import { cn } from '@/lib/utils';

interface SessionHeatmapProps {
  pageViews: {
    pagePath: string;
    viewCount: number;
    uniqueUsers: number;
  }[];
  featureUsage: {
    featureName: string;
    useCount: number;
    uniqueUsers: number;
  }[];
  sessionStats: {
    avgPagesPerSession: number;
    avgSessionDurationMin: number;
    totalSessions7d: number;
    totalPageViews7d: number;
  };
  deadFeatures: string[];
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/50 border border-white/20 rounded-xl p-4 text-center">
      <p className="text-2xl font-semibold text-warm-900">{value}</p>
      <p className="text-sm text-warm-500 mt-1">{label}</p>
    </div>
  );
}

function HeatmapBar({
  label,
  value,
  maxValue,
  sublabel,
}: {
  label: string;
  value: number;
  maxValue: number;
  sublabel: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  // Intensity: lighter for low values, darker for high
  const opacity = Math.max(0.25, pct / 100);

  return (
    <div className="flex items-center gap-3 group">
      <div className="w-40 shrink-0 text-right">
        <p className="text-sm text-warm-900 font-medium truncate" title={label}>
          {label}
        </p>
      </div>
      <div className="flex-1 relative h-8 bg-white/30 rounded-lg overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500 ease-out"
          style={{
            width: `${Math.max(pct, 2)}%`,
            backgroundColor: `rgba(22, 163, 74, ${opacity})`,
          }}
        />
        <div className="absolute inset-0 flex items-center px-3 justify-between">
          <span className="text-xs font-semibold text-warm-900 relative z-10">
            {value.toLocaleString()}
          </span>
          <span className="text-xs text-warm-400 relative z-10">{sublabel}</span>
        </div>
      </div>
    </div>
  );
}

export default function SessionHeatmap({
  pageViews,
  featureUsage,
  sessionStats,
  deadFeatures,
}: SessionHeatmapProps) {
  const maxPageViews = Math.max(...pageViews.map((p) => p.viewCount), 1);
  const maxFeatureUse = Math.max(...featureUsage.map((f) => f.useCount), 1);

  return (
    <div className="space-y-6">
      {/* Session Stats */}
      <div
        className={cn(
          'glass-standard rounded-2xl p-6'
        )}
      >
        <h2 className="text-xl font-semibold text-warm-900 mb-4">
          Session Overview
          <span className="text-sm font-normal text-warm-400 ml-2">Last 7 days</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox
            label="Total Sessions"
            value={sessionStats.totalSessions7d.toLocaleString()}
          />
          <StatBox
            label="Page Views"
            value={sessionStats.totalPageViews7d.toLocaleString()}
          />
          <StatBox
            label="Pages / Session"
            value={sessionStats.avgPagesPerSession.toFixed(1)}
          />
          <StatBox
            label="Avg Duration"
            value={`${sessionStats.avgSessionDurationMin.toFixed(1)}m`}
          />
        </div>
      </div>

      {/* Page Heatmap */}
      <div
        className={cn(
          'glass-standard rounded-2xl p-6'
        )}
      >
        <h2 className="text-xl font-semibold text-warm-900 mb-4">Page Views</h2>
        {pageViews.length === 0 ? (
          <p className="text-sm text-warm-400 text-center py-8">
            No page view data available yet.
          </p>
        ) : (
          <div className="space-y-2">
            {pageViews.map((page) => (
              <HeatmapBar
                key={page.pagePath}
                label={page.pagePath}
                value={page.viewCount}
                maxValue={maxPageViews}
                sublabel={`${page.uniqueUsers} user${page.uniqueUsers !== 1 ? 's' : ''}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Feature Usage */}
      <div
        className={cn(
          'glass-standard rounded-2xl p-6'
        )}
      >
        <h2 className="text-xl font-semibold text-warm-900 mb-4">Feature Usage</h2>
        {featureUsage.length === 0 ? (
          <p className="text-sm text-warm-400 text-center py-8">
            No feature usage data available yet.
          </p>
        ) : (
          <div className="space-y-2">
            {featureUsage.map((feature) => (
              <HeatmapBar
                key={feature.featureName}
                label={feature.featureName}
                value={feature.useCount}
                maxValue={maxFeatureUse}
                sublabel={`${feature.uniqueUsers} user${feature.uniqueUsers !== 1 ? 's' : ''}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dead Features */}
      {deadFeatures.length > 0 && (
        <div
          className={cn(
            'glass-standard rounded-2xl p-6',
            'border-l-4 border-l-amber-400'
          )}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-amber-600 text-sm font-bold">!</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-warm-900">
                Low-Usage Features
              </h3>
              <p className="text-sm text-warm-500 mt-1">
                These features have less than 5% adoption. Consider improving discoverability
                or removing them.
              </p>
              <ul className="mt-3 space-y-1">
                {deadFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="text-sm text-warm-900 flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
