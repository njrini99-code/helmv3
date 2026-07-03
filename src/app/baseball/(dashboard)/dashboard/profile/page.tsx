'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoading } from '@/components/ui/loading';
import { ProfileEditor } from '@/components/features/profile-editor';
import { CollegeProfileEditor } from '@/components/baseball/profile';
import { useAuth } from '@/hooks/use-auth';
import { IconGlobe } from '@/components/icons';
import { Player } from '@/lib/types';
import { fairwayScope } from '@/lib/redesign/flag';
import { Button } from '@/components/fairway';
import { SectionMasthead, EditorsLetter, Reveal } from '@/components/baseball/living-annual';

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
      <div className={fairwayScope('min-h-full')}>
        <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <EditorsLetter
            title="Profile unavailable"
            body="We couldn't load a player profile for this account. If you're a player, refresh to try again — otherwise head back to your dashboard."
            action={
              <Button asChild variant="primary" size="md">
                <Link href="/baseball/dashboard/command-center">Go to Command Center</Link>
              </Button>
            }
          />
        </div>
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
    <div className={fairwayScope('min-h-full')}>
      <div className="mx-auto w-full max-w-[820px] space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <Reveal>
          <SectionMasthead
            eyebrow={isCollegePlayer ? 'THE PASSPORT · EDIT PROFILE' : 'RECRUITING FILE · EDIT PROFILE'}
            title="Edit Profile"
            ink="team"
            actions={
              <Button asChild variant="secondary" size="sm" leftIcon={<IconGlobe size={14} />}>
                <Link href={`/baseball/player/${player.id}`} target="_blank">
                  View Public Profile
                </Link>
              </Button>
            }
          >
            <p className="max-w-2xl font-annual text-body-lg leading-relaxed text-text-secondary">
              {isCollegePlayer
                ? 'Manage your player profile and team information.'
                : 'Update your information and showcase your talents.'}
            </p>
          </SectionMasthead>
        </Reveal>

        {isCollegePlayer ? (
          <CollegeProfileEditor player={player} onUpdate={handleUpdate} />
        ) : (
          <ProfileEditor player={player} onUpdate={handleUpdate} />
        )}
      </div>
    </div>
  );
}
