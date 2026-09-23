"""Read-only evidence audit for the course-world factory.

A GLB proves only that a static render asset exists.  This module reads the
separate route/scorecard, GLB round-trip, physical-truth, and capability
artifacts so operational coverage reports cannot accidentally promote a
visual-only world into One Tap or measurement authority.
"""
from __future__ import annotations

import json
import os
import hashlib
from collections import Counter
from pathlib import Path
from typing import Any

from .catalog import Catalog, load_catalog
from .context import Context, supported_hole_count
from .route_recovery import inventory as route_inventory

SCHEMA = "golfhelm-factory-world-coverage-audit-v2"


def _read(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return None
    return value if isinstance(value, dict) else None


def _sha256(path: Path) -> str | None:
    """Digest an already-retained artifact for the report.

    The audit is intentionally read-only. A missing or unreadable file is
    represented as absent evidence; it is never repaired, regenerated, or
    treated as an approval.
    """
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def _file_evidence(path: Path) -> dict[str, Any] | None:
    digest = _sha256(path)
    return {"path": str(path), "sha256": digest} if digest else None


def _first(items: list[str], fallback: str) -> str:
    return items[0] if items else fallback


def _expected_keys(layout: dict[str, Any]) -> list[str]:
    return list(layout.get("holeOrder") or [])


def _hole_dir(layout_root: Path, hole_key: str) -> Path:
    return layout_root / "world" / "holes" / hole_key


def _hole_evidence(layout_root: Path, hole_key: str, artifact_hole_key: str | None, record: dict[str, Any]) -> dict[str, Any]:
    """Read an artifact by its own key while retaining the catalog key it is
    meant to serve.  An ordinal match helps audit stale assets, but it never
    creates the physical-hole crosswalk required by One Tap."""
    artifact_hole_key = artifact_hole_key or hole_key
    folder = _hole_dir(layout_root, artifact_hole_key)
    truth = _read(folder / "validation" / "course-truth.json")
    roundtrip = _read(folder / "validation" / "glb-roundtrip.json")
    glb = folder / "rendering" / f"{artifact_hole_key}.glb"
    admission = record.get("admission") if isinstance(record.get("admission"), dict) else {}
    capabilities = admission.get("capabilities") if isinstance(admission.get("capabilities"), dict) else {}
    return {
        "holeKey": hole_key,
        "artifactHoleKey": artifact_hole_key,
        "physicalHoleKeyMatchesCatalog": artifact_hole_key == hole_key,
        "glb": glb.is_file(),
        "roundTrip": bool(roundtrip and roundtrip.get("passed") is True),
        "truthGate": bool(truth and truth.get("passed") is True),
        "canRender": bool(capabilities.get("renderHole", {}).get("allowed") is True) or glb.is_file(),
        "canAssociateRoundHole": bool(capabilities.get("associateRoundHole", {}).get("allowed") is True),
        "canMeasureGreenDistance": bool(capabilities.get("measureGreenDistance", {}).get("allowed") is True),
        "canHighlightSelectedTee": bool(capabilities.get("highlightSelectedTee", {}).get("allowed") is True),
        "truthBlockers": _truth_blockers(truth),
        "capabilityBlockers": _capability_blockers(capabilities),
    }


def _truth_blockers(truth: dict[str, Any] | None) -> list[str]:
    if not truth:
        return ["TRUTH_GATE_NOT_RUN"]
    if truth.get("passed") is True:
        return []
    blockers: list[str] = []
    for hole in truth.get("holes") or []:
        for feature in hole.get("features") or []:
            for validation in feature.get("validation") or []:
                if isinstance(validation, str):
                    blockers.append(validation)
    return sorted(set(blockers)) or ["TRUTH_GATE_FAILED"]


def _capability_blockers(capabilities: dict[str, Any]) -> list[str]:
    blockers: list[str] = []
    for name in ("associateRoundHole", "measureGreenDistance", "highlightSelectedTee"):
        decision = capabilities.get(name)
        if isinstance(decision, dict) and decision.get("allowed") is not True:
            blockers.extend(reason for reason in decision.get("reasons") or [] if isinstance(reason, str))
    return sorted(set(blockers))


def _route_rows(context: Context) -> dict[str, dict[str, Any]]:
    """Route recovery is a retained-only read. Isolate malformed evidence to
    its own layout so one bad source cannot hide a route-ready sibling."""
    rows: dict[str, dict[str, Any]] = {}
    for layout_id in sorted(context.catalog.layouts):
        try:
            result = route_inventory(context, layout_id=layout_id).get("layouts", [])
            rows[layout_id] = result[0] if result else {"auditError": "ROUTE_AUDIT_EMPTY"}
        except (OSError, ValueError, TypeError, KeyError) as exc:
            rows[layout_id] = {"auditError": f"ROUTE_AUDIT_UNAVAILABLE: {exc}"}
    return rows


def _facility_visual(layout_root: Path) -> dict[str, Any]:
    pointer = _read(layout_root / "visual-world.json") or {}
    contract = pointer.get("renderingContract") if isinstance(pointer.get("renderingContract"), dict) else {}
    glb_path = pointer.get("glb")
    return {
        "available": pointer.get("canonicalHoleRoutesAdmitted") is False and isinstance(glb_path, str) and Path(glb_path).is_file(),
        "canRender": contract.get("canRender") is True,
        "canMeasure": contract.get("canMeasure") is True,
        "maySupplyHoleAssociation": contract.get("maySupplyHoleAssociation") is True,
        "glb": glb_path,
    }


def _terrain_evidence(output_root: Path, layout_id: str, facility_id: str) -> dict[str, Any]:
    """Summarize retained terrain decisions without selecting a terrain source.

    A factory run is evidence about why a stage stopped. The direct terrain
    root blocker is preferred over dependent-task noise. Source-selection
    dossiers are referenced by digest so a reviewer can see exactly which
    source decision still needs review.
    """
    dossiers = sorted((output_root / "facilities" / facility_id / "terrain").glob("**/source-selection-dossier.json"))
    dossier_rows = [_file_evidence(path) for path in dossiers]
    direct: dict[str, Any] | None = None
    for report_path in sorted((output_root / "runs").glob("*/report.json"), key=lambda path: path.stat().st_mtime, reverse=True):
        report = _read(report_path)
        if not report:
            continue
        for blocked in report.get("blocked") or []:
            if not isinstance(blocked, dict) or blocked.get("key") != f"layout.terrain.acquire[{layout_id}]":
                continue
            blockers = blocked.get("blockers") or []
            if not blockers or not isinstance(blockers[0], dict):
                continue
            direct = {"code": blockers[0].get("code"), "evidence": blockers[0].get("evidence"),
                      "runReport": _file_evidence(report_path)}
            break
        if direct:
            break
    if direct and direct.get("code") == "NATIVE_TERRAIN_COVERAGE_GAP":
        state = "native_terrain_incomplete"
    elif dossier_rows:
        state = "terrain_decision_pending"
    else:
        state = "terrain_candidate_or_not_audited"
    return {"state": state, "directBlocker": direct, "sourceSelectionDossiers": dossier_rows}


def _lifecycle_state(row: dict[str, Any]) -> str:
    """A reproducible, non-authorizing state derived from evidence rows."""
    if row["oneTap"]["geometryEligible"] and row["physicalAdmission"]["ready"]:
        return "production_compiled"
    terrain_state = row["terrain"]["state"]
    if terrain_state in {"native_terrain_incomplete", "terrain_decision_pending"} and row["renderTier"] == "facility_visual_only":
        return terrain_state
    if not row["routes"]["ready"]:
        return "route_blocked"
    if row["renderTier"] in {"full_hole_visual_candidate", "partial_hole_visual_candidate"}:
        return "physical_review_pending"
    if row["renderTier"] == "facility_visual_only":
        return "facility_visual_only"
    return "source_or_compilation_blocked"


def _acquisition_task(row: dict[str, Any]) -> dict[str, Any] | None:
    """Turn a retained blocker into a precise, non-executing work item.

    This does not discover/download data or assert that a candidate source is
    authoritative. It tells a reviewer exactly which missing fact must be
    attached to the existing source-import contract.
    """
    route = row["routes"]
    terrain = row["terrain"]
    if not route["ready"]:
        return {
            "kind": "route_evidence",
            "layoutId": row["layoutId"],
            "facilityId": row["facilityId"],
            "blockers": route["blockers"] or ["ROUTE_IDENTITY_UNCONFIRMED"],
            "requiredFacts": [
                "explicit layout identity and numbered tee-to-green route for every expected hole",
                "explicit tee/green associations or a route endpoint binding",
                "source revision, declared CRS, usage terms, and immutable raw artifact hash",
            ],
            "acceptableEvidence": ["course/operator-published georeferenced route source", "reviewed first-party field capture", "repository-approved authoritative GIS source"],
            "prohibitedResolution": ["proximity", "scorecard yardage", "green sorting", "visual resemblance"],
            "nextAction": route.get("nextAction"),
            "owner": "course-geometry-review",
        }
    if terrain["state"] in {"native_terrain_incomplete", "terrain_decision_pending"}:
        direct = terrain.get("directBlocker") or {}
        return {
            "kind": "terrain_evidence",
            "layoutId": row["layoutId"],
            "facilityId": row["facilityId"],
            "blockers": [direct.get("code")] if direct.get("code") else [terrain["state"].upper()],
            "requiredFacts": [
                "native terrain coverage for every playable corridor and safety margin",
                "source CRS, vertical datum, Z units, resolution, no-data behavior, and acquisition lineage",
                "reviewed source-selection decision bound to retained dossier hash",
            ],
            "acceptableEvidence": ["repository-approved native lidar/DTM product", "reviewed composite with per-tile provenance if policy permits"],
            "prohibitedResolution": ["synthetic interpolation presented as native terrain", "unreviewed visual fallback for measurement"],
            "nextAction": "Review the retained source-selection dossier or acquire the documented missing native coverage; retain the raw source before compiling.",
            "owner": "terrain-source-review",
        }
    return None


def _render_tier(expected: list[str], holes: list[dict[str, Any]], facility_visual: dict[str, Any]) -> str:
    if expected and all(h["glb"] for h in holes) and all(h["roundTrip"] for h in holes):
        if all(h["truthGate"] for h in holes):
            return "full_hole_physical_candidate"
        return "full_hole_visual_candidate"
    if any(h["glb"] for h in holes):
        return "partial_hole_visual_candidate"
    if facility_visual["available"]:
        return "facility_visual_only"
    return "not_rendered"


def _next_blocker(row: dict[str, Any]) -> str:
    if not row["scorecard"]["ready"]:
        return _first(row["scorecard"]["blockers"], "SCORECARD_REQUIRED")
    if not row["routes"]["ready"]:
        return _first(row["routes"]["blockers"], "ROUTE_IDENTITY_UNCONFIRMED")
    terrain = row.get("terrain", {})
    direct = terrain.get("directBlocker") if isinstance(terrain, dict) else None
    if terrain.get("state") == "native_terrain_incomplete":
        return (direct or {}).get("code", "NATIVE_TERRAIN_COVERAGE_GAP")
    if terrain.get("state") == "terrain_decision_pending":
        return "TERRAIN_SOURCE_SELECTION_REVIEW_REQUIRED"
    if row["assets"]["missingGlbs"]:
        return f"HOLE_GLB_REQUIRED:{row['assets']['missingGlbs'][0]}"
    if row["assets"]["failedRoundTrips"]:
        return f"GLB_ROUNDTRIP_REQUIRED:{row['assets']['failedRoundTrips'][0]}"
    if row["assets"]["physicalHoleKeyMismatches"]:
        mismatch = row["assets"]["physicalHoleKeyMismatches"][0]
        return f"PHYSICAL_HOLE_KEY_CROSSWALK_REQUIRED:{mismatch['catalogHoleKey']}->{mismatch['artifactHoleKey']}"
    if not row["physicalAdmission"]["ready"]:
        return _first(row["physicalAdmission"]["blockers"], "PHYSICAL_REVIEW_REQUIRED")
    if not row["oneTap"]["geometryEligible"]:
        return _first(row["oneTap"]["blockers"], "ONE_TAP_GEOMETRY_BINDING_REQUIRED")
    return "READY"


def audit_catalog(repo_root: str, catalog_root: str, output_root: str) -> dict[str, Any]:
    """Return a complete catalog report without running factory tasks or
    modifying the output directory.  Paths are inputs only."""
    catalog: Catalog = load_catalog(catalog_root)
    context = Context(repo_root, catalog, output_root, ledger=None)
    routes = _route_rows(context)
    rows: list[dict[str, Any]] = []

    for layout_id, layout in sorted(catalog.layouts.items()):
        expected = _expected_keys(layout)
        root = Path(output_root) / "layouts" / layout_id
        world = _read(root / "world" / "course-world-manifest.json") or {}
        manifest_records = [h for h in world.get("holes") or [] if isinstance(h, dict) and isinstance(h.get("key"), str)]
        manifest_holes = {h["key"]: h for h in manifest_records}
        manifest_by_ordinal = {h.get("ordinal"): h for h in manifest_records if isinstance(h.get("ordinal"), int)}
        holes = []
        for ordinal, key in enumerate(expected, start=1):
            record = manifest_holes.get(key) or manifest_by_ordinal.get(ordinal) or {}
            artifact_key = record.get("key") if isinstance(record.get("key"), str) else None
            holes.append(_hole_evidence(root, key, artifact_key, record))
        route = routes.get(layout_id, {})
        route_ready = route.get("routeStatus") == "routes_resolved" and route.get("candidateAssemblyReady") is True
        card = context.scorecard(layout_id)
        scorecard_ready = bool(card and supported_hole_count(len(expected)) and len(card.get("holes") or []) == len(expected))
        scorecard_blockers = [] if scorecard_ready else (["SCORECARD_REQUIRED"] if not card else ["SCORECARD_HOLE_MISMATCH"])
        visual = _facility_visual(root)
        terrain = _terrain_evidence(Path(output_root), layout_id, layout["facilityId"])
        missing_glbs = [h["holeKey"] for h in holes if not h["glb"]]
        failed_roundtrips = [h["holeKey"] for h in holes if h["glb"] and not h["roundTrip"]]
        key_mismatches = [{"catalogHoleKey": h["holeKey"], "artifactHoleKey": h["artifactHoleKey"]} for h in holes if h["glb"] and not h["physicalHoleKeyMatchesCatalog"]]
        truth_blockers = sorted({b for h in holes if not h["truthGate"] for b in h["truthBlockers"]})
        association_blockers = sorted({b for h in holes if not h["canAssociateRoundHole"] for b in h["capabilityBlockers"]})
        if key_mismatches:
            association_blockers.append("PHYSICAL_HOLE_KEY_CROSSWALK_REQUIRED")
        association_blockers = sorted(set(association_blockers))
        association_ready = bool(expected) and len(missing_glbs) == 0 and not key_mismatches and all(h["canAssociateRoundHole"] for h in holes)
        measurement_ready = bool(expected) and all(h["canMeasureGreenDistance"] for h in holes)
        tee_ready = bool(expected) and all(h["canHighlightSelectedTee"] for h in holes)
        physical_ready = bool(expected) and all(h["truthGate"] for h in holes)
        manifest_path = root / "world" / "course-world-manifest.json"
        capability_path = root / "capability-report.json"
        visual_path = root / "visual-world.json"
        row = {
            "layoutId": layout_id,
            "facilityId": layout["facilityId"],
            "courseName": layout.get("name"),
            "expectedHoleCount": len(expected),
            "renderTier": _render_tier(expected, holes, visual),
            "routes": {"ready": route_ready, "status": route.get("routeStatus", "not_audited"), "blockers": route.get("blockers") or ([route.get("auditError")] if route.get("auditError") else []), "nextAction": route.get("nextAction")},
            "scorecard": {"ready": scorecard_ready, "profileId": (card or {}).get("profileId"), "blockers": scorecard_blockers},
            "assets": {"expectedHoleGlbs": len(expected), "holeGlbs": sum(h["glb"] for h in holes), "missingGlbs": missing_glbs, "roundTripPassed": sum(h["roundTrip"] for h in holes), "failedRoundTrips": failed_roundtrips, "physicalHoleKeyMismatches": key_mismatches, "facilityVisual": visual},
            "terrain": terrain,
            "physicalAdmission": {"ready": physical_ready, "truthGatePassed": sum(h["truthGate"] for h in holes), "truthGateFailedOrMissing": [h["holeKey"] for h in holes if not h["truthGate"]], "blockers": truth_blockers},
            "oneTap": {"geometryEligible": association_ready, "measurementEligible": measurement_ready, "teeHighlightEligible": tee_ready, "blockers": association_blockers, "rule": "A GLB or facility visual fallback is never a One Tap geometry binding. Raw round evidence and scorecard snapshots remain usable independently."},
            "capabilityReport": {"earnedTier": (_read(root / "capability-report.json") or {}).get("earnedTier"), "publishedVisual": bool((_read(root / "capability-report.json") or {}).get("capabilities", {}).get("productionVisual") is True)},
            "artifacts": {
                "courseWorldManifest": _file_evidence(manifest_path),
                "capabilityReport": _file_evidence(capability_path),
                "visualWorld": _file_evidence(visual_path),
                "packageHash": world.get("packageHash"),
                "visualPackageHash": (_read(visual_path) or {}).get("visualPackageHash"),
                "routeSourceGeometryHash": route.get("sourceGeometryHash"),
                "routeTracesHash": route.get("routeTracesHash"),
            },
            "holes": holes,
        }
        row["nextBlocker"] = _next_blocker(row)
        row["lifecycleState"] = _lifecycle_state(row)
        row["acquisitionTask"] = _acquisition_task(row)
        rows.append(row)

    totals = Counter(row["renderTier"] for row in rows)
    return {
        "schema": SCHEMA,
        "contract": {
            "readOnly": True,
            "visualDoesNotGrantMeasurement": True,
            "facilityVisualDoesNotSupplyHoleAssociation": True,
            "oneTapRequiresPerHoleAssociation": True,
            "physicalAdmissionRequiresEveryExpectedHoleTruthGate": True,
        },
        "catalogProblems": catalog.problems,
        "totals": {
            "layouts": len(rows),
            "fullHoleVisualCandidates": totals["full_hole_visual_candidate"],
            "fullHolePhysicalCandidates": totals["full_hole_physical_candidate"],
            "partialHoleVisualCandidates": totals["partial_hole_visual_candidate"],
            "facilityVisualOnly": totals["facility_visual_only"],
            "notRendered": totals["not_rendered"],
            "routeBlocked": sum(row["lifecycleState"] == "route_blocked" for row in rows),
            "terrainDecisionBlocked": sum(row["lifecycleState"] in {"native_terrain_incomplete", "terrain_decision_pending"} for row in rows),
            "physicalReviewPending": sum(row["lifecycleState"] == "physical_review_pending" for row in rows),
            "oneTapGeometryEligible": sum(row["oneTap"]["geometryEligible"] for row in rows),
            "measurementEligible": sum(row["oneTap"]["measurementEligible"] for row in rows),
            "acquisitionTasks": sum(row["acquisitionTask"] is not None for row in rows),
        },
        "layouts": rows,
    }


def acquisition_tasks(report: dict[str, Any]) -> dict[str, Any]:
    """Project every external-evidence blocker from the canonical audit.

    This creates no competing tracker: the queue is regenerated from retained
    evidence and never discovers, downloads, or approves a source.
    """
    return {
        "schema": "golfhelm-factory-acquisition-tasks-v2",
        "readOnly": True,
        "tasks": [
            {"layoutId": row["layoutId"], "facilityId": row["facilityId"],
             "lifecycleState": row["lifecycleState"], **row["acquisitionTask"]}
            for row in report["layouts"] if row.get("acquisitionTask")
        ],
    }


def terrain_decisions(report: dict[str, Any]) -> dict[str, Any]:
    """Project terrain-held layouts into source-selection decision records."""
    return {
        "schema": "golfhelm-factory-terrain-decisions-v2",
        "readOnly": True,
        "decisions": [
            {
                "layoutId": row["layoutId"], "facilityId": row["facilityId"],
                "lifecycleState": row["lifecycleState"], "terrain": row["terrain"],
                "requiredDecision": "Retain a source selection decision bound to the dossier hash; native coverage, CRS, vertical datum, Z units, no-data behavior, and permitted capabilities must be reviewed before physical compilation.",
            }
            for row in report["layouts"]
            if row["lifecycleState"] in {"native_terrain_incomplete", "terrain_decision_pending"}
        ],
    }


def render_markdown(report: dict[str, Any]) -> str:
    totals = report["totals"]
    lines = ["# Course factory world coverage", "", "Read-only report. Render assets are never treated as physical or One Tap measurement authority.", "",
             "| Layout | Lifecycle | Render | Hole GLBs | Routes | Terrain | One Tap geometry | Measurement | Physical admission | Next blocker |",
             "|---|---|---|---:|---|---|---|---|---|---|"]
    for row in report["layouts"]:
        assets, routes, card, tap, admission = row["assets"], row["routes"], row["scorecard"], row["oneTap"], row["physicalAdmission"]
        lines.append("| {layout} | {lifecycle} | {tier} | {glbs}/{expected} | {route} | {terrain} | {tap} | {measurement} | {admission} | {blocker} |".format(
            layout=row["layoutId"], lifecycle=row["lifecycleState"], tier=row["renderTier"], glbs=assets["holeGlbs"], expected=assets["expectedHoleGlbs"],
            route="ready" if routes["ready"] else routes["status"], card="ready" if card["ready"] else "blocked",
            terrain=row["terrain"]["state"],
            tap="eligible" if tap["geometryEligible"] else "not eligible", measurement="eligible" if tap["measurementEligible"] else "not eligible",
            admission="ready" if admission["ready"] else "not approved", blocker=row["nextBlocker"]))
    lines += ["", "## Totals", "", *[f"- {key}: {value}" for key, value in totals.items()], ""]
    return "\n".join(lines)
