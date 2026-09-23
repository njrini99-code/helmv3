# M01 — `is_team_chat` vs `is_team_channel`: which is authoritative

Opened by G-15, which asked M01 to "say which is authoritative before any UI
branches on either". Answered here against the production catalog and the
function's own body, not against prose.

**They are two different flags, not two spellings of one.** The manifest's
framing — the RPC's `is_team_channel` is "silently dropped **in favour of** a
different `is_team_chat` column" — is wrong, and this is the fifth
evidence-backed correction in this audit. Nothing is dropped in favour of
anything; one flag is consumed under another name, and the other is not
consumed at all.

## The primary source

`get_golf_conversations_with_details` returns fourteen columns. Its eleventh,
named `is_group` in the result signature, is literally:

```sql
COALESCE(c.is_team_chat, FALSE)
```

and its fourteenth is `COALESCE(c.is_team_channel, FALSE)`. The function's only
other use of `is_team_channel` is its own `ORDER BY c.is_team_channel DESC
NULLS LAST, c.updated_at DESC`.

So:

| Flag | Meaning in code today | Who reads it |
|---|---|---|
| `is_team_chat` | **grouping.** The RPC exposes it as `is_group`; the write path sets it (`src/app/actions/messages.ts:837`); the supplemental participants query filters on it (`use-golf-messages.ts`). | the messages UI, via `is_group` |
| `is_team_channel` | a **separate** flag. Inside the RPC it only affects that `ORDER BY`. | nothing in the messages UI |

Both are real columns on `golf_conversations` (`information_schema`, verified
live), both default `false`, and both are covered by migrations
(`20260527000000_prod_public_baseline.sql`,
`20260621041824_harden_get_golf_conversations_rpc.sql`) and by
`supabase/schemas/golf/10_tables.sql:497` — unlike G-58, there is no
migration gap here.

They are also **not** interchangeable in RLS: `golf_conversations_select_v2`
admits a team coach or player on `(is_team_chat = true) OR (is_team_channel =
true)`, i.e. it treats them as a union of two independent grants. And
`idx_golf_conversations_team_channel` is a partial index on
`is_team_channel = true` only.

## Production distribution (13 golf conversations)

| Shape | Rows |
|---|---|
| `is_team_chat` only | 5 |
| both flags | 1 |
| `is_team_channel` only | 0 |
| neither (DMs / broadcasts) | 7 |

Every `is_team_chat` row carries a `title`; every neither-flag row has a null
`title`. That distribution matters for the two consequences below.

## Consequence 1 — the defect G-15 actually names

`ConversationRow` in `use-golf-messages.ts` declared **13** of the RPC's 14
columns. The type described a shape the function does not return, and the
value never reached the client. Fixed by declaring the column and carrying it
on the merged team-chat rows too (which previously did not select it at all).

Deliberately **not** fixed: the client's own sort. The rail orders by
`last_message.created_at || updated_at`, which is a better inbox key than the
RPC's `updated_at`, and `MessageConversationRail` buckets by time before
rendering — so restoring the RPC's channel-first pin at the hook level would
shift only intra-bucket tie order while pre-empting G-01 (inbox sectioning,
deferred). Client-owns-inbox-ordering is the existing contract. Nothing
branches on `is_team_channel` yet; this change only stops the type lying.

## Consequence 2 — `conversation-kind.ts` is already right, for a better reason

`isGroupConversation` deliberately does not trust `is_group`, because a
broadcast to ONE player also carries `is_team_chat` and so reported itself as
a group. It uses `participant_count` and falls back to `is_group` only when
the count is unknown. `is_team_channel` would **not** have been a better flag
there: it is true for 1 of 13 conversations, so five real team chats would
have rendered as DMs. The existing count-based derivation is strictly better
than either flag. No change.

## New finding: G-59 — the admin activity feed reads the other flag [low]

`src/lib/admin/data/activity.ts:395,423` selects and reads **`is_team_channel`**
for golf (`conv?.title ?? (conv?.is_team_channel ? 'the team channel' : 'a
conversation')`), while line 403/437 reads `is_team_chat` for baseball. Given
the table above, five golf threads the messages UI renders as team groups
would be described by the admin feed as "a conversation".

Latent today, not live: `title` is coalesced first and every current
`is_team_chat` row has one, so the flag branch is never reached for them. It
becomes visible the moment a titleless team chat exists. Recorded rather than
fixed — it is admin-surface, outside the messages audit's scope, and the fix
is a one-word column change plus a test.
