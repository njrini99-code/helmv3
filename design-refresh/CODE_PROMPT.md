# Prompt to paste into Claude Code

The package lives on GitHub now, on the branch `claude/design-refresh-package` of helmv3 (draft PR into main, docs only). Open Terminal on the Mac in your helmv3 folder, start Claude Code there, and paste this:

```
You are the one agent building the whole Clubhouse redesign in this repo (helmv3), end to end. Nobody else
is building any part of it. You do every lane, every PR in the order START_HERE section 4 gives, every
"Completeness pass, 4 Nov 2026" item and every "Wiring, 4 Nov 2026" item, and you don't stop until the
whole list is done or a step is truly blocked. When one is blocked, write why in that PR and go on to the
next item.

Step 1. Pull the package down locally. Run these in the helmv3 folder:
  git status                                  # must be clean; if not, stop and tell me
  git fetch origin main claude/design-refresh-package
  git switch claude/design-refresh-package    # first time: git switch -c claude/design-refresh-package --track origin/claude/design-refresh-package
  git pull --ff-only
  python3 design-refresh/tools/verify_manifest.py
The last command must print "OK: all N files match MANIFEST.md". If it prints anything missing or
different, stop and tell me what it printed.

Step 2. Where your branches start. If design-refresh/ is already on main (Nick merged the docs PR), cut
every PR branch from origin/main. If not, cut each from claude/design-refresh-package and set the draft
PR's base to claude/design-refresh-package, so its diff shows only your code. Once the docs PR merges,
rebase each open branch with
  git rebase --onto origin/main claude/design-refresh-package <your-branch>
then push with --force-with-lease and change the PR's base to main.

Step 3. Read design-refresh/START_HERE.md and follow it top to bottom: the rules, setup, the reading
order, Step 0 captures, the build order, and the loop for every PR. Then read design-refresh/COMPLETENESS.md
and design-refresh/DECISIONS.md. Every lane file ends with a "Completeness pass, 4 Nov 2026" section
(states, sizes, motion, entry points, handoffs) and each lane's 06 and 08 end with a "Wiring, 4 Nov 2026"
section (where every field comes from, what every action writes, RLS, validation, failure, sync, pushes and
flags). Build all of it; those sections win over the design page. The Practice tab and Documents pieces in
design-refresh/prerequisites/ are the minimum the Practice plan and Quick chat lanes need, not a redesign:
build only what those lanes call.

The scope is the nine pages Nick asked for and nothing else: Classes, Roster and coach Home; Stats and
player Home; Messages; Team Board; Root cause (Read); Coach vs player (Lenses); Ask; Quick chat; Practice
plan creation.

Make each screen look, move and behave exactly like its design page. Take every value from the lane's
05-SCREENS, 06-SCREEN-SPECS, 07-MOTION and 08-ACCEPTANCE and the design page's own CSS, never from
eyeballing. Prove each PR with the lane's capture script: design and build side by side, plus motion clips
with and without Reduce Motion.

Hard rules:
- Draft PRs only. Never merge, deploy, flip a flag, or apply a migration.
- New UI goes behind its lane's flag, off everywhere. The flags are listed in START_HERE section 4.
- Held migrations stay files. Never apply one. The list is in COMPLETENESS.md.
- Never change what shot tracking collects, stores or sends.
- Players never see a teammate's figures.
- Keep today's green top bar.
- One dev server, one browser, at most two subagents. Typecheck once per PR, at the end.
- If something can't be built as drawn, write it in the PR under "Can't match as drawn" and keep going.
  Calls Nick already made are in design-refresh/DECISIONS.md. Don't reopen them.

Start with the two leak fixes (CR0, then L0), then PR 1 of the shared foundation, and go in the order in
START_HERE section 4. After each draft PR, give me one line: the PR link, which 08 criteria (CP and W
checks included) passed, and anything under "Can't match as drawn". At the end, give me the full list of
PRs and anything still blocked.
```
