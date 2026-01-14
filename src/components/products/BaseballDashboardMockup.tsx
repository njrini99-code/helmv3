'use client';

import { cn } from '@/lib/utils';

/**
 * Large, realistic mockup of the BaseballHelm recruiting dashboard
 * Shows actual product UI: pipeline board, player cards, discovery
 * Editorial product showcase - the product IS the hero
 */
export function BaseballDashboardMockup() {
  return (
    <div className="relative w-full max-w-5xl mx-auto">
      {/* Perspective container for 3D effect */}
      <div
        className="relative"
        style={{
          perspective: '2000px',
          transformStyle: 'preserve-3d'
        }}
      >
        {/* Main dashboard frame */}
        <div
          className={cn(
            "relative rounded-2xl overflow-hidden",
            "bg-gradient-to-br from-slate-50 to-slate-100",
            "border border-slate-200/60",
            "shadow-[0_25px_100px_-12px_rgba(0,0,0,0.15)]"
          )}
          style={{
            transform: 'rotateX(2deg) rotateY(1deg)',
            transformOrigin: 'center center'
          }}
        >
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 bg-white/80 border-b border-slate-200/60">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="px-4 py-1 bg-slate-100 rounded-md text-xs text-slate-500 font-medium">
                baseballhelm.app/recruiting
              </div>
            </div>
            <div className="w-16" />
          </div>

          {/* Dashboard content */}
          <div className="flex min-h-[480px]">
            {/* Sidebar */}
            <div className="w-56 bg-white/60 backdrop-blur-sm border-r border-slate-200/40 p-4">
              {/* Logo */}
              <div className="flex items-center gap-2 mb-8">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 12s1.5-4 4-4 4 4 4 4-1.5 4-4 4-4-4-4-4z" />
                  </svg>
                </div>
                <span className="font-semibold text-slate-900">BaseballHelm</span>
              </div>

              {/* Nav items */}
              <div className="space-y-1">
                <NavItem icon="home" label="Dashboard" />
                <NavItem active icon="search" label="Discover" badge="New" />
                <NavItem icon="star" label="Watchlist" count="23" />
                <NavItem icon="kanban" label="Pipeline" />
                <NavItem icon="compare" label="Compare" />
                <NavItem icon="video" label="Videos" />
                <NavItem icon="calendar" label="Camps" />
              </div>
            </div>

            {/* Main content area - Pipeline Board */}
            <div className="flex-1 p-6 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">Recruiting Pipeline</h1>
                  <p className="text-sm text-slate-500">Class of 2026 • 47 prospects</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg">
                    Filter
                  </button>
                  <button className="px-4 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg shadow-sm">
                    + Add Prospect
                  </button>
                </div>
              </div>

              {/* Kanban Board */}
              <div className="flex gap-4 overflow-x-auto pb-2">
                {/* Watchlist Column */}
                <PipelineColumn
                  title="Watchlist"
                  count={12}
                  color="slate"
                >
                  <PlayerCard
                    name="Jake Martinez"
                    position="RHP"
                    school="Austin HS"
                    metrics={["94 mph", "3.8 GPA"]}
                    priority="high"
                  />
                  <PlayerCard
                    name="Ryan Chen"
                    position="SS"
                    school="Westlake"
                    metrics={["96 EV", "6.5 60yd"]}
                  />
                </PipelineColumn>

                {/* High Priority Column */}
                <PipelineColumn
                  title="High Priority"
                  count={8}
                  color="amber"
                >
                  <PlayerCard
                    name="Marcus Johnson"
                    position="OF"
                    school="Memorial HS"
                    metrics={["98 EV", "6.4 60yd"]}
                    priority="high"
                    hasVideo
                  />
                  <PlayerCard
                    name="Tyler Smith"
                    position="C"
                    school="Lake Travis"
                    metrics={["Pop: 1.92", "3.6 GPA"]}
                    hasVideo
                  />
                </PipelineColumn>

                {/* Offer Extended Column */}
                <PipelineColumn
                  title="Offer Extended"
                  count={4}
                  color="blue"
                >
                  <PlayerCard
                    name="Chris Williams"
                    position="1B"
                    school="Dripping Springs"
                    metrics={["102 EV", "3.9 GPA"]}
                    offered
                    hasVideo
                  />
                </PipelineColumn>

                {/* Committed Column */}
                <PipelineColumn
                  title="Committed"
                  count={2}
                  color="green"
                >
                  <PlayerCard
                    name="Andrew Davis"
                    position="LHP"
                    school="Bowie HS"
                    metrics={["92 mph", "4.0 GPA"]}
                    committed
                  />
                </PipelineColumn>
              </div>
            </div>
          </div>
        </div>

        {/* Reflection/glow effect */}
        <div
          className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-gradient-to-t from-transparent to-blue-500/5 blur-2xl rounded-full"
        />
      </div>
    </div>
  );
}

