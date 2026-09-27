# Pack graph and inspection

## Ownership

The BP item connects through an explicit attachable `item` string or conditional item map when present; only an omitted `item` falls back to the attachable identifier. The official definition reference documents the string form; the official guide demonstrates the conditional map. A dedicated armor-stand attachable can have a different identifier from its item, as in Geyser's `minecraft:elytra.armor_stand` selector for `minecraft:elytra`. Geometry and animation identifiers are separate from the friendly aliases on an attachable. A render controller resolves `Geometry.*`, `Texture.*` and `Material.*` in the owning attachable, and an animation controller resolves its short animation names in that same owner. Do not validate an alias against an unrelated entity's map.

Use verified vanilla files for inherited resources. `controller.animation.*` is an identifier pattern, not evidence that a controller exists. `textures/misc/*` is not a blanket existence exemption. Resolve RP files first, then the selected vanilla root. Duplicate identifiers in the same root need attention; an intentional RP override of vanilla is a separate ownership decision.

JSONC is common in sample packs. Preserve comments and formatting when editing. The inspector accepts JSON comments and trailing commas as input; this is parser compatibility, not a complete engine schema check.

Object roots are required for manifests, `.material` files and graph-owned definition folders (RP attachables, client entities, models, animations/controllers and materials; BP items/entities). Other JSON, such as an RP flipbook array, is syntax-parsed without that root restriction; `NON_GRAPH_DOCUMENT` identifies non-object data whose pack-specific schema was not validated. This allowance does not certify arbitrary BP language files or unrelated pack schemas.

## Tool contract

`tools/attachable-inspect.mjs --rp DIR [--bp DIR] [--vanilla DIR] [--max-chars 1000..64000] [--report NEW_FILE] --json`

- Schema: `mcbe-attachable-graph@1`.
- `ok` means no discovered structural error. `complete` concerns the checked static reference graph only.
- Edge statuses: `resolved`, `unresolved`, `external-unverified`, `dynamic`.
- Full reports include nodes, edges, conditional perspective references and diagnostics. Compact stdout contains summary/diagnostics and omitted counts.
- Exit 0: no structural errors; 1: structural errors; 2: bad arguments, unavailable roots, resource bound or report-write failure.
- The optional report uses exclusive creation. Input packs are never rewritten.
- Built-in material names without supplied definitions remain external-unverified. Dynamic expressions are recorded, not executed. Referenced array members can resolve while the selected index remains dynamic.
- Render-controller selector shapes follow the pinned Mojang schema: geometry expression string, texture expression list and material mapping list. Invalid shapes produce `RESOURCE_SELECTOR`; the single texture string found in older official examples is scanned with compatibility left dynamic. Bare nested array cycles also remain dynamic because finite expansion is unproven.
- Definition and state bodies must be objects. Conditional references accept nonempty expression strings or primitive number/boolean literals; null, arrays and objects are structural errors. This is a shape check, not proof of Molang validity or evaluation.
- Material parents are followed through supplied RP/vanilla definitions; a cyclic inheritance chain is a structural error. Shader behavior still requires a separate material audit and target-client evidence.
- Modern geometry arrays and legacy top-level `geometry.child:geometry.parent` keys are indexed by the child identifier. Legacy parent references and cycles are checked through supplied RP/vanilla files; bone merging, reset/inflate semantics and the resulting shape remain unverified.

Static `q.property('key')` reads on a client entity are checked against the matching BP entity's property declaration and `client_sync:true`. Computed names and unknown attachable property owners remain unverified. Subpack alternatives are skipped with an incomplete-coverage warning; inspect the selected installed variant separately.

Current scope does not decode texture bytes, validate shader programs, execute Molang, infer visual bone correctness, prove manifests are installed, or validate BP scripting. A missing runtime gate is not converted into a static pass claim.

The independently authored `examples/attachables/held-panel` fixture is inspection input, not a ready-to-install addon.

## Evidence

- [Official attachable guide](https://learn.microsoft.com/en-us/minecraft/creator/documents/attachables?view=minecraft-bedrock-stable): item ownership and binding workflow.
- [Official definition reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/attachablereference/examples/attachabledefinitions/attachable?view=minecraft-bedrock-stable): alias/script structure.

Reviewed 2026-09-28: the official definition reference's Description table documents string `item`; the official guide's `demo:wrench` example demonstrates an item-to-condition object. The inspector preserves both declaration shapes and verifies the selected item reference; this documentation check does not substitute for the target client's runtime test.

This portable workflow reorganizes the local `attachablesskill` knowledge. Its implementation is independently written; the external GeouiStudio HTML is not bundled with the skill.
