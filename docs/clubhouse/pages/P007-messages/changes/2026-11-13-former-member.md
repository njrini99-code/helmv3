# 2026-11-13 — a DM with a former member reads "Former member", read-only

## 2026-11-13 — No more "Conversation member"

```text
Design package: none (coach audit, 13 Nov 2026, §6 Messages)
PR/commit:      agent/coach-fix-shell
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- A direct message whose other person has no player or coach profile and is not
  in the team's directory (`isFormerMember`) reads "Former member", "No longer
  on the team". Its coin has no initials (`convAvatarName`). Two DMs from 11 Feb
  on Guilford's copy had read "Conversation member", "CM", "Message
  Conversation".
- Its composer is read-only: "Replies are off", and under it "They're no longer
  on the team, so this conversation is read-only." Nothing sends.
- Fairway's own fallback (`use-golf-messages`, `getGolfConversationParticipantIdentities`)
  is unchanged.
