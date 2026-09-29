'use client';

import { Copy, Link2, RefreshCw, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { Slider } from '../../ui/Slider';
import { useToast } from '../../ui/Toast';
import { EmptyState } from '../../ui/States';
import { haptic } from '../../lib/haptics';
import { chReport, chTrail } from '../../lib/track';
import { useAction } from '../../lib/use-action';
import {
  HANDICAP_OPTIONS,
  hoursLabel,
  minutesLabel,
  REMINDER_RANGES,
  remindersProblem,
  teamProblem,
  TIMEZONE_OPTIONS,
  type ChReminders,
  type ChScoring,
  type ChSettingsData,
  type ChSettingsWrites,
  type ChTeamInfo,
} from './model';
import { Card, Field, ReadFailed, Row, SaveBar, SettingSwitch, useDraft, useReportDirty } from './parts';

export function TeamSection({ data, writes }: { data: ChSettingsData; writes: ChSettingsWrites }) {
  if (!data.teamId) {
    return (
      <div className="ch-surface ch-set-failed">
        <EmptyState code="CH-8301" title="You aren't on a team yet." body="Team settings appear once your program is set up and you're on its staff." />
      </div>
    );
  }
  return (
    <>
      {data.team?.error ? <ReadFailed what="Team details" code="CH-8205" onRetry={writes.refresh} /> : data.team && <TeamCard team={data.team.value} writes={writes} />}
      {data.joinCode?.error ? <ReadFailed what="Your invite code" code="CH-8206" onRetry={writes.refresh} /> : data.joinCode && <InviteCard code={data.joinCode.value} writes={writes} />}
      {data.scoring?.error ? <ReadFailed what="Scoring settings" code="CH-8207" onRetry={writes.refresh} /> : data.scoring && <ScoringCard scoring={data.scoring.value} writes={writes} />}
      {data.reminders?.error ? <ReadFailed what="Event reminders" code="CH-8208" onRetry={writes.refresh} /> : data.reminders && <RemindersCard reminders={data.reminders.value} writes={writes} />}
    </>
  );
}

function TeamCard({ team, writes }: { team: ChTeamInfo; writes: ChSettingsWrites }) {
  const f = useDraft(team);
  useReportDirty('team', f.dirty);
  const save = useAction('settings.saveTeam', writes.saveTeam, { done: 'Team details saved', failed: "Couldn't save team details", code: 'CH-8011' });
  const org = f.draft.org;
  const setOrg = (k: keyof NonNullable<ChTeamInfo['org']>, v: string) => f.setDraft((d) => (d.org ? { ...d, org: { ...d.org, [k]: v } } : d));
  const invalid = teamProblem(f.draft);
  return (
    <Card
      id="set-team"
      title="Team details"
      description="Shown to your players, and on invites and exports."
      foot={
        <SaveBar
          dirty={f.dirty}
          pending={save.pending}
          invalid={invalid}
          savedAt={f.savedAt}
          onReset={f.reset}
          onSave={async () => {
            const r = await save.run(f.draft);
            if (r.success) {
              f.commit();
              writes.refresh();
            }
          }}
        />
      }
    >
      <div className="ch-set-grid">
        <Field id="set-team-name" label="Team name" value={f.draft.name} onChange={(e) => f.setDraft((d) => ({ ...d, name: e.target.value }))} />
        <Field id="set-team-season" label="Season" placeholder="2026–27" value={f.draft.season} onChange={(e) => f.setDraft((d) => ({ ...d, season: e.target.value }))} />
      </div>
      {org && (
        <>
          <div className="ch-set-sub">School</div>
          <div className="ch-set-grid">
            <Field id="set-org-name" label="Name" span={2} value={org.name} onChange={(e) => setOrg('name', e.target.value)} />
            <Field id="set-org-city" label="City" value={org.city} onChange={(e) => setOrg('city', e.target.value)} />
            <Field id="set-org-state" label="State" maxLength={2} placeholder="NC" value={org.state} onChange={(e) => setOrg('state', e.target.value.toUpperCase())} />
            <Field id="set-org-div" label="Division" placeholder="NCAA D1" value={org.division} onChange={(e) => setOrg('division', e.target.value)} />
            <Field id="set-org-conf" label="Conference" placeholder="ACC" value={org.conference} onChange={(e) => setOrg('conference', e.target.value)} />
          </div>
        </>
      )}
    </Card>
  );
}

function InviteCard({ code: initial, writes }: { code: string; writes: ChSettingsWrites }) {
  const [code, setCode] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  // Read after mount: the server has no navigator, and a mismatch would break hydration.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);
  const toast = useToast();
  const regen = useAction('settings.regenerateCode', writes.regenerateCode, { done: 'New invite code ready', failed: "Couldn't make a new invite code", code: 'CH-8012' });
  const link = typeof window === 'undefined' ? `/golf/join/${code}` : `${window.location.origin}/golf/join/${code}`;
  const copy = async (what: 'code' | 'link') => {
    chTrail(`settings copy invite ${what}`);
    try {
      await navigator.clipboard.writeText(what === 'code' ? code : link);
      haptic('success');
      toast({ title: what === 'code' ? 'Invite code copied' : 'Invite link copied' });
    } catch (err) {
      haptic('error');
      chReport(err, { surface: 'settings.invite', action: 'copy', severity: 'low' });
      toast({ tone: 'error', title: "Couldn't copy", body: 'Select the text and copy it yourself.', code: 'CH-8013' });
    }
  };
  const share = async () => {
    chTrail('settings share invite');
    try {
      await navigator.share({ title: 'Join our team on GolfHelm', text: `Join with code ${code}`, url: link });
    } catch (err) {
      // Closing the share sheet rejects with AbortError; that isn't a failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        chReport(err, { surface: 'settings.invite', action: 'share', severity: 'low' });
        void copy('link');
      }
    }
  };
  return (
    <Card id="set-invite" title="Invite players" description="Players join with this code, then you approve them from Roster.">
      <Row label="Invite code" help="Share it, or send the join link.">
        <b className="ch-set-code ch-num" aria-live="polite">
          {code}
        </b>
      </Row>
      <div className="ch-set-acts">
        <Button size="sm" leftIcon={Copy} onClick={() => void copy('code')}>
          Copy code
        </Button>
        <Button size="sm" leftIcon={Link2} onClick={() => void copy('link')}>
          Copy link
        </Button>
        {canShare && (
          <Button size="sm" leftIcon={Share2} onClick={() => void share()}>
            Share
          </Button>
        )}
      </div>
      <Row label="New code" help="Stops the current code from working right away. Anyone mid-join will need the new one.">
        <Button size="sm" variant="secondary" leftIcon={RefreshCw} disabled={regen.pending} onClick={() => setConfirm(true)}>
          {regen.pending ? 'Making…' : 'Make a new code'}
        </Button>
      </Row>
      <Modal
        open={confirm}
        code="CH-8503"
        onClose={() => setConfirm(false)}
        icon={RefreshCw}
        title="Replace your invite code?"
        description={`${code} stops working as soon as the new code is made. Share the new one with anyone who hasn't joined yet.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Keep this code
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                setConfirm(false);
                const r = await regen.run();
                if (r.success && r.data?.joinCode) setCode(r.data.joinCode);
              }}
            >
              Make a new code
            </Button>
          </>
        }
      />
    </Card>
  );
}

const TEES = [
  { value: 'black', label: 'Black' },
  { value: 'blue', label: 'Blue' },
  { value: 'white', label: 'White' },
  { value: 'gold', label: 'Gold' },
] as const;

function ScoringCard({ scoring, writes }: { scoring: ChScoring; writes: ChSettingsWrites }) {
  const f = useDraft(scoring);
  useReportDirty('scoring', f.dirty);
  const save = useAction('settings.saveScoring', writes.saveScoring, { done: 'Scoring settings saved', failed: "Couldn't save scoring settings", code: 'CH-8014' });
  return (
    <Card
      id="set-scoring"
      title="Scoring and format"
      description="Defaults for new rounds and events. The timezone sets when every event and reminder happens."
      foot={
        <SaveBar
          dirty={f.dirty}
          pending={save.pending}
          savedAt={f.savedAt}
          onReset={f.reset}
          onSave={async () => {
            const r = await save.run(f.draft);
            if (r.success) f.commit();
          }}
        />
      }
    >
      <Row label="Scoring format">
        <Segmented
          label="Scoring format"
          size="sm"
          value={f.draft.scoringFormat}
          options={[
            { value: 'stroke_play', label: 'Stroke play' },
            { value: 'match_play', label: 'Match play' },
          ]}
          onChange={(v) => f.setDraft((d) => ({ ...d, scoringFormat: v }))}
        />
      </Row>
      <Row label="Default tees">
        <Segmented label="Default tees" size="sm" value={f.draft.defaultTees} options={TEES} onChange={(v) => f.setDraft((d) => ({ ...d, defaultTees: v }))} />
      </Row>
      <Row label="Handicap system" htmlFor="set-hcp">
        <Select id="set-hcp" value={f.draft.handicapSystem} options={HANDICAP_OPTIONS} onChange={(v) => f.setDraft((d) => ({ ...d, handicapSystem: v }))} />
      </Row>
      <Row label="Team timezone" htmlFor="set-tz">
        <Select id="set-tz" value={f.draft.timezone} options={TIMEZONE_OPTIONS} onChange={(v) => f.setDraft((d) => ({ ...d, timezone: v }))} />
      </Row>
    </Card>
  );
}

function RemindersCard({ reminders, writes }: { reminders: ChReminders; writes: ChSettingsWrites }) {
  const f = useDraft(reminders);
  useReportDirty('reminders', f.dirty);
  const save = useAction('settings.saveReminders', writes.saveReminders, { done: 'Reminder schedule saved', failed: "Couldn't save the reminder schedule", code: 'CH-8015' });
  const invalid = remindersProblem(f.draft);
  return (
    <Card
      id="set-reminders"
      title="Event reminders"
      description="Players who haven't replied get a nudge before each event."
      foot={
        <SaveBar
          dirty={f.dirty}
          pending={save.pending}
          invalid={invalid}
          savedAt={f.savedAt}
          onReset={f.reset}
          onSave={async () => {
            const r = await save.run(f.draft);
            if (r.success) f.commit();
          }}
        />
      }
    >
      <Row label="Send reminders">
        <SettingSwitch label="Send reminders" hideLabel checked={f.draft.enabled} onChange={(v) => f.setDraft((d) => ({ ...d, enabled: v }))} />
      </Row>
      {f.draft.enabled && (
        <div className="ch-set-sliders">
          <Slider
            label="First reminder"
            value={f.draft.earlyHours}
            {...REMINDER_RANGES.earlyHours}
            format={hoursLabel}
            onChange={(v) => f.setDraft((d) => ({ ...d, earlyHours: v }))}
          />
          <Slider
            label="Final reminder"
            value={f.draft.lateMinutes}
            {...REMINDER_RANGES.lateMinutes}
            format={minutesLabel}
            onChange={(v) => f.setDraft((d) => ({ ...d, lateMinutes: v }))}
          />
        </div>
      )}
    </Card>
  );
}
