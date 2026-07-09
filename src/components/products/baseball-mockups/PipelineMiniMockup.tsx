'use client';

import { cn } from '@/lib/utils';

export function PipelineMiniMockup() {
  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="bg-gradient-to-br from-warm-900 to-warm-800 rounded-2xl p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white">Recruiting Pipeline</h3>
            <p className="text-xs text-warm-400">Class of 2026</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs font-medium rounded">
              47 prospects
            </span>
          </div>
        </div>

        {/* Pipeline visualization */}
        <div className="flex items-end gap-3 h-32">
          <PipelineBar label="Watch" count={23} height="100%" color="slate" />
          <PipelineBar label="Priority" count={12} height="70%" color="amber" />
          <PipelineBar label="Offered" count={8} height="50%" color="blue" />
          <PipelineBar label="Commit" count={4} height="30%" color="emerald" />
        </div>

        {/* Recent activity */}
        <div className="mt-4 pt-4 border-t border-warm-700">
          <p className="text-xs text-warm-400 mb-2">Recent Activity</p>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-6 h-6 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-xs">
              ✓
            </div>
            <span className="text-warm-300">Jake M. committed</span>
            <span className="text-warm-500 text-xs ml-auto">2h ago</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PipelineBar({
  label,
  count,
  height,
  color
}: {
  label: string;
  count: number;
  height: string;
  color: 'slate' | 'amber' | 'blue' | 'emerald'
}) {
  const colors = {
    slate: 'from-warm-500 to-warm-600',
    amber: 'from-amber-500 to-orange-500',
    blue: 'from-blue-500 to-indigo-500',
    emerald: 'from-primary-500 to-teal-500'
  };

  return (
    <div className="flex-1 flex flex-col items-center">
      <div
        className={cn(
          "w-full rounded-t-lg bg-gradient-to-t",
          colors[color]
        )}
        style={{ height }}
      >
        <div className="text-center pt-2">
          <span className="text-lg font-bold text-white">{count}</span>
        </div>
      </div>
      <span className="text-xs text-warm-400 mt-2">{label}</span>
    </div>
  );
}
