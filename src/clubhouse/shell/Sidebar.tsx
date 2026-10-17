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

export { badgeCount };

export function Sidebar({
  userData,
  shell,
  pathname,
  teamSwitch = null,
}: {
  userData: GolfUserData;
  shell: ChShellData;
  pathname: string;
  /** The coach's teams when they can switch among them; the team line is a plain label without it. */
  teamSwitch?: ChTeamSwitch | null;
}) {
  const badges = useNotificationBadges();
  const nav = navFor(userData.role);
  const current = activeNavItem(pathname, userData.role)?.id;
  const sections = CH_NAV_SECTIONS;

  const brandWrite = useBrandWrite();
  return (
    <aside className="ch-sidebar" aria-label="Sidebar">
      {/* The brand alone (owner, 2026-10-16: "put the team name somewhere else"): the team heads its own group below. */}
      <div className="ch-brand">
        <BrandLine write={brandWrite} />
      </div>

      <nav className="ch-nav" aria-label="Main">
        <NavPlate />
        {sections.map((section) => {
          const items = nav.filter((i) => i.section === section);
          if (!items.length) return null;
          return (
            <div key={section ?? "main"} className="ch-nav__group">
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
                section && <div className="ch-nav__section">{section}</div>
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
                    aria-current={current === i.id ? "page" : undefined}
                  >
                    <Icon icon={i.icon} size={16} />
                    <span>{i.label}</span>
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

      <div className="ch-sidebar__foot">
        {/* A player's round in progress takes the card slot (P001-C1); otherwise the team's next event. */}
        {shell.roundInProgress ? <ResumeRoundCard round={shell.roundInProgress} /> : shell.nextEvent && <NextEventCard event={shell.nextEvent} />}
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
