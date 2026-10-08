"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Flag } from "lucide-react";
import type { DistancePreference } from "@/lib/golf/distance-units";
import type { RoundHole, ShotRecord } from "@/lib/types/golf";
import { formatToPar } from "../../../lib/format";
import { haptic } from "../../../lib/haptics";
import { Icon } from "../../../ui/Icon";
import { ScoreMark } from "../../../ui/ScoreMark";
import {
  centerLine,
  holeShape,
  plotShots,
  pointAlong,
  ringRadius,
  type ChHoleFrame,
} from "./hole-geometry";
import {
  distanceText,
  RESULT_LABEL,
  roundSoFar,
  shotLine,
  shotTitle,
} from "./labels";

/** A one-of-several choice (radiogroup, CH-11806: named for what it chooses). A `rare` option is drawn quieter; `note` is its small second line. */
export function Seg<T extends string>({
  label,
  value,
  onChange,
  options,
  cols,
}: {
  label: string;
  value: T | null | undefined;
  onChange: (v: T) => void;
  options: Array<{
    value: T;
    label: string;
    note?: string | null;
    rare?: boolean;
  }>;
  cols?: number;
}) {
  return (
    <div
      className={"ch-rt-seg" + (cols ? " ch-rt-seg--grid" : "")}
      role="radiogroup"
      aria-label={label}
      style={
        cols
          ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={o.rare ? "is-rare" : undefined}
          onClick={() => {
            // CH-11705: a choice is a selection tick.
            haptic("select");
            onChange(o.value);
          }}
        >
          {o.label}
          {o.note && <em>{o.note}</em>}
        </button>
      ))}
    </div>
  );
}

