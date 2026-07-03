#!/usr/bin/env bash
set -euo pipefail

out_dir="${1:-docs/audits/generated/stashes}"
mkdir -p "$out_dir"
rm -f "$out_dir"/stash-*-stat.txt

git stash list > "$out_dir/stash-list.txt"

count="$(git stash list | wc -l | tr -d ' ')"
{
  echo "# Stash Audit Manifest"
  echo
  echo "- Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "- Stash count: $count"
  echo "- Safety: this script records stash metadata only; it does not apply, pop, drop, or clear stashes."
  echo
  echo "| Stash | Subject | Stat File | Decision | Notes |"
  echo "| --- | --- | --- | --- | --- |"
} > "$out_dir/README.md"

if [ "$count" -eq 0 ]; then
  exit 0
fi

i=0
while IFS= read -r line; do
  stash_ref="stash@{$i}"
  stat_file="stash-$i-stat.txt"
  git stash show --stat "$stash_ref" > "$out_dir/$stat_file" || true
  subject="${line#*: }"
  printf '| `%s` | %s | `%s` | Pending | Review `git stash show --patch "%s"` before deciding. |\n' "$stash_ref" "$subject" "$stat_file" "$stash_ref" >> "$out_dir/README.md"
  i=$((i + 1))
done < "$out_dir/stash-list.txt"
