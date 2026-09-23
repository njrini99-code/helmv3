"""`ship --approve` / `ship --approve --upload`: the owner's one-line action
after `ship` reaches READY_FOR_APPROVAL (plan "Design: one command, ship";
Phase 3 D2/D3). Merging into `course-geometry/approvals.json` and the Storage
upload are kept as separate pure/injectable pieces so both are unit-testable
without touching the real file or the network (D2: the bucket migration is
reviewed but not yet applied, so a real upload call would only ever fail
right now — see supabase/migrations/HELD.md)."""
import copy
import json
import os
import re
import subprocess
import urllib.error
import urllib.request

from .fingerprints import content_hash_matches
from .ship_run import ship_dir

HEX64 = re.compile(r'^[0-9a-f]{64}$')

# D3: courses without their own hand-picked flag pair get the shared pair;
# Peek keeps its own (peek_n_peak_one_tap_v1 / _sync_v1), untouched by this.
DEFAULT_GEOMETRY_FLAG = 'meridian_live_v1'
DEFAULT_SYNC_FLAG = 'meridian_live_sync_v1'
STORAGE_BUCKET = 'course-geometry'
HASHED_CACHE_CONTROL = 'public, max-age=31536000, immutable'
MANIFEST_CACHE_CONTROL = 'public, max-age=60'


def merge_approval(approvals, layout_id, content_hash, package_bytes_sha256, live_pilot=False):
    """Return (new_doc, is_new_layout); never mutates `approvals`. A layout
    already on file keeps every existing field (flags, renderWorld, name
    patterns, assetBaseUrl) — only its `packages` map gains this hash. A
    layout not yet on file gets a minimal D3 entry that still needs an
    owner's eyes on courseNamePatterns before it can match anything."""
    doc = copy.deepcopy(approvals)
    layouts = doc.setdefault('layouts', {})
    is_new = layout_id not in layouts
    layout = layouts.get(layout_id)
    if layout is None:
        layout = {'geometryFeatureFlag': DEFAULT_GEOMETRY_FLAG, 'syncFeatureFlag': DEFAULT_SYNC_FLAG,
                  'renderWorld': 'v2', 'pilotAcceptsSourceCandidate': True, 'courseNamePatterns': [], 'packages': {}}
        layouts[layout_id] = layout
    packages = layout.setdefault('packages', {})
    entry = {'packageBytesSha256': package_bytes_sha256}
    if live_pilot:
        entry['livePilot'] = True
    packages[content_hash] = entry
    return doc, is_new


def write_approvals(path, doc):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
        f.write('\n')


def run_registry_generate(repo_root, log_path):
    """`npm run course-geometry:registry:generate`, logged like every other
    ship subprocess. Raises with the log tail on a non-zero exit."""
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, 'w', encoding='utf-8') as log:
        log.write('$ npm run course-geometry:registry:generate\n')
        log.flush()
        result = subprocess.run(['npm', 'run', 'course-geometry:registry:generate'], cwd=repo_root, stdout=log, stderr=subprocess.STDOUT, text=True, check=False)
    if result.returncode != 0:
        with open(log_path, encoding='utf-8') as log:
            tail = log.read()[-1500:]
        raise RuntimeError(f'course-geometry:registry:generate exited {result.returncode}\n{tail}')


# --- Storage upload (D2) ------------------------------------------------------
class StorageEnvMissing(RuntimeError):
    pass


class StorageBucketMissing(RuntimeError):
    pass


class StorageUploadError(RuntimeError):
    pass


def _parse_env_file(path):
    """A minimal `KEY=VALUE` parser for `.env.local`: tolerates a leading
    `export `, `#` comments, blank lines, and one layer of matching quotes
    around the value. Not a general shell parser -- this repo's env files
    don't need one."""
    values = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if line.startswith('export '):
                line = line[len('export '):].lstrip()
            key, sep, value = line.partition('=')
            if not sep:
                continue
            key, value = key.strip(), value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            # A quoted value ending in a literal backslash-n/backslash-r (two
            # characters, not an actual newline) is a known artifact of some
            # deployment pipelines writing an escaped string without
            # interpreting it; strip it rather than carrying it into a URL
            # or key, since it can otherwise silently break DNS resolution.
            while value.endswith('\\n') or value.endswith('\\r'):
                value = value[:-2]
            values[key] = value
    return values


