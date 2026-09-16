'use client';

/**
 * ============================================================================
 * Fairway · modules · ResizableWorkspace — the desktop power-user shell
 * ----------------------------------------------------------------------------
 * Archetype D (workspace): a fixed left rail / center stage / right inspector
 * with pointer-draggable, keyboard-resizable boundaries and a persisted
 * layout — "desktop queue | evidence | CoachHelm", "schedule lane +
 * inspector". Any of `left`/`right` may be omitted for a 2-pane workspace;
 * `center` is required.
 *
 *   <ResizableWorkspace
 *     left={<Queue />} center={<Evidence />} right={<Assistant />}
 *     defaultLayout={[24, 48, 28]}
 *     minSizes={{ left: 18, center: 32, right: 20 }}
 *     storageKey="signals-workspace-v1"
 *     collapsible={{ left: true, right: true }}
 *     defaultCollapsed={{ right: !isWideMonitor }}
 *   />
 *
 * ── Sizing ──────────────────────────────────────────────────────────────────
 * A CSS Grid track list — `<left>% 8px <center>% 8px <right>%` — not flexbox:
 * grid resolves percentage tracks against the space LEFT OVER after the fixed
 * 8px handle tracks, so pane percentages can sum to exactly 100 without the
 * handles pushing the row into horizontal overflow (a flex-basis version of
 * this would need `calc(N% - Xpx)` on every pane to avoid the same overflow).
 *
 * ── Persistence ─────────────────────────────────────────────────────────────
 * `storageKey` persists pane sizes to `localStorage`. Read happens in an
 * effect (never during render, so SSR and the first client render agree) and
 * is guarded try/catch (private browsing, quota, disabled storage all
 * degrade to `defaultLayout` silently). A `hydrated` flag delays the
 * write-back effect one tick so a fresh mount can never stomp a previously
 * saved layout with the just-rendered default before the read finishes.
 * Only a layout the user has TOUCHED (drag, arrow key, chevron) is written:
 * the rendered default is not user data, so a laptop session never pins its
 * narrow-screen defaults onto the same coach's wide monitor. A collapsed side
 * persists as a 0 track and restores collapsed.
 *
 * ── Default collapse ────────────────────────────────────────────────────────
 * `defaultCollapsed` starts a `collapsible` side at zero (its share handed to
 * `center`). Initial-only, like `defaultLayout`: a persisted layout wins, and
 * once the user touches a handle the prop is never re-applied. Until then it
 * IS re-applied when its value changes, so a caller can feed it a media
 * query — collapse the inspector below 2xl where three panes leave the stage
 * ~500px wide, keep it open on a wide monitor — without the pane snapping
 * shut again after the coach expanded it.
 *
 * ── Keyboard ────────────────────────────────────────────────────────────────
 * Each handle is `role="separator" aria-orientation="vertical" tabIndex={0}`
 * (a vertical dividing line that resizes horizontally, per the WAI-ARIA
 * separator pattern). ArrowLeft/ArrowRight move the boundary 2 points at a
 * time between the two panes the handle sits between. `Home` collapses the
 * pane BEFORE the handle (only if that side is `collapsible`); `End`
 * collapses the pane AFTER it. Collapsing hands the freed size to `center`;
 * expanding (Home/End again, or the chevron button) takes it back, clamped to
 * `center`'s own minimum.
 *
 * ── Mobile ──────────────────────────────────────────────────────────────────
 * Below `md` there is no room for three resizable columns. Default fallback:
 * render `center` ALONE (no handles, no left/right — a workspace's side rails
 * are desktop-only power-user surfaces per brief §11 "never a stretched
 * phone"). Pass `renderMobile` to own the phone layout entirely instead (e.g.
 * a view switcher that surfaces `left`/`right` as sheets) — when provided it
 * REPLACES the center-only default, not supplements it.
 *
 * Panels are canvas by default: no border/shadow/radius here. The consumer's
 * own Surface/Inset/matte stage supplies the material for each slot.
 * ========================================================================== */

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useComposedRefs } from '@radix-ui/react-compose-refs';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { IconButton } from '../controls/button';

