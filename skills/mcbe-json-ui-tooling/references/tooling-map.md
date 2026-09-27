# Tooling Map

## Visual editor

- `references/external/bedrock-json-ui-editor/README.md`
- `references/external/bedrock-json-ui-editor/app.js`
- `docs/09-schema-and-tooling.md`

Use for:

- offsets
- anchors
- size tweaking
- tree-based visual editing

## Builder-generated examples

- `references/external/EasyUIBuilder/README.md`
- `references/external/EasyUIBuilder/ui/custom_ui/`

Use for:

- isolated element examples
- builder-oriented element composition
- generated control anatomy

## Minecraft Bedrock JSON UI Sample archive

- `docs/32-minecraft-bedrock-json-ui-sample-upstream.md`
- `references/upstreams/minecraft-bedrock-json-ui-sample/` when locally synced

Use for:

- sample UI suite animation tests
- dynamic form library search/filter/slicing bindings
- binding dump lookup
- custom NPC and dialogue UI examples
- integrated HUD/chat samples

Open only one exact source file after searching with `rg`.

## Dumper and animation values

- `docs/33-animation-patterns-and-dumper-values.md`

Use for:

- `anim_type`
- `anims`
- `animation_reset_name`
- `play_event`
- `end_event`
- `next`
- `destroy_at_end`

## Dumper value cookbook

- `docs/36-dumper-value-cookbook.md`
- `docs/37-vanilla-dumper-screen-recipes.md`
- `docs/38-advanced-json-ui-recipes.md`

Use for:

- `factory`
- `collection_name`
- `grid_dimensions`
- `grid_item_template`
- `renderer`
- `property_bag`
- `variables`
- `button_mappings`
- `focus_identifier`
- `common.scrolling_panel`
- `uv`, `tiled`, `layer`

## Chest UI tooling

Start with `mcbe-json-ui-chest-gui` to distinguish Minato's native chest editor from ActionForm skins. Use `chest-project` for saved editor JSON and `chest-contract` for the independently authored slot mapping. The following legacy sources cover chest-like forms, not Minato's native export format.

- `references/external/Chest-UI/README.md`
- `references/external/Chest-UI/RP/ui/`
- `references/external/Chest-UI/BP-scripts/extensions/forms.js`

Use for:

- chest or furnace styled forms
- slot-grid UI logic
- Script API plus RP coordination
