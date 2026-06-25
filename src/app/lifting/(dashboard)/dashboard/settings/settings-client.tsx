'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Loader2, Plus, RefreshCw, Settings, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { completeLiftingCoachOnboarding, type CompleteLiftingCoachOnboardingArgs } from '@/app/lifting/actions/onboarding';
import { assignLiftingTeam, syncOrgAthletes } from '@/app/lifting/actions/assignments';
import type { HelmLiftingCoachRow, HelmLiftingCoachAssignmentRow, HelmLiftingSport } from '@/lib/types/helm-lifting';

interface OrgInfo {
  id: string;
  name: string;
}

interface Props {
  coachRow: HelmLiftingCoachRow;
  assignments: HelmLiftingCoachAssignmentRow[];
  org: OrgInfo | null;
  canEdit: boolean;
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-8 h-8 bg-primary-50 rounded-xl flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary-600" />
        </div>
        <h2 className="text-base font-bold text-warm-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function LiftingSettingsClient({ coachRow, assignments, org, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(coachRow.full_name ?? '');
  const [title, setTitle] = useState(coachRow.title ?? '');
  const [phone, setPhone] = useState(coachRow.phone ?? '');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Team assignment state
  const [addSport, setAddSport] = useState<HelmLiftingSport>('baseball');
  const [addTeamId, setAddTeamId] = useState('');
  const [addTeamName, setAddTeamName] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [syncingTeamId, setSyncingTeamId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);

