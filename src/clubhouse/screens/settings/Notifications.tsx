'use client';

import { BellOff, Moon, RotateCcw, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { DELIVERY_NOTIFICATION_GROUPS } from '@/lib/coachhelm/v3/notifications/types';
import type { ChannelPref, NotificationCategory, PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { haptic } from '../../lib/haptics';
import { chReport, chTrail } from '../../lib/track';
import { channelsFor, DEFAULT_CHANNELS, ROUTING_GROUPS, ROUTING_LABEL, ROUTING_QUIET_EXEMPT, type ChDevice, type ChSettingsData, type ChSettingsWrites } from './model';
import { Card, ReadFailed, Row, useInstantSave } from './parts';

/** Recruiting and profile-view emails don't apply to GolfHelm coaches or players (as in the current app). */
const GROUPS = DELIVERY_NOTIFICATION_GROUPS.filter((g) => g.id !== 'pipeline' && g.id !== 'profile_views');

export function NotificationsSection({ data, writes, device }: { data: ChSettingsData; writes: ChSettingsWrites; device: ChDevice }) {
  return (
    <>
      {data.delivery.error ? (
        <ReadFailed what="Your email and push settings" onRetry={writes.refresh} />
      ) : (
        <DeliveryCard prefs={data.delivery.value} writes={writes} device={device} digest={data.digest} />
      )}
      {data.playerRouting &&
        (data.playerRouting.error ? (
          <ReadFailed what="Your CoachHelm update settings" onRetry={writes.refresh} />
        ) : (
          <RoutingCard initial={data.playerRouting.value} writes={writes} />
        ))}
    </>
  );
}

function DeliveryCard({ prefs, writes, device, digest }: { prefs: Record<string, boolean>; writes: ChSettingsWrites; device: ChDevice; digest: ChSettingsData['digest'] }) {
  const [p, setP] = useState(prefs);
  const [dg, setDg] = useState(digest && !digest.error ? digest.value : false);
  const save = useInstantSave('notifications');
  const toast = useToast();
  const quiet = !!p.quiet_mode;
  const flip = (key: string, label: string) => (v: boolean) =>
    void save.run({
      key,
      apply: () => setP((x) => ({ ...x, [key]: v })),
      rollback: () => setP((x) => ({ ...x, [key]: !v })),
      write: () => writes.setDelivery(key, v),
      failed: `Couldn't change ${label}`,
    });

  const push = device.push;
  const onDevice = push.status === 'subscribed';
  const togglePush = async (v: boolean) => {
    chTrail(`settings device push ${v ? 'on' : 'off'}`);
    try {
      const r = v ? await push.subscribe() : await push.unsubscribe();
      if (r.ok) haptic('commit');
      else {
        haptic('error');
        if (r.error) chReport(new Error(r.error), { surface: 'settings.notifications', action: 'devicePush', severity: 'low' });
        toast({ tone: 'error', title: v ? "Couldn't turn on push here" : "Couldn't turn off push here", body: r.error && r.error.length < 90 ? r.error : 'Try again in a moment.' });
      }
    } catch (err) {
      haptic('error');
      chReport(err, { surface: 'settings.notifications', action: 'devicePush' });
      toast({ tone: 'error', title: "Couldn't change push on this device", body: 'Try again in a moment.' });
    }
  };

  return (
    <Card id="set-delivery" title="Email and push" description="Which updates reach you, and how. Changes save as you make them.">
      <Row label={<><Icon icon={Moon} size={15} /> Quiet mode</>} help="Pauses everything except messages from your team.">
        <Switch label="Quiet mode" hideLabel checked={quiet} busy={save.pending.has('quiet_mode')} onChange={flip('quiet_mode', 'quiet mode')} />
      </Row>
      {push.status !== 'unsupported' && (
        <Row
          label={<><Icon icon={Smartphone} size={15} /> Push on this device</>}
          help={push.status === 'denied' ? 'Notifications are blocked for GolfHelm in this browser. Allow them in its site settings, then come back.' : 'Lets this browser show push notifications.'}
        >
          <Switch label="Push on this device" hideLabel checked={onDevice} disabled={push.status === 'denied' || push.status === 'checking'} busy={push.pending} onChange={(v) => void togglePush(v)} />
        </Row>
      )}

      <div className="ch-set-matrix" role="table" aria-label="Email and push by kind of update">
        <div className="ch-set-matrix__row is-head" role="row">
          <span role="columnheader">Update</span>
          <span role="columnheader">Email</span>
          <span role="columnheader">Push</span>
        </div>
        {GROUPS.map((g) => {
          const silenced = quiet && !g.quietExempt;
          return (
            <div key={g.id} className={'ch-set-matrix__row' + (silenced ? ' is-dim' : '')} role="row">
              <span role="rowheader" className="ch-set-matrix__what">
                <b>{g.label}</b>
                <span>{silenced ? 'Paused by quiet mode' : g.description}</span>
              </span>
              <span role="cell">
                <Switch label={`${g.label} by email`} hideLabel checked={!!p[g.emailKey]} disabled={silenced} busy={save.pending.has(g.emailKey)} onChange={flip(g.emailKey, `${g.label.toLowerCase()} email`)} />
              </span>
              <span role="cell">
                {g.pushKey ? (
                  <Switch label={`${g.label} by push`} hideLabel checked={!!p[g.pushKey]} disabled={silenced} busy={save.pending.has(g.pushKey)} onChange={flip(g.pushKey, `${g.label.toLowerCase()} push`)} />
                ) : (
                  <span className="ch-set-na">Email only</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {digest &&
        (digest.error ? (
          <Row label="Weekly team email" help="This setting didn't load. Reload to change it." dim>
            <Switch label="Weekly team email" hideLabel checked={false} disabled onChange={() => {}} />
          </Row>
        ) : (
          <Row label="Weekly team email" help="The weekly summary of your team, by email.">
            <Switch
              label="Weekly team email"
              hideLabel
              checked={dg}
              busy={save.pending.has('digest')}
              onChange={(v) =>
                void save.run({ key: 'digest', apply: () => setDg(v), rollback: () => setDg(!v), write: () => writes.setDigest(v), failed: "Couldn't change the weekly email" })
              }
            />
          </Row>
        ))}
    </Card>
  );
}

const CHANNELS: Array<{ key: keyof ChannelPref; label: string }> = [
  { key: 'in_app', label: 'In app' },
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' },
];

function RoutingCard({ initial, writes }: { initial: { prefs: PrefsByCategory; quiet: boolean }; writes: ChSettingsWrites }) {
  const [prefs, setPrefs] = useState(initial.prefs);
  const [quiet, setQuiet] = useState(initial.quiet);
  const [confirmReset, setConfirmReset] = useState(false);
  const save = useInstantSave('routing');
  const bulkBusy = save.pending.has('bulk');
  const cellBusy = [...save.pending].some((k) => k.startsWith('cell:'));

  const setCell = (c: NotificationCategory, ch: keyof ChannelPref, v: boolean) =>
    void save.run({
      key: `cell:${c}:${ch}`,
      apply: () => setPrefs((x) => ({ ...x, [c]: { ...channelsFor(x, c), [ch]: v } })),
      rollback: () => setPrefs((x) => ({ ...x, [c]: { ...channelsFor(x, c), [ch]: !v } })),
      write: () => writes.setRoutingCell(c, ch, v),
      failed: `Couldn't change ${ROUTING_LABEL[c].toLowerCase()}`,
    });

  const all = ROUTING_GROUPS.flatMap((g) => g.categories);
  const bulk = (next: PrefsByCategory, failed: string) => {
    const before = prefs;
    return save.run({ key: 'bulk', apply: () => setPrefs(next), rollback: () => setPrefs(before), write: () => writes.setRoutingAll(next), failed });
  };
  const muted = (ch: 'push' | 'email') => Object.fromEntries(all.map((c) => [c, { ...channelsFor(prefs, c), [ch]: false }])) as PrefsByCategory;

  return (
    <Card
      id="set-routing"
      title="CoachHelm updates"
      description="Round reviews, goals and insights from CoachHelm. These are separate from email and push above."
      aside={
        <div className="ch-set-bulk">
          <Button size="sm" variant="ghost" leftIcon={BellOff} disabled={bulkBusy || cellBusy} onClick={() => void bulk(muted('push'), "Couldn't mute push")}>
            Mute push
          </Button>
          <Button size="sm" variant="ghost" disabled={bulkBusy || cellBusy} onClick={() => void bulk(muted('email'), "Couldn't mute email")}>
            Mute email
          </Button>
          <Button size="sm" variant="ghost" leftIcon={RotateCcw} disabled={bulkBusy || cellBusy} onClick={() => setConfirmReset(true)}>
            Reset
          </Button>
        </div>
      }
    >
      <Row label={<><Icon icon={Moon} size={15} /> Quiet mode for CoachHelm</>} help="Pauses these except round reviews and goals from your coach.">
        <Switch
          label="Quiet mode for CoachHelm"
          hideLabel
          checked={quiet}
          busy={save.pending.has('quiet')}
          onChange={(v) => void save.run({ key: 'quiet', apply: () => setQuiet(v), rollback: () => setQuiet(!v), write: () => writes.setRoutingQuiet(v), failed: "Couldn't change quiet mode" })}
        />
      </Row>
      <div className="ch-set-matrix is-3" role="table" aria-label="CoachHelm updates by channel">
        <div className="ch-set-matrix__row is-head" role="row">
          <span role="columnheader">Update</span>
          {CHANNELS.map((c) => (
            <span key={c.key} role="columnheader">
              {c.label}
            </span>
          ))}
        </div>
        {ROUTING_GROUPS.map((g) => (
          <div key={g.label} role="rowgroup">
            <div className="ch-set-matrix__group" role="row">
              <span role="rowheader">{g.label}</span>
            </div>
            {g.categories.map((c) => {
              const ch = channelsFor(prefs, c);
              const exempt = ROUTING_QUIET_EXEMPT.has(c);
              const silenced = quiet && !exempt;
              return (
                <div key={c} className={'ch-set-matrix__row' + (silenced ? ' is-dim' : '')} role="row">
                  <span role="rowheader" className="ch-set-matrix__what">
                    <b>{ROUTING_LABEL[c]}</b>
                    {quiet && (exempt ? <Badge tone="positive">Always delivered</Badge> : <span>Paused by quiet mode</span>)}
                  </span>
                  {CHANNELS.map((x) => (
                    <span key={x.key} role="cell">
                      <Switch
                        label={`${ROUTING_LABEL[c]}, ${x.label.toLowerCase()}`}
                        hideLabel
                        checked={ch[x.key]}
                        disabled={silenced || bulkBusy}
                        busy={save.pending.has(`cell:${c}:${x.key}`)}
                        onChange={(v) => setCell(c, x.key, v)}
                      />
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        icon={RotateCcw}
        title="Reset CoachHelm updates?"
        description="Every update goes back to in app only, with push and email off."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmReset(false);
                void bulk(Object.fromEntries(all.map((c) => [c, { ...DEFAULT_CHANNELS }])) as PrefsByCategory, "Couldn't reset your updates");
              }}
            >
              Reset to defaults
            </Button>
          </>
        }
      />
    </Card>
  );
}
