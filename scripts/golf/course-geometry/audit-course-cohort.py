"""Bounded, cached public-source discovery for the non-demo usage cohort.

No database writes. Facility extents remain candidates, never course bindings.
Run serially; one request/second maximum. Original responses retained for review.
"""
import gzip
import hashlib
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'src/test/fixtures/course-geometry'
CACHE = BASE / 'sources/top-course-osm'



def fetch(url, destination, limit=12_000_000):
    if destination.exists():
        return gzip.decompress(destination.read_bytes())
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.netloc not in ('nominatim.openstreetmap.org', 'www.openstreetmap.org', 'api.openstreetmap.org'):
        raise ValueError('Unapproved public source')
    time.sleep(1.1)
    request = urllib.request.Request(url, headers={'User-Agent': 'GolfHelm-local-geometry-audit/1.0 (https://github.com/njrini99-code/helmv3)'})
    with urllib.request.urlopen(request, timeout=25) as response:
        if urllib.parse.urlparse(response.url).netloc not in ('nominatim.openstreetmap.org', 'www.openstreetmap.org', 'api.openstreetmap.org'):
            raise ValueError('Unexpected source redirect')
        body = response.read(limit + 1)
    if len(body) > limit:
        raise ValueError('Source exceeds bounded cache size')
    destination.write_bytes(gzip.compress(body, mtime=0))
    return body


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    prior = json.loads((BASE / 'coverage-audit.json').read_text())['courses']
    known = dict(zip(['Bryan Park Champs', 'Cacapon State Park', 'The Cardinal', 'Winchester CC'], prior))
    reports = []
    for course in json.loads((BASE / 'course-cohort-2026-09-13.json').read_text())['courses']:
        if course['name'] not in known:  # Owner narrowed the trial to these four.
            continue
        name = course['name']
        record = {'courseId': course['id'], 'name': name, 'completedRounds': course['completed_rounds'], 'status': 'identity_pending'}
        try:
            record['bboxWgs84'] = known[name]['bboxWgs84']
            record['identityEvidence'] = 'Prior bounded facility review; layout acceptance remains per-hole'
            w, s, e, n = record['bboxWgs84']
            if (e-w)*(n-s) > .003:
                raise ValueError('Facility extent exceeds bounded pilot crop; needs split review')
            url = 'https://www.openstreetmap.org/api/0.6/map?bbox=' + ','.join(map(str, [w, s, e, n]))
            key = hashlib.sha256(url.encode()).hexdigest()[:16]
            raw = fetch(url, CACHE / (key + '.osm.gz'))
            record.update(status='source_candidate', sourceUrl=url, sourceFile=key + '.osm.gz', sourceSha256=hashlib.sha256(raw).hexdigest())
            print(name + ': cached ' + str(len(raw)) + ' bytes', flush=True)
        except (OSError, ValueError, KeyError) as error:
            record.update(status='source_error', reason=str(error))
            print(name + ': ' + str(error), flush=True)
        reports.append(record)
        (CACHE / 'discovery.json').write_text(json.dumps(reports, indent=2) + '\n')
    (CACHE / 'discovery.json').write_text(json.dumps(reports, indent=2) + '\n')


if __name__ == '__main__':
    main()