/** A section of the entry panel, with its label and an optional Optional / Required hint. */
export function Sec({
  label,
  hint,
  tint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: "Optional" | "Required";
  tint?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={"ch-rt-sec" + (tint ? " is-tint" : "")}
      aria-label={htmlFor ? undefined : label}
    >
      <div className="ch-rt-sec__h">
        {htmlFor ? (
          <label htmlFor={htmlFor}>{label}</label>
        ) : (
          <span>{label}</span>
        )}
        {hint && (
          <em
            className={
              "ch-rt-hint" + (hint === "Required" ? " is-required" : "")
            }
          >
            {hint}
          </em>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * The hole strip under the top bar: each hole's score against par, the current
 * hole ringed, the round's score to par at the end. A hole you can go to is a
 * button (any earlier hole, a later one with a score, and the next unplayed);
 * the rest are marks. CH-11805: each is named "Hole 4, 5 strokes" or "Hole 6".
 */
export function TrackStrip({
  holes,
  current,
  onJump,
}: {
  holes: RoundHole[];
  current: number;
  onJump?: (index: number) => void;
}) {
  const frontier = holes.findIndex((h) => h.score === null);
  const soFar = roundSoFar(holes);
  return (
    <div
      className="ch-rt-strip"
      style={{ ["--ch-rt-holes" as string]: holes.length }}
    >
      {holes.map((h, i) => {
        const cls =
          "ch-rt-strip__h" +
          (i === current ? " is-cur" : "") +
          (h.score != null ? " is-done" : "");
        const name = `Hole ${h.number}${h.score != null ? `, ${h.score} strokes` : ""}${i === current ? ", current hole" : ""}`;
        const inner = (
          <>
            <em>{h.number}</em>
            {h.score != null ? (
              <ScoreMark score={h.score} par={h.par} size="sm" />
            ) : (
              <b aria-hidden="true">{i === current ? "•" : ""}</b>
            )}
          </>
        );
        const canGo =
          !!onJump &&
          i !== current &&
          (i < current || h.score != null || i === frontier);
        return canGo ? (
          <button
            key={h.number}
            type="button"
            className={cls}
            aria-label={`Go to hole ${h.number}${h.score != null ? `, ${h.score} strokes` : ""}`}
            onClick={() => onJump!(i)}
          >
            {inner}
          </button>
        ) : (
          <span
            key={h.number}
            className={cls}
            role="img"
            aria-label={name}
            aria-current={i === current ? "step" : undefined}
          >
            {inner}
          </span>
        );
      })}
      <div className="ch-rt-strip__tot">
        <em>Thru {soFar.thru}</em>
        <b>{soFar.toPar == null ? "E" : formatToPar(soFar.toPar)}</b>
      </div>
    </div>
  );
}

/** Where a shot finished, as the log and the map colour it. */
export function lieClass(shot: ShotRecord): string {
  if (shot.isPenalty) return "is-penalty";
  return `is-${shot.result}`;
}

/** A shot's label on the course view: its club or kind, and how far it went when that is in yards. */
function mapLabel(shot: ShotRecord, pref: DistancePreference): string {
  const what =
    shot.shotType === "tee"
      ? shot.clubType === "driver"
        ? "Driver"
        : "Tee shot"
      : shotTitle(shot);
  return shot.distanceUnitBefore === "yards" && shot.shotDistance > 0
    ? `${what} · ${distanceText(Math.round(shot.shotDistance), "yards", pref)}`
    : what;
}

/**
 * The hole, drawn (owner board 3 and 3b): the par's shape, not the course's (Q-72c, the course-factory view is on
 * hold), with every shot so far placed by the yards it left (hole-geometry.ts). A solid line for each shot played, a
 * dashed line from the ball to the pin while the hole is open, and numbered stops: each number is the stroke played
 * from there. `wide` is the shot screen's hero; `tall` is the course view and the desktop side map, which can also draw
 * the 50/100/150 rings from the pin (scaled from the hole's yardage) and each shot's club and distance.
 * CH-11808: named in words.
 */
export function HoleMap({
  hole,
  shots,
  pending,
  frame,
  className,
  rings,
  labels,
  ball,
}: {
  hole: RoundHole;
  shots: ShotRecord[];
  pending: boolean;
  frame: ChHoleFrame;
  className?: string;
  /** The yardage rings, in the player's unit. */
  rings?: DistancePreference;
  /** Each played shot's club and distance, in the player's unit. */
  labels?: DistancePreference;
  /** The ball's distance to the pin while the hole is open ("150 yds"), drawn beside the ball on the tall frame. */
  ball?: string | null;
}) {
  const id = useId().replace(/:/g, "");
  const s = holeShape(hole.par, frame);
  const line = centerLine(s);
  const { plotted, ball: at } = plotShots(s, hole, shots);
  const holed =
    plotted.length > 0 && plotted[plotted.length - 1]!.shot.result === "hole";
  const open = pending && !holed;
  const stops = plotted.map((p) => ({ n: p.n, at: p.from }));
  if (open) stops.push({ n: shots.length + 1, at });
  const trees = [0.14, 0.32, 0.5, 0.68, 0.84].flatMap((f, i) => {
    const p = pointAlong(s, f);
    const d = s.fairway * (frame === "wide" ? 1.25 : 1.35);
    const r = (frame === "wide" ? 13 : 19) + (i % 3) * 3;
    return [
      { x: p.x + p.nx * d, y: p.y + p.ny * d, r },
      { x: p.x - p.nx * (d + 6), y: p.y - p.ny * (d + 6), r: r - 2 },
    ];
  });
  const bunkerA = pointAlong(s, hole.par === 3 ? 0.8 : 0.58);
  const bunkerB = pointAlong(s, 0.93);
  const sand = (p: ReturnType<typeof pointAlong>, side: number, k: number) => ({
    cx: p.x + p.nx * side * k,
    cy: p.y + p.ny * side * k,
  });
  const rs = s.frame === "wide" ? 0.55 : 0.6;
  const unit = rings === "meters" ? 1.0936 : 1;
  const ringList = rings
    ? [50, 100, 150]
        .map((v) => ({ v, r: ringRadius(s, v * unit, hole.yardage) }))
        .filter((x): x is { v: number; r: number } => x.r != null)
    : [];
  const name = `Hole ${hole.number}, par ${hole.par}: ${plotted.length === 0 ? "no shots yet" : `${plotted.length} shot${plotted.length === 1 ? "" : "s"} so far${holed ? ", holed" : ""}`}`;
  return (
    <svg
      viewBox={`0 0 ${s.w} ${s.h}`}
      preserveAspectRatio="xMidYMid slice"
      className={
        "ch-rt-map ch-rt-map--" + frame + (className ? " " + className : "")
      }
      role="img"
      aria-label={name}
    >
      <defs>
        <pattern
          id={`ch-rt-mow-${id}`}
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform={frame === "wide" ? "rotate(40)" : "rotate(8)"}
        >
          <rect width="14" height="14" className="ch-rt-map__mow-a" />
          <rect width="7" height="14" className="ch-rt-map__mow-b" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={s.w} height={s.h} className="ch-rt-map__bg" />
      <g className="ch-rt-map__tree">
        {trees.map((t, i) => (
          <circle key={i} cx={t.x} cy={t.y} r={t.r} />
        ))}
      </g>
      <path
        d={line}
        className="ch-rt-map__rough"
        style={{ strokeWidth: s.fairway * 1.42 }}
      />
      <path
        d={line}
        className="ch-rt-map__fairway"
        stroke={`url(#ch-rt-mow-${id})`}
        style={{ strokeWidth: s.fairway }}
      />
      {hole.par !== 3 && (
        <ellipse
          {...sand(bunkerA, 1, s.fairway * rs)}
          rx={s.fairway * 0.2}
          ry={s.fairway * 0.13}
          className="ch-rt-map__sand"
        />
      )}
      <ellipse
        {...sand(bunkerB, -1, s.green.rx * 1.05)}
        rx={s.fairway * 0.16}
        ry={s.fairway * 0.11}
        className="ch-rt-map__sand"
      />
      <ellipse
        cx={s.pin.x}
        cy={s.pin.y}
        rx={s.green.rx + 6}
        ry={s.green.ry + 5}
        className="ch-rt-map__fringe"
      />
      <ellipse
        cx={s.pin.x}
        cy={s.pin.y}
        rx={s.green.rx}
        ry={s.green.ry}
        className="ch-rt-map__green"
      />
      {ringList.map((r) => (
        <g key={r.v}>
          <circle
            cx={s.pin.x}
            cy={s.pin.y}
            r={r.r}
            className="ch-rt-map__ring"
          />
          <text
            x={s.pin.x - r.r * 0.94}
            y={s.pin.y + r.r * 0.34}
            className="ch-rt-map__ringl"
            textAnchor="middle"
          >
            {r.v}
          </text>
        </g>
      ))}
      <rect
        x={s.tee.x - 10}
        y={s.tee.y - 4}
        width="20"
        height="8"
        rx="2.5"
        className="ch-rt-map__tee"
      />
      {plotted.map((p) => (
        <line
          key={p.n}
          x1={p.from.x}
          y1={p.from.y}
          x2={p.to.x}
          y2={p.to.y}
          className="ch-rt-map__shot"
        />
      ))}
      {open && (
        <line
          x1={at.x}
          y1={at.y}
          x2={s.pin.x}
          y2={s.pin.y}
          className="ch-rt-map__aim"
        />
      )}
      <line
        x1={s.pin.x}
        y1={s.pin.y}
        x2={s.pin.x}
        y2={s.pin.y - (frame === "wide" ? 24 : 32)}
        className="ch-rt-map__pole"
      />
      <path
        d={`M${s.pin.x},${s.pin.y - (frame === "wide" ? 24 : 32)} l${frame === "wide" ? 13 : 16},4.5 l-${frame === "wide" ? 13 : 16},4.5 z`}
        className="ch-rt-map__flag"
      />
      <circle cx={s.pin.x} cy={s.pin.y} r="2.4" className="ch-rt-map__cup" />
      {labels &&
        plotted
          .filter((p) => Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y) > 70)
          .map((p) => {
            const text = mapLabel(p.shot, labels);
            const w = text.length * 6.6 + 20;
            const mx = (p.from.x + p.to.x) / 2 + 16;
            const my = (p.from.y + p.to.y) / 2;
            return (
              <g key={p.n} className="ch-rt-map__label">
                <rect x={mx} y={my - 13} width={w} height="26" rx="13" />
                <text x={mx + w / 2} y={my + 4.5} textAnchor="middle">
                  {text}
                </text>
              </g>
            );
          })}
      {stops.map((st, i) => {
        const cur = open && i === stops.length - 1;
        const r = frame === "wide" ? (cur ? 7.5 : 7) : 11;
        return (
          <g key={st.n} className={"ch-rt-map__stop" + (cur ? " is-cur" : "")}>
            {cur && (
              <circle
                cx={st.at.x}
                cy={st.at.y}
                r={r + 7}
                className="ch-rt-map__halo"
              />
            )}
            <circle cx={st.at.x} cy={st.at.y} r={r} />
            <text
              x={st.at.x}
              y={st.at.y + (frame === "wide" ? 3.5 : 4.5)}
              textAnchor="middle"
              className="ch-rt-map__n"
            >
              {st.n}
            </text>
          </g>
        );
      })}
      {frame === "tall" && open && ball && (
        <g className="ch-rt-map__left">
          <rect
            x={at.x + 24}
            y={at.y - 14}
            width={ball.length * 8.4 + 22}
            height="28"
            rx="14"
          />
          <text
            x={at.x + 24 + (ball.length * 8.4 + 22) / 2}
            y={at.y + 5}
            textAnchor="middle"
          >
            {ball}
          </text>
        </g>
      )}
    </svg>
  );
}

/**
 * The hole's shots so far, folded to one line (dots and the last shot) and
 * opened to every shot. CH-11308: before the first shot it says so. CH-11602:
 * the rows show at once (hidden from a screen reader while folded) and the
 * chevron turns (base, ease-out); it doesn't turn with reduced motion.
 */
export function ShotLog({
  shots,
  pref,
}: {
  shots: ShotRecord[];
  pref: DistancePreference;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (!shots.length)
    return (
      <div className="ch-rt-log is-empty" data-ch-code="CH-11308">
        <Icon icon={Flag} size={14} />
        No shots yet on this hole
      </div>
    );
  const last = shots[shots.length - 1]!;
  const penalties = shots.filter((s) => s.isPenalty).length;
  const lastText = last.isPenalty
    ? shotTitle(last)
    : `${shotTitle(last)} → ${RESULT_LABEL[last.result]}${last.result !== "hole" ? `, ${distanceText(last.distanceToHoleAfter, last.distanceUnitAfter, pref)}` : ""}`;
  return (
    <div className={"ch-rt-log" + (open ? " is-open" : "")}>
      <button
        type="button"
        className="ch-rt-log__h"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
      >
        <span className="ch-rt-log__dots" aria-hidden="true">
          {shots.map((s, i) => (
            <i key={i} className={lieClass(s)}>
              {s.isPenalty ? "P" : s.shotNumber}
            </i>
          ))}
        </span>
        <span className="ch-rt-log__t">
          <b>
            {shots.length} stroke{shots.length === 1 ? "" : "s"}
            {penalties
              ? ` · ${penalties} penalt${penalties === 1 ? "y" : "ies"}`
              : ""}
          </b>
          <em>Last: {lastText}</em>
        </span>
        <Icon icon={ChevronDown} size={16} className="ch-rt-log__chev" />
      </button>
      <div className="ch-rt-log__b" id={bodyId} hidden={!open}>
        <ol>
          {shots.map((s, i) => (
            <li key={i} className="ch-rt-log__r">
              <span
                className={"ch-rt-log__n " + lieClass(s)}
                aria-hidden="true"
              >
                {s.isPenalty ? "P" : s.shotNumber}
              </span>
              <span className="ch-rt-log__rb">
                <b>{shotTitle(s)}</b>
                <em>{shotLine(s, pref)}</em>
              </span>
              {s.isPenalty && <strong>+1</strong>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
