'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoading } from '@/components/ui/loading';
import { ProfileEditor } from '@/components/features/profile-editor';
import { CollegeProfileEditor } from '@/components/baseball/profile';
import { useAuth } from '@/hooks/use-auth';
import { IconGlobe, IconChevronRight } from '@/components/icons';
import { Player } from '@/lib/types';
import { fairwayScope } from '@/lib/redesign/flag';
import { showRecruitingActivationPrompt } from '@/lib/baseball/recruiting-activation';
import { isRecruitingEnabled } from '@/lib/baseball/product-modules';
import { Button } from '@/components/fairway';
import { SectionMasthead, EditorsLetter, Reveal, pressableClass } from '@/components/baseball/living-annual';

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
            // "RECRUITING FILE" names the page after a module the product is
            // not currently selling, on a screen every player visits. College
            // players already read "THE PASSPORT"; under the sunset everyone
            // does, which is also what the rest of the player surface calls it.
            eyebrow={
              isCollegePlayer || !isRecruitingEnabled()
                ? 'THE PASSPORT · EDIT PROFILE'
                : 'RECRUITING FILE · EDIT PROFILE'
            }
            title="Edit Profile"
            ink="team"
            actions={
              // "Public" is a claim about the audience, and it is wrong while
              // recruiting is sunset: /baseball/player/[id] is readable by the
              // player and their own staff, nobody else. The destination is
              // still useful (it is how a player checks what their profile looks
              // like assembled), so relabel rather than remove — a player who
              // clicks "View Public Profile" and sees their own page has been
              // told their data is public when it is not.
              <Button asChild variant="secondary" size="sm" leftIcon={<IconGlobe size={14} />}>
                <Link href={`/baseball/player/${player.id}`} target="_blank">
                  {isRecruitingEnabled() ? 'View Public Profile' : 'Preview my profile'}
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

        {/* Activate Recruiting nudge (conn-baseball-player Finding 2) — the
            nav entry (player-activate) has no persistent rail slot by design
            (command palette / direct URL only, see hub-definitions.ts), so
            Today/Passport/Profile — the surfaces every eligible player
            actually visits — carry the one-time nudge instead.
            Gated at read time by the recruiting module; the eligibility rule
            below is left exactly as written because it is still right when the
            module returns. Note it differs from Today/Passport on purpose: a
            null `recruiting_activated` here means "not activated yet" and
            SHOULD prompt, where a null activation object there means "not
            fetched" and must not. */}
        {showRecruitingActivationPrompt(
          !isCollegePlayer && player.recruiting_activated !== true,
        ) && (
          <EditorsLetter
            ink="team"
            live
            liveLabel="One-time"
            title="Activate recruiting to be seen by college coaches"
            body="Right now your profile is invisible to recruiters. Turn on recruiting exposure once to let college coaches discover it."
            action={
              <Link
                href="/baseball/dashboard/activate"
                className={pressableClass({
                  ink: 'team',
                  className:
                    'inline-flex items-center gap-1.5 rounded-card bg-grade-plus px-4 py-2 font-annual text-body-sm font-semibold text-white',
                })}
              >
                Activate Recruiting
                <IconChevronRight size={16} aria-hidden />
              </Link>
            }
          />
        )}

        {isCollegePlayer ? (
          <CollegeProfileEditor player={player} onUpdate={handleUpdate} />
        ) : (
          <ProfileEditor player={player} onUpdate={handleUpdate} />
        )}
      </div>
    </div>
  );
}
