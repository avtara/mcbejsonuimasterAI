# Local asset learning

Use the existing local library's `indexes/assets.json` and `config/sources.json` to derive patterns from current source files. Keep the full catalog in ignored `workspace/`; it contains private source paths and identifiers.

```text
node tools/local-asset-learn.mjs scan --root <library-directory> --out workspace/<project>/learning.json --json
node tools/local-asset-learn.mjs context --catalog workspace/<project>/learning.json --need attachable --role wearable --limit 3 --max-chars 6000 --json
node tools/local-asset-learn.mjs evidence --catalog workspace/<project>/learning.json --id asset-<hash-prefix> --limit 8 --max-chars 6000 --json
```

## Scan contract

- The default reads every eligible indexed JSON/JSONC file and discovers `.material` files under registered source roots. It excludes the master-reference source, this repository itself and generated/cache directories. Binary assets remain index evidence; images are not decoded.
- `--limit N` is an explicit sample, with selected and total counts. A sample may lack the owning manifest or a referenced definition; it must not claim full resolution.
- Every selected original is read and hashed. A stale indexed hash produces `index-hash-mismatch` and is excluded from learning. JSON comments and trailing commas are supported. Invalid input produces a visible count; the CLI exits `1` after writing an incomplete scan report.
- `--cache <previous-catalog>` reuses extraction only after hashing the current original. It also checks the extractor source hash and the cached extraction digest. Changing the extractor invalidates previous extractions. This detects ordinary stale/corrupt cache data; it is not an authenticated trust boundary for a hostile catalog author.
- `--concurrency` is bounded to `1..12`, default `8`. Output uses exclusive creation and must stay inside this repository's `workspace/`, including resolved parent paths. Existing files are preserved. Do not use the old library rebuild command to run this scan.

## Evidence and retrieval

Use `--need ui|geometry|attachable|material|texture-state|nine-slice|entity|animation|render-controller`. Optionally narrow by `--role form|inventory|hud|wearable|entity|generic`. Roles are conservative content hints, not filename classifications: collection names, HUD bindings, or typed entity/attachable roots.

The context response contains neutral content-hash IDs, known aggregate facts, coverage and link-status counts. It excludes raw paths, source names, identifiers, text and arbitrary catalog fields. `--limit` is `0..10`; `--max-chars` is `1000..16000`, default `6000`. If the fixed coverage and limitations exceed a small budget, increase the budget; the tool will not silently remove them.

The character budget includes compact JSON and the final CLI line feed. Both context and evidence reserve that character before returning their result.

For an exact source follow-up, call `evidence` with a returned card ID. It verifies the current source hash and, when ownership is known, its manifest hash. Missing or stale files fail. The bounded result returns one local path, pack/subpack boundary, aggregate facts and at most `--limit 0..50` references; it never dumps source code. `privacy: local-only` is explicit. Linked targets keep their scan status and need their own current check. Content duplicates use the same representative as context and report omitted occurrences. Keep this response private rather than copying it into public docs.

| Pattern | Recorded evidence | Additional verification |
| --- | --- | --- |
| JSON UI | Namespace, control types, binding/collection counts, inheritance/texture references | `_ui_defs.json` registration, effective screen route and input behavior |
| Button state | Default/hover/pressed/locked/focus property counts | Actual referenced controls, state geometry and target-client input |
| Geometry | Identifier, bone/cube counts, per-face UV and flat cubes | Intended attachable/entity, transforms, rendered appearance |
| Attachable/entity | Explicit geometry/material/texture/animation/controller references | BP identity, alias evaluation, conditions and client visibility |
| Material | Definitions, inheritance and state counts | Vanilla bases, client/version support and actual blending |
| Nine-slice | Metadata shape/base size and same-stem image link | Current image hash/dimensions, valid slice bounds and scaled rendering |

Definition links stay inside a parsed current resource-pack manifest and its selected subpack, with base-pack fallback. Missing manifest ownership remains `unresolved-owner`. Identical IDs in another pack do not satisfy a reference. Texture links are `indexed-target-unverified` until their current image hash is separately checked. Dynamic values are preserved as unresolved dynamic evidence; this tool does not evaluate Molang, UI bindings, render-controller aliases or pack stacking.

Legacy geometry keys such as `geometry.child:geometry.parent` define the child ID and add a reference to the parent. The extractor counts local bone/cube declarations without merging inherited `reset` or `inflate` overrides; it does not report a child bone's inherited parent as locally missing. Use an owner-aware geometry checker for the effective hierarchy.

## Privacy and limits

Local/decrypted collections may lack redistribution permission. Learning a structural pattern does not grant permission to copy source assets, names, credits or identifiers. Share only the neutral context or independently authored rules; keep full provenance private. Check selected source hashes again before adapting a pattern.

Coverage means eligible text in the supplied index plus `.material` discovery. It does not cover unindexed text, image pixels, BP behavior, correct JSON UI schemas, runtime loading or visual parity. A scanned document can contain a recognizable marker and still be invalid for Minecraft. `runtimeVerified` always remains `false`.
