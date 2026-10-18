"use client";

import Link from "next/link";
import { LinkPending } from "./LinkPending";
import type { GolfUserData } from "@/contexts/golf-user-context";
import { useNotificationBadges } from "@/contexts/notification-badge-context";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import type { ChShellData } from "../data/shell";
import { activeNavItem, CH_NAV_SECTIONS, navFor } from "./nav";
import { NavPlate } from "./NavPlate";
import { NextEventCard } from "./NextEventCard";
import { ResumeRoundCard } from "./Dock";
import { badgeCount } from "./badge-count";
import { TeamSwitch } from "./TeamSwitch";
import type { ChTeamSwitch } from "./team-switch";
import { BrandLine, useBrandWrite } from './BrandWord';
import { RailTip, useRailTip } from './RailTip';

export { badgeCount };

export function Sidebar({
  userData,
  shell,
  pathname,
  teamSwitch = null,
  folded = false,
}: {
  userData: GolfUserData;
  shell: ChShellData;
  pathname: string;
  /** The coach's teams when they can switch among them; the team line is a plain label without it. */
  teamSwitch?: ChTeamSwitch | null;
  /** Folded to the icon rail (RailToggle): the labels give way to a name tip on hover and focus. */
  folded?: boolean;
}) {
  const badges = useNotificationBadges();
  const nav = navFor(userData.role);
  const current = activeNavItem(pathname, userData.role)?.id;
  const sections = CH_NAV_SECTIONS;

  const brandWrite = useBrandWrite();
  const tip = useRailTip(folded);
  return (
    <aside className="ch-sidebar" id="ch-sidebar" aria-label="Sidebar">
      {/* The brand alone (owner, 2026-10-16: "put the team name somewhere else"): the team heads its own group below. */}
      <div className="ch-brand">
        <BrandLine write={brandWrite} />
      </div>

      <nav className="ch-nav" aria-label="Main" {...tip.handlers}>
        <NavPlate />
        {sections.map((section) => {
          const items = nav.filter((i) => i.section === section);
          if (!items.length) return null;
          return (
            <div key={section ?? "main"} className="ch-nav__group">
              {section && (
              // On the rail a group's heading gives way to a short rule, and takes no focus or taps (inert).
              <div className="ch-nav__head" inert={folded || undefined}>
              {section === "Team" ? (
                // The Team group is headed by the team itself; a head coach on more than one team switches here.
                teamSwitch ? (
                  <TeamSwitch model={teamSwitch} teamName={userData.teamName ?? null} />
                ) : userData.teamName ? (
                  <div className="ch-nav__section ch-nav__team">
                    <span data-ch-code="CH-1305">{userData.teamName}</span>
                  </div>
                ) : (
                  <div className="ch-nav__section">{section}</div>
                )
              ) : (
                <div className="ch-nav__section">{section}</div>
              )}
              </div>
              )}
              {items.map((i) => {
                const count = badgeCount(i, badges, shell);
                return (
                  <Link
                    key={i.id}
                    href={i.href}
                    // RouteFrame restores the scroll (SectionStrip says why Next's is off).
                    scroll={false}
                    className="ch-navitem"
                    data-label={i.label}
                    aria-current={current === i.id ? "page" : undefined}
                  >
                    <Icon icon={i.icon} size={16} />
                    <span className="ch-navitem__label">{i.label}</span>
                    {count != null && (
                      <span className="ch-navitem__count ch-num">{count}</span>
                    )}
                    <LinkPending />
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <RailTip tip={tip.shown} />

      {/* On the rail the card folds away (inert while it is hidden) and the avatar stays. */}
      <div className="ch-sidebar__foot">
        {/* A player's round in progress takes the card slot (P001-C1); otherwise the team's next event. */}
        <div className="ch-sidebar__card" inert={folded || undefined}>
          {shell.roundInProgress ? <ResumeRoundCard round={shell.roundInProgress} /> : shell.nextEvent && <NextEventCard event={shell.nextEvent} />}
        </div>
        <div className="ch-identity">
          <Avatar name={userData.name} size={30} />
          <div className="ch-identity__txt">
            <span className="ch-identity__name">{userData.name}</span>
            <span className="ch-identity__meta">
              {userData.role === "coach" ? "Coach" : "Player"}
              {userData.teamName ? ` · ${userData.teamName}` : ""}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
