'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconCopy, IconCheck, IconRefresh } from '@/components/icons';
import { useToast } from '@/components/ui/sonner';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import {
  createTeam,
  updateTeam,
  regenerateJoinCode,
  addSecondTeam,
} from '@/app/golf/actions/teams';
import { triggerHaptic } from '@/lib/utils/capacitor';

interface TeamSettingsClientProps {
  coach: {
    id: string;
    team_id: string | null;
    full_name: string | null;
  };
  team: {
    id: string;
    name: string;
    season: string | null;
    join_code: string | null;
    created_at: string;
  } | null;
}

export function TeamSettingsClient({ team }: TeamSettingsClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  // Add-second-team state (program head affordance — only shown when team exists)
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [secondTeamName, setSecondTeamName] = useState('');
  const [secondTeamGender, setSecondTeamGender] = useState<'mens' | 'womens'>('womens');
  const [addTeamPending, startAddTeamTransition] = useTransition();

  const handleAddSecondTeam = () => {
    if (!secondTeamName.trim()) {
      showToast('Please enter a team name', 'error');
      return;
    }
    startAddTeamTransition(async () => {
      const result = await addSecondTeam(secondTeamName.trim(), secondTeamGender);
      if (result.success) {
        showToast('Second team created successfully!', 'success');
        setShowAddTeam(false);
        setSecondTeamName('');
        router.refresh();
      } else {
        showToast(result.error || 'Failed to create team', 'error');
      }
    });
  };

  // Resolve the absolute origin only after mount. Rendering
  // `window.location.origin` during render produced a hydration mismatch —
  // the server emitted a relative path ("/golf/join/CODE") while the client's
  // first paint emitted an absolute URL ("https://…/golf/join/CODE"). Seeding
  // empty and filling it in an effect keeps the server HTML and the first
  // client render identical, then upgrades to the full URL post-mount.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Form state for creating/editing team
  const [teamName, setTeamName] = useState(team?.name || '');
  const [season, setSeason] = useState(() => {
    if (team?.season) return team.season;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const seasonStart = month >= 7 ? year : year - 1;
    return `${seasonStart}-${seasonStart + 1}`;
  });

  const handleCreateTeam = () => {
    if (!teamName.trim()) {
      showToast('Please enter a team name', 'error');
      return;
    }

    startTransition(async () => {
      const result = await createTeam(teamName, season);

      if (result.success) {
        void triggerHaptic('success');
        showToast('Team created successfully!', 'success');
        router.refresh();
      } else {
        void triggerHaptic('error');
        showToast(result.error || 'Failed to create team', 'error');
      }
    });
  };

  const handleUpdateTeam = () => {
    if (!team) return;

    startTransition(async () => {
      const result = await updateTeam(team.id, {
        name: teamName.trim(),
        season: season,
      });

      if (result.success) {
        void triggerHaptic('success');
        showToast('Team updated successfully!', 'success');
        router.refresh();
      } else {
        void triggerHaptic('error');
        showToast(result.error || 'Failed to update team', 'error');
      }
    });
  };

  const handleCopyInviteCode = async () => {
    if (!team?.join_code) return;

    const inviteUrl = `${window.location.origin}/golf/join/${team.join_code}`;
    await navigator.clipboard.writeText(inviteUrl);
    void triggerHaptic('light');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateInviteCode = () => {
    if (!team) return;
    void triggerHaptic('warning');

    startTransition(async () => {
      const result = await regenerateJoinCode(team.id);

      if (result.success) {
        void triggerHaptic('success');
        showToast('Invite code regenerated', 'success');
        router.refresh();
      } else {
        void triggerHaptic('error');
        showToast(result.error || 'Failed to regenerate invite code', 'error');
      }
    });
  };

  // No team - show create form
  if (!team) {
    return (
      <div>
        <LargeTitleHeader
          title="Create Your Team"
          subtitle="Set up your team to start adding players and creating events."
        />
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8">

        <div className="surface-matte rounded-2xl p-6 space-y-6">
          <div>
            <p className="block text-sm font-medium text-warm-700 mb-2">
              Team Name
            </p>
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g., University Golf Team"
              disabled={isPending}
            />
          </div>

          <div>
            <p className="block text-sm font-medium text-warm-700 mb-2">
              Season
            </p>
            <Input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="e.g., 2024-2025"
              disabled={isPending}
            />
          </div>

          <Button
            onClick={handleCreateTeam}
            disabled={isPending || !teamName.trim()}
            className="w-full"
          >
            {isPending ? 'Creating...' : 'Create Team'}
          </Button>
        </div>
        </div>
      </div>
    );
  }

  // Has team - show settings
  return (
    <div>
      <LargeTitleHeader
        title="Team Settings"
        subtitle="Manage your team details and invite players."
      />
      <div className="max-w-2xl mx-auto px-6 py-8">

      {/* Editorial hero band — frames the program identity beneath the
          sticky title header in the magazine-cover rhythm. */}
      <Reveal>
        <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
          <PageHeader
            eyebrow="Team"
            eyebrowAccent="primary"
            title="Your program."
            subtitle={
              team.season
                ? `${team.name} · ${team.season}.`
                : `${team.name} — roster, schedule, and program identity.`
            }
          />
        </div>
      </Reveal>

      {/* Team Info */}
      <div className="surface-matte rounded-2xl p-6 space-y-6 mb-6">
        <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">Team Information</h2>

        <div>
          <p className="block text-sm font-medium text-warm-700 mb-2">
            Team Name
          </p>
          <Input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team name"
            disabled={isPending}
          />
        </div>

        <div>
          <p className="block text-sm font-medium text-warm-700 mb-2">
            Season
          </p>
          <Input
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="Season"
            disabled={isPending}
          />
        </div>

        <Button
          onClick={handleUpdateTeam}
          disabled={isPending}
          variant="secondary"
          className="gap-2"
        >
          <IconCheck size={16} />
          {isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Invite Code */}
      <div className="surface-matte rounded-2xl p-6 space-y-4">
        <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">Player Invitations</h2>
        <p className="text-sm text-warm-500">
          Share this link with players to invite them to join your team.
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 px-4 py-3 bg-warm-50 rounded-lg font-mono text-sm text-warm-700 truncate">
            {`${origin}/golf/join/${team.join_code}`}
          </div>
          <Button
            variant={copied ? 'secondary' : 'primary'}
            onClick={handleCopyInviteCode}
            className="gap-2 flex-shrink-0"
          >
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>

        <Button
          variant="secondary"
          onClick={handleRegenerateInviteCode}
          disabled={isPending}
          className="gap-2"
        >
          <IconRefresh size={16} />
          {isPending ? 'Regenerating...' : 'Regenerate Invite Code'}
        </Button>

        <p className="text-xs text-warm-400">
          Regenerating will invalidate the old invite link.
        </p>
      </div>

      {/* ── Add a second team (program head affordance) ─────────────────── */}
      <div className="surface-matte rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">
              Add a team
            </h2>
            <p className="text-sm text-warm-500 mt-1">
              Run both a Men&apos;s and Women&apos;s program? Add a second team under the
              same organization.
            </p>
          </div>
          {!showAddTeam && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAddTeam(true)}
              className="flex-shrink-0"
            >
              + Add team
            </Button>
          )}
        </div>

        {showAddTeam && (
          <div className="border-t border-warm-200/50 pt-4 space-y-4">
            {/* Gender pill toggle — aria-label on each Button satisfies a11y */}
            <div>
              <p className="block text-sm font-medium text-warm-700 mb-2" id="add-team-gender-label">
                Team Gender
              </p>
              <div className="flex gap-2" role="group" aria-labelledby="add-team-gender-label">
                {(['mens', 'womens'] as const).map((g) => (
                  <Button
                    key={g}
                    type="button"
                    onClick={() => setSecondTeamGender(g)}
                    variant={secondTeamGender === g ? 'primary' : 'secondary'}
                    size="sm"
                    className="flex-1"
                    aria-pressed={secondTeamGender === g}
                  >
                    {g === 'mens' ? "Men's" : "Women's"}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="add-second-team-name" className="block text-sm font-medium text-warm-700 mb-2">
                Team Name
              </label>
              <Input
                id="add-second-team-name"
                value={secondTeamName}
                onChange={(e) => setSecondTeamName(e.target.value)}
                placeholder={secondTeamGender === 'mens' ? "Men's Golf" : "Women's Golf"}
                disabled={addTeamPending}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleAddSecondTeam}
                disabled={addTeamPending || !secondTeamName.trim()}
                className="gap-2"
              >
                {addTeamPending ? 'Creating...' : 'Create Team'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setShowAddTeam(false); setSecondTeamName(''); }}
                disabled={addTeamPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
