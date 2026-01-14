'use client';

import { Users, Trophy, Calendar, TrendingUp, Plus, MessageSquare, Flag } from "lucide-react";
import { GlassSidebar } from "./GlassSidebar";
import { cn } from "@/lib/utils";

/**
 * Beautiful dashboard mockup for hero section
 * Showcases team management capabilities with premium glassmorphism design
 */
export function DashboardMockup() {
  return (
    <div className="relative w-full aspect-[16/10] rounded-xl shadow-2xl overflow-hidden border border-white/20">
      {/* Glassmorphic Sidebar */}
      <GlassSidebar />
      
      {/* Main Dashboard Content */}
      <div className="absolute inset-0 pl-56 bg-gradient-to-br from-[#FAFAF9] to-[#F5F5F4]">
        {/* Header */}
        <div className="px-6 py-5 bg-white/60 backdrop-blur-xl border-b border-white/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Good afternoon, Coach</h2>
              <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                University Golf Team
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6 space-y-6 overflow-hidden">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard
              icon={<Users size={16} />}
              label="Roster Size"
              value="24"
              accent
            />
            <StatCard
              icon={<Calendar size={16} />}
              label="Upcoming"
              value="8"
            />
            <StatCard
              icon={<Flag size={16} />}
              label="Qualifiers"
              value="3"
            />
            <StatCard
              icon={<TrendingUp size={16} />}
              label="Team Avg"
              value="74.2"
            />
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-2 gap-4">
            {/* Left: Quick Actions */}
            <div className="space-y-3">
              <SectionHeader title="Quick Actions" />
              <div className="space-y-2">
                <QuickAction
                  icon={<Plus size={14} className="text-white" />}
                  label="Add Player"
                  description="Invite to roster"
                  variant="primary"
                />
                <QuickAction
                  icon={<Flag size={14} />}
                  label="Create Qualifier"
                  description="Set up team qualifier"
                />
                <QuickAction
                  icon={<Calendar size={14} />}
                  label="Schedule Event"
                  description="Practice or tournament"
                />
              </div>
            </div>

            {/* Right: Top Performers */}
            <div className="space-y-3">
              <SectionHeader title="Top Performers" />
              <GlassCard>
                <div className="space-y-3">
                  <PerformerRow rank={1} name="Alex Martinez" score="72.3" />
                  <PerformerRow rank={2} name="Jordan Kim" score="73.1" />
                  <PerformerRow rank={3} name="Sam Johnson" score="73.8" />
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components

function StatCard({ 
  icon, 
  label, 
  value, 
  accent 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string; 
  accent?: boolean; 
}) {
  return (
    <div className={cn(
      "relative overflow-hidden group",
      "bg-white/45 backdrop-blur-xl",
      "border rounded-xl p-3",
      "shadow-[0_1px_3px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.5)]",
      accent 
        ? "border-l-2 border-l-[#22c55e] border-t-white/30 border-r-white/30 border-b-white/30"
        : "border-white/30"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-[10px] font-medium text-slate-500 mb-0.5">{label}</p>
          <p className="text-lg font-bold text-slate-900">{value}</p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold text-slate-900 mb-2">{title}</h3>
  );
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-white/45 backdrop-blur-xl border border-white/30 rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.5)]">
      {children}
    </div>
  );
}

function QuickAction({
  icon,
  label,
  description,
  variant
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  variant?: 'primary';
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer",
      "border backdrop-blur-xl",
      variant === 'primary'
        ? "bg-[#22c55e] border-[#22c55e] text-white shadow-[0_2px_8px_rgba(34,197,94,0.2)]"
        : "bg-white/45 border-white/30 text-slate-900 hover:bg-white/60"
    )}>
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
        variant === 'primary' ? "bg-white/20" : "bg-slate-100"
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-xs font-semibold",
          variant === 'primary' ? "text-white" : "text-slate-900"
        )}>{label}</p>
        <p className={cn(
          "text-[10px]",
          variant === 'primary' ? "text-white/70" : "text-slate-500"
        )}>{description}</p>
      </div>
    </div>
  );
}

function PerformerRow({ rank, name, score }: { rank: number; name: string; score: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 rounded-full bg-[#22c55e]/10 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-[#22c55e]">{rank}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-900">{name}</p>
      </div>
      <div className="text-xs font-bold text-slate-900 tabular-nums">{score}</div>
    </div>
  );
}
