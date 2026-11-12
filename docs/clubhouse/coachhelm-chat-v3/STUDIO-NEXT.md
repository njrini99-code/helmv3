# CoachHelm chat v3: the studio, next (11 Nov 2026)

Three things the studio (CAPABILITIES.md, section S) is built to grow into, each
as a design and as what it needs
from the engine. None is built. Each is written so it can be built without
changing the fixed component set: they
are new ways to arrive at, keep and return to the same sixteen components, not
new components.

The rule that carries over to all three: the assistant never invents interface.
A side question, a branch and a
saved workspace are all made of parts the registry already draws.

---

## 1. Side questions: ask about one thing without losing your place

**The problem.** A coach reading a team comparison wants to know why one
player's putting figure is low. Today the
question goes into the main thread: the comparison scrolls away, the answer sits
under it, and the thread is now
about that player.

**The design.**

- A tap on an element already fills the composer with a question about it (S.2).
  A side question is the same tap
  with a second choice: the composer shows the reference as a chip over the text
  field ("About: Jonah Okafor,
  strokes gained putting") with two ways to send, **Ask here** (today's
  behaviour) and **Ask on the side**.
- "Ask on the side" opens the answer **attached to the element**: on a desk, in
  the evidence panel's place beside
  the thread (SPEC Moment 6's panel, same width, same sheet rules); on a phone,
  in the app's own sheet at medium
  height. The thread behind does not scroll and gains no turn.
- The side answer is a small thread of its own: the question, the workspace's
  steps in their compact size, the
  answer with its own studio parts in `compact`. It can be asked a follow-up,
  which stays on the side.
- The element it was asked about keeps a quiet mark (a dot at the row's end, in
  the ask accent) while a side answer
  exists for it. Tapping the mark reopens it. A second side question on another
  element replaces what is shown and
  leaves both marks.
- Two ways out, both named: **Keep in the chat** moves the side thread into the
  main one as a turn quoted under the
  element's name ("About Jonah Okafor, strokes gained putting"), where it can be
  read later; **Close** leaves it
  reachable from the mark for this visit and from History afterwards.
- A side question can read. It cannot propose a task: an action preview needs
  the coach's whole attention and the
  thread's record, so a side answer that would act says "Ask this in the chat to
  do it" with one key that moves it
  there.
- Motion: the panel and the sheet are the app's own (their entrance is already
  in MOTION.md). The mark is an
  opacity beat. Nothing else moves; the thread must be seen to stay still.

**From the engine.**

| Need | Shape |
| --- | --- |
| The reference travels with the question (E-30) | `message.reference: { kind, read, key }`; the server resolves it to the read's envelope and the element inside it, and refuses a reference to a read the conversation does not hold |
| A turn that belongs to an element, not to the thread | `side_of: { message_id, reference }` on the turn; such turns are stored, are not part of the main conversation's model context unless kept, and are returned with the conversation as `side: []` beside the message they hang from |
| Reads only | the side surface's tool set is the read set (the player's set is the model); a task tool called there returns a refusal the reader turns into "Ask this in the chat to do it" |
| Keep in the chat | `POST …/side/<id>/keep`: moves the turns into the main thread after the current last turn, quoted with the reference's label, and from then on they are context |
| Cost and allowance | a side turn counts against the same allowance and is priced the same; it should use the surface's fast model (CONTRACT_NOTES E20) since it starts from a read already in hand |

**What it does not need.** No new component. No new motion. The reference format
is the one `data-ask-ref` already
carries.

---

## 2. Branches: try the question a second way and compare

**The problem.** "What if I rank them over the last four rounds instead of the
season?" Today that is a new
question whose answer pushes the first one up the thread; comparing the two
means scrolling between them, and the
conversation's history now holds both as if both were asked in sequence.

**The design.**

- Every answer that drew a studio part has **Try another way** in its foot row
  (beside Copy and the sources). It
  opens the composer with the original question and the reference to that turn,
  and the coach changes what they
  want changed, in words. Editing an earlier question of their own does the same.
- Sending it does not append. The turn becomes a **pair of versions in one
  place**: a small switch above the answer,
  "1 of 2" with previous and next, the way the practice plan card already moves
  between versions of a plan
  (`PlanVersions`, plan/PlanCard.tsx); the switch should reuse that control
  rather than add one. The thread below belongs
  to the version being shown.
- **Compare** is offered when both versions drew the same kind of part (two
  rankings, two comparisons). On a desk it
  sets them side by side in the thread's column and the panel's; on a phone it
  stacks them with the difference
  first. The comparison is itself a studio part: a `comparison` whose rows are
  the things both versions hold and
  whose two columns are the versions, with the figures that differ marked. Where
  the kinds differ there is no
  Compare, only the switch.
- A branch that proposed a task keeps its card on that branch. A card confirmed
  on one version is a fact of the
  conversation, not of the branch: its receipt shows on every version from that
  point, with "Confirmed while you
  were on version 2" as its note, so switching versions can never hide something
  that was done.