    startTransition(async () => {
      const args: CompleteLiftingCoachOnboardingArgs = {
        fullName,
        title: title || null,
        organizationId: coachRow.organization_id,
      };
      const result = await completeLiftingCoachOnboarding(args);
      if (result.success) {
        setProfileSuccess(true);
        router.refresh();
        setTimeout(() => setProfileSuccess(false), 3000);
      } else {
        setProfileError(result.error ?? 'Failed to save. Please try again.');
      }
    });
  }

  const sportEmoji = (sport: string) => (sport === 'baseball' ? '⚾' : '⛳');

  async function handleAddTeam(e: React.FormEvent) {
    e.preventDefault();
    setAssignError(null);
    setAssignSuccess(null);
    if (!addTeamId.trim()) {
      setAssignError('Team ID is required.');
      return;
    }
    startTransition(async () => {
      const result = await assignLiftingTeam({
        orgId: coachRow.organization_id,
        sport: addSport,
        teamId: addTeamId.trim(),
        teamNameSnapshot: addTeamName.trim() || null,
      });
      if (result.success) {
        setAssignSuccess('Team assigned successfully.');
        setAddTeamId('');
        setAddTeamName('');
        router.refresh();
        setTimeout(() => setAssignSuccess(null), 3000);
      } else {
        setAssignError(result.error ?? 'Could not assign team. Please try again.');
      }
    });
  }

  async function handleSyncAthletes(teamId: string | null, sport: HelmLiftingSport) {
    setSyncError(null);
    setSyncSuccess(null);
    setSyncingTeamId(teamId ?? sport);
    startTransition(async () => {
      const result = await syncOrgAthletes({
        orgId: coachRow.organization_id,
        sport,
      });
      setSyncingTeamId(null);
      if (result.success) {
        setSyncSuccess(`Synced ${result.athleteCount ?? 0} athletes.`);
        router.refresh();
        setTimeout(() => setSyncSuccess(null), 3000);
      } else {
        setSyncError(result.error ?? 'Could not sync athletes. Please try again.');
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-warm-900 tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-warm-400" />
          Settings
        </h1>
        <p className="text-warm-500 text-sm mt-1">
          Manage your Lifting Lab profile and team assignments
        </p>
      </div>

      {/* Profile section */}
      <Section title="Coach profile" icon={User}>
        <form onSubmit={handleProfileSave} className="space-y-5">
          {profileError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{profileError}</span>
            </motion.div>
          )}

          {profileSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2.5 px-4 py-3 bg-primary-50 border border-primary-200 rounded-xl text-sm text-primary-700"
              role="status"
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Profile saved.</span>
            </motion.div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="settings-name" className="text-sm font-medium text-warm-700">
                Full name <span className="text-red-500">*</span>
              </label>
              <Input
                id="settings-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={!canEdit}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-title" className="text-sm font-medium text-warm-700">
                Title <span className="text-warm-400 font-normal">(optional)</span>
              </label>
              <Input
                id="settings-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Strength & Conditioning Coach"
                disabled={!canEdit}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-email" className="text-sm font-medium text-warm-700">Email</label>
              <Input
                id="settings-email"
                type="email"
                value={coachRow.email ?? ''}
                disabled
                className="w-full opacity-60 cursor-not-allowed"
              />
              <p className="text-xs text-warm-400">Email is managed through your account settings</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-phone" className="text-sm font-medium text-warm-700">
                Phone <span className="text-warm-400 font-normal">(optional)</span>
              </label>
              <Input
                id="settings-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                disabled={!canEdit}
                className="w-full"
              />
            </div>
          </div>

          {/* Organization (read-only) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-warm-700">Organization</label>
            <div className="px-4 py-3 bg-warm-50 border border-warm-200 rounded-xl text-sm text-warm-700">
              {org?.name ?? 'Unknown organization'}
            </div>
            <p className="text-xs text-warm-400">Contact support to change your organization</p>
          </div>

          {canEdit && (
            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                type="submit"
                disabled={isPending}
                className="bg-primary-600 text-white font-semibold rounded-xl px-6 hover:bg-primary-700 active:scale-[0.97] transition-all shadow-sm shadow-primary-600/20 flex items-center gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  'Save profile'
                )}
              </Button>
            </div>
          )}
        </form>
      </Section>

      {/* Team assignments */}
      <Section title="Team assignments" icon={Users}>
        <div className="space-y-4">
          {/* Sync feedback */}
          {syncError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{syncError}</span>
            </motion.div>
          )}
          {syncSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2.5 px-4 py-3 bg-primary-50 border border-primary-200 rounded-xl text-sm text-primary-700"
              role="status"
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{syncSuccess}</span>
            </motion.div>
          )}

          {/* Assignment list */}
          {assignments.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-warm-200 mx-auto mb-3" />
              <p className="text-sm text-warm-600 font-medium">No teams assigned yet</p>
              {!canEdit && (
                <p className="text-xs text-warm-400 mt-1">
                  Ask your head coach to link your lifting program to their team from their dashboard.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {assignments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-3 bg-white/50 rounded-xl border border-white/20"
                >
                  <span className="text-lg flex-shrink-0" aria-hidden="true">
                    {sportEmoji(a.sport)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-warm-900 truncate">
                      {a.team_name_snapshot ?? 'Team'}
                    </p>
                    <p className="text-xs text-warm-500 capitalize">{a.sport}</p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      a.is_active
                        ? 'bg-primary-50 text-primary-700'
                        : 'bg-warm-100 text-warm-500'
                    }`}
                  >
                    {a.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isPending && syncingTeamId === (a.team_id ?? a.sport)}
                      onClick={() => handleSyncAthletes(a.team_id, a.sport)}
                      className="text-warm-500 hover:text-primary-600 flex items-center gap-1.5 text-xs px-2 py-1 h-auto"
                      aria-label={`Sync athletes for ${a.team_name_snapshot ?? a.sport}`}
                    >
                      {isPending && syncingTeamId === (a.team_id ?? a.sport) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Sync
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add team form (canEdit only) */}
          {canEdit && (
            <form onSubmit={handleAddTeam} className="space-y-3 pt-2 border-t border-white/20">
              <p className="text-xs font-semibold text-warm-600 uppercase tracking-wide">Add team</p>

              {assignError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{assignError}</span>
                </motion.div>
              )}
              {assignSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 px-4 py-3 bg-primary-50 border border-primary-200 rounded-xl text-sm text-primary-700"
                  role="status"
                >
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{assignSuccess}</span>
                </motion.div>
              )}

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="assign-sport" className="text-xs font-medium text-warm-700">
                    Sport
                  </label>
                  <select
                    id="assign-sport"
                    value={addSport}
                    onChange={(e) => setAddSport(e.target.value as HelmLiftingSport)}
                    className="w-full px-3 py-2 rounded-xl border border-warm-200 bg-white/80 text-sm text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  >
                    <option value="baseball">⚾ Baseball</option>
                    <option value="golf">⛳ Golf</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="assign-team-id" className="text-xs font-medium text-warm-700">
                    Team ID <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="assign-team-id"
                    type="text"
                    value={addTeamId}
                    onChange={(e) => setAddTeamId(e.target.value)}
                    placeholder="UUID"
                    required
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="assign-team-name" className="text-xs font-medium text-warm-700">
                    Team name <span className="text-warm-400 font-normal">(optional)</span>
                  </label>
                  <Input
                    id="assign-team-name"
                    type="text"
                    value={addTeamName}
                    onChange={(e) => setAddTeamName(e.target.value)}
                    placeholder="e.g. Varsity Baseball"
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isPending}
                  className="bg-primary-600 text-white font-semibold rounded-xl px-5 hover:bg-primary-700 active:scale-[0.97] transition-all shadow-sm shadow-primary-600/20 flex items-center gap-2 text-sm"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Adding…</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Add team</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Section>
    </div>
  );
}
