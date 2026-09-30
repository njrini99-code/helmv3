'use client';

import { BellOff, Moon, RotateCcw, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { DELIVERY_NOTIFICATION_GROUPS } from '@/lib/coachhelm/v3/notifications/types';
import type { ChannelPref, PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { channelsFor, DEFAULT_CHANNELS, ROUTING_GROUPS, ROUTING_LABEL, ROUTING_QUIET_EXEMPT, type ChDevice, type ChSettingsData, type ChSettingsWrites } from './model';
import { useDelivery, usePushToggle, useRouting } from './hooks';
import { Card, ReadFailed, Row, SettingSwitch } from './parts';

/** Recruiting and profile-view emails don't apply to GolfHelm coaches or players (as in the current app). */
export const DELIVERY_GROUPS = DELIVERY_NOTIFICATION_GROUPS.filter((g) => g.id !== 'pipeline' && g.id !== 'profile_views');

export function NotificationsSection({ data, writes, device }: { data: ChSettingsData; writes: ChSettingsWrites; device: ChDevice }) {
  return (
    <>
      {data.delivery.error ? (
        <ReadFailed what="Your email and push settings" code="CH-8202" onRetry={writes.refresh} />
      ) : (
        <DeliveryCard prefs={data.delivery.value} writes={writes} device={device} digest={data.digest} />
      )}
      {data.playerRouting &&
        (data.playerRouting.error ? (
          <ReadFailed what="Your CoachHelm update settings" code="CH-8203" onRetry={writes.refresh} />
        ) : (
          <RoutingCard initial={data.playerRouting.value} writes={writes} />
        ))}
    </>
  );
}

function DeliveryCard({ prefs, writes, device, digest }: { prefs: Record<string, boolean>; writes: ChSettingsWrites; device: ChDevice; digest: ChSettingsData['digest'] }) {
  const { p, dg, quiet, pending, flip, flipDigest } = useDelivery(prefs, digest, writes);
  const push = device.push;
  const onDevice = push.status === 'subscribed';
  const togglePush = usePushToggle(push);

  return (
    <Card id="set-delivery" title="Email and push" description="Which updates reach you, and how. Changes save as you make them.">
      <Row label={<><Icon icon={Moon} size={15} /> Quiet mode</>} help="Pauses everything except messages from your team.">
        <SettingSwitch label="Quiet mode" hideLabel checked={quiet} busy={pending.has('quiet_mode')} onChange={flip('quiet_mode', 'quiet mode')} />
      </Row>
      {push.status !== 'unsupported' && (
        <Row
          label={<><Icon icon={Smartphone} size={15} /> Push on this device</>}
          help={push.status === 'denied' ? 'Notifications are blocked for GolfHelm in this browser. Allow them in its site settings, then come back.' : 'Lets this browser show push notifications.'}
        >
          <SettingSwitch label="Push on this device" hideLabel checked={onDevice} disabled={push.status === 'denied' || push.status === 'checking'} busy={push.pending} onChange={(v) => void togglePush(v)} />
        </Row>
      )}

      <div className="ch-set-matrix" role="table" aria-label="Email and push by kind of update">
        <div className="ch-set-matrix__row is-head" role="row">
          <span role="columnheader">Update</span>
          <span role="columnheader">Email</span>
          <span role="columnheader">Push</span>
        </div>
        {DELIVERY_GROUPS.map((g) => {
          const silenced = quiet && !g.quietExempt;
          return (
            <div key={g.id} className={'ch-set-matrix__row' + (silenced ? ' is-dim' : '')} role="row">
              <span role="rowheader" className="ch-set-matrix__what">
                <b>{g.label}</b>
                <span>{silenced ? 'Paused by quiet mode' : g.description}</span>
              </span>
              <span role="cell">
                <SettingSwitch label={`${g.label} by email`} hideLabel checked={!!p[g.emailKey]} disabled={silenced} busy={pending.has(g.emailKey)} onChange={flip(g.emailKey, `${g.label.toLowerCase()} email`)} />
              </span>
              <span role="cell">
                {g.pushKey ? (
                  <SettingSwitch label={`${g.label} by push`} hideLabel checked={!!p[g.pushKey]} disabled={silenced} busy={pending.has(g.pushKey)} onChange={flip(g.pushKey, `${g.label.toLowerCase()} push`)} />
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
          <Row label="Weekly team email" help={<span role="alert" data-ch-code="CH-8204">This setting didn&apos;t load. Reload to change it.</span>} dim>
            <SettingSwitch label="Weekly team email" hideLabel checked={false} disabled onChange={() => {}} />
          </Row>
        ) : (
          <Row label="Weekly team email" help="The weekly summary of your team, by email.">
            <SettingSwitch
              label="Weekly team email"
              hideLabel
              checked={dg}
              busy={pending.has('digest')}
              onChange={flipDigest}
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
  const { prefs, quiet, pending, bulkBusy, cellBusy, all, setCell, bulk, flipQuiet } = useRouting(initial, writes);
  const [confirmReset, setConfirmReset] = useState(false);
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
        <SettingSwitch
          label="Quiet mode for CoachHelm"
          hideLabel
          checked={quiet}
          busy={pending.has('quiet')}
          onChange={flipQuiet}
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
                      <SettingSwitch
                        label={`${ROUTING_LABEL[c]}, ${x.label.toLowerCase()}`}
                        hideLabel
                        checked={ch[x.key]}
                        disabled={silenced || bulkBusy}
                        busy={pending.has(`cell:${c}:${x.key}`)}
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
        code="CH-8504"
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
