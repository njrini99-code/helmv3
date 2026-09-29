"use client";

import Link from "next/link";
import type { GolfUserData } from "@/contexts/golf-user-context";
import { useNotificationBadges } from "@/contexts/notification-badge-context";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import type { ChShellData } from "../data/shell";
import { activeNavItem, navFor, type ChNavItem } from "./nav";
import { NextEventCard } from "./NextEventCard";

export function badgeCount(
  item: ChNavItem,
  badges: { messages: number },
  shell: ChShellData,
): number | null {
  if (item.badge === "messages")
    return badges.messages > 0 ? badges.messages : null;
  if (item.badge === "joinRequests")
    return shell.pendingJoinRequests ? shell.pendingJoinRequests : null;
  return null;
}

export function Sidebar({
  userData,
  shell,
  pathname,
}: {
  userData: GolfUserData;
  shell: ChShellData;
  pathname: string;
}) {
  const badges = useNotificationBadges();
  const nav = navFor(userData.role);
  const current = activeNavItem(pathname, userData.role)?.id;
  const sections: Array<ChNavItem["section"]> = [undefined, "Team", "Program"];

  return (
    <aside className="ch-sidebar" aria-label="Sidebar">
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
            <span className="ch-brand__team">{userData.teamName}</span>
          )}
        </div>
      </div>

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
