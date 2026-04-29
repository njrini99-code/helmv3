'use client';

import { cn } from '@/lib/utils';
import { Play } from 'lucide-react';

/**
 * Abstract video library thumbnail mockup
 */
export function VideosMockup() {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <VideoThumbnail featured />
      <VideoThumbnail />
      <VideoThumbnail />
      <VideoThumbnail small />
    </div>
  );
}

function VideoThumbnail({ featured, small }: { featured?: boolean; small?: boolean }) {
  return (
    <div className={cn(
      "relative rounded-lg overflow-hidden group cursor-pointer",
      "bg-gradient-to-br from-slate-200 to-slate-300",
      featured ? "aspect-video" : small ? "aspect-square" : "aspect-video"
    )}>
      {/* Play button overlay */}
      <div className={cn(
        "absolute inset-0 flex items-center justify-center",
        "bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
      )}>
        <div className={cn(
          "w-6 h-6 rounded-full bg-cream-50/92 flex items-center justify-center",
          "shadow-lg"
        )}>
          <Play className="w-3 h-3 text-slate-700 ml-0.5" fill="currentColor" />
        </div>
      </div>

      {/* Duration badge */}
      <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/60 text-[8px] text-white">
        {featured ? '2:45' : small ? '0:32' : '1:15'}
      </div>

      {/* View count */}
      {featured && (
        <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-primary-500 text-[8px] text-white font-semibold">
          Primary
        </div>
      )}
    </div>
  );
}
