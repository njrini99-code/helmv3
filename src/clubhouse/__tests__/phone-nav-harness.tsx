import type { ChShellData } from '../data/shell';
import { AccountSheet } from '../shell/AccountSheet';
import type { ChRole } from '../shell/nav';
import { SectionStrip } from '../shell/SectionStrip';
import { SectionSwitchProvider, SectionTrigger } from '../shell/section-switch';
import type { ChTeamSwitch } from '../shell/team-switch';

/**
 * The phone navigation as the frame mounts it (section-strip.md): the switcher's provider, the section title, the strip
 * and the account sheet its last pill opens. The tests' stand-in for the tab bar that was.
 */
export function PhoneNav({
  pathname,
  shell,
  role,
  user = { name: 'Coach Rivera' },
  teamSwitch = null,
  title = 'Home',
}: {
  pathname: string;
  shell: ChShellData;
  role: ChRole;
  user?: { name: string; teamName?: string | null };
  teamSwitch?: ChTeamSwitch | null;
  title?: string;
}) {
  return (
    <SectionSwitchProvider pathname={pathname} role={role} shell={shell}>
      <SectionTrigger>{title}</SectionTrigger>
      <SectionStrip pathname={pathname} role={role} user={{ name: user.name }} />
      <AccountSheet pathname={pathname} role={role} user={user} teamSwitch={teamSwitch} />
    </SectionSwitchProvider>
  );
}
