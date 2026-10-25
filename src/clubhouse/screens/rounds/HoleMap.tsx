"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ChCourseHole } from "../../data/course-page-shape";
import { haptic, hapticScrub } from "../../lib/haptics";
import { formatFixed, formatToPar } from "../../lib/format";
import { Icon } from "../../ui/Icon";
import { ScoreMark } from "../../ui/ScoreMark";
import { Segmented } from "../../ui/Segmented";

/**
 * P-7 4.2.4: the course hole by hole. A map of 18 tiles, Out over In, tinted by the player's average to par there (D-42:
 * the red family under par, amber over, plain level, and level whenever the average is inside its noise), with a detail
 * panel for the picked hole; or the same as a list. On a phone the whole map is one scrub surface (tap or drag) with
 * 44 px steppers under it, because nine 44 px tiles cannot fit across (owner call 2); with a keyboard it is a radio group
 * (arrows a hole, up and down a nine, Home and End the ends).
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "June",
  "July",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];
const shortDay = (d: string) =>
  `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const spoken = (v: number) =>
  Math.abs(v) < 0.05
    ? "level"
    : `${v > 0 ? "plus" : "minus"} ${formatFixed(Math.abs(v), 1)}`;
/** "+0.8", "−0.3", or "E" when it rounds to 0.0. */
export const avgWords = (v: number) =>
  Math.abs(v) < 0.05 ? "E" : formatToPar(Math.round(v * 10) / 10);

/** The hole to work on: the highest average over par among the tinted holes; null when none is tinted over. */
export function mostToGain(holes: readonly ChCourseHole[]): number | null {
  const over = holes.filter(
    (h) =>
      (h.stats.tint === "o1" || h.stats.tint === "o2") && h.stats.avg != null,
  );
  if (!over.length) return null;
  return over.reduce((a, h) =>
    (h.stats.avg as number) > (a.stats.avg as number) ? h : a,
  ).n;
}

/** What a tile says to VoiceOver: "Hole 14, par 4, plus 0.8 average over 6 rounds, most to gain". */
export function tileLabel(h: ChCourseHole, gain: boolean): string {
  const s = h.stats;
  const par = h.par != null ? `, par ${h.par}` : "";
  if (s.n === 0) return `Hole ${h.n}, not played here`;
  if (s.n === 1)
    return `Hole ${h.n}${par}, played once, ${spoken(s.avg as number).replace("level", "level par")}`;
  const level = s.tint === "l" ? ", about level" : "";
  return `Hole ${h.n}${par}${level}, ${spoken(s.avg as number)} average over ${s.n} rounds${gain ? ", most to gain" : ""}`;
}

/** The facts under the detail, each only past its floor: "Fairway 3 of 5 · Green 2 of 6 · 1.8 putts". */
export function holeFacts(h: ChCourseHole): string | null {
  const s = h.stats;
  const out: string[] = [];
  if (s.fairways[1] >= 2)
    out.push(`Fairway ${s.fairways[0]} of ${s.fairways[1]}`);
  if (s.greens[1] >= 2) out.push(`Green ${s.greens[0]} of ${s.greens[1]}`);
  if (s.putts != null) out.push(`${formatFixed(s.putts, 1)} putts`);
  return out.length ? out.join(" · ") : null;
}

/** "Out · +1.4": the nine's sum of hole averages, only when every hole of it passes the show floor. */
function nineCaption(holes: readonly ChCourseHole[], label: string): string {
  if (
    holes.length &&
    holes.every((h) => h.stats.n >= 2 && h.stats.avg != null)
  ) {
    return `${label} · ${avgWords(holes.reduce((a, h) => a + (h.stats.avg as number), 0))}`;
  }
  return label;
}

const PILLS_MAX = 8;

