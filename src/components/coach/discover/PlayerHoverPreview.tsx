'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { PlayerCardData } from './PlayerCard';
import { Button } from '@/components/ui/button';
import {
  IconHeart,
  IconHeartFilled,
  IconMessage,
  IconArrowRight,
  IconMapPin,
  IconPlay,
} from '@/components/icons';

interface PlayerHoverPreviewProps {
  player: PlayerCardData;
  position: { x: number; y: number };
  onWatchlist?: () => void;
  onMessage?: () => void;
  onView?: () => void;
  isOnWatchlist?: boolean;
}

export function PlayerHoverPreview({
  player,
  position,
  onWatchlist,
  onMessage,
  onView,
  isOnWatchlist = false,
}: PlayerHoverPreviewProps) {
  const [mounted, setMounted] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const panelRef = useRef<HTMLDivElement>(null);

  // Mount after first render for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Adjust position to stay in viewport
  useEffect(() => {
    if (!panelRef.current) return;

    const panel = panelRef.current;
    const panelRect = panel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newX = position.x;
    let newY = position.y;

    // Check if panel goes off right edge
    if (position.x + panelRect.width > viewportWidth - 20) {
      // Position to the left of cursor instead
      newX = position.x - panelRect.width - 24;
    }

    // Check if panel goes off bottom
    if (position.y + panelRect.height > viewportHeight - 20) {
      newY = viewportHeight - panelRect.height - 20;
    }

    // Ensure not off top
    if (newY < 20) {
      newY = 20;
    }

    // Ensure not off left
    if (newX < 20) {
      newX = 20;
    }

    setAdjustedPosition({ x: newX, y: newY });
  }, [position]);

  if (!mounted) return null;

  const content = (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-50 w-72 pointer-events-auto',
        'bg-cream-50 rounded-2xl shadow-2xl shadow-black/15',
        'border border-warm-200',
        'animate-scale-in origin-top-left',
        'overflow-hidden'
      )}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {/* Header with Avatar */}
      <div className="p-4 pb-3 border-b border-warm-100">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-warm-200 to-warm-300 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {player.avatar ? (
              <Image
                src={player.avatar}
                alt={`${player.firstName} ${player.lastName}`}
                width={56}
                height={56}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-lg font-medium text-warm-600">
                {player.firstName.charAt(0)}{player.lastName.charAt(0)}
              </span>
            )}
          </div>

          {/* Name & Position */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-warm-900 truncate">
              {player.firstName} {player.lastName}
            </h4>
            <p className="text-sm text-warm-500">
              {player.position} • Class of {player.graduationYear}
            </p>
            <div className="flex items-center gap-1 mt-1 text-xs text-warm-400">
              <IconMapPin size={12} />
              <span className="truncate">{player.highSchool}, {player.state}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-4 pt-3 border-b border-warm-100">
        <div className="grid grid-cols-3 gap-3">
          {player.stats?.velocity && (
            <StatItem label="Pitch Velo" value={`${player.stats.velocity}`} unit="mph" highlight />
          )}
          {player.stats?.gpa && (
            <StatItem label="GPA" value={player.stats.gpa.toFixed(1)} />
          )}
          {player.stats?.height && (
            <StatItem label="Height" value={player.stats.height} />
          )}
          {player.stats?.exitVelo && (
            <StatItem label="Exit Velo" value={`${player.stats.exitVelo}`} unit="mph" />
          )}
          {player.stats?.sixtyYard && (
            <StatItem label="60 yd" value={`${player.stats.sixtyYard}`} unit="s" />
          )}
          {player.stats?.weight && (
            <StatItem label="Weight" value={`${player.stats.weight}`} unit="lbs" />
          )}
        </div>
      </div>

      {/* Video Preview (if available) */}
      {player.hasVideo && (
        <div className="p-4 pt-3 border-b border-warm-100">
          <Button
            type="button"
            variant="ghost"
            className="relative rounded-lg overflow-hidden bg-warm-100 aspect-video group cursor-pointer w-full h-auto min-h-0 p-0 block"
            onClick={onView}
            aria-label={`Watch ${player.firstName} ${player.lastName} video`}
          >
            {player.videoThumbnail ? (
              <Image
                src={player.videoThumbnail}
                alt={`${player.firstName} ${player.lastName} video thumbnail`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 320px"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                  <IconPlay size={20} className="text-white ml-0.5" />
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-cream-50/92 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <IconPlay size={16} className="text-warm-900 ml-0.5" />
              </div>
            </div>
            <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/70 text-white text-xs">
              Video Available
            </div>
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="p-3 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onWatchlist}
          className={cn(
            'flex-1 gap-1.5',
            isOnWatchlist && 'text-primary-600 border-primary-200 bg-primary-50'
          )}
        >
          {isOnWatchlist ? <IconHeartFilled size={14} /> : <IconHeart size={14} />}
          {isOnWatchlist ? 'Saved' : 'Save'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onMessage}
          className="flex-1 gap-1.5"
        >
          <IconMessage size={14} />
          Message
        </Button>
        <Button
          size="sm"
          onClick={onView}
          className="bg-primary-600 hover:bg-primary-700 transition-colors active:bg-primary-800 text-white gap-1.5"
        >
          View
          <IconArrowRight size={14} />
        </Button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// Stat item component
function StatItem({ 
  label, 
  value, 
  unit,
  highlight = false 
}: { 
  label: string; 
  value: string; 
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <p className={cn(
        'text-lg font-semibold',
        highlight ? 'text-primary-600' : 'text-warm-900'
      )}>
        {value}
        {unit && <span className="text-xs font-normal text-warm-400 ml-0.5">{unit}</span>}
      </p>
      <p className="text-xs text-warm-500">{label}</p>
    </div>
  );
}
