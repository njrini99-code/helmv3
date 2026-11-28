"use client";

import { Ellipsis, X } from "lucide-react";
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { IconButton } from "./Button";
import { Menu, type MenuItem } from "./Menu";
import { rovingTarget } from "./use-roving";

export type HeaderSelection = {
  /** How many things are selected; at 0 the toolbar shows its usual actions. */
  count: number;
  /** What one of them is called, for the line that counts them: "player" reads "3 players selected". */
  noun: [one: string, many: string];
  /** The actions for the selection, in the toolbar's place. */
  actions: ReactNode;
  /** Ends the selection (also Escape inside the toolbar). */
  onClear: () => void;
};

type ToolbarProps = {
  /** What the toolbar's actions act on, for screen readers ("Roster actions"). */
  label: string;
  children?: ReactNode;
  /** Actions that fold into a More menu: shown in the menu on the phone and wherever the bar runs out of room. */
  overflow?: MenuItem[];
  selection?: HeaderSelection;
  className?: string;
};

/** Every control a toolbar's arrow keys can land on: what a person can press, minus the disabled. */
const TOOL =
  'button:not(:disabled), a[href], [role="button"]:not([aria-disabled="true"]), input, select';

/**
 * The header's toolbar (WAI-ARIA toolbar): one Tab stop for the group, the arrow keys walk its controls, Home and End
 * jump; a single control is left as it is (a toolbar of one is just a button). With a `selection` of one or more it
 * shows the count and the selection's actions instead, announced politely (the first count too), and Escape ends the
 * selection; ending it from inside the toolbar leaves the focus on the toolbar, not on the page.
 */
export function HeaderToolbar({
  label,
  children,
  overflow,
  selection,
  className,
}: ToolbarProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  /** Set when the selection is ended from inside the toolbar, whose controls then unmount under the focus. */
  const refocus = useRef(false);
  const selecting = !!selection && selection.count > 0;
  const many =
    Children.toArray(children).filter(isValidElement).length +
      (overflow?.length ? 1 : 0) >
      1 || selecting;

  // The roving stop: the control last focused keeps tabindex 0, the rest -1, so the toolbar is one Tab stop.
  useEffect(() => {
    const el = ref.current;
    if (!el || !many) return;
    const tools = () =>
      Array.from(el.querySelectorAll<HTMLElement>(TOOL)).filter(
        (t) => t.closest("[data-ch-toolbar]") === el,
      );
    const settle = (keep?: HTMLElement) => {
      const all = tools();
      const stop =
        keep && all.includes(keep)
          ? keep
          : (all.find((t) => t.tabIndex === 0 && t.dataset.chRove === "on") ??
            all[0]);
      for (const t of all) {
        t.tabIndex = t === stop ? 0 : -1;
        t.dataset.chRove = t === stop ? "on" : "";
      }
    };
    settle();
    const onFocus = (e: FocusEvent) => settle(e.target as HTMLElement);
    el.addEventListener("focusin", onFocus);
    const seen =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => settle());
    seen?.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-disabled"],
    });
    return () => {
      el.removeEventListener("focusin", onFocus);
      seen?.disconnect();
      for (const t of tools()) {
        t.removeAttribute("tabindex");
        delete t.dataset.chRove;
      }
    };
  }, [many, selecting]);

  // Escape or Clear selection swaps the selection's controls out from under the focus, which would drop it to <body>.
  // It lands on the toolbar's stop instead (after the roving effect above has set it), unless it already went somewhere.
  useEffect(() => {
    const wanted = refocus.current;
    refocus.current = false;
    if (selecting || !wanted) return;
    const at = document.activeElement;
    if (at && at !== document.body && at.isConnected) return;
    const el = ref.current;
    const tools = el
      ? Array.from(el.querySelectorAll<HTMLElement>(TOOL)).filter(
          (t) => t.closest("[data-ch-toolbar]") === el,
        )
      : [];
    (tools.find((t) => t.tabIndex === 0) ?? tools[0])?.focus();
  }, [selecting]);

  const clear = () => {
    refocus.current = !!ref.current?.contains(document.activeElement);
    selection?.onClear();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape" && selecting) {
      e.preventDefault();
      clear();
      return;
    }
    // A key typed into a field inside the toolbar (a search) stays the field's.
    const at = e.target as HTMLElement;
    if (at.matches("input, select, textarea") && e.key !== "Escape") return;
    if (!many || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
      return;
    const all = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(TOOL),
    ).filter((t) => t.closest("[data-ch-toolbar]") === e.currentTarget);
    const from = all.findIndex((t) => t === at || t.contains(at));
    const to = rovingTarget(e.key, from, all.length);
    if (to === null || from < 0) return;
    e.preventDefault();
    all[to]?.focus();
  };

  // A toolbar that can select keeps its live region mounted (empty at rest), so the first count is announced: a region
  // that arrives already holding its words is not read.
  if (!children && !overflow?.length && !selection) return null;
  const n = selection?.count ?? 0;
  const body = (
    <>
      {selection && (
        <span
          className={selecting ? "ch-head__count ch-num" : "ch-sr-only"}
          role="status"
          aria-live="polite"
        >
          {selecting
            ? `${n} ${n === 1 ? selection.noun[0] : selection.noun[1]} selected`
            : ""}
        </span>
      )}
      {selecting ? (
        <>
          {selection!.actions}
          <IconButton
            data-ctl="CTL-P000-055"
            icon={X}
            label="Clear selection"
            onClick={clear}
          />
        </>
      ) : (
        <>
          {children}
          {overflow && overflow.length > 0 && (
            <Menu
              label={`More ${label.toLowerCase()}`}
              items={overflow}
              trigger={(t) => (
                <IconButton
                  data-ctl="CTL-P000-056"
                  icon={Ellipsis}
                  label="More"
                  menu={t}
                />
              )}
            />
          )}
        </>
      )}
    </>
  );
  const cls =
    "ch-head__tools" +
    (selecting ? " is-selecting" : "") +
    (className ? ` ${className}` : "");
  // A toolbar is a group of controls: with one it is that control, so it takes no role and no arrow keys.
  if (!many)
    return (
      <div ref={ref} className={cls} data-ch-toolbar="">
        {body}
      </div>
    );
  return (
    <div
      ref={ref}
      className={cls}
      role="toolbar"
      aria-label={label}
      data-ch-toolbar=""
      onKeyDown={onKeyDown}
    >
      {body}
    </div>
  );
}
