"""Immutable scorecard revisions; tee labels never establish identity."""
import hashlib
import json

from .catalog import UUID, scorecard_problems


def content_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()


def import_profiles(cards, layout_id, retrieved_at, snapshot_hash, hole_count=None, require_ids=True):
    profiles, rejected, seen = {}, [], {}
    for card in cards:
        tee_id, course_id = card.get('tee_id'), card.get('course_id')
        identified = all(isinstance(v, str) and UUID.fullmatch(v) for v in (tee_id, course_id))
        if require_ids and not identified:
            raise ValueError('TEE_ID_REQUIRED: re-export scorecards with exact course and tee IDs')
        holes = [{'hole': h.get('number'), 'par': h.get('par'), 'yards': h.get('yardage'),
                  **({'handicap': h['handicap']} if h.get('handicap') is not None else {})}
                 for h in card.get('holes', [])]
        facts = {'courseId': course_id, 'teeId': tee_id if identified else None,
                 'teeName': card.get('tee_name'), 'holes': holes,
                 'courseRating': card.get('course_rating'), 'slopeRating': card.get('slope_rating')}
        revision = content_hash(facts)
        if identified:
            if tee_id in seen and seen[tee_id] != revision:
                raise ValueError(f'SCORECARD_SOURCE_CONFLICT: tee {tee_id} has different cards in one snapshot')
            seen[tee_id] = revision
        identity = f'tee-{tee_id}' if identified else 'unbound'
        profile_id = f'{layout_id}-{identity}-{revision[:20]}'
        profile = {
            'schema': 'golfhelm-scorecard-profile-v1', 'profileId': profile_id,
            'layoutId': layout_id, 'teeName': facts['teeName'], 'revision': revision,
            'courseRating': facts['courseRating'], 'slopeRating': facts['slopeRating'],
            'source': {'provider': 'helm_course_library', 'url': None, 'retrievedAt': retrieved_at[:10],
                       'snapshotHash': snapshot_hash,
                       'note': f'Immutable read-only snapshot; library source={card.get("source") or "unknown"}. '
                               'Scorecard facts only. No physical tee marker, hole association or geometry approval.'},
            'holes': holes,
        }
        if identified:
            profile['libraryBinding'] = {'courseId': course_id, 'teeId': tee_id}
        problems = scorecard_problems(profile)
        if hole_count is not None and len(holes) != hole_count:
            problems.append(f'layout requires {hole_count} holes; source has {len(holes)}')
        if problems:
            rejected.append({'teeId': tee_id, 'reason': 'SCORECARD_INVALID', 'problems': problems})
        else:
            profiles[profile_id] = profile
    return sorted(profiles.values(), key=lambda p: p['profileId']), rejected
