'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Player } from '@/types/database';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { IconX, IconStar, IconMapPin, IconCalendar, IconMail } from '@/components/icons';
import { getFullName } from '@/lib/utils';
import { addToWatchlist } from '@/app/actions/watchlist';
import { createConversation } from '@/app/actions/messages';
import { useToast } from '@/components/ui/toast';

interface PlayerDetailModalProps {
  player: Player;
  coachId: string;
  onClose: () => void;
}

export function PlayerDetailModal({ player, coachId, onClose }: PlayerDetailModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [messaging, setMessaging] = useState(false);

  const handleAddToWatchlist = async () => {
    setAdding(true);
    try {
      const result = await addToWatchlist(coachId, player.id);
      if (result.success) {
        setAdded(true);
      }
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      showToast('Failed to add to watchlist', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleMessage = async () => {
    if (!player.user_id) {
      showToast('Cannot message this player - no user account found', 'error');
      return;
    }

    setMessaging(true);
    try {
      const result = await createConversation([player.user_id]);
      router.push(`/dashboard/messages/${result.conversationId}`);
    } catch (error) {
      console.error('Error creating conversation:', error);
      showToast('Failed to create conversation', 'error');
    } finally {
      setMessaging(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between z-10">
          <h2 className="text-xl font-semibold text-slate-900">Player Profile</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close player profile"
          >
            <IconX size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Header Section */}
          <div className="flex items-start gap-6">
            <Avatar
              name={getFullName(player.first_name, player.last_name)}
              src={player.avatar_url || undefined}
              size="xl"
            />
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-slate-900 mb-2">
                {getFullName(player.first_name, player.last_name)}
              </h3>
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="default">{player.primary_position}</Badge>
                <Badge variant="secondary">Class of {player.grad_year}</Badge>
                {player.recruiting_activated && (
                  <Badge variant="success">Recruiting Active</Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-600">
                {(player.city || player.state) && (
                  <div className="flex items-center gap-1">
                    <IconMapPin size={14} />
                    <span>{player.city}, {player.state}</span>
                  </div>
                )}
                {player.high_school_name && (
                  <div className="flex items-center gap-1">
                    <IconCalendar size={14} />
                    <span>{player.high_school_name}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleAddToWatchlist}
                disabled={adding || added}
                variant={added ? "secondary" : "primary"}
              >
                <IconStar size={16} className="mr-2" />
                {added ? 'Added to Watchlist' : 'Add to Watchlist'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleMessage}
                disabled={messaging}
              >
                <IconMail size={16} className="mr-2" />
                {messaging ? 'Opening...' : 'Message'}
              </Button>
            </div>
          </div>

          {/* About */}
          {player.about_me && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">About</h4>
              <p className="text-sm text-slate-600">{player.about_me}</p>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Physical */}
            {(player.height_feet || player.weight_lbs) && (
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Physical</p>
                <p className="text-lg font-semibold text-slate-900">
                  {player.height_feet}'{player.height_inches}" / {player.weight_lbs} lbs
                </p>
              </div>
            )}

            {/* Bats/Throws */}
            {(player.bats || player.throws) && (
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Bats/Throws</p>
                <p className="text-lg font-semibold text-slate-900">
                  {player.bats || '-'} / {player.throws || '-'}
                </p>
              </div>
            )}

            {/* Pitch Velo */}
            {player.pitch_velo && (
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Pitch Velocity</p>
                <p className="text-lg font-semibold text-slate-900">{player.pitch_velo} mph</p>
              </div>
            )}

            {/* Exit Velo */}
            {player.exit_velo && (
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Exit Velocity</p>
                <p className="text-lg font-semibold text-slate-900">{player.exit_velo} mph</p>
              </div>
            )}

            {/* 60 Time */}
            {player.sixty_time && (
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">60-Yard Time</p>
                <p className="text-lg font-semibold text-slate-900">{player.sixty_time} sec</p>
              </div>
            )}

            {/* Pop Time */}
            {player.pop_time && (
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Pop Time</p>
                <p className="text-lg font-semibold text-slate-900">{player.pop_time} sec</p>
              </div>
            )}

            {/* GPA */}
            {player.gpa && (
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">GPA</p>
                <p className="text-lg font-semibold text-slate-900">{player.gpa.toFixed(2)}</p>
              </div>
            )}

            {/* SAT */}
            {player.sat_score && (
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">SAT</p>
                <p className="text-lg font-semibold text-slate-900">{player.sat_score}</p>
              </div>
            )}
          </div>

          {/* Additional Info */}
          <div className="grid grid-cols-2 gap-4">
            {player.club_team && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Travel Team</h4>
                <p className="text-sm text-slate-600">{player.club_team}</p>
              </div>
            )}
            {player.primary_goal && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Primary Goal</h4>
                <p className="text-sm text-slate-600">{player.primary_goal}</p>
              </div>
            )}
          </div>

          {/* Top Schools */}
          {player.top_schools && player.top_schools.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Top Schools</h4>
              <div className="flex flex-wrap gap-2">
                {player.top_schools.map((school, i) => (
                  <Badge key={i} variant="secondary">{school}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Social */}
          {(player.twitter || player.instagram) && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Social Media</h4>
              <div className="flex gap-4">
                {player.twitter && (
                  <a
                    href={`https://twitter.com/${player.twitter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-600 hover:text-green-700"
                  >
                    @{player.twitter}
                  </a>
                )}
                {player.instagram && (
                  <a
                    href={`https://instagram.com/${player.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-600 hover:text-green-700"
                  >
                    @{player.instagram}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
