# All agents read this first

This folder is the coordination surface for the Sphera master boot model. Before changing or consuming it:

1. Read [`MASTER_BOOT.md`](MASTER_BOOT.md).
2. Check [`STATUS.yaml`](STATUS.yaml) for the current revision, open work, and adoption notes.
3. Treat [`pack.manifest.json`](pack.manifest.json) and `schemas/` as the normative machine contract.
4. Validate changes with [`VALIDATION_CHECKLIST.md`](VALIDATION_CHECKLIST.md).
5. Record proposals and downstream use as described in [`CONTRIBUTING.md`](CONTRIBUTING.md).

Quick check: `python 00_SPHERA_MANIFEST/validate.py`

Do not silently rewrite identifiers, hashes, revision ancestry, or compatibility ranges. Improvements begin as proposals; accepted changes increment `pack_revision` and update provenance and status in the same change.

## Project integration

A consuming project should record:

```yaml
sphera_pack:
  source: "relative/path/or/repository-url/00_SPHERA_MANIFEST"
  pack_id: "sphera.engine-state.core"
  pack_revision: 1
  manifest_sha256: "<sha256 of pack.manifest.json>"
  local_status: "evaluating | adopted | extending"
  contact: "<project or maintainer>"
```

Pinning the manifest hash makes it clear what a project drew from while still allowing that project to propose improvements upstream.
