# Input, equipment and lifecycle

Read when a held/worn display reacts to a server value or an action. Identify the actual event before implementing the visual response. Rendering a button-like shape does not make it an input target.

## Keep three slot vocabularies separate

| Layer | Example | Meaning |
| --- | --- | --- |
| Molang attachable context | `context.item_slot == 'main_hand'` / `'off_hand'` | Rendered item slot used for perspective/pose selection |
| Script API | `EquipmentSlot.Mainhand` / `EquipmentSlot.Offhand` | Typed equipment access; main hand is the player's currently active hotbar slot |
| Item component | `minecraft:wearable` `slot` value, e.g. `slot.armor.head` | Equipment placement contract for that item; not a bone identifier |

Use the declared API version's names, not an automatic string-case conversion. `minecraft:allow_off_hand` allows offhand placement (documented minimum item format `1.20.30`); it does not install an action handler or prove the placement UX on every input profile.

## Finite item-state update contract

For a pending/ready quest-map variant, the server owns quest state and item identity. The renderer projects that state. A safe adapter has this order:

1. Receive the real supported event and identify player/session, quest instance, request revision and owned map instance.
2. Validate eligibility against current server state. A client animation state or item texture is not the source of reward eligibility.
3. Immediately before replacement, re-read equipment and compare the same owned item instance and current revision. Mainhand may now refer to a different hotbar slot. A type ID comparison alone is not sufficient for two identical maps.
4. Preserve the metadata the game needs when constructing the replacement, check the equipment operation's return value and handle exceptions. Do not pass an accidentally missing ItemStack: `setEquipment(slot, undefined)` clears the slot.
5. If the operation fails, retain canonical state and revalidate before retrying; do not overwrite whatever item is now in that slot.

This is a logical precondition/revalidation pattern, not an atomic compare-and-swap API. The precise adapter depends on the server and script module version. The original recipe deliberately defines the contract without pretending to implement arbitrary existing game inventories.

## Choose a real input and cleanup boundary

`ItemUseAfterEvent` documents successful item use/entity interaction. Do not assume an inert custom item produces that event for every click. If the task needs menu controls, use an actual server form, a supported item/component event or an existing server input route and document cancel behavior. Keep GUI focus and rapid duplicate actions in that owner's tests.

| Transition | Revalidation/cleanup |
| --- | --- |
| Switch hotbar slot or move map to offhand during a delayed callback | Reject the stale slot/instance request; do not apply a ready variant to a new item |
| Unequip / close / disable | Cancel pending request tokens and clear only owned transient display state |
| Death / respawn | Drop old entity/session references; apply game inventory policy, not a blind restore of a cached stack |
| Disconnect / rejoin | Rebuild display from canonical quest state and currently owned equipment; avoid automatic duplicate grants |
| Another observer / late join | Check that the chosen state route reaches the intended viewer; verify owner selectors and visibility separately |
| Pack/world reload | Re-evaluate initialization and data resynchronization with actual client evidence; do not infer persistence from one animation trigger |

`PlayerSpawnAfterEvent.initialSpawn` distinguishes initial join from later spawn. It does not itself prove an old entity reference is valid. Record that distinction if rebuilding UI on spawn.

## Temporary animation state

Official `PlayAnimationOptions` exposes controller, recipients and stop expression; this describes animation playback rather than a durable arbitrary-data channel. The Wiki demonstrates variable assignment in stop expressions and reports client-side controller reset on leaving the world or moving the entity far away. Those observations do not prove persistence over pack reload, late observers or reconnect.

When using this technique deliberately, document variable readers/writers, a bounded stable controller identity, selected recipients, initialization and reset, and the runtime trigger that resends data. Avoid a new controller name on every update. For server-synchronized properties, viewer overrides, timing and client-sync requirements, use repository `docs/81-geometry-ui-state-and-lifecycle.md` when available. A standalone installation must verify the target actor/API support and synchronization contract before substituting a property route.

## Versioned evidence (reviewed 2026-09-28)

- Official docs revision `1dfc5c4fa1cd75cabe558b08adee3420264ff0b5`: [EquipmentSlot](https://github.com/MicrosoftDocs/minecraft-creator/blob/1dfc5c4fa1cd75cabe558b08adee3420264ff0b5/creator/ScriptAPI/minecraft/server/EquipmentSlot.md#L35-L42), [equipment reads/writes](https://github.com/MicrosoftDocs/minecraft-creator/blob/1dfc5c4fa1cd75cabe558b08adee3420264ff0b5/creator/ScriptAPI/minecraft/server/EntityEquippableComponent.md#L46-L101), [ItemUseAfterEvent](https://github.com/MicrosoftDocs/minecraft-creator/blob/1dfc5c4fa1cd75cabe558b08adee3420264ff0b5/creator/ScriptAPI/minecraft/server/ItemUseAfterEvent.md), [spawn](https://github.com/MicrosoftDocs/minecraft-creator/blob/1dfc5c4fa1cd75cabe558b08adee3420264ff0b5/creator/ScriptAPI/minecraft/server/PlayerSpawnAfterEvent.md), [playback options](https://github.com/MicrosoftDocs/minecraft-creator/blob/1dfc5c4fa1cd75cabe558b08adee3420264ff0b5/creator/ScriptAPI/minecraft/server/PlayAnimationOptions.md). CC-BY-4.0 docs/MIT examples; current documentation is not a promise that all APIs exist in the sample's minimum engine version.
- Wiki revision `ed49e24424c0aa8bd0edc710ffe9f09c167452b4`: [playanimation observations](https://github.com/Bedrock-OSS/bedrock-wiki/blob/ed49e24424c0aa8bd0edc710ffe9f09c167452b4/docs/commands/playanimation.md#L74-L87), [variable resets](https://github.com/Bedrock-OSS/bedrock-wiki/blob/ed49e24424c0aa8bd0edc710ffe9f09c167452b4/docs/commands/playanimation.md#L211-L223). Community evidence, page license unverified; reference-only.
