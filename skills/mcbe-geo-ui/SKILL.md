---
name: mcbe-geo-ui
description: Design and inspect Bedrock geometry UI shown through a player client entity and JSON UI live_player_renderer, including GeouiStudio projects, scene/property transport and pack override integration. Use for player-renderer Geo UI, not ordinary held attachables.
---

# Geometry UI

Geo UI projects model planes through the player renderer. It is distinct from an equipped attachable and from native interactive JSON UI controls. Choose geometry for projected visuals; name a separate input owner when interaction is required.

- For source/project/output analysis, read [GeouiStudio contract](references/geoui-contract.md).
- For pack integration, coordinate calibration or verification, read [integration and acceptance](references/integration-and-acceptance.md).

Trace project layers → geometry/texture pages → transforms/materials/render controllers → player client entity → HUD renderer. Trace BP state independently from its client-synchronized properties to Molang. Preserve original editor data and final RP/BP ownership.

When this repository is available, `node tools/attachable-inspect.mjs --rp RP --bp BP --vanilla VANILLA_RP --json` checks the attachable/client-entity resource graph. Use `--report NEW_FILE` for all edges. It does not execute GeouiStudio, simulate Molang or prove screen coverage. If the tool is absent, give the manual trace and mark the automated check unavailable.

For a design/review request, produce the proposed file graph, state/input contract and unresolved checks. For implementation, add measured screenshots, target-device interaction evidence and a fresh Content Log before claiming the requested runtime behavior works. Keep `runtimeVerified: false` until that evidence exists.
