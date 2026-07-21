"""Fail-closed server-side release feature-flag evaluation."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ServerFeatureFlag:
    flag_id: str
    enabled: bool
    scope: str
    scientific_maturity: str
    safety_class: str
    owner: str
    limitations_document: str


def load_server_feature_flag(
    root: Path,
    flag_id: str,
    *,
    expected_scope: str = "server",
) -> ServerFeatureFlag:
    release = json.loads((root / "release" / "version.json").read_text(encoding="utf-8"))
    registry = json.loads((root / "release" / "feature-flags.json").read_text(encoding="utf-8"))
    if registry.get("schemaVersion") != 1 or registry.get("releaseVersion") != release.get("version"):
        raise RuntimeError("Feature-flag registry does not match the authoritative release metadata")
    matches = [item for item in registry.get("flags", []) if item.get("id") == flag_id]
    if len(matches) != 1:
        raise RuntimeError(f"Feature flag {flag_id} is missing or duplicated")
    item = matches[0]
    scope = str(item.get("scope", ""))
    if scope != expected_scope:
        raise RuntimeError(f"Feature flag {flag_id} must have scope {expected_scope}")
    limitations = str(item.get("limitationsDocument", ""))
    if not limitations or not (root / limitations).is_file():
        raise RuntimeError(f"Feature flag {flag_id} limitations document is unavailable")
    enabled = (
        item.get("enabled") is True
        and release.get("channel") in item.get("enabledChannels", [])
        and str(item.get("scientificMaturity", "")).lower() == release.get("maturity")
        and item.get("safetyClass") == release.get("safetyClass")
    )
    return ServerFeatureFlag(
        flag_id=flag_id,
        enabled=enabled,
        scope=scope,
        scientific_maturity=str(item.get("scientificMaturity", "")),
        safety_class=str(item.get("safetyClass", "")),
        owner=str(item.get("owner", "")),
        limitations_document=limitations,
    )
