'use client';

/**
 * ============================================================================
 * Fairway · Team · FairwayTeamSettings  (COACH view · ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the COACH side of /golf/dashboard/team — the legacy
 * `TeamSettingsClient`. PRESENTATION-ONLY: every mutation is reused VERBATIM by
 * exact import path from `@/app/golf/actions/teams`:
 *
 *   • createTeam(name, season)              — when the coach has no team yet
 *   • updateTeam(teamId, { name, season })  — edit team identity
 *   • regenerateJoinCode(teamId)            — mint a fresh invite code
 *
 * None of these are destructive (no delete-then-insert). The legacy join-code
 * copy + regenerate affordances are preserved; the invite link is built from
 * window.location.origin client-side, exactly as the legacy component did
 * (seeded empty to avoid the SSR hydration mismatch the legacy code documented).
 *
 * Toasts go through `fairwayToast` only. Tokens / primitives ONLY — no glass,
 * no warm-* / primary-* legacy classes, no surface-matte / surface-stone.
 * ========================================================================== */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import {
  ViewHeader,
  Surface,
  Button,
  IconButton,
  Badge,
  Form,
  FormSection,
  FormField,
  Input,
  InlineNotice,
  fairwayToast,
} from '@/components/fairway';
import {
  IconCopy,
  IconCheck,
  IconRefresh,
  IconLink,
  IconUsers,
  IconCalendar,
  IconPlus,
} from '@/components/icons';
import {
  createTeam,
  updateTeam,
  regenerateJoinCode,
  addSecondTeam,
} from '@/app/golf/actions/teams';
import { setActiveTeam } from '@/app/golf/actions/team-switcher';
import { triggerHaptic } from '@/lib/utils/capacitor';

/* ---------------------------------------------------------------------------
 * Props — mirror the legacy TeamSettingsClient loader output EXACTLY
 * ------------------------------------------------------------------------- */

export interface FairwayTeamSettingsTeam {
  id: string;
  name: string;
  season: string | null;
  join_code: string | null;
  created_at: string;
  /**
   * Program type ('mens' | 'womens'). Optional/nullable so legacy callers that
   * never selected it keep type-checking; the masthead only renders a gender
   * chip when this is a recognised value. (P365)
   */
  gender?: string | null;
}

export interface FairwayTeamSettingsCoach {
  id: string;
  team_id: string | null;
  full_name: string | null;
}

export interface FairwayTeamSettingsProps {
  coach: FairwayTeamSettingsCoach;
  team: FairwayTeamSettingsTeam | null;
}

/** Compute the default season string ("YYYY-YYYY") the legacy form seeded. */
function defaultSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const seasonStart = month >= 7 ? year : year - 1;
  return `${seasonStart}-${seasonStart + 1}`;
}

const EM_DASH = '—';

