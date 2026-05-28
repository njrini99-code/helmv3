'use client';

import { cn } from '@/lib/utils';

/**
 * Premium Video Library Mockup
 * Cinematic design with visual-only elements, no icons
 */
export function VideoMockup() {
  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Main container - cinematic dark theme */}
      <div className="bg-gradient-to-b from-[#0a0a0a] to-[#141414] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
        {/* Header - minimal */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-white/5">
          <div>
            <h3 className="font-semibold text-white text-sm tracking-tight">Video Library</h3>
            <p className="text-micro text-white/40 mt-0.5">234 clips • 12.4 GB</p>
          </div>
          <button className="px-3 py-1.5 bg-emerald-500 text-white text-micro font-semibold rounded-md hover:bg-blue-400 transition-colors tracking-wide uppercase">
            Upload
          </button>
        </div>

        {/* Featured Video - cinematic player */}
        <div className="relative aspect-[16/9] group cursor-pointer overflow-hidden">
          {/* Cinematic video frame with blurred motion effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-warm-800 via-warm-900 to-black">
            {/* Abstract baseball field visualization - geometric, no icons */}
            <div className="absolute inset-0 flex items-center justify-center opacity-40">
              {/* Diamond outline */}
              <div className="relative w-24 h-24 rotate-45">
                <div className="absolute inset-0 border border-white/20" />
                {/* Base markers as simple squares */}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-cream-100/68" />
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-cream-100/68" />
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-cream-100/68" />
                <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-cream-100/68" />
              </div>
            </div>

            {/* Motion blur streaks */}
            <div className="absolute top-1/4 left-1/5 w-32 h-px bg-gradient-to-r from-white/30 via-white/10 to-transparent rotate-12" />
            <div className="absolute top-1/2 left-1/4 w-24 h-px bg-gradient-to-r from-emerald-400/40 to-transparent -rotate-6" />
            <div className="absolute bottom-1/3 right-1/4 w-20 h-px bg-gradient-to-l from-white/20 to-transparent rotate-3" />
          </div>

          {/* Gradient overlays for depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />

          {/* Cinematic letterbox bars */}
          <div className="absolute top-0 left-0 right-0 h-3 bg-black" />
          <div className="absolute bottom-0 left-0 right-0 h-3 bg-black" />

          {/* Play button - clean circle, no icon inside */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm ring-2 ring-white/30 flex items-center justify-center group-hover:bg-white/20 group-hover:scale-110 transition-all duration-300">
              {/* Triangle play shape using CSS */}
              <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1" />
            </div>
          </div>

          {/* Video metadata overlay */}
          <div className="absolute bottom-3 left-4 right-4">
            <div className="flex items-end justify-between">
              <div>
                <span className="inline-block px-2 py-0.5 bg-emerald-500 text-eyebrow text-white font-bold uppercase tracking-wider rounded mb-1">
                  Highlight
                </span>
                <h4 className="text-white font-semibold text-sm">State Championship At-Bat</h4>
                <p className="text-white/50 text-label">Jake Martinez • Walk-off Double</p>
              </div>
              <span className="text-white/80 text-label font-medium bg-black/60 px-2 py-1 rounded">0:45</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
            <div className="h-full w-[35%] bg-emerald-500" />
          </div>
        </div>

        {/* Video grid - clean visual thumbnails */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-micro text-white/40 uppercase tracking-widest font-medium">Recent</span>
            <span className="text-micro text-emerald-400 hover:text-emerald-300 cursor-pointer">View All</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <VideoThumb
              color="from-emerald-700 to-emerald-900"
              label="Bullpen"
              duration="2:30"
              isNew
            />
            <VideoThumb
              color="from-orange-600 to-red-800"
              label="Game Film"
              duration="1:15"
            />
            <VideoThumb
              color="from-violet-700 to-purple-900"
              label="Drills"
              duration="0:48"
            />
          </div>
        </div>

        {/* Bottom actions - text only, no icons */}
        <div className="px-4 pb-4 flex gap-2">
          <button className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 text-label font-medium rounded-lg transition-colors ring-1 ring-white/10">
            Create Clip
          </button>
          <button className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 text-label font-medium rounded-lg transition-colors ring-1 ring-white/10">
            Share
          </button>
        </div>
      </div>
    </div>
  );
}

function VideoThumb({ color, label, duration, isNew }: {
  color: string;
  label: string;
  duration: string;
  isNew?: boolean;
}) {
  return (
    <div className="group relative cursor-pointer">
      {/* Thumbnail with gradient */}
      <div className={cn(
        "aspect-video rounded-lg overflow-hidden relative",
        `bg-gradient-to-br ${color}`
      )}>
        {/* Film grain texture overlay */}
        <div className="absolute inset-0 opacity-30 mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Subtle vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />

        {/* Hover play indicator - simple circle with triangle */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-cream-50/92 flex items-center justify-center">
            <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[9px] border-l-warm-900 border-b-[5px] border-b-transparent ml-0.5" />
          </div>
        </div>

        {/* Duration badge */}
        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-white text-eyebrow font-medium rounded">
          {duration}
        </span>

        {/* New indicator */}
        {isNew && (
          <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-emerald-500 text-white text-eyebrow font-bold uppercase tracking-wider rounded">
            New
          </span>
        )}
      </div>

      {/* Label */}
      <p className="text-micro text-white/50 mt-1.5 truncate">{label}</p>
    </div>
  );
}
