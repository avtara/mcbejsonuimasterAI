# Two-state quest map authoring recipe

Independently authored BP/RP definitions and four small diagnostic pixel textures. This expands the earlier `held-panel` inspection fixture with manifest dependencies, two actual items, atlas icons, translations, six cube faces and four complete hand/perspective poses. No upstream source code or art is included.

## What it demonstrates

- `kit_demo:quest_map_pending` and `kit_demo:quest_map_ready` select distinct static textures with a shared bound geometry.
- A player-only item selector separates item identity from attachable identity. Other renderer owners need an explicit design choice.
- `minecraft:allow_off_hand` allows offhand placement. The main/offhand and first/third-person branches each set position, rotation and scale.
- A thin box provides six explicit faces. The PNG corners contain actual alpha transparency; the ready marker changes shape as well as color.
- `recipe.json` records the server adapter's preconditions, cleanup and runtime cases. It is authoring metadata, not a Minecraft file loaded by the packs.

The two item IDs are a **finite state projection**. They cannot render arbitrary server numbers, text, per-pixel buttons or persistent quest state. No grants, item replacement, script module or input handler are installed. A game integration must implement the adapter contract and preserve unrelated equipment and required item metadata.

## Verify from this repository

```sh
node examples/attachables/quest-map-recipe/verify.mjs
node tools/attachable-inspect.mjs --rp examples/attachables/quest-map-recipe/rp --bp examples/attachables/quest-map-recipe/bp --json
```

The read-only verifier checks manifest dependency/UUIDs, item/attachable/atlas links, PNG bytes and dimensions, translations, face UV bounds, animation bone targets and the four declared exclusive branches. It rejects four in-memory corruptions: wrong manifest dependency, missing animated bone, UV overflow and a duplicated branch condition. It recognizes this example's exact condition table; it does not execute arbitrary Molang.

Expected graph result: no structural errors, two unresolved-evidence warnings for the engine material `entity_alphatest`, `complete:false`, `runtimeVerified:false`. No local material definition is fabricated to hide that evidence gap. Texture decoding is this example verifier's check, not a promise of the general graph inspector.

## Try in an isolated development world

Pack manifests declare minimum client `1.21.100`; this is an authored compatibility target, not a tested version claim. Enable both packs, then manually obtain each item with `/give @s kit_demo:quest_map_pending` or `/give @s kit_demo:quest_map_ready` if testing is authorized. Place it in each supported hand through an appropriate game/addon operation; an allow-offhand component alone is not proof of every platform's placement UX.

Pose numbers are calibration starting points. Inspect the front/back face, camera clipping, hand obstruction, third-person orientation, slim/normal skin and another observer. Recalibrate a single branch at a time and retain its full position/rotation/scale. The texture previews were inspected locally; Bedrock rendering, Content Log, input and lifecycle have **not** been tested.

For item replacement, re-read the current equipment at commit time and compare the owned map instance and session/quest revision. The same type ID alone does not identify a map instance. Handle death, slot movement and reconnect without restoring a stale saved item or granting a duplicate. Choose an actual input event supported by the target item; a passive item must not be assumed to raise a successful-use event for every click.

See [attachable authoring](../../../docs/80-attachables-ui-authoring.md) for source evidence and [state/lifecycle choices](../../../docs/81-geometry-ui-state-and-lifecycle.md) for synced properties and temporary animation state when finite item variants do not meet the task.
