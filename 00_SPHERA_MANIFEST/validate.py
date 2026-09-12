"""Zero-dependency structural and cross-record validator for the bundled examples."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
SHA256 = re.compile(r"^[a-f0-9]{64}$")
SEMVER = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
NFT_KEYS = {"chain_id", "contract", "token_id"}


def load(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def uri(value: str) -> bool:
    return bool(urlparse(value).scheme)


def nft_id(value: dict) -> bool:
    return set(value) == NFT_KEYS and all(isinstance(value[key], str) and value[key] for key in NFT_KEYS)


def provenance(value: dict) -> bool:
    required = {"created_at", "created_by", "source_uri", "source_sha256"}
    try:
        datetime.fromisoformat(value["created_at"].replace("Z", "+00:00"))
    except (KeyError, TypeError, ValueError):
        return False
    return (
        set(value) == required
        and bool(value["created_by"])
        and uri(value["source_uri"])
        and bool(SHA256.fullmatch(value["source_sha256"]))
    )


def canonical_sha256(value: dict) -> str:
    # The ASCII-only fixtures produce identical bytes under RFC 8785 JCS.
    data = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def validate_engine(value: dict) -> None:
    assert value["record_type"] == "sphera.engine-nft"
    assert value["schema_version"] == "1.0.0" and SEMVER.fullmatch(value["schema_version"])
    assert nft_id(value["nft_id"])
    assert SEMVER.fullmatch(value["ruleset"]["version"])
    assert uri(value["resources"]["rule_book_uri"]) and uri(value["resources"]["player_guide_uri"])
    assert uri(value["engine_spec"]["uri"]) and SHA256.fullmatch(value["engine_spec"]["sha256"])
    assert value["accepted_state_schema_versions"] and len(set(value["accepted_state_schema_versions"])) == len(value["accepted_state_schema_versions"])
    assert all(SEMVER.fullmatch(item) for item in value["accepted_state_schema_versions"])
    assert value["revision"] == 1 and provenance(value["provenance"])


def validate_state(value: dict) -> None:
    assert value["record_type"] == "sphera.state-nft"
    assert value["schema_version"] == "1.0.0" and nft_id(value["nft_id"]) and nft_id(value["engine_ref"])
    assert isinstance(value["revision"], int) and value["revision"] >= 1
    assert uri(value["snapshot"]["uri"]) and SHA256.fullmatch(value["snapshot"]["sha256"])
    assert provenance(value["provenance"])
    previous = value["previous_revision"]
    assert previous is None or (
        set(previous) == {"revision", "record_sha256"}
        and isinstance(previous["revision"], int)
        and previous["revision"] >= 1
        and SHA256.fullmatch(previous["record_sha256"])
    )


def main() -> None:
    manifest = load("pack.manifest.json")
    for relative in [*manifest["record_schemas"].values(), manifest["entrypoint"], manifest["validation_checklist"]]:
        assert (ROOT / relative).is_file(), f"missing manifest target: {relative}"
    engine = load(manifest["examples"]["engine"])
    states = [load(relative) for relative in manifest["examples"]["state_revisions"]]
    validate_engine(engine)
    for state in states:
        validate_state(state)
        assert state["engine_ref"] == engine["nft_id"]
        assert state["schema_version"] in engine["accepted_state_schema_versions"]
    assert states[0]["revision"] == 1 and states[0]["previous_revision"] is None
    for previous, current in zip(states, states[1:]):
        assert current["nft_id"] == previous["nft_id"]
        assert current["engine_ref"] == previous["engine_ref"]
        assert current["revision"] == previous["revision"] + 1
        assert current["previous_revision"] == {
            "revision": previous["revision"],
            "record_sha256": canonical_sha256(previous),
        }
        assert current["provenance"]["created_at"] >= previous["provenance"]["created_at"]
    print(f"OK: {manifest['pack_id']} revision {manifest['pack_revision']}; 1 engine, {len(states)} state revisions")


if __name__ == "__main__":
    main()
