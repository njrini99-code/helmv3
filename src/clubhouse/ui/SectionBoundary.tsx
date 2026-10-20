'use client';

import { Component, Suspense, createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { chReport } from '../lib/track';
import { InlineNotice, partsSentence } from './Notices';

type Props = { surface: string; label: string; children: ReactNode; /** Catalog number of the crash notice. */ code?: string };

/** A failed section as its group knows it: the label its notice names, and how to try it again. */
type Failed = { label: string; reset: () => void };

type Group = {
  /** The failed sections, by the number each boundary took when it was created. */
  failed: ReadonlyMap<number, Failed>;
  /** Two or more failed and a SectionGroupNotice is there to say so: each failed section keeps only its title. */
  covered: boolean;
  add: (id: number, part: Failed) => void;
  remove: (id: number) => void;
  /** A SectionGroupNotice mounts; the returned function unmounts it. */
  slot: () => () => void;
};

const SectionGroupContext = createContext<Group | null>(null);

/** Boundaries are numbered as they are created, which on a page's first render is its reading order. */
let created = 0;

/**
 * Contains a crash to one section of a page. The rest of the screen keeps
 * working, the coach sees what broke in plain words with Try again, and the
 * error goes to Sentry tagged with its surface (home.leaderboard, ...).
 *
 * An error boundary only catches in the browser. The Suspense inside it
 * covers the server render: a section that throws there is left out of the
 * HTML and rendered again in the browser, where this boundary catches it.
 * Without it, one section's crash on first load fails the whole page.
 *
 * Inside a SectionGroup, a failed section tells the group; while two or more
 * have failed, the group's SectionGroupNotice says so once (CH-1210) and each
 * failed section keeps only its title. Outside one, nothing changes.
 */
export function SectionBoundary(props: Props) {
  return <Boundary {...props} group={useContext(SectionGroupContext)} />;
}

class Boundary extends Component<Props & { group: Group | null }, { failed: boolean }> {
  override state = { failed: false };
  private readonly id = ++created;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    chReport(error, { surface: this.props.surface, severity: 'high', extra: { componentStack: info.componentStack ?? undefined } });
    this.props.group?.add(this.id, { label: this.props.label, reset: this.reset });
  }

  // StrictMode (dev) and <Activity> detach a mounted boundary and attach it again without catching again, and a section
  // can crash in the commit that mounts it (the phone tree mounts after hydration): a failed one tells its group again.
  override componentDidMount() {
    if (this.state.failed) this.props.group?.add(this.id, { label: this.props.label, reset: this.reset });
  }

  override componentDidUpdate(_props: unknown, prev: { failed: boolean }) {
    if (prev.failed && !this.state.failed) this.props.group?.remove(this.id);
  }

  override componentWillUnmount() {
    this.props.group?.remove(this.id);
  }

  private readonly reset = () => this.setState({ failed: false });

  override render() {
    if (!this.state.failed) return <Suspense fallback={null}>{this.props.children}</Suspense>;
    return (
      <InlineNotice
        code={this.props.code}
        title={`${this.props.label} couldn’t be shown`}
        body="The rest of the page is fine. This has been reported automatically."
        onRetry={this.reset}
        covered={this.props.group?.covered ?? false}
      />
    );
  }
}

/**
 * The sections of one page, told once when several crash (CH-1210). Wrap the page's one rendered tree (the phone or
 * the desktop page, never both) and put SectionGroupNotice under its head. The group lives in the browser only:
 * nothing fails on the server, so the server HTML and the first render in the browser match.
 */
export function SectionGroup({ children }: { children: ReactNode }) {
  const [failed, setFailed] = useState<ReadonlyMap<number, Failed>>(() => new Map());
  const [slots, setSlots] = useState(0);
  const add = useCallback((id: number, part: Failed) => setFailed((now) => new Map(now).set(id, part)), []);
  const remove = useCallback(
    (id: number) =>
      setFailed((now) => {
        if (!now.has(id)) return now;
        const next = new Map(now);
        next.delete(id);
        return next;
      }),
    [],
  );
  const slot = useCallback(() => {
    setSlots((n) => n + 1);
    return () => setSlots((n) => n - 1);
  }, []);
  const group = useMemo<Group>(() => ({ failed, covered: slots > 0 && failed.size > 1, add, remove, slot }), [failed, slots, add, remove, slot]);
  return <SectionGroupContext.Provider value={group}>{children}</SectionGroupContext.Provider>;
}

/** A label is written as a title ("The trend chart"); inside a sentence a plain first word drops its capital, never an acronym ("RSVPs"). */
const inSentence = (label: string) => (/^[A-Z][a-z’'-]*(\s|$)/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label);

/**
 * The group's one notice (CH-1210), under the page head: nothing until two or more of the group's sections have
 * crashed, then one alert naming them in reading order, whose Try again tries every one of them again.
 */
export function SectionGroupNotice({ code = 'CH-1210' }: { code?: string }) {
  const group = useContext(SectionGroupContext);
  const slot = group?.slot;
  // Before paint, as the boundaries register (componentDidCatch), so two crashes never show uncovered for a frame.
  useLayoutEffect(() => slot?.(), [slot]);
  if (!group || group.failed.size < 2) return null;
  const parts = [...group.failed].sort(([a], [b]) => a - b).map(([, part]) => part);
  return (
    <InlineNotice
      code={code}
      title="Some of this page couldn’t be shown"
      body={`${partsSentence(parts.map((p, i) => (i === 0 ? p.label : inSentence(p.label))))} couldn’t be shown. The rest of the page is fine, and this has been reported automatically.`}
      onRetry={() => parts.forEach((p) => p.reset())}
    />
  );
}
