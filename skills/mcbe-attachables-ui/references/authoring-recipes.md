# Authoring held and worn displays

Read for a new display or a model that resolves correctly but has the wrong pose or appearance. Use the target owner's geometry and selected pack variant as evidence before borrowing coordinates.

## Choose the rig and state projection

| Requirement | Useful starting point | Decision that changes implementation |
| --- | --- | --- |
| A map/card held in either hand | One root bone with `q.item_slot_to_bone_name(context.item_slot)` binding | Both hand slots need explicit intended poses and actual BP offhand permission |
| Badge or panel worn on a body part | Verified wearer rig, item equipment slot and owner selector | Equipment slot chooses where the item is equipped; geometry binding/parent chooses the rendered attachment |
| One specific skeleton and one slot | Copy only the required skeleton hierarchy when justified | Pivot coordinates and parent names become coupled to that exact owner; do not treat it as a portable two-hand model |
| A few discrete quest states | Explicit item variants and texture aliases | Server replaces only its currently owned item instance; each variant needs icon/translation/attachable links |
| Arbitrary server number/text | A verified property/encoding route and renderer that consumes it | Static texture variants cannot represent unrestricted text; select the data route before drawing digits |
| Screen-fixed clickable card | JSON UI / player-renderer GeoUI specialist as appropriate | Projected attachable geometry has no JSON UI control hitboxes |

For worn items, separate three facts: BP `minecraft:wearable` slot, attachable `item` selector and geometry attachment. The [vanilla player chestplate](https://github.com/Mojang/bedrock-samples/blob/46ba6ea985fb5a92d79a9419198f10dda14c199d/resource_pack/attachables/diamond_chestplate.player.json#L4-L25) explicitly selects `minecraft:player`; the [Geyser armor-stand elytra](https://github.com/GeyserMC/GeyserIntegratedPack/blob/87008b13e13d2aef074933f6c03cb4ce381cde38/src/main/resources/integratedpack/attachables/elytra.armor_stand.json#L4-L27) selects a different renderer owner. Those conditions do not authorize gameplay use or hide data from another client. Preserve inherited geometry such as `geometry.child:geometry.parent` when extracting armor; the child's own bones are not necessarily the complete rig.

## Binding is not ordinary parenting

The official [attachables guide](https://github.com/MicrosoftDocs/minecraft-creator/blob/1dfc5c4fa1cd75cabe558b08adee3420264ff0b5/creator/Documents/attachables.md#L81-L160) uses a bound root and recommends this method for flexible item slots. A fixed `rightItem` binding fixes one hand; the slot query resolves the actual slot's target bone. Keep the modeled pivot, bound origin and animation offset separate while diagnosing displacement.

The [Wiki's binding example](https://github.com/Bedrock-OSS/bedrock-wiki/blob/ed49e24424c0aa8bd0edc710ffe9f09c167452b4/docs/items/attachables.md#L155-L225) upgrades geometry to `1.16.0`, explains binding's root position and describes a guide-animation Y correction of `-24`. The Wiki explicitly leaves the engine cause uncertain. That guide value is evidence for that workflow, not a universal runtime offset. Do not apply an editor guide and copy its correction into an already corrected pose without measuring the result.

In an installed skill without repository assets, use this small independently authored root shape as a starting contract, then supply your own cubes and verified poses:

```json
{
  "name": "display_root",
  "binding": "q.item_slot_to_bone_name(context.item_slot)",
  "pivot": [0, 0, 0]
}
```

Do not graft player-hand animation channels into this root. Verify the animated bone exists in the attachable model, or explicitly move the change into the player animation graph.

## Flat-card failure diagnosis

| Symptom | Inspect next | Useful change after confirming the cause |
| --- | --- | --- |
| Front visible, reverse disappears | Face definitions, winding/culling and the selected material | Give a deliberately two-sided card explicit opposite faces or an appropriate verified material; a thin box is one testable option |
| Black/white rectangle at cutout corners | Decode PNG alpha and inspect material's alpha behavior | Real transparent pixels plus a verified cutout/translucent material; drawing a checkerboard is not transparency |
| A faint duplicate or shimmer | Coincident front/back planes, overlapping cubes and depth order | Separate the surfaces or remove duplicated geometry; do not hide z-fighting with arbitrary texture changes |
| Flicker/order errors through another object | Blend versus cutout intent, depth states and graphics mode | Route material behavior to `mcbe-resource-pack-rendering`; texture alpha alone cannot settle sorting |
| Model clips or vanishes while looking away | Geometry bounds and camera/frustum behavior | Verify visible bounds around the actual animated extent on the target client |
| Back face text is mirrored or unreadable | Per-face UV orientation after the hand rotation | Author face UVs intentionally; do not infer readability from a flat PNG preview |
| Model works but inventory icon is missing | BP icon key → `item_texture.json` → PNG | Repair the separate atlas path rather than attachable texture aliases |
| Enchanted item has missing/incorrect glint | Enchanted material, texture, conditional selection and RC | Inspect the entire optional glint branch; copying only an `enchanted` alias does not implement it |

## Original recipe when the checkout is available

`examples/attachables/quest-map-recipe` includes two finite item states, BP→RP manifest dependency, localized names, icons, transparent textures, a shared thin-box geometry and four exclusive full poses. Run:

```sh
node examples/attachables/quest-map-recipe/verify.mjs
```

The validator checks texture bytes, UV bounds, actual animation bone names and manifest/item links in addition to the graph. Its four branch conditions are a fixed sample contract, not a Molang evaluator. Material `entity_alphatest` remains unverified without supplied engine definitions. The coordinates require target-client calibration; there is no script or installed input handler.

Only read the sample files needed for the requested layer. A standalone installation can use this reference and create equivalent original definitions; do not imply that repository examples are bundled inside the skill.

Reviewed 2026-09-28. Official docs: CC-BY-4.0 documentation/MIT examples; Mojang samples: Mojang EULA; Geyser source: MIT; Wiki page license not verified, reference-only. The recipe and its pixels are independently authored; no upstream art is redistributed.
