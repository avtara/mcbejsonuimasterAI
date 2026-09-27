# 80. Attachable UI authoring: rig, pose, state and evidence

This guide connects the attachable skill to an original two-state quest-map recipe. Reviewed 2026-09-28. It supplements the static graph inspector with concrete authoring checks; it does not establish Bedrock runtime success.

## Choose the smallest implementation that carries the requested state

| Request | Implementation choice | Evidence needed before promising the result |
| --- | --- | --- |
| Hold a quest map in either hand | Bound root plus four hand/perspective poses | Actual owner rig, offhand item permission and complete animation channels |
| Wear a badge over armor | Equipment component plus selected wearer geometry/material graph | Wearable slot, owner selector, inherited geometry and overlap with existing armor |
| Change pending → ready | Finite server-owned item variants | Current item instance/revision, metadata preservation and replacement outcome |
| Display changing numeric/text data | A supported synchronized state/encoding route | Consumer expression, property owner, update lifetime and target viewer; see [state/lifecycle](81-geometry-ui-state-and-lifecycle.md) |
| Click visual controls | Actual server/item input or JSON UI route | Event/cancel behavior and server validation; geometry supplies no clickable UI region |

In the task “update an open GeoUI card and a held quest map from server values,” route the card to `mcbe-geo-ui`, the held map to `mcbe-attachables-ui`, and keep one server state owner. A finite map marker may use the recipe below, while the numeric card needs its own verified state channel. Do not infer a shared actor/query context simply because both consume a quest revision.

## Original recipe

[`examples/attachables/quest-map-recipe`](../examples/attachables/quest-map-recipe/README.md) contains paired manifests, two BP items, two player-only attachables, one shared geometry, one animation file, one render controller, an item atlas, four original PNGs and English/Korean names. `recipe.json` states the adapter contract and pending runtime cases. There is no automatic grant, equipment replacement, Script API dependency or input handler.

The map uses a thin box with explicit front/back/edge UVs. The pending and ready textures differ in marker shape and color. Its root binds through `q.item_slot_to_bone_name(context.item_slot)`. Each exclusive hand/perspective branch supplies position, rotation and scale; these are authored calibration starting points. They were not copied from shield, wrench or totem source coordinates.

```sh
node examples/attachables/quest-map-recipe/verify.mjs
node tools/attachable-inspect.mjs --rp examples/attachables/quest-map-recipe/rp --bp examples/attachables/quest-map-recipe/bp --json
```

The read-only recipe verifier checks manifest/UUID links, item and icon selection, translations, PNG dimensions/real alpha, face UV bounds, animated bone existence and the sample's exact four-branch condition table. Four in-memory corruptions must fail: wrong manifest target, unknown animated bone, UV overflow and duplicate pose condition.

Observed static result: **2 states, 4 pose branches, 4 textures; 30 resolved graph edges, 0 unresolved, 0 structural errors**. The two `entity_alphatest` edges remain `external-unverified`, so `complete:false` and `runtimeVerified:false`. The PNG previews were inspected locally; shader behavior, pose/readability, Content Log and input/lifecycle require target-client tests. A minimum manifest version is not evidence of having run that version.

## What the source comparison changed

