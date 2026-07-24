#!/usr/bin/env bash
#
# apply-auth-email-templates.sh
# ─────────────────────────────
# Applies GolfHelm's branded auth email templates (recovery / confirmation /
# email_change) to the LINKED Supabase project via the Management API.
#
# WHY NOT `supabase config push`?
#   config push sends the WHOLE supabase/config.toml, including the dev
#   `site_url = "http://127.0.0.1:3000"`, which would overwrite production's
#   site URL and break every auth email link + redirect. This script instead
#   PATCHes ONLY the mailer_* fields. PATCH /v1/projects/{ref}/config/auth is a
#   partial (merge) update, so fields we don't send are left as-is — and we
#   PROVE it afterward with a full before/after diff (see the verify step).
#
# USAGE
#   SUPABASE_ACCESS_TOKEN=sbp_xxx bash scripts/apply-auth-email-templates.sh
#
#   Create a token at https://supabase.com/dashboard/account/tokens
#   (Personal access token). Read from the env only; never stored, echoed,
#   or committed.
#
# OPTIONS (env)
#   SUPABASE_PROJECT_REF   override target project ref
#                          (default: qmnssrrolpinvwjjnufo = Helm-Production)
#
set -euo pipefail
umask 077   # backup/after/payload can contain secret-bearing auth config

REF="${SUPABASE_PROJECT_REF:-qmnssrrolpinvwjjnufo}"
: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN to a Supabase PAT (https://supabase.com/dashboard/account/tokens). Never committed or printed.}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/supabase/config.toml"
API="https://api.supabase.com/v1/projects/$REF/config/auth"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${TMPDIR:-/tmp}/helm-authcfg-backup-$STAMP.json"
AFTER="${TMPDIR:-/tmp}/helm-authcfg-after-$STAMP.json"
PAYLOAD="${TMPDIR:-/tmp}/helm-authcfg-patch-$STAMP.json"
# Keep BACKUP as the rollback snapshot; drop the transient payload/after files.
trap 'rm -f "$PAYLOAD" "$AFTER"' EXIT

echo "→ Target project : $REF"
echo "→ Backing up current auth config → $BACKUP"
curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$API" > "$BACKUP" \
  || { echo "✗ GET failed — is SUPABASE_ACCESS_TOKEN a valid Management API PAT?" >&2; exit 1; }

# Build the surgical patch body from config.toml (single source of truth for
# subjects + content_path) → exactly the 6 mailer_* fields for our 3 templates.
python3 - "$CONFIG" "$ROOT" "$PAYLOAD" <<'PY'
import json, os, sys, tomllib
config, root, out = sys.argv[1], sys.argv[2], sys.argv[3]
tpl = tomllib.load(open(config, "rb"))["auth"]["email"]["template"]
FIELDS = {  # template name → (subject field, body field) in the Management API
    "recovery":     ("mailer_subjects_recovery",     "mailer_templates_recovery_content"),
    "confirmation": ("mailer_subjects_confirmation", "mailer_templates_confirmation_content"),
    "email_change": ("mailer_subjects_email_change", "mailer_templates_email_change_content"),
}
body = {}
for name, (subj_key, body_key) in FIELDS.items():
    entry = tpl[name]
    path = os.path.join(root, entry["content_path"].lstrip("./"))
    body[subj_key] = entry["subject"]
    body[body_key] = open(path, encoding="utf-8").read()
json.dump(body, open(out, "w"))
print("  fields:", ", ".join(sorted(body)))
PY

echo "→ PATCHing auth config (email templates only) …"
curl -fsS -X PATCH \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$PAYLOAD" "$API" > "$AFTER" \
  || { echo "✗ PATCH failed. Nothing to roll back on our side; prior config in $BACKUP" >&2; exit 1; }

echo "→ Verifying: templates applied AND nothing else changed …"
python3 - "$BACKUP" "$AFTER" "$PAYLOAD" <<'PY' || { echo "✗ Verification failed (see above). Config WAS mutated — restore from the backup snapshot if needed." >&2; exit 1; }
import json, re, sys
before = json.load(open(sys.argv[1]))
after  = json.load(open(sys.argv[2]))
sent   = json.load(open(sys.argv[3]))   # the exact fields we intended to change
ok = True

# 1) Every field we sent must now equal what we sent.
for k, v in sent.items():
    got = after.get(k)
    match = (got or "").strip() == (v or "").strip() if isinstance(v, str) else got == v
    print(f"  applied {k:42} {'OK' if match else 'MISMATCH'}")
    ok = ok and match

# 2) SURGICAL PROOF: no other auth field may differ from the backup
#    (ignore server-side timestamps like updated_at).
volatile = re.compile(r'_at$')
sent_keys = set(sent)
changed = [
    k for k in (set(before) | set(after))
    if k not in sent_keys and not volatile.search(k) and before.get(k) != after.get(k)
]
if changed:
    ok = False
    print("  ✗ UNEXPECTED changes to non-template fields:", ", ".join(sorted(changed)))
else:
    print("  surgical: no non-template auth field changed  OK")

sys.exit(0 if ok else 1)
PY

echo "✅ Branded auth emails applied (recovery, confirmation, email_change). Rollback snapshot: $BACKUP"
