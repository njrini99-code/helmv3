'use client';

// =============================================================================
// src/components/baseball/settings/ProgramSettingsClient.tsx
//
// Wave 4 / packet: settings-os. MIGRATED (P4.16) to "The Living Annual" kit
// (design-system-living-annual.md §7 kit, §8 motion contract): the generic
// `Header` + `Card`/`CardHeader`/`CardContent` chrome is now `SectionMasthead`
// + `PaperCard` + `HairlineRule` + `Eyebrow`, and the read-only guard renders
// through `EditorsLetter` instead of the old amber-adjacent `EmptyState`.
//
// PRESENTATION-ONLY migration: BOTH save paths (updateProgramSettings via
// handleSave, updateProgramIdentity via handleSaveIdentity), changeProgramType,
// every patch()/patchIdentity() mutator, and every form primitive (Input,
// Select, Checkbox, Button — all still `@/components/ui/*`, untouched) are
// preserved verbatim. `SectionCard` is refactored exactly once: it now wraps
// each section in the kit's `<Reveal>` (mount-based settle — see Reveal.tsx;
// a `whileInView` gate would strand every card below the fold at opacity:0
// because the dashboard's inner-scroll shell breaks IntersectionObserver
// against the document viewport) instead of the old bespoke inline
// framer-motion `m.div`. The `#anchor` deep-links (player-access,
// guardian-access, showcase-profile, ai, notifications, data-retention) still
// work — `id`/`scroll-mt-24` moved to SectionCard's outer wrapper because
// `PaperCard` doesn't forward arbitrary props. `AiAuditLog.tsx` is untouched.
//
// Program-ops = the Pressbox (team) lane → green ink throughout.
//
// No golf vocabulary. Terminology comes from the variant terminology pack.
// =============================================================================

import { useState, useTransition } from 'react';
import { LazyMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import {
  IconBuilding,
  IconShield,
  IconBrain,
  IconBell,
  IconDatabase,
  IconLock,
  IconUsers,
  IconGraduationCap,
  IconCheck,
  IconPalette,
  IconFlag,
  IconImage,
} from '@/components/icons';
import {
  updateProgramSettings,
  changeProgramType,
  updateProgramIdentity,
  type ProgramSettingsData,
} from '@/app/baseball/actions/program-settings';
import {
  listProgramVariants,
} from '@/lib/baseball/program-type-variants';
import { AiAuditLog } from '@/components/baseball/settings/AiAuditLog';
import {
  SectionMasthead,
  PaperCard,
  HairlineRule,
  Eyebrow,
  EditorsLetter,
  Reveal,
} from '@/components/baseball/living-annual';
import type {
  BaseballProgramType,
  BaseballProgramSettings,
  BaseballProgramSettingsUpdate,
  BaseballNotificationType,
} from '@/lib/types/baseball-settings';
import { BASEBALL_NOTIFICATION_TYPES } from '@/lib/types/baseball-settings';
import type {
  BaseballProgramIdentityUpdate,
  BaseballPublicProfileMode,
  BaseballPlayerAccountPolicy,
} from '@/lib/types/baseball-program-identity';
import {
  BASEBALL_TIMEZONE_OPTIONS,
  isValidBrandHex,
} from '@/lib/types/baseball-program-identity';

interface Props {
  data: ProgramSettingsData;
}

// -----------------------------------------------------------------------------
// Small, palette-true toggle row. Reuses the Checkbox form primitive verbatim
// so every toggle stays consistent with the rest of the app.
// -----------------------------------------------------------------------------

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Checkbox
      label={label}
      description={description}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

// -----------------------------------------------------------------------------
// Labelled text/select field. The label/hint chrome uses the kit's ink-primary
// / ink-tertiary text tokens; the control passed as `children` (Input/Select)
// is a form primitive and is never touched here.
// -----------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-text-primary">{label}</span>
      {hint && <span className="block text-xs text-text-tertiary mb-1.5">{hint}</span>}
      {!hint && <span className="block mb-1.5" />}
      {children}
    </label>
  );
}

// -----------------------------------------------------------------------------
// SectionCard — refactored ONCE onto the Living Annual kit. Every one of the
// page's ten sections composes from this: a PaperCard body, an icon badge in
// team ink, an Eyebrow + serif title, a green HairlineRule, and a mount-based
// Reveal settle (capped stagger — see below).
// -----------------------------------------------------------------------------

