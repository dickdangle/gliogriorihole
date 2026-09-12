# Validation checklist

## Structure

- [ ] `pack.manifest.json` parses as JSON and all relative paths resolve inside this folder.
- [ ] Both schemas declare JSON Schema draft 2020-12 and reject unknown fields.
- [ ] Every example validates against its declared record schema with URI and date-time format checks enabled.

## Engine record

- [ ] `nft_id` uniquely identifies the engine by chain, contract, and token.
- [ ] Ruleset and schema versions use semantic `major.minor.patch` form.
- [ ] Rule book, player guide, and engine-spec URIs resolve.
- [ ] Retrieved engine-spec bytes match `engine_spec.sha256`.
- [ ] Provenance source bytes match `provenance.source_sha256`.

## State records and revision chain

- [ ] `engine_ref` exactly equals the intended engine's `nft_id`.
- [ ] State `schema_version` occurs in the engine's `accepted_state_schema_versions`.
- [ ] All revisions retain the same state `nft_id` and `engine_ref`.
- [ ] Revision 1 has `previous_revision: null`.
- [ ] Each later revision is exactly prior revision + 1.
- [ ] Each later `previous_revision.revision` names the immediate predecessor.
- [ ] `previous_revision.record_sha256` matches SHA-256 over the predecessor's RFC 8785 JCS UTF-8 bytes.
- [ ] Retrieved snapshot bytes match `snapshot.sha256`.
- [ ] Creation timestamps do not move backward along the chain.

## Release and collaboration

- [ ] Illustrative example values are not mistaken for deployed identities or content.
- [ ] `pack_revision`, `STATUS.yaml`, examples, provenance, and compatibility notes are updated together.
- [ ] Downstream projects pin the manifest hash and record adoption or extension status.
- [ ] No secrets, private keys, or mutable credentials are committed.
