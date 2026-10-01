"use client";

import Link from "next/link";
import type { GolfUserData } from "@/contexts/golf-user-context";
import { useNotificationBadges } from "@/contexts/notification-badge-context";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import type { ChShellData } from "../data/shell";
import { activeNavItem, CH_NAV_SECTIONS, navFor, type ChNavItem } from "./nav";
import { NextEventCard } from "./NextEventCard";
import { BrandTeamSwitch } from "./TeamSwitch";
import type { ChTeamSwitch } from "./team-switch";

export function badgeCount(
  item: ChNavItem,
  badges: { messages: number; announcements: number; tasks: number; travel: number },
  shell: ChShellData,
): number | null {
  if (item.badge === "messages")
    return badges.messages > 0 ? badges.messages : null;
  if (item.badge === "hub") {
    // The same sum as the current app's Team Hub badge (src/lib/golf/nav-registry.ts).
    const n = badges.announcements + badges.tasks + badges.travel;
    return n > 0 ? n : null;
  }
  if (item.badge === "joinRequests")
    return shell.pendingJoinRequests ? shell.pendingJoinRequests : null;
  return null;
}

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

  return (
    <aside className="ch-sidebar" aria-label="Sidebar">
      {teamSwitch ? (
        <BrandTeamSwitch model={teamSwitch} teamName={userData.teamName ?? null} />
      ) : (
        <div className="ch-brand">
          <img
            src="/helm-main-logo-transparent-white-trim.png"
            alt=""
            width={32}
            height={32}
          />
          <div className="ch-brand__txt">
            <span className="ch-brand__word">GolfHelm</span>
            {userData.teamName && (
              <span className="ch-brand__team" data-ch-code="CH-1305">
                {userData.teamName}
              </span>
            )}
          </div>
        </div>
      )}

      <nav className="ch-nav" aria-label="Main">
        {sections.map((section) => {
          const items = nav.filter((i) => i.section === section);
          if (!items.length) return null;
          return (
            <div key={section ?? "main"} className="ch-nav__group">
              {section && <div className="ch-nav__section">{section}</div>}
              {items.map((i) => {
                const count = badgeCount(i, badges, shell);
                return (
                  <Link
                    key={i.id}
                    href={i.href}
                    className="ch-navitem"
                    aria-current={current === i.id ? "page" : undefined}
                  >
                    <Icon icon={i.icon} size={16} />
                    <span>{i.label}</span>
                    {count != null && (
                      <span className="ch-navitem__count ch-num">{count}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="ch-sidebar__foot">
        {shell.nextEvent && <NextEventCard event={shell.nextEvent} />}
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
