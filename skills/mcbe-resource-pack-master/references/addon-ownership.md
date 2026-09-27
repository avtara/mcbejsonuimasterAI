# Own the connected feature

Trace the active pack stack and manifests before borrowing any reference. Use exact identifiers and real file contents; directory names are only discovery hints.

| Feature | Owners and edges to verify |
| --- | --- |
| Item/model | BP item identifier → RP item atlas/attachable → geometry, texture, material, animation/render controllers |
| Entity visual | BP entity/state → RP client entity → referenced assets and state aliases |
| Block visual | BP geometry/material instances → RP geometry/terrain atlas/texture; check permutations and target version |
| Animation | Entity/attachable script alias → animation/controller identifier → bones and Molang inputs |
| Particle/audio | BP/script or animation trigger → RP effect/sound definition → texture/material/audio resource |
| Interaction/reward | Input event → BP/server state and permissions → result → display update |
| JSON UI | Registered screen/factory → binding/collection → sender and textures/font |

Keep RP presentation separate from authoritative BP/server changes. An equipment marker, hidden geometry or local animation variable does not authorize a purchase, craft or reward. Follow lifecycle events: activation, duplicate activation, cancel, unequip, death, reconnect and other players observing it. Preserve item count, durability, enchantment and other state where the requested operation needs it.

Check UUID/version/dependency links and actual installed roots. For overlapping packs, record which pack owns player overrides, screen files, atlas keys, material names and animation identifiers. Target-pack resolution comes first; a definition available only in the reference pack is unresolved in the delivered pack.

When available, use the item's/particle's own generator and validator. Do not infer component/API support from the current repository's research date. Use current official documentation for the declared client/API version and keep beta-only behavior explicit. For delivery, include editable source and requested pack archives, with original reference content and local-only provenance excluded.
