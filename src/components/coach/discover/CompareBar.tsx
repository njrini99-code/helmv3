'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { IconX, IconPlus, IconCheck } from '@/components/icons';

// Scale icon component
function IconScale({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={className}
    >
      <path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
      <path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
      <path d="M7 21h10"/>
      <path d="M12 3v18"/>
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
    </svg>
  );
}

interface CompareBarProps {
  selectedPlayers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
    position: string;
  }>;
  onRemove: (playerId: string) => void;
  onClear: () => void;
  onAddAllToWatchlist: () => void;
  maxPlayers?: number;
  className?: string;
}

export function CompareBar({
  selectedPlayers,
  onRemove,
  onClear,
  onAddAllToWatchlist,
  maxPlayers = 4,
  className,
}: CompareBarProps) {
  const router = useRouter();

  if (selectedPlayers.length === 0) return null;

  const handleCompare = () => {
    const ids = selectedPlayers.map(p => p.id).join(',');
    router.push(`/baseball/dashboard/compare?players=${ids}`);
  };

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pb-[env(safe-area-inset-bottom)]',
        'flex items-center gap-4 px-5 py-3 rounded-2xl',
        'bg-slate-900/95 backdrop-blur-lg border border-slate-700/50',
        'shadow-2xl shadow-black/20',
        'animate-slide-up',
        className
      )}
    >
      {/* Selected player avatars */}
      <div className="flex items-center gap-2">
        {selectedPlayers.map((player, index) => (
          <div
            key={player.id}
            className="relative group animate-scale-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <Avatar
              name={`${player.firstName} ${player.lastName}`}
              src={player.avatar}
              size="sm"
              className="ring-2 ring-slate-700"
            />
            <button
              onClick={() => onRemove(player.id)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full 
                         bg-red-500 text-white opacity-0 group-hover:opacity-100
                         flex items-center justify-center transition-opacity"
            >
              <IconX size={10} />
            </button>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 
                            px-2 py-1 rounded bg-slate-800 text-white text-xs
                            whitespace-nowrap opacity-0 group-hover:opacity-100
                            transition-opacity pointer-events-none">
              {player.firstName} {player.lastName}
            </div>
          </div>
        ))}
        
        {/* Empty slots */}
        {Array.from({ length: maxPlayers - selectedPlayers.length }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-8 h-8 rounded-full border-2 border-dashed border-slate-600
                       flex items-center justify-center"
          >
            <IconPlus size={12} className="text-slate-500" />
          </div>
        ))}
      </div>

      <div className="w-px h-8 bg-slate-700" />

      {/* Info */}
      <div className="text-sm">
        <span className="text-white font-medium">{selectedPlayers.length}</span>
        <span className="text-slate-400"> of {maxPlayers} selected</span>
      </div>

      <div className="w-px h-8 bg-slate-700" />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleCompare}
          disabled={selectedPlayers.length < 2}
          size="sm"
          className="bg-primary-600 hover:bg-primary-700 transition-colors active:bg-primary-800 text-white gap-2 disabled:opacity-50"
        >
          <IconScale size={14} />
          Compare
        </Button>
        
        <Button
          onClick={onAddAllToWatchlist}
          variant="secondary"
          size="sm"
          className="bg-slate-800 hover:bg-slate-700 transition-colors text-white border-slate-600 gap-2"
        >
          <IconCheck size={14} />
          Add All
        </Button>
        
        <button
          onClick={onClear}
          className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