| Source and pinned evidence | Observation | Authoring consequence |
| --- | --- | --- |
| [Official attachables guide, lines 81–160](https://github.com/MicrosoftDocs/minecraft-creator/blob/1dfc5c4fa1cd75cabe558b08adee3420264ff0b5/creator/Documents/attachables.md#L81-L160) | Binding follows an item slot's target bone; the guide prefers it for flexible use | Track bound origin separately from model pivot; avoid hardwiring `rightItem` for a two-hand item |
| [Wiki method two, lines 155–225](https://github.com/Bedrock-OSS/bedrock-wiki/blob/ed49e24424c0aa8bd0edc710ffe9f09c167452b4/docs/items/attachables.md#L155-L225) | Geometry 1.16 binding workflow and a guide-specific `-24` Y correction; its cause is explicitly uncertain | Do not treat the editor guide offset as a universal runtime fix |
| [Vanilla shield controller](https://github.com/Mojang/bedrock-samples/blob/46ba6ea985fb5a92d79a9419198f10dda14c199d/resource_pack/animation_controllers/shield.animation_controllers.json#L4-L54) | Blocking and perspective transitions compose with hand conditions | Inspect both entry and return paths; only import states the target actually needs |
| [Microsoft wrench geometry](https://github.com/microsoft/minecraft-samples/blob/5e04b6f719c316b0611f569af0cab7d6e9a2fb26/custom_items/resource_packs/custom_item/models/entity/wrench.geo.json#L13-L18) and [animation](https://github.com/microsoft/minecraft-samples/blob/5e04b6f719c316b0611f569af0cab7d6e9a2fb26/custom_items/resource_packs/custom_item/animations/first_person.json#L3-L20) | The reviewed model root is `bb_main`; animation channels address `steve_head` | Verify actual bone targets even for official examples; source presence alone cannot prove the copied pose works |
| [3d-totem attachable, lines 17–37](https://github.com/mirzahilmi/3d-totem/blob/93b436eea475b2baa9aae2e5d10c67122aa85c19/attachables/mmaarapuppet.json#L17-L37) and [animations, lines 4–39](https://github.com/mirzahilmi/3d-totem/blob/93b436eea475b2baa9aae2e5d10c67122aa85c19/animations/mmaarapuppet.animation.json#L4-L39) | General first/third poses and extra offhand corrections can be active together; correction omits scale | Distinguish simultaneous adjustments from exclusive full poses before refactoring conditions |
| [Player chestplate](https://github.com/Mojang/bedrock-samples/blob/46ba6ea985fb5a92d79a9419198f10dda14c199d/resource_pack/attachables/diamond_chestplate.player.json#L4-L25) and [armor-stand elytra](https://github.com/GeyserMC/GeyserIntegratedPack/blob/87008b13e13d2aef074933f6c03cb4ce381cde38/src/main/resources/integratedpack/attachables/elytra.armor_stand.json#L4-L27) | Different item selectors choose different render owners | Equipment slot, item identity and owner selector are separate contracts |
| [EquipmentSlot, lines 35–42](https://github.com/MicrosoftDocs/minecraft-creator/blob/1dfc5c4fa1cd75cabe558b08adee3420264ff0b5/creator/ScriptAPI/minecraft/server/EquipmentSlot.md#L35-L42) and [setEquipment, lines 80–101](https://github.com/MicrosoftDocs/minecraft-creator/blob/1dfc5c4fa1cd75cabe558b08adee3420264ff0b5/creator/ScriptAPI/minecraft/server/EntityEquippableComponent.md#L80-L101) | Mainhand tracks active hotbar; replacement can fail/throw; undefined clears | Re-read equipment before commit, compare owned instance/revision and preserve metadata |

## Practical references and validation boundary

- [Authoring recipes](../skills/mcbe-attachables-ui/references/authoring-recipes.md): held/worn selection, binding, alpha/culling/depth/UV/bounds/icon/glint diagnosis.
- [Perspective and state](../skills/mcbe-attachables-ui/references/perspective-and-state.md): four-view table, complete versus composed poses and bone ownership.
- [Input and lifecycle](../skills/mcbe-attachables-ui/references/input-and-lifecycle.md): typed slot names, delayed replacement, death/rejoin/observer cleanup and actual input events.
- [Graph contract](../skills/mcbe-attachables-ui/references/pack-graph.md): what structural completeness covers and which unresolved evidence remains.

For an authored pack, test main/offhand, first/third person, normal/slim skin, intended input profile, another observer and rapid hand changes. Exercise slot switch during an outstanding action, close, death/respawn, reconnect and world/pack reload. Keep canonical quest state independent from whether a projected visual update has arrived. Record actual client/API version and pack order alongside screenshots and the fresh Content Log.

## Provenance and redistribution

The public recipe is independently authored. Microsoft sample code and Geyser source are MIT; Microsoft documentation is CC-BY-4.0 with its documented code-example terms. Mojang samples remain subject to Mojang's terms. The inspected Wiki page license was not verified. No license file was found in the pinned `mirzahilmi/3d-totem` tree. Wiki and totem are used as reference-only evidence, with no source/artwork copied into the recipe. Do not infer reuse permission from a public GitHub URL.

Research snapshots, exact SHA256/byte counts and line evidence are recorded locally under ignored `workspace/attachable-geoui-deepening-20260928/attachable-research/`; the tracked design research lock records source revisions. External source code was read, not executed or installed.