export function HoleMap({
  holes,
  selected,
  onSelect,
  coverage,
  sample,
}: {
  holes: ChCourseHole[];
  selected: number;
  onSelect: (n: number) => void;
  coverage: string | null;
  sample: number;
}) {
  const [view, setView] = useState<"map" | "list">("map");
  const [allPlays, setAllPlays] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const scrub = useRef<{ active: boolean; last: number; at: number }>({
    active: false,
    last: 0,
    at: 0,
  });
  const gain = mostToGain(holes);
  const hole = holes.find((h) => h.n === selected) ?? holes[0]!;

  // Large Text Size: tiles 36 wide can't hold the type, so the list shows (Map stays available).
  useEffect(() => {
    try {
      const k =
        Number(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--ch-type-scale",
          ),
        ) || 1;
      if (k > 1.3) setView("list");
    } catch {
      /* no computed style (a test DOM): keep the map */
    }
  }, []);
  useEffect(() => setAllPlays(false), [selected]);

  const pick = (n: number) => {
    if (n !== selected) onSelect(n);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = selected - 1;
    const to =
      e.key === "ArrowRight"
        ? (i + 1) % 18
        : e.key === "ArrowLeft"
          ? (i + 17) % 18
          : e.key === "ArrowDown"
            ? (i + 9) % 18
            : e.key === "ArrowUp"
              ? (i + 9) % 18
              : e.key === "Home"
                ? 0
                : e.key === "End"
                  ? 17
                  : null;
    if (to == null) return;
    e.preventDefault();
    pick(to + 1);
    group.current
      ?.querySelector<HTMLElement>(`[data-hole="${to + 1}"]`)
      ?.focus();
  };
  // The scrub: the nearest tile under the finger; a step haptic each new hole, at most every 40 ms.
  const nearest = (e: PointerEvent<HTMLDivElement>): number | null => {
    const tiles = group.current?.querySelectorAll<HTMLElement>("[data-hole]");
    if (!tiles?.length) return null;
    let best: { n: number; d: number } | null = null;
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      const d = Math.hypot(
        e.clientX - (r.left + r.width / 2),
        e.clientY - (r.top + r.height / 2),
      );
      if (!best || d < best.d) best = { n: Number(t.dataset.hole), d };
    }
    return best?.n ?? null;
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    const n = nearest(e);
    if (n == null) return;
    scrub.current = { active: true, last: n, at: e.timeStamp };
    hapticScrub("start");
    pick(n);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!scrub.current.active) return;
    const n = nearest(e);
    if (n == null || n === scrub.current.last) return;
    scrub.current.last = n;
    if (e.timeStamp - scrub.current.at >= 40) {
      scrub.current.at = e.timeStamp;
      hapticScrub("step");
    }
    pick(n);
  };
  const onUp = () => {
    if (!scrub.current.active) return;
    scrub.current.active = false;
    hapticScrub("end");
  };
  const step = (d: 1 | -1) => {
    haptic("select");
    pick(((selected - 1 + d + 18) % 18) + 1);
  };

  const tile = (h: ChCourseHole) => {
    const s = h.stats;
    const on = h.n === selected;
    return (
      <button
        key={h.n}
        type="button"
        role="radio"
        aria-checked={on}
        tabIndex={on ? 0 : -1}
        data-hole={h.n}
        className={
          `ch-hmap-t is-${s.tint}` +
          (on ? " is-sel" : "") +
          (s.n === 0 ? " is-none" : s.n === 1 ? " is-once" : "") +
          (gain === h.n ? " is-gain" : "")
        }
        aria-label={tileLabel(h, gain === h.n)}
        onKeyDown={onKey}
        onClick={(e) => {
          // A finger has already picked it on the way down (the scrub); a click from a mouse or the keyboard picks it here.
          if (
            e.detail === 0 ||
            !scrub.current.last ||
            scrub.current.last !== h.n
          )
            pick(h.n);
        }}
      >
        <span className="ch-hmap-t__n ch-num">{h.n}</span>
        <b className="ch-num">
          {s.n === 0
            ? "–"
            : s.n === 1
              ? formatToPar(s.avg as number)
              : avgWords(s.avg as number)}
        </b>
        <span className="ch-hmap-t__p ch-num">
          {h.par != null ? `P${h.par}` : ""}
        </span>
      </button>
    );
  };

  const plays = hole.plays.slice(0, allPlays ? undefined : PILLS_MAX);
  const facts = holeFacts(hole);
  const reviewAt = (roundId: string) =>
    `/golf/dashboard/rounds/${roundId}?hole=${hole.n}`;

  return (
    <section className="ch-ch-sec" aria-labelledby="ch-hmap-h">
      <div className="ch-ch-sec__h">
        <h2 id="ch-hmap-h">Hole by hole</h2>
        <Segmented
          label="Show the holes as"
          size="sm"
          value={view}
          onChange={(v) => {
            haptic("select");
            setView(v);
          }}
          options={[
            { value: "map", label: "Map" },
            { value: "list", label: "List" },
          ]}
        />
      </div>
      <p className="ch-ch-sec__note">
        {coverage ??
          `From ${sample} ${sample === 1 ? "round" : "rounds"} with hole scores`}
      </p>
      {view === "map" ? (
        <>
          {/* The scrub surface wraps the group: pointer handlers here, the radios' keys on each radio. */}
          <div
            className="ch-hmap"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <div
              ref={group}
              role="radiogroup"
              aria-label="Hole by hole, average to par"
              aria-controls="ch-hmap-detail"
            >
              <span className="ch-hmap__cap" aria-hidden="true">
                {nineCaption(holes.slice(0, 9), "Out")}
              </span>
              <div className="ch-hmap__row">{holes.slice(0, 9).map(tile)}</div>
              <span className="ch-hmap__cap" aria-hidden="true">
                {nineCaption(holes.slice(9, 18), "In")}
              </span>
              <div className="ch-hmap__row">{holes.slice(9, 18).map(tile)}</div>
            </div>
          </div>
          <div className="ch-hmap__steps">
            <button
              type="button"
              className="ch-hmap__step"
              aria-label="Previous hole"
              onClick={() => step(-1)}
            >
              <Icon icon={ChevronLeft} size={20} />
            </button>
            <button
              type="button"
              className="ch-hmap__step"
              aria-label="Next hole"
              onClick={() => step(1)}
            >
              <Icon icon={ChevronRight} size={20} />
            </button>
          </div>
        </>
      ) : (
        <table className="ch-hmap-list">
          <thead>
            <tr>
              <th scope="col">Hole</th>
              <th scope="col">Par</th>
              <th scope="col">Average</th>
              <th scope="col">Best</th>
              <th scope="col">Times</th>
            </tr>
          </thead>
          <tbody>
            {holes.map((h) => (
              <tr
                key={h.n}
                className={h.n === selected ? "is-sel" : undefined}
                aria-selected={h.n === selected}
              >
                <th scope="row">
                  <button
                    type="button"
                    className="ch-hmap-list__go"
                    onClick={() => pick(h.n)}
                    aria-label={tileLabel(h, gain === h.n)}
                  >
                    {h.n}
                  </button>
                </th>
                <td className="ch-num">{h.par ?? "–"}</td>
                <td className="ch-num">
                  <i
                    className={`ch-hmap-list__dot is-${h.stats.tint}`}
                    aria-hidden="true"
                  />
                  {h.stats.n === 0
                    ? "Not played"
                    : avgWords(h.stats.avg as number)}
                </td>
                <td className="ch-num">
                  {h.stats.best == null ? "–" : formatToPar(h.stats.best)}
                </td>
                <td className="ch-num">{h.stats.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div id="ch-hmap-detail" className="ch-hmap-d">
        <div className="ch-hmap-d__h">
          <h3>Hole {hole.n}</h3>
          <span className="ch-num">
            {[
              hole.par != null ? `par ${hole.par}` : null,
              hole.yards ? `${hole.yards} yards` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {gain === hole.n && (
            <span className="ch-hmap-d__tag">Most to gain</span>
          )}
        </div>
        {hole.stats.n === 0 ? (
          <p className="ch-hmap-d__s">Not played here yet.</p>
        ) : (
          <p className="ch-hmap-d__v">
            <b className="ch-num">
              {hole.stats.n === 1
                ? formatToPar(hole.stats.avg as number)
                : avgWords(hole.stats.avg as number)}
            </b>
            <span>
              {hole.stats.n === 1
                ? "played once"
                : hole.stats.state === "early"
                  ? `Early read · ${hole.stats.n} times`
                  : `average to par · ${hole.stats.n} times`}
            </span>
          </p>
        )}
        {plays.length > 0 && (
          <div className="ch-hmap-d__plays">
            {plays.map((p) => (
              <Link
                key={p.roundId}
                className="ch-hmap-d__pill"
                href={reviewAt(p.roundId)}
                aria-label={`${shortDay(p.date)}: ${p.score} on par ${p.par}. Open the round at this hole`}
              >
                <ScoreMark score={p.score} par={p.par} size="sm" />
                <span className="ch-num">{shortDay(p.date)}</span>
              </Link>
            ))}
            {!allPlays && hole.plays.length > PILLS_MAX && (
              <button
                type="button"
                className="ch-hmap-d__all"
                onClick={() => setAllPlays(true)}
              >
                All {hole.plays.length}
              </button>
            )}
          </div>
        )}
        {facts && <p className="ch-hmap-d__f">{facts}</p>}
      </div>
    </section>
  );
}
