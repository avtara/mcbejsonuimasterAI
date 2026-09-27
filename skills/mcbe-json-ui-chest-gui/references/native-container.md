# Native container workflow

Read this for actual chest inventory interactions. Minato's reviewed exporter targets `chest.small_chest_screen`; it is not an ActionForm sender. Source evidence is available through `design-library.mjs chest --topic native-slots` and `docs/76-chest-source-review.md` in this checkout.

## Trace the real owners

```text
server/BP container and item stacks
  -> selected chest screen and exact title condition
  -> registered RP control and collection
  -> original collection index
  -> verified container input event
  -> actual stack movement and server validation
```

1. Inspect the installed pack's `chest_screen.json`, `_ui_defs.json`, inherited vanilla controls, and other packs overriding the same screen. Preserve ordinary chest fallback.
2. Determine small/large/ender/custom container support from the actual route and data provider. Minato's double-chest-looking template alone does not establish a large-chest screen override.
3. Keep `visualCell`, `collection`, and `sourceIndex` distinct. Player inventory and hotbar are not implicit continuations of the custom menu's indices. Declare each source capacity from verified evidence.
4. Validate indices as finite integers before arithmetic; reject negative/out-of-range values and numeric strings from editor properties. Track intentionally repeated display references separately from multiple interactive controls for one source slot.
5. Check the actual button event. A control using `button.container_auto_place` participates in inventory behavior; it is not an arbitrary JavaScript callback. A hidden/disabled RP control does not enforce server-side permissions.

In authored contracts, native item slots use `source: {collection, index}`. A native control may declare `targetSource` for its event's target slot; it may intentionally target an already displayed item slot. Verify the event's requirements in the actual RP—the validator only checks declared collection existence and index bounds.

## Geometry and game UI

- Use one cell/spacing rule for repeated slots; derive its value from the target vanilla/profile or measured design. The reviewed editor often previews 18px cells and 16px item art, which are source examples, not universal touch dimensions.
- Measure the combined chest, title, inventory, hotbar, scrollbar and close-control bounds at the target GUI scale. Decorative vines or asymmetric frames can shift the perceived center; compare the visible background and content bounds.
- Preserve integer pixel scaling for pixel art. Keep nine-slice borders out of the stretch region and inspect transparent edges over the actual background.
- Give quantities, durability, empty/selected/locked states and keyboard/controller focus distinct readable cues. Important labels must be discoverable without hover on touch.
- Recheck focus and scroll position after tab changes. Native item drag, split-stack, quick-move and drop have input behavior that a web preview cannot simulate reliably.

## Tabs and scrolling

Use stable component IDs, explicit parent links, and a complete old-ID→new-ID map for duplication. Check orphan parents, cycles, duplicate IDs and the generated toggle names: different component IDs can still share one effective toggle index. Keep undo history scoped to the edited screen or store the entire screen identity in each history entry. Do not let switching UIs silently replay another UI's components.

For each dynamic grid, distinguish viewport size, scroll-content size, source collection count, and preview-only cells. Verify that each intended setting is emitted into the final JSON. A decorative scrollbar does not prove the last real slot is reachable.

## Item text as state

Some sources extract progress/toggle/type values from `#hover_text`. Specify producer, source slot, prefix length, field widths, ranges, reset behavior and update lifetime together. The reviewed Minato code removes a six-character prefix; that is its own protocol, not a Bedrock rule.

Test missing stacks, short/malformed text, lower/upper bounds, formatting codes, Korean names and lore newlines. Preserve user-visible text separately. Verify whether live changes appear while the chest remains open or only after reopening.

## Runtime checks

Test exact-target and ordinary fallback chests; first/middle/last slots; empty and full destinations; quick move, splitting, drop, replacement while open and close/reopen; inventory/hotbar mappings; requested mouse/controller/touch devices; and a fresh Content Log. For shops, rewards or crafting, have the server revalidate current stacks, quantities, balance and permissions before committing a transaction.
