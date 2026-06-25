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

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { IconUsers, IconLock, IconCheck, IconLink } from '@/components/icons';

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
      <>
        <Header title="Team Settings" subtitle="Coach access required" />
        <div className="p-6 lg:p-8 max-w-3xl mx-auto">
          <EmptyState
            variant="card"
            glass
            icon={<IconLock size={40} />}
            title="Team settings are staff-controlled"
            description="Join policy and the team code are managed by your coaching staff."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Team Settings"
        subtitle={`${settings.teamName} • how members join`}
      />

      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        {/* Join code */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="text-warm-600">
                <IconLink size={20} />
              </span>
              <div>
                <h2 className="font-semibold text-warm-900">Join Code</h2>
                <p className="text-sm leading-relaxed text-warm-500">
                  Players use this code to find your team. Regenerating invalidates
                  the old code.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <code className="rounded-lg border border-warm-200 bg-cream-50 px-4 py-2 font-mono text-lg tracking-widest text-warm-900">
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
              <p className="text-sm text-warm-500">
                The roster is currently closed — the code will not let anyone join
                until you change the join policy.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Invite policy */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="text-warm-600">
                <IconUsers size={20} />
              </span>
              <div>
                <h2 className="font-semibold text-warm-900">Invite Policy</h2>
                <p className="text-sm leading-relaxed text-warm-500">
                  Controls how a valid code turns into a roster member.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {BASEBALL_INVITE_POLICIES.map((policy) => {
                const active = settings.invite_policy === policy;
                const copy = POLICY_COPY[policy];
                return (
                  <Button
                    key={policy}
                    type="button"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => setPolicy(policy)}
                    className={cn(
                      'h-auto text-left rounded-xl border p-4 transition-all flex-col items-start justify-start',
                      active
                        ? 'border-primary-500 bg-primary-50/70 ring-1 ring-primary-200'
                        : 'border-warm-200 bg-cream-50 hover:border-primary-200',
                      isPending && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1 w-full">
                      <span className="font-semibold text-warm-900">{copy.label}</span>
                      {active && (
                        <IconCheck size={16} className="text-primary-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-warm-500">
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
          </CardContent>
        </Card>
      </div>
    </>
  );
}
