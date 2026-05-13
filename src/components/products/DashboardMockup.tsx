'use client';

import { cn } from "@/lib/utils";

/**
 * Premium iPhone-style phone mockup for products hero
 * Professional device frame with realistic details
 */
export function DashboardMockup() {
  return (
    <div className="relative flex items-center justify-center py-4">
      {/* Phone Frame */}
      <div className="relative">
        {/* Outer bezel - the phone body */}
        <div className="relative w-[280px] sm:w-[320px] h-[560px] sm:h-[640px] bg-warm-900 rounded-[3rem] p-[10px] shadow-2xl">
          {/* Side buttons - Volume */}
          <div className="absolute -left-[3px] top-[100px] w-[3px] h-[30px] bg-warm-700 rounded-l-sm" />
          <div className="absolute -left-[3px] top-[145px] w-[3px] h-[50px] bg-warm-700 rounded-l-sm" />
          <div className="absolute -left-[3px] top-[205px] w-[3px] h-[50px] bg-warm-700 rounded-l-sm" />
          {/* Side button - Power */}
          <div className="absolute -right-[3px] top-[160px] w-[3px] h-[70px] bg-warm-700 rounded-r-sm" />

          {/* Inner bezel with subtle gradient */}
          <div className="relative w-full h-full bg-gradient-to-b from-warm-800 to-warm-900 rounded-[2.5rem] p-[2px]">
            {/* Screen container */}
            <div className="relative w-full h-full bg-white rounded-[2.4rem] overflow-hidden">
              {/* Dynamic Island / Notch */}
              <div className="absolute top-3 left-1/2 -tranwarm-x-1/2 z-20">
                <div className="w-[90px] sm:w-[110px] h-[28px] sm:h-[32px] bg-warm-900 rounded-full flex items-center justify-center gap-2">
                  {/* Camera */}
                  <div className="w-3 h-3 rounded-full bg-warm-800 ring-1 ring-warm-700">
                    <div className="w-1.5 h-1.5 rounded-full bg-warm-600 mt-[3px] ml-[3px]" />
                  </div>
                </div>
              </div>

              {/* Status Bar */}
              <div className="absolute top-0 left-0 right-0 h-12 z-10 flex items-end justify-between px-6 pb-1">
                <span className="text-micro font-semibold text-warm-900">9:41</span>
                <div className="flex items-center gap-1">
                  {/* Signal */}
                  <div className="flex items-end gap-[2px]">
                    <div className="w-[3px] h-[4px] bg-warm-900 rounded-sm" />
                    <div className="w-[3px] h-[6px] bg-warm-900 rounded-sm" />
                    <div className="w-[3px] h-[8px] bg-warm-900 rounded-sm" />
                    <div className="w-[3px] h-[10px] bg-warm-900 rounded-sm" />
                  </div>
                  {/* Wifi */}
                  <svg className="w-3.5 h-3.5 text-warm-900" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 18c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm-4.9-2.3c2.6-2.6 6.8-2.6 9.4 0l-1.4 1.4c-1.8-1.8-4.7-1.8-6.5 0l-1.5-1.4zm-2.8-2.8c4.2-4.2 10.9-4.2 15.1 0l-1.4 1.4c-3.4-3.4-8.9-3.4-12.3 0l-1.4-1.4zm-2.8-2.8c5.6-5.6 14.7-5.6 20.3 0l-1.4 1.4c-4.8-4.8-12.7-4.8-17.5 0l-1.4-1.4z" />
                  </svg>
                  {/* Battery */}
                  <div className="flex items-center gap-0.5">
                    <div className="w-5 h-2.5 border border-warm-900 rounded-sm p-[1px]">
                      <div className="w-full h-full bg-warm-900 rounded-[1px]" />
                    </div>
                    <div className="w-[2px] h-1 bg-warm-900 rounded-r-full" />
                  </div>
                </div>
              </div>

              {/* App Content */}
              <div className="absolute inset-0 pt-14 bg-gradient-to-b from-[#FAFAF9] to-[#F5F5F4]">
                {/* App Header */}
                <div className="px-4 py-3 bg-cream-100/82 backdrop-blur-xl border-b border-warm-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-warm-900">Dashboard</div>
                      <div className="text-micro text-warm-500">Team Overview</div>
                    </div>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Active Players" value="24" accent />
                    <StatCard label="Avg. Score" value="72.4" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Rounds Logged" value="148" />
                    <StatCard label="Team Rank" value="#3" accent />
                  </div>

                  {/* Quick Actions */}
                  <div className="mt-4">
                    <div className="text-micro font-medium text-warm-500 uppercase tracking-wider mb-2">Quick Actions</div>
                    <div className="space-y-2">
                      <ActionRow icon="plus" label="Log New Round" primary />
                      <ActionRow icon="users" label="View Roster" />
                      <ActionRow icon="chart" label="Performance Stats" />
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="mt-4">
                    <div className="text-micro font-medium text-warm-500 uppercase tracking-wider mb-2">Recent Activity</div>
                    <div className="bg-white rounded-xl border border-warm-100 p-3 space-y-2.5">
                      <ActivityRow name="J. Smith" action="scored 71" time="2h ago" />
                      <ActivityRow name="M. Davis" action="completed practice" time="4h ago" />
                      <ActivityRow name="T. Wilson" action="logged 18 holes" time="Yesterday" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Home Indicator */}
              <div className="absolute bottom-2 left-1/2 -tranwarm-x-1/2 w-32 h-1 bg-warm-900 rounded-full" />
            </div>
          </div>
        </div>

        {/* Reflection/Glow effect */}
        <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/10 via-transparent to-blue-500/10 rounded-[4rem] blur-2xl -z-10" />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn(
      "bg-white rounded-xl p-3 border",
      accent ? "border-emerald-200 bg-emerald-50/50" : "border-warm-100"
    )}>
      <div className="text-micro text-warm-500 mb-1">{label}</div>
      <div className={cn(
        "text-lg font-bold",
        accent ? "text-emerald-600" : "text-warm-900"
      )}>{value}</div>
    </div>
  );
}

function ActionRow({ icon, label, primary }: { icon: string; label: string; primary?: boolean }) {
  const icons = {
    plus: <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />,
    users: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />,
    chart: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
  };

  return (
    <div className={cn(
      "flex items-center gap-3 p-2.5 rounded-lg",
      primary ? "bg-emerald-500 text-white" : "bg-white border border-warm-100"
    )}>
      <div className={cn(
        "w-7 h-7 rounded-lg flex items-center justify-center",
        primary ? "bg-white/20" : "bg-warm-100"
      )}>
        <svg className={cn("w-4 h-4", primary ? "text-white" : "text-warm-600")} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          {icons[icon as keyof typeof icons]}
        </svg>
      </div>
      <span className={cn("text-xs font-medium", primary ? "text-white" : "text-warm-700")}>{label}</span>
    </div>
  );
}

function ActivityRow({ name, action, time }: { name: string; action: string; time: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
        <span className="text-[9px] font-semibold text-emerald-600">{name.split(' ').map(n => n[0]).join('')}</span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-label text-warm-900 font-medium">{name}</span>
        <span className="text-label text-warm-500"> {action}</span>
      </div>
      <span className="text-[9px] text-warm-400 flex-shrink-0">{time}</span>
    </div>
  );
}