export function FairwayTeamSettings({ coach, team }: FairwayTeamSettingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  // Resolve the absolute origin only after mount — rendering it during render
  // produced a hydration mismatch (the legacy code documents this). Seed empty,
  // fill in an effect.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Form state for creating / editing the team (verbatim seeding from legacy).
  const [teamName, setTeamName] = useState(team?.name || '');
  const [season, setSeason] = useState(() => team?.season || defaultSeason());
  // Gender for the FIRST team. createTeam defaults to 'mens' when omitted, so a
  // women's-program head creating their first team here used to silently get a
  // men's team (wrong gender propagates to theming + the men/women toggle — a B4
  // data lie). The create form now exposes the same picker the add-second-team
  // panel has. (P362)
  const [firstTeamGender, setFirstTeamGender] = useState<'mens' | 'womens'>('mens');

  // Add-second-team panel state (only shown to coaches who already have a team)
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [secondTeamName, setSecondTeamName] = useState('');
  const [secondTeamGender, setSecondTeamGender] = useState<'mens' | 'womens'>('womens');
  const [addTeamPending, startAddTeamTransition] = useTransition();
  // The team the coach just created — drives an inline confirmation that closes
  // the create→manage loop with a one-tap "Switch to {name}" action. (P370)
  const [createdTeam, setCreatedTeam] = useState<{ id: string; name: string } | null>(null);
  const [switchPending, startSwitchTransition] = useTransition();

  const handleAddSecondTeam = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!secondTeamName.trim()) {
      fairwayToast.error('Please enter a team name');
      return;
    }
    startAddTeamTransition(async () => {
      const result = await addSecondTeam(secondTeamName.trim(), secondTeamGender);
      if (result.success) {
        void triggerHaptic('success');
        fairwayToast.success('Second team created successfully');
        setShowAddTeam(false);
        setSecondTeamName('');
        // Surface which team was created + a direct switch affordance instead of
        // making the coach hunt for the top-bar switcher. (P370)
        if (result.data) {
          setCreatedTeam({ id: result.data.id, name: result.data.name });
        }
        router.refresh();
      } else {
        void triggerHaptic('error');
        fairwayToast.error(result.error || 'Failed to create team');
      }
    });
  };

  const handleSwitchToCreatedTeam = () => {
    if (!createdTeam) return;
    startSwitchTransition(async () => {
      const result = await setActiveTeam(createdTeam.id);
      if (result.success) {
        void triggerHaptic('success');
        fairwayToast.success(`Switched to ${createdTeam.name}`);
        setCreatedTeam(null);
        router.refresh();
      } else {
        void triggerHaptic('error');
        fairwayToast.error('Could not switch teams. Use the team switcher in the top bar.');
      }
    });
  };

  const handleCreateTeam = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!teamName.trim()) {
      fairwayToast.error('Please enter a team name');
      return;
    }
    startTransition(async () => {
      const result = await createTeam(teamName, season, firstTeamGender);
      if (result.success) {
        void triggerHaptic('success');
        fairwayToast.success('Team created');
        router.refresh();
      } else {
        void triggerHaptic('error');
        fairwayToast.error(result.error || 'Failed to create team');
      }
    });
  };

  const handleUpdateTeam = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!team) return;
    // Error prevention (P359): never let an empty team name reach the server.
    // The edit Input is not `required` (an existing name can be cleared), so
    // guard here before mutating — a blank name would otherwise persist and
    // render verbatim across the app.
    if (!teamName.trim()) {
      void triggerHaptic('error');
      fairwayToast.error('Team name is required');
      return;
    }
    startTransition(async () => {
      const result = await updateTeam(team.id, {
        name: teamName.trim(),
        season,
      });
      if (result.success) {
        void triggerHaptic('success');
        fairwayToast.success('Team updated');
        router.refresh();
      } else {
        void triggerHaptic('error');
        fairwayToast.error(result.error || 'Failed to update team');
      }
    });
  };

  const handleCopyInviteLink = async () => {
    if (!team?.join_code) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      fairwayToast.error('Clipboard is unavailable in this browser');
      return;
    }
    try {
      const inviteUrl = `${window.location.origin}/golf/join/${team.join_code}`;
      await navigator.clipboard.writeText(inviteUrl);
      void triggerHaptic('light');
      setCopied(true);
      fairwayToast.success('Invite link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      fairwayToast.error('Could not copy to clipboard');
    }
  };

  const handleRegenerateInviteCode = () => {
    if (!team) return;
    void triggerHaptic('warning');
    startTransition(async () => {
      const result = await regenerateJoinCode(team.id);
      if (result.success) {
        void triggerHaptic('success');
        fairwayToast.success('Invite code regenerated');
        router.refresh();
      } else {
        void triggerHaptic('error');
        fairwayToast.error(result.error || 'Failed to regenerate invite code');
      }
    });
  };

  /* ──────────────────────────────────────────────────────────────────────
   * NO TEAM — create form
   * ──────────────────────────────────────────────────────────────────── */
  if (!team) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
        <ViewHeader
          eyebrow="Team"
          title="Create your team"
          description="Set up your team to start adding players and creating events."
        />

        <Form spacing="roomy" onSubmit={handleCreateTeam} className="mt-8">
          <FormSection
            title="Team details"
            description="Name your program, choose the program type, and set the current season."
          >
            <div className="flex flex-col gap-5">
              {/* Gender picker — mirrors the add-second-team panel so the stored
                  gender is correct on the very first team. (P362) */}
              <FormField label="Program" required>
                <div className="flex gap-2">
                  {(['mens', 'womens'] as const).map((g) => (
                    <Button
                      key={g}
                      type="button"
                      variant={firstTeamGender === g ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setFirstTeamGender(g)}
                      disabled={isPending}
                      aria-pressed={firstTeamGender === g}
                      className="flex-1"
                    >
                      {g === 'mens' ? "Men's" : "Women's"}
                    </Button>
                  ))}
                </div>
              </FormField>
              <FormField label="Team name" required>
                <Input
                  name="name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder={firstTeamGender === 'mens' ? "e.g. Men's Golf" : "e.g. Women's Golf"}
                  disabled={isPending}
                  required
                />
              </FormField>
              <FormField label="Season" help="Format: YYYY-YYYY">
                <Input
                  name="season"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  placeholder="e.g. 2024-2025"
                  disabled={isPending}
                />
              </FormField>
            </div>
          </FormSection>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="primary"
              busy={isPending}
              disabled={!teamName.trim()}
              className="min-w-[160px]"
            >
              Create team
            </Button>
          </div>
        </Form>
      </div>
    );
  }

  /* ──────────────────────────────────────────────────────────────────────
   * HAS TEAM — settings
   * ──────────────────────────────────────────────────────────────────── */
  const inviteUrl = team.join_code
    ? `${origin}/golf/join/${team.join_code}`
    : '';
  const established = team.created_at
    ? new Date(team.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : EM_DASH;

  // Dirty-state for the edit form (P359). Baseline = the values the form was
  // seeded with (persisted name + persisted season, falling back to the
  // auto-seeded default season exactly as the inputs were initialised).
  const seededSeason = team.season || defaultSeason();
  const isEditDirty =
    teamName.trim() !== (team.name || '') || season !== seededSeason;

  // Surface the program type so a head running both programs always knows which
  // team they're editing (P365). Gender is set at creation and enforced by the
  // one-team-per-program-per-gender DB guard, so it's shown read-only here.
  const genderLabel =
    team.gender === 'mens' ? "Men's" : team.gender === 'womens' ? "Women's" : null;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Team"
        title={team.name || 'Team'}
        description="Manage your program details and invite players to the roster."
        meta={
          <>
            {genderLabel && (
              <>
                <Badge
                  tone="accent"
                  size="sm"
                  title="Program type is set when the team is created and can't be changed."
                >
                  {genderLabel}
                </Badge>
                <span aria-hidden>·</span>
              </>
            )}
            <span className="inline-flex items-center gap-1.5">
              <IconCalendar size={13} aria-hidden />
              {team.season || 'Season not set'}
            </span>
            <span aria-hidden>·</span>
            <span>Established {established}</span>
          </>
        }
      />

      {/* ── Team information (editable) ─────────────────────────────────── */}
      <Form spacing="roomy" onSubmit={handleUpdateTeam} className="mt-8">
        <FormSection
          title="Team information"
          description="The program name and season shown across the app."
        >
          <div className="flex flex-col gap-5">
            {genderLabel && (
              <FormField
                label="Program"
                help="Set when the team is created — can't be changed."
              >
                <div className="flex min-h-[2.5rem] items-center">
                  <Badge tone="accent" size="md">
                    {genderLabel}
                  </Badge>
                </div>
              </FormField>
            )}
            <FormField label="Team name">
              <Input
                name="name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Team name"
                disabled={isPending}
              />
            </FormField>
            <FormField label="Season" help="Format: YYYY-YYYY">
              <Input
                name="season"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="e.g. 2024-2025"
                disabled={isPending}
              />
            </FormField>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              variant="secondary"
              busy={isPending}
              // Real dirty-state + error prevention (P359): disabled when the
              // name is empty OR nothing changed vs the persisted team. Prevents
              // saving a blank name and the "Save" no-op that implies an edit.
              disabled={!teamName.trim() || !isEditDirty}
              leftIcon={<IconCheck size={16} />}
            >
              Save changes
            </Button>
          </div>
        </FormSection>
      </Form>

      {/* ── Player invitations ──────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="mb-5 flex flex-col gap-1">
          <h2 className="font-fw-display text-h2 text-text-primary">
            Player invitations
          </h2>
          <p className="font-fw-sans text-body text-text-secondary">
            Share this link with players to invite them to join your team.
          </p>
        </div>

        <Surface elevation="border" padding="md" className="flex flex-col gap-4">
          {team.join_code ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="fw-team-invite-link"
                  className="block font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary"
                >
                  Invite link
                </label>
                <Input
                  id="fw-team-invite-link"
                  readOnly
                  value={inviteUrl}
                  aria-label="Team invite link"
                  onFocus={(e) => e.currentTarget.select()}
                  leading={<IconLink size={16} />}
                  className="font-fw-mono text-body-sm text-text-secondary"
                  trailing={
                    <IconButton
                      variant="ghost"
                      // 44px touch target (P367) — `md` is h-11 w-11 so the
                      // inline copy affordance clears the premium 44px minimum on
                      // every pointer type, not just coarse pointers.
                      size="md"
                      aria-label={copied ? 'Invite link copied' : 'Copy invite link'}
                      onClick={() => void handleCopyInviteLink()}
                    >
                      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    </IconButton>
                  }
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={copied ? 'secondary' : 'primary'}
                  leftIcon={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  onClick={() => void handleCopyInviteLink()}
                >
                  {copied ? 'Copied to clipboard' : 'Copy invite link'}
                </Button>
                <Button
                  variant="ghost"
                  busy={isPending}
                  leftIcon={<IconRefresh size={16} />}
                  onClick={handleRegenerateInviteCode}
                >
                  Regenerate invite code
                </Button>
              </div>

              <p className="font-fw-sans text-caption text-text-tertiary">
                Regenerating will invalidate the old invite link.
              </p>
            </>
          ) : (
            <InlineNotice tone="warning" title="No invite code yet">
              This team doesn&rsquo;t have an invite code. Regenerate one to start
              inviting players.
              <div className="mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  busy={isPending}
                  leftIcon={<IconRefresh size={16} />}
                  onClick={handleRegenerateInviteCode}
                >
                  Generate invite code
                </Button>
              </div>
            </InlineNotice>
          )}
        </Surface>
      </section>

      {/* ── Add a second team (program head affordance) ─────────────────── */}
      <section className="mt-10">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-fw-display text-h2 text-text-primary">
              Add a team
            </h2>
            <p className="font-fw-sans text-body text-text-secondary">
              Run both a Men&rsquo;s and Women&rsquo;s program? Add a second team under
              the same organization.
            </p>
          </div>
          {!showAddTeam && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<IconPlus size={16} />}
              onClick={() => setShowAddTeam(true)}
              className="flex-shrink-0 mt-0.5"
            >
              Add team
            </Button>
          )}
        </div>

        {/* Inline create→manage confirmation (P370): names the team just made
            and offers a one-tap switch so the program head can manage it without
            hunting for the top-bar switcher. */}
        {createdTeam && !showAddTeam && (
          <div className="mb-5">
            <InlineNotice
              tone="success"
              title={`${createdTeam.name} created`}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  busy={switchPending}
                  onClick={handleSwitchToCreatedTeam}
                >
                  Switch to {createdTeam.name}
                </Button>
              }
            >
              You&rsquo;re still managing your current team. Switch over to set up{' '}
              {createdTeam.name}.
            </InlineNotice>
          </div>
        )}

        {showAddTeam && (
          <Surface elevation="border" padding="md">
            <Form spacing="roomy" onSubmit={handleAddSecondTeam}>
              <FormSection
                title="New team"
                description="Choose the gender and give the team a name."
              >
                <div className="flex flex-col gap-5">
                  {/* Gender picker */}
                  <FormField label="Team gender" required>
                    <div className="flex gap-2">
                      {(['mens', 'womens'] as const).map((g) => (
                        <Button
                          key={g}
                          type="button"
                          variant={secondTeamGender === g ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => setSecondTeamGender(g)}
                          className="flex-1"
                        >
                          {g === 'mens' ? "Men's" : "Women's"}
                        </Button>
                      ))}
                    </div>
                  </FormField>
                  <FormField label="Team name" required>
                    <Input
                      name="secondTeamName"
                      value={secondTeamName}
                      onChange={(e) => setSecondTeamName(e.target.value)}
                      placeholder={secondTeamGender === 'mens' ? "Men's Golf" : "Women's Golf"}
                      disabled={addTeamPending}
                      required
                    />
                  </FormField>
                </div>
              </FormSection>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setShowAddTeam(false); setSecondTeamName(''); }}
                  disabled={addTeamPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  busy={addTeamPending}
                  disabled={!secondTeamName.trim()}
                  leftIcon={<IconPlus size={16} />}
                >
                  Create team
                </Button>
              </div>
            </Form>
          </Surface>
        )}
      </section>

      {/* Quiet coach attribution — honest about what we know. */}
      <p
        className={cn(
          'mt-8 flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary',
        )}
      >
        <IconUsers size={13} aria-hidden />
        Managed by {coach.full_name || EM_DASH}
      </p>
    </div>
  );
}
