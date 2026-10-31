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
import { LifeBuoy, LogOut, Settings, Users } from "lucide-react";
import { Menu, type MenuItem } from "../ui/Menu";
import { useToast } from "../ui/Toast";
import { haptic } from "../lib/haptics";
import { chSignOut } from "../lib/sign-out";
import { SIGN_OUT_FAILED } from "../lib/sign-out-copy";
import { chReport } from "../lib/track";
import { TeamSwitch } from "./TeamSwitch";
import { useTeamSwitch, type ChTeamSwitch } from "./team-switch";
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
  const nav = navFor(userData.role, shell);
  const current = activeNavItem(pathname, userData.role, shell)?.id;
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
        {teamSwitch ? (
          <IdentityMenuWithTeams userData={userData} headCoach={!!shell.viewerIsHeadCoach} teamSwitch={teamSwitch} />
        ) : (
          <IdentityMenu userData={userData} headCoach={!!shell.viewerIsHeadCoach} />
        )}
      </div>
    </aside>
  );
}

/** Help in the account menu is Settings' Help and legal card, as on the phone's account sheet. */
const HELP_HREF = "/golf/dashboard/settings#set-help";

/** A head coach on more than one team: the account menu lists the teams too, the current one ticked (useTeamSwitch). */
function IdentityMenuWithTeams({ userData, headCoach, teamSwitch }: { userData: GolfUserData; headCoach: boolean; teamSwitch: ChTeamSwitch }) {
  const sw = useTeamSwitch(teamSwitch);
  const teams: MenuItem[] = teamSwitch.choices.map((c) => ({ label: c.label, icon: Users, checked: c.id === sw.shownId, onSelect: () => sw.pick(c.id) }));
  return <IdentityMenu userData={userData} headCoach={headCoach} teams={teams} />;
}

/**
 * Who is signed in, at the sidebar's foot (B11): a menu key with Settings, the coach's teams when they can switch, Help and
 * Sign out, the desktop's version of the phone's account sheet. Closed, it looks as the static block did; on the folded
 * rail the avatar is the key. Sign out is the one way everywhere (lib/sign-out.ts), its failure the same toast.
 */
function IdentityMenu({ userData, headCoach, teams = [] }: { userData: GolfUserData; headCoach: boolean; teams?: MenuItem[] }) {
  const toast = useToast();
  const signOut = async () => {
    try {
      await chSignOut();
    } catch (err) {
      chReport(err, { surface: "shell.identity", action: "signOut" });
      haptic("error");
      toast({ tone: "error", title: SIGN_OUT_FAILED.title, body: SIGN_OUT_FAILED.body, action: { label: SIGN_OUT_FAILED.retry, run: () => void signOut() } });
    }
  };
  const items: MenuItem[] = [
    { label: "Settings", icon: Settings, href: "/golf/dashboard/settings" },
    ...(teams.length ? [{ kind: "separator" } as const, ...teams, { kind: "separator" } as const] : []),
    { label: "Help", icon: LifeBuoy, href: HELP_HREF },
    { label: "Sign out", icon: LogOut, onSelect: () => void signOut() },
  ];
  return (
    <Menu
      label="Account"
      align="start"
      items={items}
      trigger={(t) => (
        <button
          ref={t.ref}
          type="button"
          className="ch-identity"
          aria-label={`${userData.name}. Account`}
          aria-expanded={t["aria-expanded"]}
          aria-haspopup={t["aria-haspopup"]}
          aria-controls={t["aria-expanded"] ? t["aria-controls"] : undefined}
          onClick={t.onClick}
        >
          <Avatar name={userData.name} size={30} />
          <span className="ch-identity__txt">
            <span className="ch-identity__name">{userData.name}</span>
            <span className="ch-identity__meta">
              {userData.role === "coach" ? (headCoach ? "Head coach" : "Coach") : "Player"}
              {userData.teamName ? ` · ${userData.teamName}` : ""}
            </span>
          </span>
        </button>
      )}
    />
  );
}