// Sidebar nav item
function NavItem({
  icon,
  label,
  active,
  badge,
  count
}: {
  icon: string;
  label: string;
  active?: boolean;
  badge?: string;
  count?: string;
}) {
  const icons: Record<string, React.ReactNode> = {
    home: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </svg>
    ),
    search: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
    star: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
      </svg>
    ),
    kanban: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="18" rx="1" />
        <rect x="14" y="3" width="7" height="10" rx="1" />
      </svg>
    ),
    compare: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 3h5v5M8 3H3v5M21 3l-7 7M3 3l7 7M21 21l-7-7M3 21l7-7M16 21h5v-5M8 21H3v-5" />
      </svg>
    ),
    video: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <polygon points="10,9 16,12 10,15" />
      </svg>
    ),
    calendar: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
        active
          ? "bg-blue-500/10 text-blue-600 font-medium"
          : "text-slate-600 hover:bg-slate-100/80"
      )}
    >
      <div className="flex items-center gap-2.5">
        {icons[icon]}
        <span>{label}</span>
      </div>
      {badge && (
        <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-500 text-white rounded">
          {badge}
        </span>
      )}
      {count && (
        <span className="text-xs text-slate-400">{count}</span>
      )}
    </div>
  );
}

// Pipeline column
function PipelineColumn({
  title,
  count,
  color,
  children
}: {
  title: string;
  count: number;
  color: 'slate' | 'amber' | 'blue' | 'green';
  children: React.ReactNode;
}) {
  const colorStyles = {
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="flex-shrink-0 w-64">
      <div className="flex items-center gap-2 mb-3">
        <span className={cn(
          "px-2 py-1 rounded-md text-xs font-semibold",
          colorStyles[color]
        )}>
          {title}
        </span>
        <span className="text-xs text-slate-400">{count}</span>
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

// Player card
function PlayerCard({
  name,
  position,
  school,
  metrics,
  priority,
  hasVideo,
  offered,
  committed
}: {
  name: string;
  position: string;
  school: string;
  metrics: string[];
  priority?: 'high';
  hasVideo?: boolean;
  offered?: boolean;
  committed?: boolean;
}) {
  return (
    <div
      className={cn(
        "p-3 rounded-xl bg-white border shadow-sm",
        "hover:shadow-md transition-shadow cursor-pointer",
        committed ? "border-emerald-200 bg-emerald-50/50" :
        offered ? "border-blue-200 bg-blue-50/50" :
        "border-slate-200"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold flex-shrink-0",
          committed ? "bg-emerald-100 text-emerald-700" :
          offered ? "bg-blue-100 text-blue-700" :
          priority === 'high' ? "bg-amber-100 text-amber-700" :
          "bg-slate-100 text-slate-600"
        )}>
          {name.split(' ').map(n => n[0]).join('')}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 text-sm truncate">{name}</span>
            {hasVideo && (
              <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              {position}
            </span>
            <span className="text-xs text-slate-500 truncate">{school}</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
        {metrics.map((metric, i) => (
          <span key={i} className="text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded">
            {metric}
          </span>
        ))}
      </div>

      {/* Status badge */}
      {committed && (
        <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-emerald-600">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20,6 9,17 4,12" />
          </svg>
          Committed
        </div>
      )}
      {offered && !committed && (
        <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-blue-600">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22,4 12,14.01 9,11.01" />
          </svg>
          Offer Extended
        </div>
      )}
    </div>
  );
}
