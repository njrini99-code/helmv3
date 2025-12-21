'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { usePeekPanelStore } from '@/stores/peek-panel-store';
import type { Player } from '@/lib/types';
import {
  IconX,
  IconMapPin,
  IconGraduationCap,
  IconMessage,
  IconHeart,
  IconVideo,
  IconPlay,
  IconExternalLink,
  IconActivity,
  IconRuler,
  IconTarget,
} from '@/components/icons';

interface PanelVideo {
  id: string;
  title: string;
  video_type: string | null;
  thumbnail_url: string | null;
  is_primary: boolean | null;
}

interface PlayerData extends Player {
  videos?: PanelVideo[];
}

export function PlayerPeekPanel() {
  const { isOpen, panelType, selectedId, closePanel } = usePeekPanelStore();
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  // Fetch player data when panel opens
  useEffect(() => {
    async function fetchPlayer() {
      if (!selectedId || panelType !== 'player') {
        setPlayer(null);
        return;
      }

      setLoading(true);
      // Fetch player data
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .select('*')
        .eq('id', selectedId)
        .single();

      if (playerError) {
        console.error('Error fetching player:', playerError);
        setPlayer(null);
        setLoading(false);
        return;
      }

      // Fetch player videos
      const { data: videosData } = await supabase
        .from('videos')
        .select('id, title, video_type, thumbnail_url, is_primary')
        .eq('player_id', selectedId)
        .limit(5);

      setPlayer({
        ...playerData,
        videos: videosData || [],
      } as PlayerData);
      setLoading(false);
    }

    fetchPlayer();
  }, [selectedId, panelType]);

  // Handle escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        closePanel();
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, closePanel]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (panelType !== 'player') return null;

  const formatHeight = (feet: number | null, inches: number | null) => {
    if (!feet) return null;
    return `${feet}'${inches || 0}"`;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closePanel}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-slate-900">Player Preview</h2>
          <button
            onClick={closePanel}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-73px)]">
          {loading ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-200 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-32 bg-slate-200 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />
            </div>
          ) : player ? (
            <div className="p-6 space-y-6">
              {/* Player Header */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {player.avatar_url ? (
                    <img
                      src={player.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-semibold text-slate-600">
                      {player.first_name?.charAt(0)}
                      {player.last_name?.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-semibold text-slate-900">
                    {player.first_name} {player.last_name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                    <span className="font-medium text-green-600">
                      {player.primary_position}
                    </span>
                    {player.secondary_position && (
                      <>
                        <span>/</span>
                        <span>{player.secondary_position}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <IconGraduationCap size={14} className="text-slate-400" />
                      <span>{player.grad_year}</span>
                    </div>
                    {player.city && player.state && (
                      <div className="flex items-center gap-1">
                        <IconMapPin size={14} className="text-slate-400" />
                        <span>
                          {player.city}, {player.state}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors">
                  <IconHeart size={16} />
                  <span>Add to Watchlist</span>
                </button>
                <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors">
                  <IconMessage size={16} />
                </button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                {player.pitch_velo && (
                  <StatCard
                    icon={<IconActivity size={16} className="text-green-600" />}
                    label="Pitch Velocity"
                    value={`${player.pitch_velo} mph`}
                  />
                )}
                {player.exit_velo && (
                  <StatCard
                    icon={<IconTarget size={16} className="text-green-600" />}
                    label="Exit Velocity"
                    value={`${player.exit_velo} mph`}
                  />
                )}
                {formatHeight(player.height_feet, player.height_inches) && (
                  <StatCard
                    icon={<IconRuler size={16} className="text-green-600" />}
                    label="Height"
                    value={formatHeight(player.height_feet, player.height_inches)!}
                  />
                )}
                {player.weight_lbs && (
                  <StatCard
                    icon={<IconRuler size={16} className="text-green-600" />}
                    label="Weight"
                    value={`${player.weight_lbs} lbs`}
                  />
                )}
                {player.sixty_time && (
                  <StatCard
                    icon={<IconActivity size={16} className="text-green-600" />}
                    label="60-Yard"
                    value={`${player.sixty_time}s`}
                  />
                )}
                {player.gpa && (
                  <StatCard
                    icon={<IconGraduationCap size={16} className="text-green-600" />}
                    label="GPA"
                    value={player.gpa.toFixed(2)}
                  />
                )}
              </div>

              {/* School Info */}
              {player.high_school_name && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                    High School
                  </div>
                  <div className="font-medium text-slate-900">
                    {player.high_school_name}
                  </div>
                  {player.city && player.state && (
                    <div className="text-sm text-slate-500 mt-1">
                      {player.city}, {player.state}
                    </div>
                  )}
                </div>
              )}

              {/* Videos Section */}
              {player.videos && player.videos.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-900">Videos</h4>
                    <span className="text-xs text-slate-500">
                      {player.videos.length} video{player.videos.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {player.videos.slice(0, 3).map((video) => (
                      <div
                        key={video.id}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {video.thumbnail_url ? (
                            <img
                              src={video.thumbnail_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <IconPlay size={16} className="text-slate-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-slate-900 truncate">
                            {video.title}
                          </div>
                          <div className="text-xs text-slate-500 capitalize">
                            {video.video_type || 'Video'}
                          </div>
                        </div>
                        <IconVideo size={14} className="text-slate-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* About */}
              {player.about_me && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">About</h4>
                  <p className="text-sm text-slate-600 leading-relaxed line-clamp-4">
                    {player.about_me}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-slate-500">
              <p>Player not found</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {player && (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4">
            <Link
              href={`/baseball/player/${player.id}`}
              onClick={closePanel}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors"
            >
              <span>View Full Profile</span>
              <IconExternalLink size={16} />
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
