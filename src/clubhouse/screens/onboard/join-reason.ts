/**
 * Why a finished player is not on the team their code named, in words that say what to do next. The server's own
 * sentence (`processGolfTeamInvitation`) is read for its kind; nothing here decides who may join.
 */
export function joinReason(error: string | null | undefined): { sub: string; onAnotherTeam: boolean } {
  const e = (error ?? '').trim();
  if (/already on|one team/i.test(e)) {
    return {
      onAnotherTeam: true,
      sub: `${e.endsWith('.') ? e : `${e}.`} Your profile is saved. To move teams, leave your current team in Settings, or ask your coach to move you.`,
    };
  }
  if (/invalid join code|team not found/i.test(e)) {
    return { onAnotherTeam: false, sub: 'That code didn’t match a team. Your coach may have made a new one: ask them to resend it, then enter it here.' };
  }
  return { onAnotherTeam: false, sub: 'We couldn’t add you to your coach’s team with that code. Ask your coach to resend it, or enter the team code again.' };
}
