# Sphera Master Boot

The Sphera Pack separates stable game/runtime rules from revisioned play state.

- An **engine NFT** identifies a ruleset and points to its rule book, player guide, executable/specification digest, and accepted state schema versions.
- A **state NFT revision** is a save-state record. It explicitly references one engine NFT and chains to its immediately preceding revision.
- The engine identity remains stable while state revisions advance. A state revision is never edited in place.

## Boot sequence

1. Load `pack.manifest.json` and verify its declared schemas.
2. Resolve the state record's `engine_ref`.
3. Validate the engine and state records against their schemas.
4. Confirm the state's schema version is accepted by the engine.
5. Verify content hashes and the state revision chain.
6. Load the engine specification/rules, then hydrate the referenced state snapshot.

Record hashes use RFC 8785 JSON Canonicalization Scheme (JCS) bytes encoded as UTF-8, then SHA-256 rendered as lowercase hexadecimal. Content hashes are SHA-256 over the exact retrieved bytes.

Normative definitions live in `schemas/`; valid fixtures live in `examples/`. This file explains the model but does not override the manifest or schemas.