type PaneKey = 'left' | 'center' | 'right';

export interface ResizableWorkspaceMinSizes {
  left?: number;
  center?: number;
  right?: number;
}

export interface ResizableWorkspaceProps {
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  /** Initial pane percentages, ONE per active pane (left→right order). Renormalized if they don't sum to 100. */
  defaultLayout?: number[];
  /** Minimum percentage per pane. Default: 15 for left/right, 24 for center. */
  minSizes?: ResizableWorkspaceMinSizes;
  /** Persists pane sizes to localStorage under this key. Omit to disable persistence. */
  storageKey?: string;
  /** Which side(s) can collapse to zero via the handle's chevron / Home-End. Default `false`. */
  collapsible?: boolean | { left?: boolean; right?: boolean };
  /**
   * Side(s) that start collapsed (must also be `collapsible`). Initial-only:
   * a layout persisted under `storageKey` wins, and the prop stops applying
   * the moment the user drags, keys, or clicks a handle. Re-applied on change
   * until then, so a media query is a valid input.
   */
  defaultCollapsed?: { left?: boolean; right?: boolean };
  /**
   * Owns the ENTIRE sub-`md` layout (e.g. a tab switcher exposing `left`/
   * `right` as sheets). Omit for the default: `center` alone, no chrome.
   */
  renderMobile?: ReactNode;
  className?: string;
  'data-slot'?: string;
}

const HANDLE_PX = 8;
const STEP_PCT = 2;
const DEFAULT_MIN: Required<ResizableWorkspaceMinSizes> = { left: 15, center: 24, right: 15 };

function resolveCollapsible(
  collapsible: ResizableWorkspaceProps['collapsible'],
): { left: boolean; right: boolean } {
  if (collapsible === true) return { left: true, right: true };
  if (!collapsible) return { left: false, right: false };
  return { left: !!collapsible.left, right: !!collapsible.right };
}

