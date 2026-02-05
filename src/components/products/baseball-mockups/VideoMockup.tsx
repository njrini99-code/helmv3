'use client';

import { cn } from '@/lib/utils';

/**
 * Premium Video Library Mockup
 * Modern, cinematic video management interface
 */
export function VideoMockup() {
  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Main container with dark theme for video focus */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Video Library</h3>
              <p className="text-[10px] text-slate-400">234 clips • 12.4 GB</p>
            </div>
          </div>
          <button className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-400 transition-colors">
            Upload
          </button>
        </div>

        {/* Featured Video Player */}
        <div className="relative aspect-video bg-gradient-to-br from-slate-800 to-slate-900 group cursor-pointer">
          {/* Video preview scene - baseball field from above */}
          <div className="absolute inset-0 overflow-hidden">
            {/* Field graphic representation */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-32 h-32">
                {/* Diamond shape */}
                <div className="absolute inset-0 rotate-45 border-2 border-blue-400/30 rounded-sm" />
                {/* Bases */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white/80 rotate-45" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-white/80 rotate-45" />
                <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white/80 rotate-45" />
                <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white/80 rotate-45" />
                {/* Mound */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-blue-400/40" />
              </div>
            </div>
            {/* Motion lines */}
            <div className="absolute top-1/3 left-1/4 w-16 h-[2px] bg-gradient-to-r from-blue-400/60 to-transparent rotate-12" />
            <div className="absolute top-1/2 left-1/3 w-20 h-[2px] bg-gradient-to-r from-blue-400/40 to-transparent -rotate-6" />
          </div>

          {/* Gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-slate-900/50" />

          {/* Play button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center group-hover:bg-white/20 group-hover:scale-110 transition-all duration-300">
              <svg className="w-7 h-7 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,4 20,12 6,20" />
              </svg>
            </div>
          </div>

          {/* Video info overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="flex items-end justify-between">
              <div>
                <span className="px-2 py-0.5 bg-blue-500 text-white text-[10px] font-semibold rounded mb-1.5 inline-block">
                  HIGHLIGHT
                </span>
                <h4 className="text-white font-semibold text-sm">State Championship At-Bat</h4>
                <p className="text-slate-400 text-xs">Jake Martinez • Walk-off Double</p>
              </div>
              <div className="text-right">
                <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">0:45</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div className="h-full w-1/3 bg-blue-500" />
          </div>
        </div>

        {/* Video thumbnails grid */}
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Recent Uploads</span>
            <span className="text-[10px] text-blue-400 cursor-pointer hover:text-blue-300">View All</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <VideoThumb
              title="Bullpen Session"
              duration="2:30"
              type="practice"
              isNew
            />
            <VideoThumb
              title="Game vs Eagles"
              duration="1:15"
              type="game"
            />
            <VideoThumb
              title="Defensive Drill"
              duration="0:48"
              type="training"
            />
          </div>
        </div>

        {/* Quick actions */}
        <div className="px-3 pb-3 pt-1 flex gap-2">
          <button className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 text-white/70 text-xs font-medium rounded-lg transition-colors border border-white/10">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            Create Clip
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 text-white/70 text-xs font-medium rounded-lg transition-colors border border-white/10">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
        </div>
      </div>
    </div>
  );
}

function VideoThumb({ title, duration, type, isNew }: {
  title: string;
  duration: string;
  type: 'practice' | 'game' | 'training';
  isNew?: boolean;
}) {
  const typeColors = {
    practice: 'from-emerald-600 to-emerald-800',
    game: 'from-orange-500 to-red-600',
    training: 'from-purple-500 to-indigo-600',
  };

  const typeIcons = {
    practice: (
      <svg className="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    game: (
      <svg className="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
      </svg>
    ),
    training: (
      <svg className="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
  };

  return (
    <div className="group relative cursor-pointer">
      <div className={cn(
        "aspect-video rounded-lg overflow-hidden relative",
        `bg-gradient-to-br ${typeColors[type]}`
      )}>
        {/* Icon centered */}
        <div className="absolute inset-0 flex items-center justify-center opacity-60">
          {typeIcons[type]}
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
            <svg className="w-4 h-4 text-slate-900 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          </div>
        </div>

        {/* Duration */}
        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[9px] font-medium rounded">
          {duration}
        </span>

        {/* New badge */}
        {isNew && (
          <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-blue-500 text-white text-[8px] font-bold rounded">
            NEW
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5 truncate">{title}</p>
    </div>
  );
}
