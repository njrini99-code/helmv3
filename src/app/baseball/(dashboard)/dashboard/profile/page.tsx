'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { ProfileEditor } from '@/components/features/profile-editor';
import { CollegeProfileEditor } from '@/components/baseball/profile';
import { useAuth } from '@/hooks/use-auth';
import { IconGlobe, IconUser } from '@/components/icons';
import { Player } from '@/lib/types';

export default function ProfilePage() {
  const router = useRouter();
  const { user, player, loading, updatePlayer } = useAuth();

  const isCoach = user?.role === 'coach';

  // "My Profile" is the PLAYER's own athlete profile — coaches have no player
  // record here. Rather than strand a coach on a bare "players only" wall (the
  // QA nav dead-end), send them to their own home, mirroring how Analytics and
  // the coach-only settings surfaces already redirect coaches to the Command
  // Center. A coach's own account/program identity lives under Settings.
  useEffect(() => {
    if (!loading && isCoach) {
      router.replace('/baseball/dashboard/command-center');
    }
  }, [loading, isCoach, router]);

  if (loading || isCoach) return <PageLoading />;

  if (user?.role !== 'player' || !player) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <EmptyState
          variant="card"
          glass
          className="mx-auto max-w-lg"
          icon={<IconUser size={40} />}
          title="Profile unavailable"
          description="We couldn't load a player profile for this account. If you're a player, refresh to try again — otherwise head back to your dashboard."
          action={
            <Link href="/baseball/dashboard/command-center">
              <Button variant="primary" size="md">
                Go to Command Center
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const handleUpdate = async (updates: Partial<Player>) => {
    await updatePlayer(updates);
  };

  // Only true college players get the team-only editor. JUCO players are
  // transfer-recruiting-eligible (opt-in activation), so they need the
  // recruiting ProfileEditor with showcase fields like videos — same as HS.
  const isCollegePlayer = player.player_type === 'college';

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
      <div className="p-4 sm:p-6 lg:p-8 max-w-[720px] mx-auto">
        {isCollegePlayer ? (
          <CollegeProfileEditor player={player} onUpdate={handleUpdate} />
        ) : (
          <ProfileEditor player={player} onUpdate={handleUpdate} />
        )}
      </div>
    </>
  );
}
