'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { ProfileEditor } from '@/components/features/profile-editor';
import { CollegeProfileEditor } from '@/components/baseball/profile';
import { useAuth } from '@/hooks/use-auth';
import { IconGlobe } from '@/components/icons';
import { Player } from '@/lib/types';

export default function ProfilePage() {
  const { user, player, loading, updatePlayer } = useAuth();

  if (loading) return <PageLoading />;

  if (user?.role !== 'player' || !player) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600">This page is only available to players</p>
        </div>
      </div>
    );
  }

  const handleUpdate = async (updates: Partial<Player>) => {
    await updatePlayer(updates);
  };

  // Use CollegeProfileEditor for college/juco players
  const isCollegePlayer = player.player_type === 'college' || player.player_type === 'juco';

  return (
    <>
      <Header 
        title="Edit Profile" 
        subtitle={isCollegePlayer 
          ? "Manage your player profile and team information" 
          : "Update your information and showcase your talents"
        }
      >
        <Link href={`/baseball/player/${player.id}`} target="_blank">
          <Button variant="secondary" size="sm" className="gap-2">
            <IconGlobe size={14} />
            View Public Profile
          </Button>
        </Link>
      </Header>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        {isCollegePlayer ? (
          <CollegeProfileEditor player={player} onUpdate={handleUpdate} />
        ) : (
          <ProfileEditor player={player} onUpdate={handleUpdate} />
        )}
      </div>
    </>
  );
}
