# Contributing and downstream use

## Draw from the master

Consumers should pin `pack_id`, `pack_revision`, and the SHA-256 of `pack.manifest.json` in their own project manifest. Local extensions must use new fields only through a new schema/version; the core schemas reject undeclared fields intentionally.

## Contribute improvements

Add a proposal to `STATUS.yaml` with an ID, owner, summary, compatibility impact, and status. A change is accepted only when it:

- updates the normative schema or boot guidance;
- increments `pack_revision` for any pack-level change;
- increments the affected semantic `schema_version` for record-contract changes;
- updates examples, checklist results, provenance, and open work;
- states whether existing records remain valid.

Projects adopting the pack may add an `adopters` entry containing project name, pinned revision/hash, status, and contact. Do not place secrets or mutable credentials here.

## Improve the master boot file

Boot guidance may clarify behavior but may not contradict the schemas. If boot behavior needs a new field or invariant, change the schema first, then the boot sequence and fixtures in the same proposal.
