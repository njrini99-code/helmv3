'use client';

import { cn } from '@/lib/utils';

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
