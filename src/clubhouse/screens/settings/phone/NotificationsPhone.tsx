'use client';

import { useState } from 'react';
import type { ChannelPref, NotificationCategory, PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';
import { channelsFor, ROUTING_GROUPS, ROUTING_QUIET_EXEMPT, type ChDevice, type ChSettingsData, type ChSettingsWrites } from '../model';
import { useDelivery, usePushToggle, useRouting } from '../hooks';
import { DELIVERY_GROUPS } from '../Notifications';
import { ReadFailed } from '../parts';
import { ListSheet } from './sheets';
import { Group, NavRow, SwitchRow } from './ui';

/**
 * Notifications on the phone: the notification matrix becomes one row per kind of update, which opens a sheet with
 * its switches and shows what is on ("In app, Push") on the row. Same saves and catalog numbers as desktop.
 */
export function NotificationsPhone({ data, writes, device }: { data: ChSettingsData; writes: ChSettingsWrites; device: ChDevice }) {
  return (
    <>
      <p className="ch-setm-lead">Which updates reach you, and how. Changes save as you make them.</p>
      {data.delivery.error ? (
        <ReadFailed what="Your email and push settings" code="CH-8202" onRetry={writes.refresh} />
      ) : (
        <DeliveryPhone prefs={data.delivery.value} digest={data.digest} writes={writes} device={device} />
      )}
      {data.playerRouting &&
        (data.playerRouting.error ? (
          <ReadFailed what="Your CoachHelm update settings" code="CH-8203" onRetry={writes.refresh} />
        ) : (
          <RoutingPhone initial={data.playerRouting.value} writes={writes} />
        ))}
    </>
  );
}

function DeliveryPhone({ prefs, digest, writes, device }: { prefs: Record<string, boolean>; digest: ChSettingsData['digest']; writes: ChSettingsWrites; device: ChDevice }) {
  const { p, dg, quiet, pending, flip, flipDigest } = useDelivery(prefs, digest, writes);
  const push = device.push;
  const togglePush = usePushToggle(push);
  const [kind, setKind] = useState<string | null>(null);
  const open = DELIVERY_GROUPS.find((g) => g.id === kind);
  const denied = push.status === 'denied';
  const silenced = (exempt: boolean) => quiet && !exempt;
  const summary = (g: (typeof DELIVERY_GROUPS)[number]) => {
    if (silenced(g.quietExempt)) return 'Paused';
    const on = [p[g.emailKey] && 'Email', g.pushKey && p[g.pushKey] && 'Push'].filter(Boolean);
    return on.length ? on.join(', ') : 'Off';
  };

  return (
    <>
      {(push.status !== 'unsupported' || digest) && (
        <Group title="This device">
          {push.status !== 'unsupported' && (
            <SwitchRow
              label="Push on this device"
              help={denied ? 'Notifications are blocked for GolfHelm in this browser. Allow them in its site settings, then come back.' : undefined}
              checked={push.status === 'subscribed'}
              disabled={denied || push.status === 'checking'}
              busy={push.pending}
              onChange={(v) => void togglePush(v)}
            />
          )}
          {digest &&
            (digest.error ? (
              <SwitchRow
                label="Weekly team email"
                help={<span role="alert" data-ch-code="CH-8204">This setting didn&apos;t load. Reload to change it.</span>}
                checked={false}
                disabled
                onChange={() => {}}
              />
            ) : (
              <SwitchRow label="Weekly team email" checked={dg} busy={pending.has('digest')} onChange={flipDigest} />
            ))}
        </Group>
      )}

      <Group title="Email and push" note="Quiet mode pauses everything except messages from your team.">
        {DELIVERY_GROUPS.map((g) => (
          <NavRow key={g.id} label={g.label} value={summary(g)} onClick={() => setKind(g.id)} />
        ))}
        <SwitchRow label="Quiet mode" checked={quiet} busy={pending.has('quiet_mode')} onChange={flip('quiet_mode', 'quiet mode')} />
      </Group>

      <ListSheet
        open={!!open}
        onClose={() => setKind(null)}
        title={open?.label ?? ''}
        subtitle={open?.description}
        note={
          open
            ? [
                silenced(open.quietExempt) ? 'Paused by quiet mode. Turn it off to change these.' : open.quietExempt ? `${open.label} always reach you, even in quiet mode.` : null,
                open.pushKey ? null : 'This one is email only.',
                'Each switch saves as you flip it.',
              ]
                .filter(Boolean)
                .join(' ')
            : undefined
        }
      >
        {open && (
          <div className="ch-setm-card">
            <SwitchRow
              label="Email"
              checked={!!p[open.emailKey]}
              disabled={silenced(open.quietExempt)}
              busy={pending.has(open.emailKey)}
              onChange={flip(open.emailKey, `${open.label.toLowerCase()} email`)}
            />
            {open.pushKey && (
              <SwitchRow
                label="Push"
                checked={!!p[open.pushKey]}
                disabled={silenced(open.quietExempt)}
                busy={pending.has(open.pushKey)}
                onChange={flip(open.pushKey, `${open.label.toLowerCase()} push`)}
              />
            )}
          </div>
        )}
      </ListSheet>
    </>
  );
}

const CHANNELS: Array<{ key: keyof ChannelPref; label: string }> = [
  { key: 'in_app', label: 'In app' },
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' },
];

/** What a kind of update covers, under its name in the sheet. */
const KIND_HINT: Record<string, string> = {
  'Rounds and reviews': 'A round review ready, or your team standing changed',
  Goals: 'A goal assigned, reached, missed or suggested',
  Insights: 'A new insight, a pattern across rounds, or a comment from your coach',
};

/** One channel across a kind of update's categories: on for all, for some, or for none. */
function channelState(prefs: PrefsByCategory, cats: NotificationCategory[], ch: keyof ChannelPref): { state: 'all' | 'some' | 'none'; n: number } {
  const n = cats.filter((c) => channelsFor(prefs, c)[ch]).length;
  return { state: n === cats.length ? 'all' : n === 0 ? 'none' : 'some', n };
}

function RoutingPhone({ initial, writes }: { initial: { prefs: PrefsByCategory; quiet: boolean }; writes: ChSettingsWrites }) {
  const r = useRouting(initial, writes);
  const [kind, setKind] = useState<string | null>(null);
  const open = ROUTING_GROUPS.find((g) => g.label === kind);
  // Quiet mode silences a kind unless one of its categories is exempt (round reviews, goals your coach assigns).
  const exempt = (cats: NotificationCategory[]) => cats.filter((c) => ROUTING_QUIET_EXEMPT.has(c));
  const silenced = (cats: NotificationCategory[]) => r.quiet && exempt(cats).length === 0;
  const summary = (cats: NotificationCategory[]) => {
    if (silenced(cats)) return 'Paused';
    const on = CHANNELS.flatMap((c) => {
      const { state } = channelState(r.prefs, cats, c.key);
      return state === 'all' ? [c.label] : state === 'some' ? [`${c.label} (some)`] : [];
    });
    return on.length ? on.join(', ') : 'Off';
  };

  return (
    <>
      <Group title="CoachHelm updates" note="Quiet mode pauses these updates. Round reviews and goals your coach assigns are always delivered.">
        {ROUTING_GROUPS.map((g) => (
          <NavRow key={g.label} label={g.label} value={summary(g.categories)} onClick={() => setKind(g.label)} />
        ))}
        <SwitchRow label="Quiet mode for CoachHelm" checked={r.quiet} busy={r.pending.has('quiet')} onChange={r.flipQuiet} />
      </Group>

      <ListSheet
        open={!!open}
        onClose={() => setKind(null)}
        title={open?.label ?? ''}
        subtitle={open ? KIND_HINT[open.label] : undefined}
        note={
          open
            ? [
                silenced(open.categories)
                  ? 'Paused by quiet mode. Turn it off to change these.'
                  : exempt(open.categories).length
                    ? `${open.label === 'Goals' ? 'Goals your coach assigns' : 'Round reviews'} always reach you, even in quiet mode.`
                    : null,
                'Each switch saves as you flip it.',
              ]
                .filter(Boolean)
                .join(' ')
            : undefined
        }
      >
        {open && (
          <div className="ch-setm-card">
            {CHANNELS.map((c) => {
              const { state, n } = channelState(r.prefs, open.categories, c.key);
              const key = `group:${open.label}:${c.key}`;
              return (
                <SwitchRow
                  key={c.key}
                  label={c.label}
                  help={state === 'some' ? `On for ${n} of ${open.categories.length} updates. Turning it on sets all of them.` : undefined}
                  checked={state === 'all'}
                  disabled={silenced(open.categories) || r.bulkBusy || (r.groupBusy && !r.pending.has(key))}
                  busy={r.pending.has(key)}
                  onChange={(v) => void r.setGroup(open.label, open.categories, c.key, v, `Couldn't change ${open.label.toLowerCase()} ${c.label.toLowerCase()}`)}
                />
              );
            })}
          </div>
        )}
      </ListSheet>
    </>
  );
}
