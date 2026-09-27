---
name: mcbe-geo-ui
description: Design and inspect Bedrock geometry UI shown through a player client entity and JSON UI live_player_renderer, including GeouiStudio projects, scene/property transport and pack override integration. Use for player-renderer Geo UI, not ordinary held attachables.
---

# Geometry UI

Geo UI projects model planes through the player renderer. It is distinct from an equipped attachable and from native interactive JSON UI controls. Choose geometry for projected visuals; name a separate input owner when interaction is required.

- For `.geoui.json` save/load, missing media, IDs or export configuration, read [native project inspection](references/project-inspection.md) and run `node tools/geoui-inspect.mjs --input PROJECT.geoui.json --json`.
- For generated geometry, atlas, materials or renderer ownership, read [GeouiStudio contract](references/geoui-contract.md).
- For pack integration, coordinate calibration or verification, read [integration and acceptance](references/integration-and-acceptance.md).
- For state, multiplayer, closing or reconnect behavior, select `docs/81-geometry-ui-state-and-lifecycle.md` from the repository. Check the actual entity/viewer context before choosing ordinary properties or per-viewer overrides; the upstream generator is not evidence that it uses the newer override API.

Trace project layers → geometry/texture pages → transforms/materials/render controllers → player client entity → HUD renderer. Trace BP state independently from its client-synchronized properties to Molang. Preserve original editor data and final RP/BP ownership.

When this repository is available, `node tools/attachable-inspect.mjs --rp RP --bp BP --vanilla VANILLA_RP --json` checks the attachable/client-entity resource graph. Use `--report NEW_FILE` for all edges. It does not execute GeouiStudio, simulate Molang or prove screen coverage. If the tool is absent, give the manual trace and mark the automated check unavailable.

The project inspector and pack graph inspect different artifacts. A saved project can pass its supported structural checks while recipes, external property producers or exported files remain unverified. Read `ok`, `complete`, diagnostics and omitted counts separately; keep the original project unchanged.

For a design/review request, produce the proposed file graph, state/input contract and unresolved checks. For implementation, add measured screenshots, target-device interaction evidence and a fresh Content Log before claiming the requested runtime behavior works. Keep `runtimeVerified: false` until that evidence exists.
