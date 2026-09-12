# Sphera Field Station

An installable, offline-ready progressive web app demo derived from the local Sphera Pack, with the canonical Sphere Gice Melody v2 / v3.3 “Honk Heist” build promoted as its flagship exhibit and the SM7 Goose Cube Workbook builder included as a core tool. Spherai Voxel has been developed into a quaternion-driven 64-sheet edition: eight complete Zooter rainbow-note cycles arranged as eight symmetric octaves.

The Field Station also contains **Goose Crossing Local**, a Sites-independent migration of the knot-to-S³ interaction. It uses the observed Voxel 64 note/color mapping as its source vocabulary, the verified `sphera-state.js` candidate runtime for hash-chained events and session capsules, deterministic seeded initialization for the biome, and full local biome checkpoints. This is recorded as a downstream extension; it does not modify or claim adoption into the draft master pack contract.

Voxel 64 is intentionally still by default. Its quaternion orientation changes only through direct pointer/touch input; no autonomous rotation is applied.

## Run locally

Serve this directory over HTTP (service workers do not run from `file://`):

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173`.

The files under `exhibits/` are copied snapshots of the original Pack experiments. The source folder at `C:\Users\tmacd\OneDrive\Desktop\Sphera Pack` is unchanged.

Goose Crossing Local is an explicit exception to the snapshot-only note: it is a new local adapter assembled from verified and observed project artifacts. Provenance and the pinned pack digest are recorded in `sphera-integration.yaml`.
