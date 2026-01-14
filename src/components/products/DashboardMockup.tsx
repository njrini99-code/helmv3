'use client';

import { GlassSidebar } from "./GlassSidebar";
import { cn } from "@/lib/utils";

/**
 * Stylized dashboard mockup for hero section
 * More abstract/illustrative style matching marketing reference
 */
export function DashboardMockup() {
  return (
    <div className="relative w-full aspect-[16/10] rounded-xl shadow-2xl overflow-hidden border border-white/20">
      {/* Glassmorphic Sidebar */}
      <GlassSidebar />
      
      {/* Main Dashboard Content - More abstract/placeholder style */}
      <div className="absolute inset-0 pl-56 bg-gradient-to-br from-[#FAFAF9] to-[#F5F5F4]">
        {/* Header - Simplified */}
        <div className="px-6 py-5 bg-white/60 backdrop-blur-xl border-b border-white/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-5 w-32 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-24 bg-slate-100 rounded mt-2" />
            </div>
            <div className="flex gap-2">
              <div className="h-2 w-2 rounded-full bg-[#22c55e]" />
              <div className="h-3 w-20 bg-slate-100 rounded" />
            </div>
          </div>
        </div>

        {/* Main Content Area - More placeholder-like */}
        <div className="p-6 space-y-6 overflow-hidden">
          {/* Stats Grid - Simplified */}
          <div className="grid grid-cols-4 gap-3">
            <PlaceholderStatCard accent />
            <PlaceholderStatCard />
            <PlaceholderStatCard />
            <PlaceholderStatCard />
          </div>

          {/* Two Column Layout - Abstract content */}
          <div className="grid grid-cols-2 gap-4">
            {/* Left: Placeholder sections */}
            <div className="space-y-3">
              <div className="h-3 w-24 bg-slate-200 rounded" />
              <div className="space-y-2">
                <PlaceholderAction primary />
                <PlaceholderAction />
                <PlaceholderAction />
              </div>
            </div>

            {/* Right: Placeholder list */}
            <div className="space-y-3">
              <div className="h-3 w-28 bg-slate-200 rounded" />
              <div className="bg-white/45 backdrop-blur-xl border border-white/30 rounded-xl p-4">
                <div className="space-y-3">
                  <PlaceholderRow />
                  <PlaceholderRow />
                  <PlaceholderRow />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simplified placeholder components - more abstract

function PlaceholderStatCard({ accent }: { accent?: boolean }) {
  return (
    <div className={cn(
      "relative overflow-hidden",
      "bg-white/45 backdrop-blur-xl",
      "border rounded-xl p-3",
      "shadow-[0_1px_3px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.5)]",
      accent 
        ? "border-l-2 border-l-[#22c55e] border-t-white/30 border-r-white/30 border-b-white/30"
        : "border-white/30"
    )}>
      <div className="space-y-2">
        <div className="h-2 w-16 bg-slate-200 rounded" />
        <div className="h-6 w-12 bg-slate-300 rounded" />
      </div>
    </div>
  );
}

function PlaceholderAction({ primary }: { primary?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg",
      "border backdrop-blur-xl",
      primary
        ? "bg-[#22c55e] border-[#22c55e]"
        : "bg-white/45 border-white/30"
    )}>
      <div className={cn(
        "w-8 h-8 rounded-lg flex-shrink-0",
        primary ? "bg-white/20" : "bg-slate-100"
      )} />
      <div className="flex-1 space-y-1">
        <div className={cn(
          "h-2 w-20 rounded",
          primary ? "bg-white/80" : "bg-slate-300"
        )} />
        <div className={cn(
          "h-2 w-16 rounded",
          primary ? "bg-white/60" : "bg-slate-200"
        )} />
      </div>
    </div>
  );
}

function PlaceholderRow() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 rounded-full bg-[#22c55e]/10 flex-shrink-0" />
      <div className="flex-1">
        <div className="h-2 w-24 bg-slate-200 rounded" />
      </div>
      <div className="h-3 w-10 bg-slate-300 rounded" />
    </div>
  );
}
