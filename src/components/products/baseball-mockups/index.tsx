'use client';

import { cn } from '@/lib/utils';

/**
 * BaseballHelm Feature Mockups - Varied visual treatments
 * Each mockup showcases a different product feature with unique styling
 */

// ============================================
// 1. PLAYER DISCOVERY - Search/Filter Interface
// ============================================
export function DiscoveryMockup() {
  const players = [
    { name: 'Jake Martinez', pos: 'RHP', school: 'Austin HS, TX', velo: 94, ev: null, gpa: 3.8 },
    { name: 'Marcus Johnson', pos: 'OF', school: 'Memorial, TX', velo: null, ev: 98, gpa: 3.6 },
    { name: 'Tyler Smith', pos: 'C', school: 'Lake Travis, TX', velo: null, ev: 92, gpa: 3.9 },
  ];

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Search header */}
        <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="flex items-center gap-2 bg-white/20 backdrop-blur rounded-xl px-4 py-2.5">
            <svg className="w-5 h-5 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <span className="text-white/70 text-sm">Search 12,847 prospects...</span>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="px-3 py-1 bg-white text-blue-600 text-xs font-medium rounded-full">
              Class 2026
            </span>
            <span className="px-3 py-1 bg-white/20 text-white text-xs font-medium rounded-full">
              Texas
            </span>
            <span className="px-3 py-1 bg-white/20 text-white text-xs font-medium rounded-full">
              90+ mph
            </span>
            <span className="px-3 py-1 bg-white/20 text-white text-xs font-medium rounded-full">
              +3 more
            </span>
          </div>
        </div>

        {/* Results */}
        <div className="p-2">
          <p className="px-2 py-2 text-xs text-slate-500 font-medium">
            247 prospects match your filters
          </p>

          <div className="space-y-2">
            {players.map((player, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-blue-600 font-semibold">
                  {player.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{player.name}</span>
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                      {player.pos}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{player.school}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">
                    {player.velo ? `${player.velo} mph` : `${player.ev} EV`}
                  </p>
                  <p className="text-xs text-slate-500">{player.gpa} GPA</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating "Add to Watchlist" action */}
      <div className="absolute -right-4 top-1/2 -translate-y-1/2 bg-blue-600 text-white p-3 rounded-full shadow-lg cursor-pointer hover:bg-blue-700 transition-colors">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
    </div>
  );
}

// ============================================
// 2. PLAYER COMPARISON - Side by Side Cards
// ============================================
export function CompareMockup() {
  const players = [
    {
      name: 'Jake Martinez',
      pos: 'RHP',
      stats: { velo: 94, spin: 2340, cmd: 85, gpa: 3.8 }
    },
    {
      name: 'Chris Williams',
      pos: 'RHP',
      stats: { velo: 92, spin: 2480, cmd: 92, gpa: 3.9 }
    }
  ];

  const statLabels = [
    { key: 'velo', label: 'Velocity', unit: 'mph' },
    { key: 'spin', label: 'Spin Rate', unit: 'rpm' },
    { key: 'cmd', label: 'Command', unit: '%' },
    { key: 'gpa', label: 'GPA', unit: '' }
  ];

  return (
    <div className="relative w-full max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-4">
        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full">
          COMPARE MODE
        </span>
      </div>

      {/* Comparison cards */}
      <div className="flex gap-4">
        {players.map((player, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 bg-white rounded-2xl shadow-xl overflow-hidden border-2",
              i === 0 ? "border-blue-200" : "border-indigo-200"
            )}
          >
            {/* Player header */}
            <div className={cn(
              "p-4 text-center",
              i === 0 ? "bg-gradient-to-br from-blue-500 to-blue-600" : "bg-gradient-to-br from-indigo-500 to-indigo-600"
            )}>
              <div className="w-16 h-16 mx-auto rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-2xl font-bold text-white mb-2">
                {player.name.split(' ').map(n => n[0]).join('')}
              </div>
              <h4 className="font-semibold text-white">{player.name}</h4>
              <span className="text-sm text-white/80">{player.pos}</span>
            </div>

            {/* Stats */}
            <div className="p-4 space-y-3">
              {statLabels.map((stat) => {
                const value = player.stats[stat.key as keyof typeof player.stats];
                const otherValue = players[1 - i].stats[stat.key as keyof typeof players[0]['stats']];
                const isWinner = value > otherValue;

                return (
                  <div key={stat.key} className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{stat.label}</span>
                    <span className={cn(
                      "font-semibold",
                      isWinner ? "text-emerald-600" : "text-slate-700"
                    )}>
                      {value}{stat.unit}
                      {isWinner && <span className="ml-1">✓</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* VS badge */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-bold shadow-xl z-10">
        VS
      </div>
    </div>
  );
}

// ============================================
// 3. VIDEO LIBRARY - Grid Style
// ============================================
export function VideoMockup() {
  const videos = [
    { title: 'At-Bat vs Austin HS', player: 'Jake M.', duration: '0:45', type: 'At-Bat', thumbnail: '🎬' },
    { title: 'Bullpen Session', player: 'Chris W.', duration: '2:30', type: 'Practice', thumbnail: '⚾' },
    { title: 'Game Highlights', player: 'Marcus J.', duration: '1:15', type: 'Highlight', thumbnail: '🏆' },
    { title: 'Defensive Play', player: 'Tyler S.', duration: '0:22', type: 'Defense', thumbnail: '🧤' },
  ];

  return (
    <div className="relative w-full max-w-sm mx-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Video Library</h3>
          <span className="text-xs text-slate-500">234 clips</span>
        </div>

        {/* Video grid */}
        <div className="grid grid-cols-2 gap-2 p-3">
          {videos.map((video, i) => (
            <div
              key={i}
              className="group relative rounded-xl overflow-hidden cursor-pointer"
            >
              {/* Thumbnail */}
              <div className={cn(
                "aspect-video flex items-center justify-center text-3xl",
                i === 0 && "bg-gradient-to-br from-blue-400 to-blue-600",
                i === 1 && "bg-gradient-to-br from-emerald-400 to-emerald-600",
                i === 2 && "bg-gradient-to-br from-amber-400 to-orange-500",
                i === 3 && "bg-gradient-to-br from-purple-400 to-indigo-600"
              )}>
                {video.thumbnail}

                {/* Play button overlay */}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-900 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Duration badge */}
              <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                {video.duration}
              </span>

              {/* Info */}
              <div className="p-2">
                <p className="text-sm font-medium text-slate-900 truncate">{video.title}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-slate-500">{video.player}</span>
                  <span className="text-xs text-blue-600">{video.type}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Upload CTA */}
        <div className="p-3 border-t border-slate-100">
          <button className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors">
            + Upload Video
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 4. RECRUITING PIPELINE - Kanban Mini
// ============================================
export function PipelineMiniMockup() {
  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white">Recruiting Pipeline</h3>
            <p className="text-xs text-slate-400">Class of 2026</p>
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
        <div className="mt-4 pt-4 border-t border-slate-700">
          <p className="text-xs text-slate-400 mb-2">Recent Activity</p>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">
              ✓
            </div>
            <span className="text-slate-300">Jake M. committed</span>
            <span className="text-slate-500 text-xs ml-auto">2h ago</span>
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
    slate: 'from-slate-500 to-slate-600',
    amber: 'from-amber-500 to-orange-500',
    blue: 'from-blue-500 to-indigo-500',
    emerald: 'from-emerald-500 to-teal-500'
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
      <span className="text-xs text-slate-400 mt-2">{label}</span>
    </div>
  );
}
