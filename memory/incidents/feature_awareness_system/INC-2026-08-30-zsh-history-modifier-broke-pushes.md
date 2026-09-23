# INC-2026-08-30 — zsh history modifiers silently mangled push refspecs

- Feature: `feature_awareness_system`

## What happened

`"refs/heads/$b:refs/heads/$b"` became
`refs/heads/recovered/stash-0efs/heads/recovered/stash-0` — zsh reads
`$b:r` as the `:r` history modifier when a variable is followed directly by
a colon. `git push` then reported "src refspec ... does not match any" for
a ref that resolved fine on its own, and the same command typed literally
worked, so it read as a git problem rather than a shell one. Seven branch
pushes failed this way in one session.

## Fix / where it lives now

`.claude/rules/shipping.md` names the trap (`$var:r`/`:h`/`:t`/`:e` read as
history modifiers) and the fix: use `git push origin "$b"`, or a literal
colon separated from the bare variable, never `$b:` glued together.
