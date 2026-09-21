"""Factory operator entry point for immutable local review, never sign-off."""
import hashlib
import http.client
import json
import shutil
import subprocess
from pathlib import Path

from .lab_bundle import MAX_JSON, export_bundle, read_checked


def require_served_bundle(output_root, bundle):
    """Probe the exact manifest; an unrelated server or another root cannot pass.

    HTTPConnection intentionally does not follow redirects, and the endpoint
    is fixed loopback rather than an operator-supplied remote service.
    """
    connection = http.client.HTTPConnection('127.0.0.1', 8774, timeout=5)
    try:
        connection.request('GET', f'/__factory/{bundle["layoutId"]}/{bundle["bundleHash"]}/manifest')
        response = connection.getresponse()
        body = response.read(MAX_JSON + 1)
        if response.status != 200:
            raise ValueError(f'lab returned HTTP {response.status} for this exact bundle')
        if len(body) > MAX_JSON or hashlib.sha256(body).hexdigest() != bundle['bundleHash']:
            raise ValueError('lab manifest hash mismatch')
        if body != read_checked(output_root, bundle['manifest'], MAX_JSON):
            raise ValueError('lab serves a different factory output root')
    finally:
        connection.close()


def capture_directory(output_root, bundle):
    root = Path(output_root).absolute()
    path = root / 'lab' / 'captures' / bundle['layoutId'] / bundle['bundleHash']
    current = root
    for part in path.relative_to(root).parts:
        current = current / part
        if current.is_symlink():
            raise ValueError('capture symlink directories are forbidden')
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('capture path escaped factory output root')
    if path.is_dir() and any(child.is_symlink() for child in path.iterdir()):
        raise ValueError('capture symlink files are forbidden')
    return path


def review_bundle(session, args, out):
    if args.layout not in session.catalog.layouts:
        out.write(f'review-bundle failed: unknown layout {args.layout}; no fallback is allowed\n')
        return 1
    try:
        bundle = export_bundle(session.output_root, args.layout)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        out.write(f'review-bundle failed: {exc}\n')
        return 1
    out.write(json.dumps(bundle, indent=1) + '\n')
    out.write('Local review only: this does not satisfy physical admission or the legacy player/canary sign-off matrix.\n')
    if not args.capture:
        return 0
    try:
        require_served_bundle(session.output_root, bundle)
    except (OSError, ValueError, http.client.HTTPException) as exc:
        out.write(f'capture unavailable: {exc}\nStart the existing factory lab from this repository with '
                  'GOLFHELM_FACTORY_OUTPUT_ROOT set to the configured output root, then run '
                  'node_modules/.bin/vite --config scripts/golf/course-geometry/factory-lab.config.ts '
                  'and retry review-bundle --capture. No server was launched.\n')
        return 1
    node = shutil.which('node')
    if not node:
        out.write('capture unavailable: node is not installed\n')
        return 1
    try:
        capture_root = capture_directory(session.output_root, bundle)
        result = subprocess.run([node, str(Path(session.repo_root) / 'scripts/golf/course-geometry/capture-factory-bundle.cjs'),
                                 f'--layout={args.layout}', f'--bundle={bundle["bundleHash"]}', f'--out={capture_root}'],
                                cwd=session.repo_root, capture_output=True, text=True,
                                timeout=max(60, bundle['holeCount'] * 90), check=False)
        if result.stdout:
            out.write(result.stdout)
        if result.stderr:
            out.write(result.stderr)
        if result.returncode:
            out.write(f'capture failed with exit {result.returncode}; review/sign-off not granted\n')
            return 1
        report = json.loads(read_checked(session.output_root, capture_root / 'captures.json', MAX_JSON))
        if (report.get('schema') != 'golfhelm-factory-bundle-captures-v1'
                or report.get('bundleHash') != bundle['bundleHash'] or report.get('packageHash') != bundle['packageHash']
                or report.get('layoutId') != args.layout or report.get('errors')
                or len(report.get('captures') or []) != bundle['holeCount']
                or report.get('physicallyApproved') is not False):
            raise ValueError('capture report does not match the requested local review contract')
        out.write(f'review captures: {capture_root / "captures.json"}\n')
        return 0
    except (OSError, ValueError, TypeError, subprocess.TimeoutExpired) as exc:
        out.write(f'capture failed: {exc}; review/sign-off not granted\n')
        return 1