/** Renormalize a raw size list to the given pane count, summing to exactly 100. */
function normalizeSizes(raw: number[] | undefined, count: number, fallbackEach = 100 / count): number[] {
  // `>= 0`, not `> 0`: a collapsed pane is a legitimate 0 track (see the
  // persistence note in the docblock) — rejecting it threw away every saved
  // layout that had a side collapsed.
  const src = Array.isArray(raw) && raw.length === count && raw.every((n) => Number.isFinite(n) && n >= 0) ? raw : null;
  const base = src ?? Array.from({ length: count }, () => fallbackEach);
  const sum = base.reduce((a, b) => a + b, 0);
  // Already sums to 100 (the common case: a caller-supplied layout that adds
  // up correctly) — skip the divide/multiply round-trip so it comes back
  // byte-identical instead of off by floating-point noise (e.g. 28 →
  // 28.000000000000004).
  if (Math.abs(sum - 100) < 1e-9) return base;
  return sum > 0 ? base.map((n) => (n / sum) * 100) : Array.from({ length: count }, () => fallbackEach);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const ResizableWorkspace = forwardRef<HTMLDivElement, ResizableWorkspaceProps>(
  function ResizableWorkspace(
    {
      left,
      center,
      right,
      defaultLayout,
      minSizes,
      storageKey,
      collapsible = false,
      defaultCollapsed,
      renderMobile,
      className,
      'data-slot': dataSlot = 'fw-resizable-workspace',
    },
    ref,
  ) {
    const isDesktop = useMediaQuery('(min-width: 768px)');
    const paneKeys = useMemo<PaneKey[]>(
      () => (['left', 'center', 'right'] as PaneKey[]).filter((k) => (k === 'center' ? true : k === 'left' ? !!left : !!right)),
      [left, right],
    );
    const min = useMemo<Required<ResizableWorkspaceMinSizes>>(
      () => ({ ...DEFAULT_MIN, ...minSizes }),
      [minSizes],
    );
    const resolvedCollapsible = resolveCollapsible(collapsible);
    // Memoized on the two booleans, not the (usually inline) `collapsible`
    // object, so the callbacks and the default-collapse effect below stay
    // referentially stable across renders.
    const canCollapse = useMemo(
      () => ({ left: resolvedCollapsible.left, right: resolvedCollapsible.right }),
      [resolvedCollapsible.left, resolvedCollapsible.right],
    );
    const wantCollapsedLeft = !!defaultCollapsed?.left;
    const wantCollapsedRight = !!defaultCollapsed?.right;

    const [sizes, setSizes] = useState<number[]>(() => normalizeSizes(defaultLayout, paneKeys.length));
    const [hydrated, setHydrated] = useState(!storageKey);
    const [collapsed, setCollapsed] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
    const [isResizing, setIsResizing] = useState(false);
    const lastSizeRef = useRef<{ left: number; right: number }>({ left: min.left, right: min.right });
    /** Set once a persisted layout was loaded — `defaultCollapsed` then never applies. */
    const storedLayoutRef = useRef(false);
    /** Set on the first drag/key/chevron — from then on the layout is user data: persisted, and no longer overridden by `defaultCollapsed`. */
    const userTouchedRef = useRef(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const composedRef = useComposedRefs(ref, containerRef);

    // Re-derive sizes if the set of active panes changes shape at runtime
    // (left/right toggling from undefined→node or back).
    useEffect(() => {
      setSizes((prev) => (prev.length === paneKeys.length ? prev : normalizeSizes(defaultLayout, paneKeys.length)));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paneKeys.length]);

    // Load persisted layout — effect only, never during render (SSR-safe).
    useEffect(() => {
      if (!storageKey) return;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed) && parsed.length === paneKeys.length && parsed.every((n) => typeof n === 'number')) {
            const restored = normalizeSizes(parsed, paneKeys.length);
            const defaults = normalizeSizes(defaultLayout, paneKeys.length);
            const restoredCollapsed = { left: false, right: false };
            (['left', 'right'] as const).forEach((side) => {
              const idx = paneKeys.indexOf(side);
              if (idx < 0 || (restored[idx] ?? 1) > 0.01) return;
              restoredCollapsed[side] = true;
              // Expanding a side that was saved collapsed brings back its
              // default share, not the bare minimum.
              lastSizeRef.current = { ...lastSizeRef.current, [side]: Math.max(defaults[idx] ?? 0, min[side]) };
            });
            setSizes(restored);
            setCollapsed(restoredCollapsed);
            storedLayoutRef.current = true;
          }
        }
      } catch {
        // localStorage unavailable/corrupt — keep defaultLayout.
      }
      setHydrated(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);

    // Persist on change — gated on `hydrated` so the initial default render
    // can never overwrite a previously saved layout before the read above
    // runs, and on `userTouchedRef` so only a layout the user actually chose
    // is written (a default-collapsed inspector is not a preference).
    useEffect(() => {
      if (!storageKey || !hydrated || !userTouchedRef.current) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(sizes));
      } catch {
        // ignore (quota / private mode / disabled storage)
      }
    }, [storageKey, hydrated, sizes]);

    const paneIndex = useCallback((key: PaneKey) => paneKeys.indexOf(key), [paneKeys]);

    const minFor = useCallback((key: PaneKey) => min[key], [min]);

    /** Resize the two panes adjacent to `handleIndex` (between panes[handleIndex] and panes[handleIndex+1]) by `deltaPct`. */
    const resizeAt = useCallback(
      (handleIndex: number, deltaPct: number) => {
        setSizes((prev) => {
          const a = handleIndex;
          const b = handleIndex + 1;
          const keyA = paneKeys[a];
          const keyB = paneKeys[b];
          const sizeA0 = prev[a];
          const sizeB0 = prev[b];
          if (!keyA || !keyB || sizeA0 === undefined || sizeB0 === undefined) return prev;
          const pairTotal = sizeA0 + sizeB0;
          const minA = minFor(keyA);
          const minB = minFor(keyB);
          let sizeA = clamp(sizeA0 + deltaPct, minA, pairTotal - minB);
          let sizeB = pairTotal - sizeA;
          if (sizeB < minB) {
            sizeB = minB;
            sizeA = pairTotal - sizeB;
          }
          const next = [...prev];
          next[a] = sizeA;
          next[b] = sizeB;
          return next;
        });
      },
      [minFor, paneKeys],
    );

    /** Collapse `side` to 0, handing its size to `center`. No-op if already collapsed or not collapsible. */
    const collapseSide = useCallback(
      (side: 'left' | 'right') => {
        if (!canCollapse[side]) return;
        const idx = paneIndex(side);
        if (idx < 0) return;
        setCollapsed((prev) => (prev[side] ? prev : { ...prev, [side]: true }));
        setSizes((prev) => {
          const current = prev[idx];
          if (current === undefined || current <= 0.01) return prev;
          const centerIdx = paneIndex('center');
          const centerCurrent = prev[centerIdx];
          if (centerCurrent === undefined) return prev;
          lastSizeRef.current = { ...lastSizeRef.current, [side]: Math.max(current, min[side]) };
          const next = [...prev];
          next[idx] = 0;
          next[centerIdx] = centerCurrent + current;
          return next;
        });
      },
      [canCollapse, min, paneIndex],
    );

    /** Restore `side` from 0 to its last remembered size, taken back from `center`. */
    const expandSide = useCallback(
      (side: 'left' | 'right') => {
        const idx = paneIndex(side);
        if (idx < 0) return;
        setCollapsed((prev) => (prev[side] ? { ...prev, [side]: false } : prev));
        setSizes((prev) => {
          const centerIdx = paneIndex('center');
          const centerCurrent = prev[centerIdx];
          if (centerCurrent === undefined) return prev;
          const restore = Math.min(lastSizeRef.current[side], Math.max(centerCurrent - min.center, 0));
          if (restore <= 0.01) return prev;
          const next = [...prev];
          next[idx] = restore;
          next[centerIdx] = centerCurrent - restore;
          return next;
        });
      },
      [min.center, paneIndex],
    );

    const toggleSide = useCallback(
      (side: 'left' | 'right') => {
        userTouchedRef.current = true;
        if (collapsed[side]) expandSide(side);
        else collapseSide(side);
      },
      [collapsed, collapseSide, expandSide],
    );

    // Apply `defaultCollapsed`. Declared AFTER the storage read so, within
    // the mount commit, a persisted layout has already flagged
    // `storedLayoutRef` by the time this runs. Idempotent: it only acts when
    // the wanted state differs from the current one, and never once the user
    // has touched a handle.
    useEffect(() => {
      if (storedLayoutRef.current || userTouchedRef.current) return;
      (['left', 'right'] as const).forEach((side) => {
        if (!canCollapse[side] || paneIndex(side) < 0) return;
        const want = side === 'left' ? wantCollapsedLeft : wantCollapsedRight;
        if (want && !collapsed[side]) collapseSide(side);
        else if (!want && collapsed[side]) expandSide(side);
      });
    }, [wantCollapsedLeft, wantCollapsedRight, canCollapse, collapsed, collapseSide, expandSide, paneIndex]);

    const handlePointerDown = useCallback(
      (handleIndex: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        userTouchedRef.current = true;
        setIsResizing(true);
        const onMove = (moveEvent: PointerEvent) => {
          const deltaPx = moveEvent.movementX;
          const deltaPct = (deltaPx / rect.width) * 100;
          if (deltaPct !== 0) resizeAt(handleIndex, deltaPct);
        };
        const onUp = () => {
          setIsResizing(false);
          target.releasePointerCapture(event.pointerId);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      },
      [resizeAt],
    );

    const handleKeyDown = useCallback(
      (handleIndex: number) => (event: ReactKeyboardEvent<HTMLDivElement>) => {
        const before = paneKeys[handleIndex];
        const after = paneKeys[handleIndex + 1];
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) userTouchedRef.current = true;
        switch (event.key) {
          case 'ArrowLeft':
            event.preventDefault();
            resizeAt(handleIndex, -STEP_PCT);
            break;
          case 'ArrowRight':
            event.preventDefault();
            resizeAt(handleIndex, STEP_PCT);
            break;
          case 'Home':
            if (before === 'left' || before === 'right') {
              event.preventDefault();
              if (collapsed[before]) expandSide(before);
              else collapseSide(before);
            }
            break;
          case 'End':
            if (after === 'left' || after === 'right') {
              event.preventDefault();
              if (collapsed[after]) expandSide(after);
              else collapseSide(after);
            }
            break;
          default:
            break;
        }
      },
      [collapseSide, collapsed, expandSide, paneKeys, resizeAt],
    );

    // ── Mobile: center-only by default, or the consumer's own layout ────────
    if (!isDesktop) {
      return (
        <div ref={ref} data-slot={dataSlot} data-mobile="" className={cn('min-h-0 w-full', className)}>
          {renderMobile ?? center}
        </div>
      );
    }

    const gridTemplate = paneKeys
      .map((key) => `${sizes[paneIndex(key)]}%`)
      .flatMap((track, i) => (i === 0 ? [track] : [`${HANDLE_PX}px`, track]))
      .join(' ');

    const paneStyle = (key: PaneKey): CSSProperties => ({
      gridColumn: paneIndex(key) * 2 + 1,
      minWidth: 0,
    });

    const content: Record<PaneKey, ReactNode> = { left, center, right };

    return (
      <div
        ref={composedRef}
        data-slot={dataSlot}
        className={cn('grid h-full min-h-0 w-full', className)}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {paneKeys.map((key, i) => {
          const isLast = i === paneKeys.length - 1;
          return (
            <div key={`pane-${key}`} style={{ display: 'contents' }}>
              <div
                data-slot={`fw-resizable-workspace-${key}`}
                style={paneStyle(key)}
                className={cn(
                  'min-h-0 overflow-hidden',
                  !isResizing && 'transition-[grid-column] duration-200 motion-reduce:transition-none',
                )}
              >
                {content[key]}
              </div>
              {!isLast ? (
                // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the WAI-ARIA "separator" (splitter) pattern requires a pointer/keyboard-driven div; no native interactive element has this role
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${key} and ${paneKeys[i + 1]}`}
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the splitter itself is the keyboard target (arrow keys resize, Home/End collapse); there is no native interactive element with role="separator"
                  tabIndex={0}
                  onPointerDown={handlePointerDown(i)}
                  onKeyDown={handleKeyDown(i)}
                  data-slot="fw-resizable-workspace-handle"
                  style={{ gridColumn: i * 2 + 2 }}
                  className="group relative flex min-h-0 cursor-col-resize touch-none flex-col items-center justify-center outline-none"
                >
                  {(key === 'left' && canCollapse.left) || (paneKeys[i + 1] === 'right' && canCollapse.right) ? (
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label={
                        key === 'left' && canCollapse.left
                          ? collapsed.left
                            ? 'Expand left panel'
                            : 'Collapse left panel'
                          : collapsed.right
                            ? 'Expand right panel'
                            : 'Collapse right panel'
                      }
                      onClick={() => toggleSide(key === 'left' && canCollapse.left ? 'left' : 'right')}
                      className="pointer-events-auto absolute top-2 z-10 h-6 w-6"
                    >
                      {key === 'left' && canCollapse.left ? (
                        collapsed.left ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />
                      ) : collapsed.right ? (
                        <ChevronLeft className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </IconButton>
                  ) : null}
                  <div
                    aria-hidden="true"
                    className="h-full w-px bg-border-subtle transition-colors duration-fast group-hover:bg-accent-650/40 group-focus-visible:bg-accent-650"
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  },
);
