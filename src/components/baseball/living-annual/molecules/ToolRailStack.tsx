/**
 * ToolRailStack — a player's 20-80 tool card (spec §7, §6 #10 Decision Room).
 *
 * A vertical stack of `<ToolRail>`s — one per tool (HIT / POWER / RUN / ARM /
 * FIELD) — each drawing its baseline rule and placing a present pip (+ optional
 * future/ceiling pip) on mount. `compare` overlays a second athlete on the SAME
 * rails (the Decision Room compare): the primary reads team green, the compared
 * player reads clay, so the louder tool is visible before a digit. A tool with
 * `present: false` (not yet earned) dims to a projection.
 *
 * No hooks / handlers — safe in a server component.
 */
import { cn } from '@/lib/utils';
import { ToolRail } from '..';

export interface ToolRailStackTool {
  /** Tool name, hung left, e.g. `POWER`. */
  tool: string;
  /** Present 20-80 grade (filled pip). */
  value: number;
  /** Graded yet? `false` dims the rail to a projection. */
  present?: boolean;
  /** Projected / ceiling grade (hollow pip + connector). */
  future?: number;
}

export interface ToolRailStackProps {
  tools: Array<ToolRailStackTool>;
  /** A second athlete overlaid on the same rails (clay), matched by tool name. */
  compare?: Array<{ tool: string; value: number }>;
  className?: string;
}

export function ToolRailStack({ tools, compare, className }: ToolRailStackProps) {
  const compareMap = new Map((compare ?? []).map((c) => [c.tool, c.value]));

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {tools.map((t, i) => {
        const cmp = compareMap.get(t.tool);
        return (
          <ToolRail
            key={`${t.tool}-${i}`}
            label={t.tool}
            value={t.value}
            future={t.future}
            ink="team"
            compare={cmp != null ? { value: cmp, ink: 'pursuit' } : undefined}
            className={t.present === false ? 'opacity-45' : undefined}
          />
        );
      })}
    </div>
  );
}
