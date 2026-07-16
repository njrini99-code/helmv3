'use client';

// =============================================================================
// CollegeProfileEditor — the college player's own passport-editing surface.
//
// WRITE surface — every field/handler PRESERVED VERBATIM from the prior
// implementation: `handleInputChange`, `handleSave`, `calculateProfileCompletion`,
// the `baseball_team_members` fetch, every `formData` key. This pass is
// PRESENTATION ONLY, rebuilt onto the Living-Annual kit
// (`@/components/baseball/living-annual`) + Fairway form primitives
// (`@/components/fairway`) — the page already renders inside `.living-annual` /
// `.fairway-ds` via BaseballFairwayShell, and `(dashboard)/dashboard/template.tsx`
// already mounts `<LazyMotion features={domAnimation}>`, so this file does not
// mount its own motion provider.
//
// ADDENDUM 2 (design-system-living-annual.md) drops Fraunces + Fragment Mono from
// the baseball kit — Space Grotesk (`font-annual`) only. Fairway `FormSection`'s
// heading and `NumberField`'s numeral both hardcode the banned faces, so this file
// intentionally skips both: section headers are plain `font-annual` markup, and
// numeric fields use `Input type="number"` (its body text stays on `font-fw-sans`
// chrome, never a "stat figure" read — those stay on `RuledStatLine`/`StatReadout`).
// =============================================================================

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Player, Team } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { Button, FormField, Input, TextArea, Select, Tabs, TabsList, TabsTrigger, TabsContent, Inset } from '@/components/fairway';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PaperCard,
  Eyebrow,
  RuledStatLine,
  HairlineRule,
  InkBadge,
  Reveal,
} from '@/components/baseball/living-annual';
import {
  IconUser,
  IconActivity,
  IconGraduationCap,
  IconInstagram,
  IconTwitter,
  IconMail,
  IconPhone,
  IconMapPin,
  IconCheck,
  IconAlertCircle,
  IconUsers,
} from '@/components/icons';

interface CollegeProfileEditorProps {
  player: Player;
  onUpdate: (updates: Partial<Player>) => Promise<void>;
  className?: string;
}

type TabId = 'personal' | 'athletic' | 'academic' | 'social';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'personal', label: 'Personal', icon: <IconUser size={16} /> },
  { id: 'athletic', label: 'Athletic', icon: <IconActivity size={16} /> },
  { id: 'academic', label: 'Academic', icon: <IconGraduationCap size={16} /> },
  { id: 'social', label: 'Social', icon: <IconMail size={16} /> },
];

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const STATE_OPTIONS = US_STATES.map((s) => ({ label: s, value: s }));

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'IF', 'UTL'];
const POSITION_OPTIONS = POSITIONS.map((p) => ({ label: p, value: p }));

const BATS_OPTIONS = [
  { label: 'Right', value: 'R' },
  { label: 'Left', value: 'L' },
  { label: 'Switch', value: 'S' },
];
const THROWS_OPTIONS = [
  { label: 'Right', value: 'R' },
  { label: 'Left', value: 'L' },
];

interface TeamMembership {
  team: Team;
  jersey_number: number | null;
  position: string | null;
}

// Profile completion calculation — UNCHANGED.
function calculateProfileCompletion(player: Player): { percentage: number; missingFields: string[] } {
  const fields = [
    { key: 'first_name', label: 'First Name', required: true },
    { key: 'last_name', label: 'Last Name', required: true },
    { key: 'city', label: 'City', required: false },
    { key: 'state', label: 'State', required: true },
    { key: 'primary_position', label: 'Position', required: true },
    { key: 'height_feet', label: 'Height', required: false },
    { key: 'weight_lbs', label: 'Weight', required: false },
    { key: 'bats', label: 'Bats', required: false },
    { key: 'throws', label: 'Throws', required: false },
    { key: 'gpa', label: 'GPA', required: false },
    { key: 'email', label: 'Email', required: true },
    { key: 'about_me', label: 'About Me', required: false },
    { key: 'avatar_url', label: 'Profile Photo', required: false },
  ];

  const missingFields: string[] = [];
  let filledCount = 0;

  fields.forEach(({ key, label }) => {
    const value = player[key as keyof Player];
    if (value !== null && value !== undefined && value !== '') {
      filledCount++;
    } else {
      missingFields.push(label);
    }
  });

  return {
    percentage: Math.round((filledCount / fields.length) * 100),
    missingFields,
  };
}