function SectionCard({
  icon,
  eyebrow,
  title,
  subtitle,
  children,
  anchorId,
  index = 0,
}: {
  icon: React.ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /**
   * Optional stable anchor so the dedicated spec routes that fold into this
   * page (player-access, guardian-access, showcase-profile, ai,
   * notifications, data-retention) can deep-link via `#anchor`. Lives on the
   * OUTER wrapper — not `PaperCard`, which doesn't forward `id` — so the
   * browser's native fragment scroll still lands here; `scroll-mt-24` keeps
   * the section clear of the sticky masthead on jump.
   */
  anchorId?: string;
  index?: number;
}) {
  // Reveal on MOUNT (the kit's <Reveal>, never `whileInView`): a settings form
  // is one tall document, and gating each card behind viewport-intersection
  // left every section below the fold stuck at opacity:0 until scrolled to —
  // the dashboard's inner-scroll shell breaks IntersectionObserver against the
  // document viewport (see Reveal.tsx). Stagger is capped at 3 steps (~180ms
  // max) so a ten-section form still settles briskly rather than crawling.
  return (
    <div id={anchorId} className={anchorId ? 'scroll-mt-24' : undefined}>
      <Reveal staggerIndex={Math.min(index, 3)}>
        <PaperCard className="p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-md border border-[color:var(--hairline)] bg-grade-plus/10 text-grade-plus">
              {icon}
            </span>
            <div className="min-w-0">
              {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
              <h2 className="font-annual text-h3 font-semibold text-text-primary">{title}</h2>
              {subtitle && (
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">{subtitle}</p>
              )}
            </div>
          </div>
          <HairlineRule ink="team" className="my-4" />
          <div className="space-y-3">{children}</div>
        </PaperCard>
      </Reveal>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

export function ProgramSettingsClient({ data }: Props) {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState<BaseballProgramSettings>(data.settings);
  const [programType, setProgramType] = useState<BaseballProgramType>(
    data.program.program_type,
  );
  const [dirty, setDirty] = useState<BaseballProgramSettingsUpdate>({});

  // Program-identity (writes to baseball_teams) is tracked separately from the
  // settings document so each saves through its own server action.
  const [identity, setIdentity] = useState({
    name: data.identity.name,
    competition_level: data.program.competition_level ?? '',
    region_state: data.program.region_state ?? '',
    timezone: data.program.timezone ?? 'America/New_York',
    season_label: data.program.season_label ?? '',
    logo_url: data.identity.logo_url ?? '',
    primary_color: data.identity.primary_color ?? '',
    secondary_color: data.identity.secondary_color ?? '',
    public_profile_mode: data.identity.public_profile_mode,
    player_account_policy: data.identity.player_account_policy,
    default_team_id: data.identity.default_team_id ?? '',
  });
  const [identityDirty, setIdentityDirty] = useState<BaseballProgramIdentityUpdate>({});

  const canEdit = data.viewerCanManageSettings;
  const variants = listProgramVariants();
  const term = data.variant.terminology;
  const siblingTeams = data.siblingTeams.filter((t) => t.id !== data.teamId);

  const patch = <K extends keyof BaseballProgramSettings>(
    key: K,
    value: BaseballProgramSettings[K],
  ) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setDirty((d) => ({ ...d, [key]: value }));
  };

  const patchIdentity = <K extends keyof typeof identity>(
    key: K,
    value: (typeof identity)[K],
  ) => {
    setIdentity((i) => ({ ...i, [key]: value }));
    setIdentityDirty((d) => ({ ...d, [key]: value === '' ? null : value }));
  };

  const hasUnsaved = Object.keys(dirty).length > 0;
  const hasIdentityUnsaved = Object.keys(identityDirty).length > 0;

  const handleSave = () => {
    if (!hasUnsaved) return;
    startTransition(async () => {
      try {
        const result = await updateProgramSettings(dirty);
        if (!result.success) {
          showToast(result.error || 'Could not save settings. Check your access and try again.', 'error');
          return;
        }
        setDirty({});
        showToast('Settings saved', 'success');
      } catch {
        showToast('Could not save settings. Check your access and try again.', 'error');
      }
    });
  };

  const handleSaveIdentity = () => {
    if (!hasIdentityUnsaved) return;
    // Client-side brand-hex guard so the user gets immediate feedback; the
    // server re-validates regardless.
    for (const key of ['primary_color', 'secondary_color'] as const) {
      const v = identity[key];
      if (v && !isValidBrandHex(v)) {
        showToast('Brand colors must be a 6-digit hex value (e.g. #16a34a).', 'error');
        return;
      }
    }
    startTransition(async () => {
      try {
        await updateProgramIdentity(identityDirty);
        setIdentityDirty({});
        showToast('Program identity saved', 'success');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        showToast(
          msg || 'Could not save program identity. Check your access and try again.',
          'error',
        );
      }
    });
  };

  const handleProgramTypeChange = (next: BaseballProgramType) => {
    if (next === programType || !canEdit) return;
    startTransition(async () => {
      try {
        await changeProgramType(next);
        setProgramType(next);
        showToast(
          `Program mode set to ${variants.find((v) => v.programType === next)?.label ?? next}. Defaults and navigation updated.`,
          'success',
        );
      } catch {
        showToast('Could not change program type.', 'error');
      }
    });
  };

  if (!canEdit && !settings.id) {
    return (
      <LazyMotion features={loadFeatures}>
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <SectionMasthead eyebrow="THE PRESSBOX · SETTINGS" title="Program Settings" ink="team" />
          <div className="mt-8">
            <EditorsLetter
              ink="team"
              title="Settings are staff-controlled."
              body="Program settings are managed by your coaching staff. Ask a head coach if you need a change."
            />
          </div>
        </div>
      </LazyMotion>
    );
  }

  return (
    <LazyMotion features={loadFeatures}>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <SectionMasthead
          eyebrow="THE PRESSBOX · SETTINGS"
          title="Program Settings"
          ink="team"
          actions={
            canEdit ? (
              <Button onClick={handleSave} isLoading={isPending} disabled={!hasUnsaved}>
                {hasUnsaved ? 'Save Changes' : 'Saved'}
              </Button>
            ) : undefined
          }
        >
          <p className="text-sm text-text-secondary">
            {data.teamName} · {data.variant.label} mode
          </p>
        </SectionMasthead>

        {!canEdit && (
          <div className="flex items-center gap-2 border-b border-[color:var(--hairline)] pb-4 text-sm text-text-secondary">
            <IconLock size={16} className="shrink-0 text-text-tertiary" />
            You can view these settings but only staff with the manage-settings
            capability can change them.
          </div>
        )}

        {/* --- PROGRAM IDENTITY ---------------------------------------------- */}
        <SectionCard
          anchorId="program-identity"
          icon={<IconFlag size={18} />}
          eyebrow="Identity"
          title="Program Identity"
          subtitle="The name, location, season, and access posture for your program. Used across reports, schedules, and (when enabled) the public profile."
          index={0}
        >
          <Field label="Program name">
            <Input
              type="text"
              value={identity.name}
              disabled={!canEdit}
              maxLength={120}
              onChange={(e) => patchIdentity('name', e.target.value)}
              placeholder="e.g. State University Baseball"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Competition level"
              hint="Free text — e.g. D1, 5A, 17U, NJCAA D2."
            >
              <Input
                type="text"
                value={identity.competition_level}
                disabled={!canEdit}
                maxLength={64}
                onChange={(e) => patchIdentity('competition_level', e.target.value)}
                placeholder="Competition level"
              />
            </Field>
            <Field label="Region / state">
              <Input
                type="text"
                value={identity.region_state}
                disabled={!canEdit}
                maxLength={64}
                onChange={(e) => patchIdentity('region_state', e.target.value)}
                placeholder="e.g. North Carolina"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Season naming"
              hint='How this season is labelled — e.g. "Fall 2026".'
            >
              <Input
                type="text"
                value={identity.season_label}
                disabled={!canEdit}
                maxLength={64}
                onChange={(e) => patchIdentity('season_label', e.target.value)}
                placeholder="e.g. 2026 Summer Circuit"
              />
            </Field>
            <Field label="Timezone" hint="Used for schedule + report times.">
              <Select
                options={[
                  ...(!BASEBALL_TIMEZONE_OPTIONS.some((o) => o.value === identity.timezone)
                    ? [{ value: identity.timezone, label: identity.timezone }]
                    : []),
                  ...BASEBALL_TIMEZONE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                ]}
                value={identity.timezone}
                disabled={!canEdit}
                onChange={(v) => patchIdentity('timezone', v)}
              />
            </Field>
          </div>

          {siblingTeams.length > 0 && (
            <Field
              label="Default team"
              hint="For multi-team programs — the team coaches land on first."
            >
              <Select
                options={[
                  { value: '', label: `This team (${data.teamName})` },
                  ...siblingTeams.map((t) => ({ value: t.id, label: t.name })),
                ]}
                value={identity.default_team_id}
                disabled={!canEdit}
                onChange={(v) => patchIdentity('default_team_id', v)}
              />
            </Field>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Public profile mode"
              hint="Controls whether your program has a public profile."
            >
              <Select
                options={[
                  { value: 'private', label: 'Private — no public profile' },
                  { value: 'unlisted', label: 'Unlisted — link only' },
                  { value: 'public', label: 'Public — discoverable' },
                ]}
                value={identity.public_profile_mode}
                disabled={!canEdit}
                onChange={(v) => patchIdentity('public_profile_mode', v as BaseballPublicProfileMode)}
              />
            </Field>
            <Field
              label="Player account policy"
              hint="The program-level stance on player self-accounts."
            >
              <Select
                options={[
                  { value: 'invite_only', label: 'Invite only' },
                  { value: 'approval_required', label: 'Approval required' },
                  { value: 'open_join', label: 'Open join' },
                ]}
                value={identity.player_account_policy}
                disabled={!canEdit}
                onChange={(v) => patchIdentity('player_account_policy', v as BaseballPlayerAccountPolicy)}
              />
            </Field>
          </div>

          {canEdit && (
            <div className="flex justify-end pt-1">
              <Button
                onClick={handleSaveIdentity}
                isLoading={isPending}
                disabled={!hasIdentityUnsaved}
                variant="secondary"
              >
                {hasIdentityUnsaved ? 'Save identity' : 'Saved'}
              </Button>
            </div>
          )}
        </SectionCard>

        {/* --- PROGRAM TYPE (the controlling setting) -------------------------- */}
        <SectionCard
          icon={<IconBuilding size={18} />}
          eyebrow="Mode"
          title="Program Type"
          subtitle="Controls default navigation, terminology, feature defaults, and onboarding. Switching modes never overwrites settings you've already saved."
          index={1}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {variants.map((v) => {
              const active = v.programType === programType;
              return (
                <Button
                  key={v.programType}
                  type="button"
                  variant="ghost"
                  disabled={!canEdit || isPending}
                  onClick={() => handleProgramTypeChange(v.programType)}
                  className={cn(
                    'h-auto text-left rounded-fw-md border p-4 transition-all flex-col items-start justify-start',
                    active
                      ? 'border-grade-plus bg-grade-plus/10 ring-1 ring-grade-plus/30'
                      : 'border-[color:var(--hairline)] bg-[var(--paper)] hover:border-grade-plus/40',
                    (!canEdit || isPending) && 'cursor-not-allowed opacity-70',
                  )}
                >
                  <div className="flex items-center justify-between mb-1 w-full">
                    <span className="font-semibold text-text-primary">{v.label}</span>
                    {active && (
                      <IconCheck size={16} className="text-grade-plus shrink-0" />
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-text-secondary">
                    {v.description}
                  </p>
                </Button>
              );
            })}
          </div>
        </SectionCard>

        {/* --- PLAYER ACCESS -------------------------------------------------- */}
        <SectionCard
          anchorId="player-access"
          icon={<IconUsers size={18} />}
          eyebrow="Access"
          title="Player Access"
          subtitle={`What ${term.rosterNoun.toLowerCase()} members can do in their account.`}
          index={2}
        >
          <ToggleRow
            label="Require invite to join"
            description="Players must be invited; no open self-join."
            checked={settings.players_require_invite}
            disabled={!canEdit}
            onChange={(v) => patch('players_require_invite', v)}
          />
          <ToggleRow
            label="Players can edit their profile"
            checked={settings.players_can_edit_profile}
            disabled={!canEdit}
            onChange={(v) => patch('players_can_edit_profile', v)}
          />
          <ToggleRow
            label="Players can edit their public profile"
            checked={settings.players_can_edit_public_profile}
            disabled={!canEdit}
            onChange={(v) => patch('players_can_edit_public_profile', v)}
          />
          <ToggleRow
            label="Players can view team stats"
            checked={settings.players_can_view_team_stats}
            disabled={!canEdit}
            onChange={(v) => patch('players_can_view_team_stats', v)}
          />
          <ToggleRow
            label="Players can self-log lifts"
            checked={settings.players_can_self_log_lift}
            disabled={!canEdit}
            onChange={(v) => patch('players_can_self_log_lift', v)}
          />
          <ToggleRow
            label="Players can self-report availability"
            checked={settings.players_can_self_report_availability}
            disabled={!canEdit}
            onChange={(v) => patch('players_can_self_report_availability', v)}
          />
          <ToggleRow
            label="Players can upload video"
            checked={settings.players_can_upload_video}
            disabled={!canEdit}
            onChange={(v) => patch('players_can_upload_video', v)}
          />
        </SectionCard>

        {/* --- MODULES ------------------------------------------------------- */}
        <SectionCard
          icon={<IconGraduationCap size={18} />}
          eyebrow="Surfaces"
          title="Modules"
          subtitle="Turn the major surfaces on or off for this program."
          index={3}
        >
          <ToggleRow
            label="Academics & class conflicts"
            checked={settings.academics_module_enabled}
            disabled={!canEdit}
            onChange={(v) => patch('academics_module_enabled', v)}
          />
          <ToggleRow
            label="Travel & team operations"
            checked={settings.travel_module_enabled}
            disabled={!canEdit}
            onChange={(v) => patch('travel_module_enabled', v)}
          />
          <ToggleRow
            label="Recruiting / exposure"
            description={term.exposureNoun}
            checked={settings.recruiting_exposure_enabled}
            disabled={!canEdit}
            onChange={(v) => patch('recruiting_exposure_enabled', v)}
          />
          <ToggleRow
            label="Public player profiles"
            checked={settings.public_profiles_enabled}
            disabled={!canEdit}
            onChange={(v) => patch('public_profiles_enabled', v)}
          />
          <div className="space-y-2 pt-2">
            <Eyebrow className="text-text-tertiary">Performance depth</Eyebrow>
            <HairlineRule animate={false} className="mb-1" />
            <div className="flex gap-2">
              {(['lite', 'standard', 'full'] as const).map((depth) => (
                <Button
                  key={depth}
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit}
                  onClick={() => patch('performance_module_depth', depth)}
                  className={cn(
                    'flex-1 rounded-fw-md border px-3 py-2 text-sm font-medium capitalize transition-colors',
                    settings.performance_module_depth === depth
                      ? 'border-grade-plus bg-grade-plus/10 text-grade-plus'
                      : 'border-[color:var(--hairline)] bg-[var(--paper)] text-text-secondary hover:border-grade-plus/40',
                    !canEdit && 'cursor-not-allowed opacity-70',
                  )}
                >
                  {depth}
                </Button>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* --- GUARDIAN ACCESS ----------------------------------------------- */}
        <SectionCard
          anchorId="guardian-access"
          icon={<IconShield size={18} />}
          eyebrow="Family"
          title="Guardian Access"
          subtitle="Optional family communication. Guardians never see staff notes, staff AI, or other players' data."
          index={4}
        >
          <ToggleRow
            label="Enable guardian access"
            checked={settings.guardian_access_enabled}
            disabled={!canEdit}
            onChange={(v) => patch('guardian_access_enabled', v)}
          />
          <ToggleRow
            label="Guardians can view schedule"
            checked={settings.guardian_can_view_schedule}
            disabled={!canEdit || !settings.guardian_access_enabled}
            onChange={(v) => patch('guardian_can_view_schedule', v)}
          />
          <ToggleRow
            label="Guardians can view announcements"
            checked={settings.guardian_can_view_announcements}
            disabled={!canEdit || !settings.guardian_access_enabled}
            onChange={(v) => patch('guardian_can_view_announcements', v)}
          />
          <ToggleRow
            label="Guardians can view travel details"
            checked={settings.guardian_can_view_travel}
            disabled={!canEdit || !settings.guardian_access_enabled}
            onChange={(v) => patch('guardian_can_view_travel', v)}
          />
        </SectionCard>

        {/* --- SCOUT / SHOWCASE ACCESS --------------------------------------- */}
        <SectionCard
          anchorId="showcase-profile"
          icon={<IconUsers size={18} />}
          eyebrow="Exposure"
          title="Scout & Showcase Access"
          subtitle="Controls for scout packets, verified-metric display, and exports."
          index={5}
        >
          <ToggleRow
            label="Enable scout access"
            checked={settings.scout_access_enabled}
            disabled={!canEdit}
            onChange={(v) => patch('scout_access_enabled', v)}
          />
          <ToggleRow
            label="Show unverified metrics to scouts"
            description="Off keeps unverified measurables out of scout packets."
            checked={settings.scout_show_unverified_metrics}
            disabled={!canEdit || !settings.scout_access_enabled}
            onChange={(v) => patch('scout_show_unverified_metrics', v)}
          />
          <ToggleRow
            label="Scouts can export packets"
            checked={settings.scout_can_export}
            disabled={!canEdit || !settings.scout_access_enabled}
            onChange={(v) => patch('scout_can_export', v)}
          />
          <div className="space-y-2 pt-2">
            <Eyebrow className="text-text-tertiary">Scout packet visibility</Eyebrow>
            <HairlineRule animate={false} className="mb-1" />
            <div className="flex gap-2">
              {(['private', 'event_only', 'public'] as const).map((vis) => (
                <Button
                  key={vis}
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit || !settings.scout_access_enabled}
                  onClick={() => patch('scout_packet_visibility', vis)}
                  className={cn(
                    'flex-1 rounded-fw-md border px-3 py-2 text-sm font-medium transition-colors',
                    settings.scout_packet_visibility === vis
                      ? 'border-grade-plus bg-grade-plus/10 text-grade-plus'
                      : 'border-[color:var(--hairline)] bg-[var(--paper)] text-text-secondary hover:border-grade-plus/40',
                    (!canEdit || !settings.scout_access_enabled) &&
                      'cursor-not-allowed opacity-70',
                  )}
                >
                  {vis === 'event_only' ? 'Event only' : vis.charAt(0).toUpperCase() + vis.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* --- AI SETTINGS --------------------------------------------------- */}
        <SectionCard
          anchorId="ai"
          icon={<IconBrain size={18} />}
          eyebrow="Intelligence"
          title="AI Settings"
          subtitle="Every AI output cites its sources, stores a confidence, and respects visibility. Player-visible AI requires staff approval."
          index={6}
        >
          <ToggleRow
            label="AI enabled"
            checked={settings.ai_enabled}
            disabled={!canEdit}
            onChange={(v) => patch('ai_enabled', v)}
          />
          <ToggleRow
            label="Staff AI briefs enabled"
            checked={settings.ai_staff_enabled}
            disabled={!canEdit || !settings.ai_enabled}
            onChange={(v) => patch('ai_staff_enabled', v)}
          />
          <ToggleRow
            label="Player-visible AI enabled"
            description="Player-safe summaries only — never staff notes or risk flags."
            checked={settings.ai_player_visible_enabled}
            disabled={!canEdit || !settings.ai_enabled}
            onChange={(v) => patch('ai_player_visible_enabled', v)}
          />
          <ToggleRow
            label="Require staff approval before player-visible AI"
            checked={settings.ai_require_staff_approval}
            disabled={!canEdit || !settings.ai_enabled}
            onChange={(v) => patch('ai_require_staff_approval', v)}
          />
          <ToggleRow
            label="Require source references on every AI output"
            checked={settings.ai_require_source_refs}
            disabled={!canEdit || !settings.ai_enabled}
            onChange={(v) => patch('ai_require_source_refs', v)}
          />
          <ToggleRow
            label="Medical-claim guardrail"
            checked={settings.ai_medical_guardrail}
            disabled={!canEdit || !settings.ai_enabled}
            onChange={(v) => patch('ai_medical_guardrail', v)}
          />
          <ToggleRow
            label="Academic-privacy guardrail"
            checked={settings.ai_academic_privacy_guardrail}
            disabled={!canEdit || !settings.ai_enabled}
            onChange={(v) => patch('ai_academic_privacy_guardrail', v)}
          />

          {/* Numeric governance gates — persisted + ENFORCED in the engine
              (ai-policy.ts): outputs below the confidence floor are withheld, and
              outputs older than the stale window are marked not-authoritative. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
            <Field
              label="Confidence threshold"
              hint="AI output below this confidence is withheld."
            >
              <div className="flex items-center gap-3">
                { }
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.ai_confidence_threshold}
                  disabled={!canEdit || !settings.ai_enabled}
                  onChange={(e) => patch('ai_confidence_threshold', Number(e.target.value))}
                  className="flex-1 cursor-pointer accent-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-70"
                  aria-label="AI confidence threshold"
                  aria-valuetext={`${Math.round(settings.ai_confidence_threshold * 100)} percent`}
                />
                <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-text-primary">
                  {Math.round(settings.ai_confidence_threshold * 100)}%
                </span>
              </div>
            </Field>
            <Field
              label="Stale-output expiration"
              hint="AI output older than this is flagged stale."
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={settings.ai_stale_after_days}
                  disabled={!canEdit || !settings.ai_enabled}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(365, Math.round(Number(e.target.value) || 1)));
                    patch('ai_stale_after_days', n);
                  }}
                  className="w-24"
                  aria-label="AI stale-after days"
                />
                <span className="text-sm text-text-tertiary">days</span>
              </div>
            </Field>
          </div>

          {/* Enforcement note — these gates are NOT cosmetic; they govern the
              engine on every generation. */}
          <p className="rounded-fw-md border border-[color:var(--hairline)] bg-grade-plus/[0.06] px-3 py-2 text-xs leading-relaxed text-text-secondary">
            These controls are enforced by the CoachHelm engine on every run. With AI
            off, no signals or briefs generate. Player-visible AI is held to staff
            approval when required, low-confidence and source-less outputs are
            withheld, and the guardrails redact medical and academic detail. Every
            generation writes an audit entry below.
          </p>

          {/* AI audit log — the v4 §AI Settings AI-audit row, surfaced. Untouched. */}
          <AiAuditLog teamId={data.teamId} canManage={canEdit} />
        </SectionCard>

        {/* --- NOTIFICATIONS -------------------------------------------------- */}
        <SectionCard
          anchorId="notifications"
          icon={<IconBell size={18} />}
          eyebrow="Alerts"
          title="Notifications"
          subtitle="Program-level notification defaults. Members can refine their own preferences. In-app channel is live; email and push arrive in a later wave."
          index={7}
        >
          {/* Quiet hours */}
          <div className="space-y-3 pt-2">
            <div>
              <Eyebrow className="text-text-tertiary">Quiet hours</Eyebrow>
              <p className="mt-1 text-xs text-text-tertiary">
                No notifications are sent during this window (applied across the program).
              </p>
            </div>
            <HairlineRule animate={false} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  type="time"
                  label="Start"
                  value={settings.quiet_hours_start ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => patch('quiet_hours_start', e.target.value || null)}
                  aria-label="Quiet hours start"
                />
              </div>
              <div>
                <Input
                  type="time"
                  label="End"
                  value={settings.quiet_hours_end ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => patch('quiet_hours_end', e.target.value || null)}
                  aria-label="Quiet hours end"
                />
              </div>
            </div>
            {(settings.quiet_hours_start || settings.quiet_hours_end) && canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  patch('quiet_hours_start', null);
                  patch('quiet_hours_end', null);
                }}
                className="text-xs text-text-tertiary hover:text-text-secondary px-0 underline-offset-2 hover:underline"
              >
                Clear quiet hours
              </Button>
            )}
          </div>

          {/* Per-type in-app defaults */}
          <div className="space-y-3 pt-2">
            <div>
              <Eyebrow className="text-text-tertiary">Default in-app notifications</Eyebrow>
              <p className="mt-1 text-xs text-text-tertiary">
                Members who have not overridden a type will follow the program default.
              </p>
            </div>
            <HairlineRule animate={false} />
            <div className="space-y-2">
              {BASEBALL_NOTIFICATION_TYPES.map((type) => {
                const pref = (settings.notification_defaults as Record<BaseballNotificationType, { in_app: boolean; email: boolean } | undefined>)[type];
                const inApp = pref?.in_app ?? true;
                const labelText = type
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                return (
                  <Checkbox
                    key={type}
                    label={labelText}
                    checked={inApp}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const next = {
                        ...((settings.notification_defaults as Record<string, unknown>)),
                        [type]: { in_app: e.target.checked, email: pref?.email ?? false },
                      };
                      patch('notification_defaults', next as BaseballProgramSettings['notification_defaults']);
                    }}
                  />
                );
              })}
            </div>
          </div>
        </SectionCard>

        {/* --- APPEARANCE & BRAND -------------------------------------------- */}
        <SectionCard
          anchorId="appearance"
          icon={<IconPalette size={18} />}
          eyebrow="Brand"
          title="Appearance & Brand"
          subtitle="Your logo and brand colors, plus a single accent and theme. The product keeps its readable cream-and-green base — brand color is used sparingly and status colors never change."
          index={8}
        >
          {/* Logo + brand colors live on the team record, so they save with the
              identity action. Brand accent + theme live on the settings doc. */}
          <Field label="Logo URL" hint="A square PNG/SVG reads best.">
            <div className="flex items-center gap-3">
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] text-text-tertiary">
                {/* Placeholder sits underneath; a broken URL reveals it because the
                    <img> hides itself on error rather than showing a broken glyph. */}
                <IconImage size={20} aria-hidden />
                {identity.logo_url && (
                  <img
                    key={identity.logo_url}
                    src={identity.logo_url}
                    alt="Program logo preview"
                    className="absolute inset-0 h-full w-full bg-[var(--paper)] object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    onLoad={(e) => {
                      e.currentTarget.style.display = 'block';
                    }}
                  />
                )}
              </span>
              <Input
                type="url"
                value={identity.logo_url}
                disabled={!canEdit}
                onChange={(e) => patchIdentity('logo_url', e.target.value)}
                placeholder="https://…/logo.png"
              />
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Primary color" hint="Used for the brand accent.">
              <div className="flex items-center gap-3">
                { }
                <input
                  type="color"
                  aria-label="Primary brand color"
                  disabled={!canEdit}
                  value={isValidBrandHex(identity.primary_color) ? identity.primary_color : '#16a34a'}
                  onChange={(e) => patchIdentity('primary_color', e.target.value)}
                  className={cn(
                    'h-10 w-14 shrink-0 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-1',
                    !canEdit && 'cursor-not-allowed opacity-70',
                  )}
                />
                <Input
                  type="text"
                  value={identity.primary_color}
                  disabled={!canEdit}
                  onChange={(e) => patchIdentity('primary_color', e.target.value)}
                  placeholder="#16a34a"
                  maxLength={7}
                />
              </div>
            </Field>
            <Field label="Secondary color" hint="Optional supporting color.">
              <div className="flex items-center gap-3">
                { }
                <input
                  type="color"
                  aria-label="Secondary brand color"
                  disabled={!canEdit}
                  value={isValidBrandHex(identity.secondary_color) ? identity.secondary_color : '#1c1917'}
                  onChange={(e) => patchIdentity('secondary_color', e.target.value)}
                  className={cn(
                    'h-10 w-14 shrink-0 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-1',
                    !canEdit && 'cursor-not-allowed opacity-70',
                  )}
                />
                <Input
                  type="text"
                  value={identity.secondary_color}
                  disabled={!canEdit}
                  onChange={(e) => patchIdentity('secondary_color', e.target.value)}
                  placeholder="#1c1917"
                  maxLength={7}
                />
              </div>
            </Field>
          </div>

          {canEdit && hasIdentityUnsaved && (
            <div className="flex justify-end">
              <Button
                onClick={handleSaveIdentity}
                isLoading={isPending}
                variant="secondary"
              >
                Save logo & colors
              </Button>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <Eyebrow className="text-text-tertiary">Brand accent</Eyebrow>
            <HairlineRule animate={false} className="mb-1" />
            <div className="flex items-center gap-3">
              { }
              <input
                type="color"
                aria-label="Brand accent color"
                disabled={!canEdit}
                value={settings.brand_accent ?? '#16A34A'}
                onChange={(e) => patch('brand_accent', e.target.value)}
                className={cn(
                  'h-10 w-14 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-1',
                  !canEdit && 'cursor-not-allowed opacity-70',
                )}
              />
              <span className="text-sm text-text-secondary">
                {settings.brand_accent ?? 'Default (helm green)'}
              </span>
              {settings.brand_accent && canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => patch('brand_accent', null)}
                  className="text-sm text-text-tertiary hover:text-text-secondary px-0 underline-offset-2 hover:underline"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2 pt-2">
            <Eyebrow className="text-text-tertiary">Theme</Eyebrow>
            <HairlineRule animate={false} className="mb-1" />
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((theme) => (
                <Button
                  key={theme}
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit}
                  onClick={() => patch('appearance_theme', theme)}
                  className={cn(
                    'flex-1 rounded-fw-md border px-3 py-2 text-sm font-medium capitalize transition-colors',
                    settings.appearance_theme === theme
                      ? 'border-grade-plus bg-grade-plus/10 text-grade-plus'
                      : 'border-[color:var(--hairline)] bg-[var(--paper)] text-text-secondary hover:border-grade-plus/40',
                    !canEdit && 'cursor-not-allowed opacity-70',
                  )}
                >
                  {theme}
                </Button>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* --- DATA RETENTION ------------------------------------------------- */}
        <SectionCard
          anchorId="data-retention"
          icon={<IconDatabase size={18} />}
          eyebrow="Lifecycle"
          title="Data Retention"
          subtitle="How long imports and audit records are kept."
          index={9}
        >
          <div className="space-y-2 pt-2">
            <Eyebrow className="text-text-tertiary">Season archive policy</Eyebrow>
            <HairlineRule animate={false} className="mb-1" />
            <div className="flex gap-2">
              {(['keep', 'archive_after_season'] as const).map((policy) => (
                <Button
                  key={policy}
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit}
                  onClick={() => patch('season_archive_policy', policy)}
                  className={cn(
                    'flex-1 rounded-fw-md border px-3 py-2 text-sm font-medium transition-colors',
                    settings.season_archive_policy === policy
                      ? 'border-grade-plus bg-grade-plus/10 text-grade-plus'
                      : 'border-[color:var(--hairline)] bg-[var(--paper)] text-text-secondary hover:border-grade-plus/40',
                    !canEdit && 'cursor-not-allowed opacity-70',
                  )}
                >
                  {policy === 'keep' ? 'Keep all seasons' : 'Archive after season'}
                </Button>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Sticky save affordance on mobile */}
        {canEdit && hasUnsaved && (
          <div className="sticky bottom-4 flex justify-end">
            <Button onClick={handleSave} isLoading={isPending}>
              Save Changes
            </Button>
          </div>
        )}
      </div>
    </LazyMotion>
  );
}
