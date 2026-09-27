# Perspective, equipment and state

Use the geometry's actual slot binding, such as the official sample's `q.item_slot_to_bone_name(context.item_slot)`, and inspect the bound bone/pivot before adapting transforms. Do not transplant a third-person pose into first person because the item looks similar.

Record the intended result for main hand/offhand and first/third person. Trace perspective conditions through both `scripts.animate` and reachable animation-controller states. Absence of a condition can be intentional for shared geometry; presence of `context.is_first_person` is not proof that both branches or transforms are correct.

## Four views and animation ownership

| View | Condition vocabulary | Check before changing offsets |
| --- | --- | --- |
| Main hand, first person | `context.is_first_person`, `context.item_slot == 'main_hand'` | Bound pivot, near-camera clipping, visible hand and screen obstruction |
| Offhand, first person | `context.is_first_person`, `context.item_slot == 'off_hand'` | Separate hand pivot; mirrored offsets need not produce the desired face orientation |
| Main hand, third person | `!context.is_first_person`, main-hand slot | Observer-facing orientation, body overlap, movement and skins |
| Offhand, third person | `!context.is_first_person`, offhand slot | Independent slot path and the other observer's view |

Distinguish **exclusive full poses** from **simultaneous base and correction animations**. In the original quest-map recipe, each exclusive branch supplies position, rotation and scale. The reviewed [3d-totem attachable](https://github.com/mirzahilmi/3d-totem/blob/93b436eea475b2baa9aae2e5d10c67122aa85c19/attachables/mmaarapuppet.json#L17-L37) activates a general first/third-person animation and an additional offhand correction; its correction animation omits scale. Turning those corrections into standalone exclusive poses would discard the base pose. Inspect animation order, blending and channels before restructuring a working graph. No code or artwork from that unlicensed repository is bundled.

Before claiming a pose applies, compare every animated bone with the geometry's actual bones and inherited definitions. The pinned Microsoft wrench geometry uses `bb_main`, while its `first_person.json` targets `steve_head`; the source link alone does not establish a working pose on that geometry. The sample verifier checks this concrete failure class. Animating a player's hands is a player-animation task; naming a player bone inside the attachable does not establish ownership of it.

Use a state controller for genuine state transitions, not merely to make a fixed pose look sophisticated. The [vanilla shield controller](https://github.com/Mojang/bedrock-samples/blob/46ba6ea985fb5a92d79a9419198f10dda14c199d/resource_pack/animation_controllers/shield.animation_controllers.json) combines blocking, slot and perspective. When adapting it, preserve return transitions as well as entry conditions. A map with no blocking state does not need that state machine.

Attachable visuals do not create clickable UI regions or authoritative item actions. Name the real input event and the BP/server state owner. For equipment changes, delayed callbacks, disable, death and rejoin, read [input and lifecycle](input-and-lifecycle.md).

For offhand support, inspect the item's offhand permission and the actual equip operation. A wearable slot name alone is insufficient. Test display and action separately.

`playAnimation`/`stopExpression` variable transport and long-lived render variables are community techniques. Record controller identity, recipient scope, initialization/reset, and synchronization after entity visibility or reconnect; do not describe them as a guaranteed persistent state channel. Avoid unbounded creation of animation controller identities.

Acceptance evidence should include the exact client/API version, final pack order, content log, both perspectives, both relevant hands, touch/controller or mouse as requested, and another observer if visibility is shared. If the request is only planning, list those remaining checks without launching the game.

Reviewed 2026-09-28. For a repo checkout, `examples/attachables/quest-map-recipe` demonstrates exclusive complete poses and `docs/81-geometry-ui-state-and-lifecycle.md` compares temporary animation state with documented synchronized properties. A standalone skill installation can apply the branch/ownership checks above without those repository files.