- Limits, said in the interface: three versions of one turn; a branch of a
  branch is a new chat ("Open this version
  as its own chat"), which copies the thread up to that turn.
- Motion: the switch cross-fades the answer in place at a fixed height taken
  from the taller version (opacity only,
  the frame does not grow or shrink while switching). Named request to the
  lead's vocabulary; nothing here invents
  one.

**From the engine.**

| Need | Shape |
| --- | --- |
| A turn has a parent, not only an order | `parent_message_id` and `version` on each stored message; the conversation is a tree whose current path is a list of chosen versions |
| The context is the path | the model is given the turns on the chosen path only; the other versions exist in storage and in the response (`versions: [{ version, message_id, summary }]`), not in context |
| Re-ask from a turn | `{ conversation_id, branch_from: message_id, message }`: plans nothing from the abandoned path, starts a new version, and settles any card still waiting on the old path as set aside (the existing `superseded` state) |
| Receipts outlive the branch | a completed receipt is stored against the conversation with the `message_id` it came from, and is returned on every path that descends from that turn's parent |
| Compare | nothing from the model: `compare` is built by trusted code from the two versions' reads (the same rule as every figure), as a `comparison` part with `columns: ['Version 1', 'Version 2']`; it needs each version's parts to keep their `evidence_ref` and metric ids |
| Limits | the three-version cap enforced by the server; "open as its own chat" is a copy of the path |

**The risk to design against.** A branch must never make the record of what was
done ambiguous. That is why a
receipt is conversation-wide, why a waiting card on an abandoned path is set
aside rather than left open, and why
"approve all" (0.9) only ever names cards on the path being shown.

---

## 3. Saved workspaces: keep the working surface, not just the words

**The problem.** A coach builds something useful over ten minutes: the team
comparison, two players opened beside
it, a draft plan. Tomorrow it is a chat in History whose top shows the first
question. The useful thing was the
arrangement, and it is gone.

**The design.**

- A **workspace** is a named set of studio parts kept together, each still
  knowing the read it came from. It is made
  from a chat, never from nothing: **Keep on a workspace** on any studio part
  (in the part's overflow, and by
  dragging on a desk) adds that part; the first one asks for a name ("Putting,
  fall season").
- Its page is a board of the same components at the same two sizes: `full` on a
  desk in a two-column grid the coach
  can reorder, `compact` on a phone as one column. No free-form canvas, no
  resizing, no drawing: order is the only
  arrangement, so it holds at 320px and prints.
- Every part says **how fresh it is**, from its read's `as_of`: "As of Nov 9".
  **Refresh** runs the same read again
  with the same arguments and redraws the part; it does not ask the model and it
  never changes which part it is. A
  part whose read now comes back empty or fails shows that state in place
  (SPEC's empty and failed read), not the
  old figures.
- A workspace is **askable as a whole**: its page has the chat's composer, and a
  question there starts a chat whose
  context is the workspace's parts ("About: Putting, fall season, 5 parts").
  Tapping an element asks about that
  element, as everywhere.
- **Who can see it** is said on the page in the reach vocabulary (0.3): "Only
  you" by default; "Coaches only" when
  shared with the staff. A workspace is never visible to players, and a part
  that holds a coach-only field keeps it
  out of anything exported.
- It can hold a draft (a plan, a document) but never a waiting action preview: a
  card that waits for Confirm lives
  in its chat, where its record is. Its receipt can be kept, as a `receipt` part.
- Where it lives: a "Workspaces" list beside History in the CoachHelm tab, each
  with its name, its part count and
  its oldest "as of". Empty state: "Keep a chart or a table from any chat and it
  stays here, up to date."
- Motion: adding a part is the app's existing save flight (the plan card's
  flight to its folder is the precedent);
  reordering uses the app's reorder behaviour for lists. No new motion.

**From the engine.**

| Need | Shape |
| --- | --- |
| A part can be re-made without the model | every studio part stores its **recipe**: `{ tool, args, evidence_ref, block }` (the read's tool and arguments as the server ran them, and the block that draws it). The composition compiler already has all of it; it must be kept on the stored part |
| Refresh | `POST …/workspaces/<id>/parts/<part>/refresh`: runs the recipe's read under the caller's own access, re-resolves the block with trusted code, returns the part with the new `as_of`. A read the caller may no longer run (a player left the team) returns the read's own refusal |
| Storage | `golf_coachhelm_workspaces` (id, team, owner, name, visibility `only_you` or `coaches`, timestamps) and `…_workspace_parts` (workspace, position, kind, recipe, the last drawn part, `as_of`); row-level security by team and owner, staff by team when `coaches`; no player policy at all |
| A chat about a workspace | `{ workspace_id }` on a new conversation: the parts' envelopes are given to the model as reads already made this turn, so its figures are grounded the same way and it can cite them |
| Access is the read's, every time | a workspace never stores another person's view: refresh and open both run as the viewer, so a shared workspace shows each coach what that coach may read |
| Size | a cap on parts per workspace (suggest 12) and on stored part size; a part over the cap is kept as its table |

**What to decide before building (recommended defaults).**

1. Whether a refresh may change the **shape** of a part (a ranking of five
   becomes six when a player joins).
   Default: yes, the recipe says "the team", not "these five"; the part says "6
   players, was 5" once after the
   change.
2. Whether workspaces are per coach or per team. Default: per coach, shareable
   to the staff, never to players.
3. Whether a workspace part can be the target of a task ("send this to Jonah").
   Default: only through a chat about
   the workspace, so the action has a card, a Confirm and a record.

---

## Order to build them in

1. **The reference on the request (E-30).** It is the smallest piece, it makes
   today's tap-to-ask precise, and both
   side questions and workspace chats stand on it.
2. **Recipes on stored parts.** Needed by Refresh and by Compare; costs nothing
   a coach sees.
3. **Side questions.** Reads only, no new storage shape beyond `side_of`.
4. **Saved workspaces.** New tables and policies: goes through the migration
   reviewers and the rollout thread.
5. **Branches.** The largest change to how a conversation is stored and given to
   the model; last, with the rule
   about receipts settled first.
