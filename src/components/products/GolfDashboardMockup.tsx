'use client';

import { cn } from '@/lib/utils';

/**
 * Large, realistic mockup of the GolfHelm dashboard
 * Shows actual product UI: stats, live tracking, roster
 * Editorial product showcase - the product IS the hero
 */
export function GolfDashboardMockup() {
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
            "bg-gradient-to-br from-[#FFFEFA] to-[#F8F6F3]",
            "border border-slate-200/60",
            "shadow-[0_25px_100px_-12px_rgba(0,0,0,0.15)]"
          )}
          style={{
            transform: 'rotateX(2deg) rotateY(-1deg)',
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
                golfhelm.app/dashboard
              </div>
            </div>
            <div className="w-16" /> {/* Spacer for symmetry */}
          </div>

          {/* Dashboard content */}
          <div className="flex min-h-[480px]">
            {/* Sidebar */}
            <div className="w-56 bg-white/60 backdrop-blur-sm border-r border-slate-200/40 p-4">
              {/* Logo */}
              <div className="flex items-center gap-2 mb-8">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#16A34A] to-[#15803D] flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                  </svg>
                </div>
                <span className="font-semibold text-slate-900">GolfHelm</span>
              </div>

              {/* Nav items */}
              <div className="space-y-1">
                <NavItem active icon="home" label="Dashboard" />
                <NavItem icon="users" label="Roster" />
                <NavItem icon="flag" label="Rounds" badge="3" />
                <NavItem icon="trophy" label="Qualifiers" />
                <NavItem icon="calendar" label="Calendar" />
                <NavItem icon="chart" label="Stats" />
              </div>

              {/* CoachHelm AI badge */}
              <div className="mt-8 p-3 rounded-xl bg-gradient-to-br from-[#16A34A]/10 to-[#16A34A]/5 border border-[#16A34A]/20">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-5 h-5 rounded-full bg-[#16A34A] flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-[#16A34A]">CoachHelm AI</span>
                </div>
                <p className="text-xs text-slate-500">3 insights ready</p>
              </div>
            </div>

            {/* Main content area */}
            <div className="flex-1 p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">Team Dashboard</h1>
                  <p className="text-sm text-slate-500">Spring 2026 Season</p>
                </div>
                <button className="px-4 py-2 bg-[#16A34A] text-white text-sm font-medium rounded-lg shadow-sm">
                  + New Round
                </button>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard label="Team Avg" value="74.2" trend="-1.3" positive />
                <StatCard label="GIR %" value="68%" trend="+4%" positive />
                <StatCard label="Putts/Round" value="31.4" trend="-0.8" positive />
                <StatCard label="Rounds" value="127" />
              </div>

              {/* Two column layout */}
              <div className="grid grid-cols-2 gap-6">
                {/* Live round tracking */}
                <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-slate-900">Live Rounds</h3>
                    <span className="flex items-center gap-1.5 text-xs text-[#16A34A] font-medium">
                      <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
                      2 Active
                    </span>
                  </div>
                  <div className="space-y-3">
                    <LiveRoundRow name="Jake M." hole="7" score="-1" />
                    <LiveRoundRow name="Chris P." hole="12" score="E" />
                  </div>
                </div>

                {/* Recent activity */}
                <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
                  <h3 className="font-medium text-slate-900 mb-4">Recent Activity</h3>
                  <div className="space-y-3">
                    <ActivityRow
                      avatar="JM"
                      text="Jake M. completed round at Pebble Beach"
                      score="71"
                      time="2h ago"
                    />
                    <ActivityRow
                      avatar="CP"
                      text="Chris P. started qualifier round"
                      time="3h ago"
                    />
                    <ActivityRow
                      avatar="MT"
                      text="Mike T. uploaded practice session"
                      time="5h ago"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reflection/glow effect */}
        <div
          className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-gradient-to-t from-transparent to-[#16A34A]/5 blur-2xl rounded-full"
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
  badge
}: {
  icon: string;
  label: string;
  active?: boolean;
  badge?: string;
}) {
  const icons: Record<string, React.ReactNode> = {
    home: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </svg>
    ),
    users: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    flag: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
    trophy: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M4 22h16M10 22V9M14 22V9M8 4h8" />
        <path d="M8 4a2 2 0 012-2h4a2 2 0 012 2v5a4 4 0 01-8 0V4z" />
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
    chart: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
        active
          ? "bg-[#16A34A]/10 text-[#16A34A] font-medium"
          : "text-slate-600 hover:bg-slate-100/80"
      )}
    >
      <div className="flex items-center gap-2.5">
        {icons[icon]}
        <span>{label}</span>
      </div>
      {badge && (
        <span className="px-1.5 py-0.5 text-xs font-medium bg-[#16A34A] text-white rounded">
          {badge}
        </span>
      )}
    </div>
  );
}

// Stat card
function StatCard({
  label,
  value,
  trend,
  positive
}: {
  label: string;
  value: string;
  trend?: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-semibold text-slate-900">{value}</span>
        {trend && (
          <span className={cn(
            "text-xs font-medium",
            positive ? "text-[#16A34A]" : "text-slate-400"
          )}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}

// Live round row
function LiveRoundRow({ name, hole, score }: { name: string; hole: string; score: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
          {name.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-900">{name}</p>
          <p className="text-xs text-slate-500">Hole {hole}</p>
        </div>
      </div>
      <span className={cn(
        "text-sm font-semibold",
        score.startsWith('-') ? "text-[#16A34A]" : "text-slate-600"
      )}>
        {score}
      </span>
    </div>
  );
}

// Activity row
function ActivityRow({
  avatar,
  text,
  score,
  time
}: {
  avatar: string;
  text: string;
  score?: string;
  time: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-[#16A34A]/10 flex items-center justify-center text-xs font-medium text-[#16A34A] flex-shrink-0">
        {avatar}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-600 leading-tight">{text}</p>
        <div className="flex items-center gap-2 mt-1">
          {score && (
            <span className="text-xs font-semibold text-[#16A34A]">{score}</span>
          )}
          <span className="text-xs text-slate-400">{time}</span>
        </div>
      </div>
    </div>
  );
}
