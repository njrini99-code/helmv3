'use client';

// =============================================================================
// src/components/baseball/settings/TeamSettingsClient.tsx
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// The TEAM settings surface (v4 §Team Settings) that previously had no editing
// home: join code, invite policy, player self-join, and coach-approval-required.
// Distinct from Program Settings (program_type-grain): these are the TEAM-grain
// join controls that sit next to the join code.
//
// Reuses GolfHelm UI primitives verbatim (Card / Button / Header) + cream/green
// tokens. Every write goes through a capability-gated server action; read-only
// viewers see the values but cannot change them. No golf vocabulary.
// =============================================================================

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { IconUsers, IconCheck, IconLink } from '@/components/icons';
import { EditorsLetter } from '@/components/baseball/living-annual';
import {
  SettingsSection,
  SettingsShell,
} from '@/components/baseball/settings/SettingsChrome';

import {
  BASEBALL_INVITE_POLICIES,
  type BaseballInvitePolicy,
  type BaseballTeamSettings,
} from '@/lib/types/baseball-team-season-settings';
import { updateTeamJoinSettings } from '@/app/baseball/actions/team-season-settings';
import {
  generateTeamInviteCode,
  regenerateTeamInviteCode,
} from '@/app/baseball/actions/teams';

const POLICY_COPY: Record<
  BaseballInvitePolicy,
  { label: string; description: string }
> = {
  invite_only: {
    label: 'Invite only',
    description: 'Share a code, but every new member needs a coach to approve. Safest.',
  },
  code_self_join: {
    label: 'Code self-join',
    description: 'Anyone with a valid join code joins immediately.',
  },
  closed: {
    label: 'Closed',
    description: 'Roster is locked. No new members can join.',
  },
};

interface Props {
  data: { settings: BaseballTeamSettings; viewerCanManageSettings: boolean };
}

export function TeamSettingsClient({ data }: Props) {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState<BaseballTeamSettings>(data.settings);

  const canEdit = data.viewerCanManageSettings;

  const setPolicy = (policy: BaseballInvitePolicy) => {
    if (!canEdit || policy === settings.invite_policy) return;
    const prev = settings;
    setSettings((s) => ({
      ...s,
      invite_policy: policy,
      allow_player_self_join: policy === 'code_self_join',
    }));
    startTransition(async () => {
      try {
        await updateTeamJoinSettings({ invite_policy: policy });
        showToast('Join policy updated', 'success');
      } catch {
        setSettings(prev);
        showToast('Could not update join policy.', 'error');
      }
    });
  };

  const setCoachApproval = (value: boolean) => {
    if (!canEdit) return;
    const prev = settings;
    setSettings((s) => ({ ...s, require_coach_approval: value }));
    startTransition(async () => {
      try {
        await updateTeamJoinSettings({ require_coach_approval: value });
        showToast(value ? 'Coach approval required' : 'Coach approval off', 'success');
      } catch {
        setSettings(prev);
        showToast('Could not update setting.', 'error');
      }
    });
  };

  const handleGenerate = () => {
    if (!canEdit) return;
    startTransition(async () => {
      const res = settings.joinCode
        ? await regenerateTeamInviteCode(settings.teamId)
        : await generateTeamInviteCode(settings.teamId);
      if (res.success && res.data) {
        setSettings((s) => ({ ...s, joinCode: res.data!.inviteCode }));
        showToast(settings.joinCode ? 'New code generated' : 'Join code created', 'success');
      } else {
        showToast(res.error ?? 'Could not update the join code.', 'error');
      }
    });
  };

  const copyCode = async () => {
    if (!settings.joinCode) return;
    try {
      await navigator.clipboard.writeText(settings.joinCode);
      showToast('Code copied', 'success');
    } catch {
      showToast('Could not copy. Copy it manually.', 'error');
    }
  };

  if (!canEdit) {
    return (
      <SettingsShell title="Team Settings" lede="Coach access required">
        <EditorsLetter
          ink="team"
          title="Team settings are staff-controlled."
          body="Join policy and the team code are managed by your coaching staff."
        />
      </SettingsShell>
    );
  }

  return (
    <SettingsShell
      title="Team Settings"
      lede={`${settings.teamName} • how members join`}
    >
      {/* Join code */}
      <SettingsSection
        icon={<IconLink size={18} />}
        title="Join Code"
        subtitle="Players use this code to find your team. Regenerating invalidates the old code."
      >
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-fw-sm border border-[color:var(--hairline)] bg-[var(--paper-canvas)] px-4 py-2 font-mono text-lg tracking-widest text-text-primary">
            {settings.joinCode ?? '— — — —'}
          </code>
          {settings.joinCode && (
            <Button variant="secondary" size="sm" onClick={copyCode}>
              Copy
            </Button>
          )}
          <Button
            variant={settings.joinCode ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleGenerate}
            isLoading={isPending}
          >
            {settings.joinCode ? 'Regenerate' : 'Create code'}
          </Button>
        </div>
        {settings.invite_policy === 'closed' && (
          <p className="text-sm leading-relaxed text-text-secondary">
            The roster is currently closed — the code will not let anyone join
            until you change the join policy.
          </p>
        )}
      </SettingsSection>

      {/* Invite policy */}
      <SettingsSection
        icon={<IconUsers size={18} />}
        title="Invite Policy"
        subtitle="Controls how a valid code turns into a roster member."
      >
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          role="radiogroup"
          aria-label="Invite policy"
        >
          {BASEBALL_INVITE_POLICIES.map((policy) => {
            const active = settings.invite_policy === policy;
            const copy = POLICY_COPY[policy];
            return (
              <Button
                key={policy}
                type="button"
                variant="ghost"
                role="radio"
                aria-checked={active}
                disabled={isPending}
                onClick={() => setPolicy(policy)}
                className={cn(
                  'h-auto flex-col items-start justify-start rounded-fw-md border p-4 text-left transition-colors duration-200',
                  active
                    ? 'border-grade-plus bg-grade-plus/10'
                    : 'border-[color:var(--hairline)] bg-[var(--paper-canvas)] hover:border-grade-plus/40',
                  isPending && 'cursor-not-allowed opacity-70',
                )}
              >
                <div className="mb-1 flex w-full items-center justify-between">
                  <span className="font-annual font-semibold text-text-primary">{copy.label}</span>
                  {active && <IconCheck size={16} className="shrink-0 text-grade-plus" />}
                </div>
                <p className="text-xs leading-relaxed text-text-secondary">
                  {copy.description}
                </p>
              </Button>
            );
          })}
        </div>

        <Checkbox
          label="Require coach approval"
          description="New members land in a pending state until a coach approves them — even when self-join is on."
          checked={settings.require_coach_approval}
          onChange={(e) => setCoachApproval(e.target.checked)}
          disabled={isPending}
        />
      </SettingsSection>
    </SettingsShell>
  );
}
