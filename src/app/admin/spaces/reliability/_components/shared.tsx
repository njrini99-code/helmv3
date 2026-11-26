import type { ReactNode } from 'react';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { PipeStatus } from '@/lib/admin/clubhouse/live-model';
import { LinkTabs, Pill } from '../../_ui/ui';
import './reliability.css';

export type ReliabilityView = 'feed' | 'rules' | 'speed';

/** Feed / How it counts / Speed: the same three tabs at the top of each Reliability screen. */
export function ReliabilityTabs({ current }: { current: ReliabilityView }) {
  return (
    <LinkTabs
      label="Reliability"
      current={current}
      tabs={[
        { key: 'feed', label: 'Error feed', href: '/admin/spaces/reliability', br: BR.feed.spaceTab },
        { key: 'rules', label: 'How it counts', href: '/admin/spaces/reliability/rules', br: BR.feed.spaceTab },
        { key: 'speed', label: 'Speed', href: '/admin/spaces/reliability/speed', br: BR.feed.spaceTab },
      ]}
    />
  );
}

/** The pipe, in one pill: live in green, anything else (silent, off, not there yet, unreadable) in amber. */
export function PipePill({ pipe }: { pipe: PipeStatus }) {
  return (
    <Pill tone={pipe.untrusted ? 'watch' : 'good'} dot>
      {pipe.label}
    </Pill>
  );
}

/** The line under a screen's controls: the pipe, where the numbers come from, and whether a read was cut short. */
export function TruthLine({ pipe, children }: { pipe: PipeStatus; children?: ReactNode }) {
  return (
    <div className="rl-truth">
      <PipePill pipe={pipe} />
      {children}
    </div>
  );
}

/** A segmented link group (window, device, role): each option is a URL, so Back works and the server renders it. */
export function LinkGroup({
  label,
  br,
  options,
}: {
  label: string;
  br: string;
  options: ReadonlyArray<{ key: string; label: string; href: string; active: boolean }>;
}) {
  return (
    <LinkTabs label={label} current={options.find((o) => o.active)?.key ?? ''} tabs={options.map((o) => ({ key: o.key, label: o.label, href: o.href, br }))} />
  );
}