export function CollegeProfileEditor({ player, onUpdate, className }: CollegeProfileEditorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('personal');
  const [formData, setFormData] = useState<Partial<Player>>(player);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);

  const { percentage: profileCompletion, missingFields } = calculateProfileCompletion({
    ...player,
    ...formData,
  } as Player);

  // Backfill formData whenever a fresher `player` object arrives. `formData`
  // is seeded once at mount (above) — if this component ever mounts before
  // the FULL player row is in the shared auth store (e.g. a lightweight
  // route-guard reconciliation writes a partial {id, onboarding_completed,
  // player_type} player object into the store ahead of useAuth()'s full-row
  // fetch — see use-baseball-auth.ts's reconcileStore), formData permanently
  // lacks keys like first_name/last_name even after the store is later
  // replaced with the complete row, because nothing ever re-seeds it. That
  // produced a live bug: the Input for a populated name field rendered
  // empty, and a Save could have sent an update with the name field simply
  // absent. This only ever ADDS a field that formData doesn't have yet
  // (strict `undefined` check) — it can never overwrite something the
  // player already typed, even if they cleared a field to ''.
  useEffect(() => {
    setFormData((prev) => {
      let changed = false;
      const next: Partial<Player> = { ...prev };
      (Object.keys(player) as Array<keyof Player>).forEach((key) => {
        if (prev[key] === undefined && player[key] !== undefined) {
          next[key] = player[key] as never;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [player]);

  // Fetch team memberships — UNCHANGED query.
  useEffect(() => {
    async function fetchTeamMemberships() {
      if (!player?.id) {
        setLoadingTeams(false);
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from('baseball_team_members')
        .select(`
          jersey_number,
          position,
          baseball_teams (
            id,
            name,
            team_type,
            logo_url,
            primary_color
          )
        `)
        .eq('player_id', player.id)
        .eq('status', 'active');

      if (!error && data) {
        const memberships = data
          .map((item) => ({
            team: item.baseball_teams as unknown as Team,
            jersey_number: item.jersey_number,
            position: item.position,
          }))
          .filter((m) => m.team !== null);
        setTeamMemberships(memberships);
      }
      setLoadingTeams(false);
    }

    fetchTeamMemberships();
  }, [player?.id]);

  const handleInputChange = (field: keyof Player, value: string | number | boolean | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await onUpdate(formData);
      setSaveMessage('Profile updated successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage('Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Profile Completion & Team Affiliation — the passport masthead spread */}
      <div className="grid gap-5 md:grid-cols-2">
        <Reveal staggerIndex={0}>
          <PaperCard registrationTick className="h-full p-5 sm:p-6">
            <Eyebrow ink="team">Profile File</Eyebrow>
            <div className="mt-3">
              <RuledStatLine
                label="Complete"
                value={profileCompletion}
                unit="%"
                size="hero"
                ink="team"
                emphasis={profileCompletion >= 80}
              />
            </div>
            <div className="mt-4">
              {profileCompletion < 100 ? (
                <p className="font-annual text-body-sm leading-relaxed text-text-secondary">
                  Add {missingFields.slice(0, 2).join(', ')}
                  {missingFields.length > 2 && ` +${missingFields.length - 2} more`}
                </p>
              ) : (
                <InkBadge label="Complete" tone="team" variant="solid" />
              )}
            </div>
          </PaperCard>
        </Reveal>

        <Reveal staggerIndex={1}>
          <PaperCard registrationTick className="h-full p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <IconUsers size={16} className="text-text-tertiary" />
              <Eyebrow ink="muted">Team Affiliation</Eyebrow>
            </div>

            {loadingTeams ? (
              <div className="space-y-3" aria-hidden="true">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton variant="block" className="h-8 w-8 shrink-0 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton variant="line" className="h-3.5 w-2/3" />
                      <Skeleton variant="line" className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : teamMemberships.length === 0 ? (
              <RuledStatLine label="Team" value="—" ghost />
            ) : (
              <div className="space-y-3">
                {teamMemberships.map((membership, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between gap-3 py-1">
                      <div className="flex min-w-0 items-center gap-3">
                        {membership.team.logo_url ? (
                          <img
                            src={membership.team.logo_url}
                            alt={membership.team.name}
                            className="h-8 w-8 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                            style={{ backgroundColor: membership.team.primary_color || '#16A34A' }}
                          >
                            {membership.team.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-annual text-body text-text-primary">{membership.team.name}</p>
                          {membership.team.team_type ? (
                            <Eyebrow ink="muted" className="mt-0.5">
                              {membership.team.team_type.replace('_', ' ')}
                            </Eyebrow>
                          ) : null}
                        </div>
                      </div>
                      {membership.jersey_number ? (
                        <InkBadge label={`#${membership.jersey_number}`} tone="team" variant="solid" />
                      ) : null}
                    </div>
                    {idx < teamMemberships.length - 1 ? <HairlineRule ink="hairline" /> : null}
                  </div>
                ))}
              </div>
            )}
          </PaperCard>
        </Reveal>
      </div>

      {/* Main editor — the record-book form */}
      <Reveal staggerIndex={2}>
        <PaperCard>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
            <div className="px-5 pt-4 sm:px-6">
              <TabsList aria-label="Profile sections">
                {TABS.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                    {tab.icon}
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="p-5 sm:p-6">
              <TabsContent value="personal" className="space-y-5">
                <h3 className="flex items-center gap-2 font-annual text-h3 text-text-primary">
                  <IconUser size={18} className="text-text-tertiary" />
                  Personal Information
                </h3>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <FormField label="First name" required>
                    <Input
                      value={formData.first_name || ''}
                      onChange={(e) => handleInputChange('first_name', e.target.value)}
                      required
                    />
                  </FormField>

                  <FormField label="Last name" required>
                    <Input
                      value={formData.last_name || ''}
                      onChange={(e) => handleInputChange('last_name', e.target.value)}
                      required
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <FormField
                    label={
                      <span className="flex items-center gap-1.5">
                        <IconMapPin size={14} className="text-text-tertiary" />
                        City
                      </span>
                    }
                    showOptional
                  >
                    <Input value={formData.city || ''} onChange={(e) => handleInputChange('city', e.target.value)} />
                  </FormField>

                  <FormField label="State" required>
                    <Select
                      value={formData.state || undefined}
                      onValueChange={(v) => handleInputChange('state', v ?? '')}
                      options={STATE_OPTIONS}
                      placeholder="Select state"
                    />
                  </FormField>
                </div>

                <FormField label="About me" showOptional help="This appears on your public profile">
                  <TextArea
                    rows={4}
                    value={formData.about_me || ''}
                    onChange={(e) => handleInputChange('about_me', e.target.value)}
                    placeholder="Share your story, goals, and what drives you as a player…"
                  />
                </FormField>
              </TabsContent>

              <TabsContent value="athletic" className="space-y-5">
                <h3 className="flex items-center gap-2 font-annual text-h3 text-text-primary">
                  <IconActivity size={18} className="text-text-tertiary" />
                  Athletic Information
                </h3>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <FormField label="Primary position" required>
                    <Select
                      value={formData.primary_position || undefined}
                      onValueChange={(v) => handleInputChange('primary_position', v ?? '')}
                      options={POSITION_OPTIONS}
                      placeholder="Select position"
                    />
                  </FormField>

                  <FormField label="Secondary position" showOptional>
                    <Select
                      value={formData.secondary_position || undefined}
                      onValueChange={(v) => handleInputChange('secondary_position', v ?? '')}
                      options={POSITION_OPTIONS}
                      placeholder="Select position"
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                  <FormField label="Bats" showOptional>
                    <Select
                      value={formData.bats || undefined}
                      onValueChange={(v) => handleInputChange('bats', v ?? '')}
                      options={BATS_OPTIONS}
                      placeholder="—"
                    />
                  </FormField>

                  <FormField label="Throws" showOptional>
                    <Select
                      value={formData.throws || undefined}
                      onValueChange={(v) => handleInputChange('throws', v ?? '')}
                      options={THROWS_OPTIONS}
                      placeholder="—"
                    />
                  </FormField>

                  <FormField label="Height" showOptional>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        placeholder="Ft"
                        min="4"
                        max="7"
                        value={formData.height_feet ?? ''}
                        onChange={(e) => handleInputChange('height_feet', e.target.value ? parseInt(e.target.value) : null)}
                        className="text-center"
                      />
                      <Input
                        aria-label="Height inches"
                        type="number"
                        placeholder="In"
                        min="0"
                        max="11"
                        value={formData.height_inches ?? ''}
                        onChange={(e) => handleInputChange('height_inches', e.target.value ? parseInt(e.target.value) : null)}
                        className="text-center"
                      />
                    </div>
                  </FormField>

                  <FormField label="Weight" showOptional>
                    <Input
                      type="number"
                      trailing="lbs"
                      value={formData.weight_lbs ?? ''}
                      onChange={(e) => handleInputChange('weight_lbs', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="185"
                    />
                  </FormField>
                </div>

                <div className="border-t border-[color:var(--hairline)] pt-5">
                  <Eyebrow ink="muted" className="mb-3">Performance Metrics</Eyebrow>
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                    <FormField label="Pitch velo" showOptional>
                      <Input
                        type="number"
                        trailing="mph"
                        value={formData.pitch_velo ?? ''}
                        onChange={(e) => handleInputChange('pitch_velo', e.target.value ? parseInt(e.target.value) : null)}
                        placeholder="85"
                      />
                    </FormField>

                    <FormField label="Exit velo" showOptional>
                      <Input
                        type="number"
                        trailing="mph"
                        value={formData.exit_velo ?? ''}
                        onChange={(e) => handleInputChange('exit_velo', e.target.value ? parseInt(e.target.value) : null)}
                        placeholder="90"
                      />
                    </FormField>

                    <FormField label="60-yard" showOptional>
                      <Input
                        type="number"
                        step="0.01"
                        trailing="sec"
                        value={formData.sixty_time ?? ''}
                        onChange={(e) => handleInputChange('sixty_time', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="7.2"
                      />
                    </FormField>

                    <FormField label="Pop time" showOptional>
                      <Input
                        type="number"
                        step="0.01"
                        trailing="sec"
                        value={formData.pop_time ?? ''}
                        onChange={(e) => handleInputChange('pop_time', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="2.0"
                      />
                    </FormField>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="academic" className="space-y-5">
                <h3 className="flex items-center gap-2 font-annual text-h3 text-text-primary">
                  <IconGraduationCap size={18} className="text-text-tertiary" />
                  Academic Information
                </h3>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <FormField label="GPA" showOptional help="Current cumulative GPA">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="4.0"
                      value={formData.gpa ?? ''}
                      onChange={(e) => handleInputChange('gpa', e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder="3.50"
                    />
                  </FormField>

                  <FormField label="Graduation year" showOptional help="Expected graduation year">
                    <Input
                      type="number"
                      value={formData.grad_year ?? ''}
                      onChange={(e) => handleInputChange('grad_year', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder={String(new Date().getFullYear() + 1)}
                      min={new Date().getFullYear()}
                      max={new Date().getFullYear() + 6}
                    />
                  </FormField>
                </div>

                {/* High School Info (read-only for college players) */}
                {player.high_school_name ? (
                  <Inset padding="md" className="mt-2">
                    <Eyebrow ink="muted" className="mb-2">High School Background</Eyebrow>
                    <p className="font-annual text-body-sm text-text-secondary">
                      {player.high_school_name}
                      {player.high_school_city && `, ${player.high_school_city}`}
                      {player.high_school_state && `, ${player.high_school_state}`}
                    </p>
                  </Inset>
                ) : null}
              </TabsContent>

              <TabsContent value="social" className="space-y-5">
                <h3 className="flex items-center gap-2 font-annual text-h3 text-text-primary">
                  <IconMail size={18} className="text-text-tertiary" />
                  Contact & Social
                </h3>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <FormField
                    label={
                      <span className="flex items-center gap-1.5">
                        <IconMail size={14} className="text-text-tertiary" />
                        Email
                      </span>
                    }
                    required
                  >
                    <Input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      required
                    />
                  </FormField>

                  <FormField
                    label={
                      <span className="flex items-center gap-1.5">
                        <IconPhone size={14} className="text-text-tertiary" />
                        Phone
                      </span>
                    }
                    showOptional
                  >
                    <Input
                      type="tel"
                      value={formData.phone || ''}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <FormField
                    label={
                      <span className="flex items-center gap-1.5">
                        <IconTwitter size={14} className="text-text-tertiary" />
                        Twitter
                      </span>
                    }
                    showOptional
                  >
                    <Input
                      leading="@"
                      value={formData.twitter || ''}
                      onChange={(e) => handleInputChange('twitter', e.target.value)}
                      placeholder="username"
                    />
                  </FormField>

                  <FormField
                    label={
                      <span className="flex items-center gap-1.5">
                        <IconInstagram size={14} className="text-text-tertiary" />
                        Instagram
                      </span>
                    }
                    showOptional
                  >
                    <Input
                      leading="@"
                      value={formData.instagram || ''}
                      onChange={(e) => handleInputChange('instagram', e.target.value)}
                      placeholder="username"
                    />
                  </FormField>
                </div>
              </TabsContent>

              {/* Save Button */}
              <div className="mt-6 flex flex-col items-center justify-between gap-4 border-t border-[color:var(--hairline)] pt-6 sm:flex-row">
                <div className="order-2 min-h-[20px] sm:order-1">
                  {saveMessage ? (
                    <Reveal key={saveMessage}>
                      <p
                        role={saveMessage.includes('successfully') ? 'status' : 'alert'}
                        aria-live="polite"
                        className={cn(
                          'flex items-center gap-1.5 font-annual text-body-sm font-medium',
                          saveMessage.includes('successfully') ? 'text-grade-plus' : 'text-fw-danger',
                        )}
                      >
                        {saveMessage.includes('successfully') ? (
                          <IconCheck size={14} className="shrink-0" />
                        ) : (
                          <IconAlertCircle size={14} className="shrink-0" />
                        )}
                        {saveMessage}
                      </p>
                    </Reveal>
                  ) : null}
                </div>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  busy={isSaving}
                  className="order-1 w-full sm:order-2 sm:w-auto"
                >
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </Tabs>
        </PaperCard>
      </Reveal>
    </div>
  );
}
