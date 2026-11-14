# Write log: Clubhouse audit 13 Nov 2026 (staging, view-only)

Every non-GET request the audit browsers sent, 1946 in all. Next.js server actions are POSTs even when they only read, so this is a superset of real writes. Session refreshes (`/auth/v1/token`) and the Sentry tunnel are left out.

| Requests | Kind | Count |
| --- | --- | --- |
| /monitoring | POST other | 865 |
| action 40c91a29ca | POST server-action | 330 |
| action 4053579138 | POST server-action | 213 |
| /rest/v1/rpc/get_golf_conversations_with_details | POST rpc | 148 |
| action 7f153c6a5a | POST server-action | 128 |
| /rest/v1/rpc/golf_my_class_day | POST rpc | 104 |
| /rest/v1/rpc/golf_player_profiles | POST rpc | 71 |
| /rest/v1/rpc/golf_team_class_day | POST rpc | 32 |
| action 40351673d7 | POST server-action | 14 |
| action 00af984e8c | POST server-action | 11 |
| action 4088eea197 | POST server-action | 10 |
| /api/admin/log-event | POST other | 6 |
| action 7fc8d4a61f | POST server-action | 4 |
| action 00a10d305c | POST server-action | 4 |
| action 4089cc602f | POST server-action | 3 |
| action 4035b53c49 | POST server-action | 2 |
| action 60e612ff7b | POST server-action | 1 |

What they were, checked against the code and the database:

- The bell opening (`getUnifiedNotifications`) and the search palette are reads; badges stayed unread across every open.
- `golf_my_class_day` and `golf_team_class_day` RPCs are reads.
- "Set a goal" opened its sheet only: no `golf_goals` row was created.
- Opening the team channel thread on the phone marked it read for the demo coach and the demo player (WRITES-ON-OPEN row 4). Desktop Messages, which opens the thread by itself, did not.
- Opening the player's Travel tab updated `last_travel_seen_at` (row 6).
- Round reviews were opened only for rounds that already had a recap; no Claude call was made.

## End-of-run check (WRITES-ON-OPEN §5), rows since 17:50 ET

| Table | Rows |
| --- | --- |
| golf_insight_exposure (demo coach / demo player) | 0 / 0 |
| golf_conversation_participants.last_read_at (coach + player) | 2 |
| golf_player_notification_state (player) | 1 |
| golf_rounds updated (team) | 0 |
| golf_coachhelm_llm_calls | 0 |
| golf_team_coachhelm_settings | 0 |
| error_logs (demo users / all users) | 0 / 0 |

No table outside the list changed and no error was logged, so the run raised no write finding.