def storage_env(environ, repo_root=None):
    """The service-role credentials, from the process environment first,
    then `<repo_root>/.env.local` (a symlink to the canonical file in this
    worktree). Raises without ever including a value -- only which source
    was tried, so a caller can log that safely."""
    url = (environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').strip().rstrip('/')
    key = (environ.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()
    if url and key:
        return url, key, 'process environment'
    env_local = os.path.join(repo_root, '.env.local') if repo_root else None
    if env_local and os.path.isfile(env_local):
        values = _parse_env_file(env_local)
        file_url = (values.get('NEXT_PUBLIC_SUPABASE_URL') or '').strip().rstrip('/')
        file_key = (values.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()
        if file_url and file_key:
            return file_url, file_key, '.env.local'
    # Deliberately never echoes whatever partial value was present, in either source.
    tried = 'the process environment' + (f' and {env_local}' if env_local else '')
    raise StorageEnvMissing(f'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set; checked {tried} (values never logged)')


def _request(url, key, method, path, data=None, headers=None, opener=urllib.request.urlopen):
    req = urllib.request.Request(f'{url}/storage/v1/{path}', data=data, method=method,
                                  headers={'Authorization': f'Bearer {key}', 'apikey': key, **(headers or {})})
    return opener(req, timeout=30)


def check_bucket(url, key, bucket=STORAGE_BUCKET, opener=urllib.request.urlopen):
    """Raises StorageBucketMissing (naming the pending migration, never the
    key) when the bucket does not exist yet; returns quietly when it does."""
    try:
        _request(url, key, 'GET', f'bucket/{bucket}', opener=opener)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise StorageBucketMissing(
                f'Storage bucket {bucket!r} does not exist yet — its migration is reviewed but not applied '
                f'(supabase/migrations/HELD.md: 20260922100000_course_geometry_storage_bucket.sql). Ask the owner to apply it, then retry --upload.'
            ) from None
        raise StorageUploadError(f'bucket check failed: HTTP {exc.code}') from None


def upload_file(url, key, object_path, data, content_type, cache_control, upsert, bucket=STORAGE_BUCKET, opener=urllib.request.urlopen):
    headers = {'Content-Type': content_type, 'cache-control': cache_control, 'x-upsert': 'true' if upsert else 'false'}
    try:
        _request(url, key, 'POST', f'object/{bucket}/{object_path}', data=data, headers=headers, opener=opener)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise StorageBucketMissing(f'Storage bucket {bucket!r} does not exist yet; apply its migration first.') from None
        raise StorageUploadError(f'{object_path}: HTTP {exc.code}') from None


def upload_staged(url, key, staging_layout_dir, opener=urllib.request.urlopen):
    """Every file under a `publish-course-assets.mts --out` staging
    directory for one layout: hash-named files (application/json, long
    immutable cache) plus `manifest.json` (upsert, short cache — the only
    file this uploader ever overwrites in place)."""
    check_bucket(url, key, opener=opener)
    uploaded = []
    for root, _dirs, names in os.walk(staging_layout_dir):
        for name in sorted(names):
            path = os.path.join(root, name)
            object_path = os.path.relpath(path, os.path.dirname(staging_layout_dir)).replace(os.sep, '/')
            with open(path, 'rb') as f:
                data = f.read()
            is_manifest = name == 'manifest.json'
            upload_file(url, key, object_path, data, 'application/json',
                       MANIFEST_CACHE_CONTROL if is_manifest else HASHED_CACHE_CONTROL, upsert=is_manifest, opener=opener)
            uploaded.append(object_path)
    return uploaded


# --- CLI glue ------------------------------------------------------------------
def cmd_ship_approve(session, args, out):
    """Refuses unless the exact hash has a READY_FOR_APPROVAL qa-report,
    re-verifies the package on disk still hashes to it, and re-verifies the
    staged publish manifest agrees, before touching approvals.json at all."""
    layout_id, content_hash = args.approve
    if not HEX64.match(content_hash):
        out.write(f'refusing: content hash must be 64 lowercase hex characters, got {content_hash!r}\n')
        return 1
    ctx = session.ctx
    dest = ship_dir(ctx, layout_id)
    qa = ctx.json(os.path.join(dest, 'qa-report.json'), fresh=True)
    if not qa or qa.get('status') != 'READY_FOR_APPROVAL' or qa.get('packageHash') != content_hash:
        out.write(f'refusing: no READY_FOR_APPROVAL qa-report.json for {layout_id} at hash {content_hash[:12]} '
                  f'(found status={qa.get("status") if qa else None}, packageHash={(qa.get("packageHash") or "")[:12] if qa else None}); '
                  f'run `ship --layout {layout_id}` first\n')
        return 1
    package = ctx.package(layout_id)
    if not package or package.get('contentHash') != content_hash or not content_hash_matches(package):
        out.write(f'refusing: the package on disk no longer hashes to {content_hash[:12]}; rerun ship first\n')
        return 1
    proposed = ctx.json(os.path.join(dest, 'proposed-approval.json'), fresh=True)
    if not proposed or proposed.get('contentHash') != content_hash or not proposed.get('packageBytesSha256'):
        out.write(f'refusing: no matching proposed-approval.json for {content_hash[:12]}; rerun ship first\n')
        return 1
    staging_dir = proposed['stagingDir'] if os.path.isabs(proposed['stagingDir']) else os.path.join(session.repo_root, proposed['stagingDir'])
    manifest = ctx.json(os.path.join(staging_dir, layout_id, 'manifest.json'), fresh=True)
    if not manifest or manifest.get('geometryVersion') != content_hash:
        out.write(f'refusing: staged manifest.json geometryVersion does not match {content_hash[:12]}; rerun ship first\n')
        return 1

    approvals_path = os.path.join(session.repo_root, 'course-geometry', 'approvals.json')
    with open(approvals_path, encoding='utf-8') as f:
        approvals = json.load(f)
    new_doc, is_new = merge_approval(approvals, layout_id, content_hash, proposed['packageBytesSha256'], live_pilot=args.live_pilot)
    write_approvals(approvals_path, new_doc)
    if is_new:
        out.write(f'NOTE: {layout_id} is a new approvals.json entry with placeholder courseNamePatterns: []; '
                  f'an owner must add real name patterns before this course can match anything live.\n')
    run_registry_generate(session.repo_root, os.path.join(dest, 'registry-generate.log'))
    shares = [row.get('uncertainShare') for row in (qa.get('advisory') or {}).get('contextUncertainShares', []) if row.get('uncertainShare') is not None]
    if shares:
        worst = max(shares)
        worst_hole = next(row['holeKey'] for row in qa['advisory']['contextUncertainShares'] if row.get('uncertainShare') == worst)
        out.write(f'CONTEXT SIGN-OFF: this approval accepts the context layer as reviewed, worst hole {worst_hole} at {worst:.3f} uncertain share '
                  f'(same pattern as route confirmation; see advisory.contextUncertainShares in qa-report.json for every hole).\n')
    out.write(f'approved {layout_id} @ {content_hash[:12]} (bytes {proposed["packageBytesSha256"][:12]})\n')
    out.write('next steps:\n'
              f'  1. Storage upload (if not done with --upload): course-factory.py ship --approve {layout_id} {content_hash} --upload\n'
              '  2. open a PR with the updated course-geometry/approvals.json and course-geometry/registry.generated.json\n')
    if args.upload:
        return _do_upload(staging_dir, layout_id, session.repo_root, out)
    return 0


def _do_upload(staging_dir, layout_id, repo_root, out):
    try:
        url, key, source = storage_env(os.environ, repo_root=repo_root)
    except StorageEnvMissing as exc:
        out.write(f'upload skipped: {exc}\n')
        return 1
    out.write(f'using Storage credentials from {source}\n')
    try:
        uploaded = upload_staged(url, key, os.path.join(staging_dir, layout_id))
    except (StorageBucketMissing, StorageUploadError) as exc:
        out.write(f'upload failed: {exc}\n')
        return 1
    out.write(f'uploaded {len(uploaded)} file(s) to Storage bucket {STORAGE_BUCKET}\n')
    return 0
