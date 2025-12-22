'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { IconMapPin, IconSchool, IconMail, IconPhone, IconBrandTwitter, IconBrandInstagram } from '@/components/icons';
import { formatHeight } from '@/lib/utils';

interface PlayerSettings {
  show_full_name?: boolean;
  show_location?: boolean;
  show_school?: boolean;
  show_contact_email?: boolean;
  show_phone?: boolean;
  show_social_links?: boolean;
  show_height_weight?: boolean;
  show_position?: boolean;
  show_grad_year?: boolean;
  show_bats_throws?: boolean;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  city?: string;
  state?: string;
  high_school_name?: string;
  email?: string;
  phone?: string;
  twitter_handle?: string;
  instagram_handle?: string;
  height_feet?: number;
  height_inches?: number;
  weight_lbs?: number;
  primary_position?: string;
  secondary_position?: string;
  grad_year?: number;
  bats?: string;
  throws?: string;
  player_settings?: PlayerSettings;
}

interface PlayerCardProps {
  player: Player;
  isPublic?: boolean; // If viewing as coach vs player viewing own
}

export function PlayerCard({ player, isPublic = false }: PlayerCardProps) {
  const settings = player.player_settings || {};

  // Determine what to show based on privacy settings
  const showFullName = !isPublic || settings.show_full_name !== false;
  const showLocation = !isPublic || settings.show_location !== false;
  const showSchool = !isPublic || settings.show_school !== false;
  const showContactEmail = !isPublic || settings.show_contact_email === true;
  const showPhone = !isPublic || settings.show_phone === true;
  const showSocial = !isPublic || settings.show_social_links !== false;
  const showPhysicals = !isPublic || settings.show_height_weight !== false;
  const showPosition = !isPublic || settings.show_position !== false;
  const showGradYear = !isPublic || settings.show_grad_year !== false;
  const showBatsThrows = !isPublic || settings.show_bats_throws !== false;

  const displayName = showFullName
    ? `${player.first_name} ${player.last_name}`
    : `${player.first_name} ${player.last_name.charAt(0)}.`;

  return (
    <Card className="overflow-hidden">
      {/* Header with Avatar */}
      <div className="bg-gradient-to-br from-green-50 to-white p-6 border-b border-slate-200">
        <div className="flex items-start gap-4">
          <div className="relative">
            <Avatar
              name={`${player.first_name} ${player.last_name}`}
              src={player.avatar_url}
              size="xl"
              ring
            />
            {/* Green Recruiting Indicator */}
            {(player as any).recruiting_activated && (
              <div
                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-lg"
                title="Actively recruiting"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-semibold text-slate-900 mb-1">
              {displayName}
            </h2>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              {showPosition && player.primary_position && (
                <Badge>{player.primary_position}</Badge>
              )}
              {showPosition && player.secondary_position && (
                <Badge variant="secondary">{player.secondary_position}</Badge>
              )}
              {showGradYear && player.grad_year && (
                <Badge variant="success">{player.grad_year}</Badge>
              )}
            </div>

            {/* Location & School */}
            <div className="space-y-1 text-sm">
              {showSchool && player.high_school_name && (
                <div className="flex items-center gap-2 text-slate-600">
                  <IconSchool size={16} className="text-slate-400" />
                  <span>{player.high_school_name}</span>
                </div>
              )}
              {showLocation && player.city && player.state && (
                <div className="flex items-center gap-2 text-slate-600">
                  <IconMapPin size={16} className="text-slate-400" />
                  <span>{player.city}, {player.state}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      {showPhysicals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 border-b border-slate-200 bg-white">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
              Height
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {player.height_feet && player.height_inches
                ? formatHeight(player.height_feet, player.height_inches)
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
              Weight
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {player.weight_lbs ? `${player.weight_lbs} lbs` : '—'}
            </p>
          </div>
          {showBatsThrows && (
            <>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                  Bats
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  {player.bats || '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                  Throws
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  {player.throws || '—'}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Contact Information */}
      {(showContactEmail || showPhone || showSocial) && (
        <div className="p-6 bg-slate-50 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
            Contact
          </h3>

          {showContactEmail && player.email && (
            <div className="flex items-center gap-3">
              <IconMail size={16} className="text-slate-400" />
              <a
                href={`mailto:${player.email}`}
                className="text-sm leading-relaxed text-green-600 hover:text-green-700 hover:underline"
              >
                {player.email}
              </a>
            </div>
          )}

          {showPhone && player.phone && (
            <div className="flex items-center gap-3">
              <IconPhone size={16} className="text-slate-400" />
              <a
                href={`tel:${player.phone}`}
                className="text-sm leading-relaxed text-green-600 hover:text-green-700 hover:underline"
              >
                {player.phone}
              </a>
            </div>
          )}

          {showSocial && (player.twitter_handle || player.instagram_handle) && (
            <div className="flex items-center gap-4 pt-2">
              {player.twitter_handle && (
                <a
                  href={`https://twitter.com/${player.twitter_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-slate-600 hover:text-green-600 transition-colors"
                >
                  <IconBrandTwitter size={16} />
                  <span>@{player.twitter_handle}</span>
                </a>
              )}
              {player.instagram_handle && (
                <a
                  href={`https://instagram.com/${player.instagram_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-slate-600 hover:text-green-600 transition-colors"
                >
                  <IconBrandInstagram size={16} />
                  <span>@{player.instagram_handle}</span>
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
