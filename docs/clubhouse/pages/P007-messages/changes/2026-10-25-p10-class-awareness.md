# 2026-10-25 — Class awareness (P-10): the thread header status

```text
Design package: P-10 Class awareness (plan 2026-10-24, changelog 2026-10-25)
PR/commit: branch claude/clubhouse-class-awareness
Contract IDs: none (no new CH code in this slice)
Actions: none
Data impact: reads golf_team_class_day through the shared cache and golf_conversations.team_id for the open thread; nothing is written
Held items: the migrations; with class_awareness_v1 off nothing is read and the header is unchanged
```

### Changed

- A coach's 1:1 with a player of their own team shows the player's class status under the name ("In class until 11:50 AM"; on desktop the usual subtitle follows after a dot, on the phone the status replaces it). The class name never appears in the header.
- It shows only for a direct thread, with a player on the coach's team, in a conversation that belongs to that same team. A group, another team's conversation, a conversation with no team, one whose team is not known yet and a player viewer all draw exactly what they drew before.

### Verification

- class-thread.test.tsx.
