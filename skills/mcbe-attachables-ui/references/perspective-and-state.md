# Perspective, equipment and state

Use the geometry's actual slot binding, such as the official sample's `q.item_slot_to_bone_name(context.item_slot)`, and inspect the bound bone/pivot before adapting transforms. Do not transplant a third-person pose into first person because the item looks similar.

Record the intended result for main hand/offhand and first/third person. Trace perspective conditions through both `scripts.animate` and reachable animation-controller states. Absence of a condition can be intentional for shared geometry; presence of `context.is_first_person` is not proof that both branches or transforms are correct.

Attachable visuals do not create clickable UI regions or authoritative item actions. Name the real input event and the BP/server state owner. Equipment changes must preserve unrelated contents and handle delayed callbacks, disable, death and rejoin without duplicate replacements.

For offhand support, inspect the item's offhand permission and the actual equip operation. A wearable slot name alone is insufficient. Test display and action separately.

`playAnimation`/`stopExpression` variable transport and long-lived render variables are community techniques. Record controller identity, recipient scope, initialization/reset, and synchronization after entity visibility or reconnect; do not describe them as a guaranteed persistent state channel. Avoid unbounded creation of animation controller identities.

Acceptance evidence should include the exact client/API version, final pack order, content log, both perspectives, both relevant hands, touch/controller or mouse as requested, and another observer if visibility is shared. If the request is only planning, list those remaining checks without launching the game.
