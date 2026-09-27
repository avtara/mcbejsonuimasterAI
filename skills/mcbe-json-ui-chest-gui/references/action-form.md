# Chest-style ActionForm workflow

Read this for menu callbacks rendered in chest cells. Continue with the server-forms skill for factory/binding details. `design-library.mjs chest --topic action-grid` provides a small pinned source card.

## Fixed slots and pages

1. Define semantic actions independently of their visible positions. Freeze the ordered page model when showing the form.
2. Emit the full slot array, including placeholders. Removing empty entries shifts every later response index.
3. Keep `selectionIndex`, visible slot and semantic action explicit. Accept selection `0`; do not use a truthiness test for it.
4. Return from `canceled` before reading `selection`. Validate that the selected index is an integer in the captured page's range and reject placeholders, decorative and disabled entries.
5. Bind each response to the captured page/snapshot. If data changed or another page superseded it, discard or refresh the response. Do not apply an old index to a new sorted/filtered item list.
6. Reserve explicit control slots for next/previous/close and validate page targets. Pagination is application behavior, not a built-in grid binding.

The local `chest-contract` tool checks a declared plan and offers a pure response resolver. It does not parse arbitrary sender code, emit a resource pack, or prove its declared snapshot is a server transaction lock. Keep business actions behind current server checks.

## Sender and receiver must agree

Record exact title marker, emitted slot count, RP enabled route, factory, collection and ordinary ActionForm fallback. The reviewed Herobrine snapshot constructs 27 buttons by default while its RP configuration disables the 27-slot route. A valid sender alone does not guarantee a visible chest form.

Do not insert newer ActionForm header/label/divider elements into an older fixed-slot skin without verifying collection behavior and index preservation. Select the Script API version from the target manifest and official versioned docs.

## Inventory appendices and icons

- If empty inventory slots are omitted, save response index→original inventory slot/item identity separately. Check current identity/count again before use; a UI snapshot is not authoritative state.
- Texture paths and numeric AUX values are separate icon protocols. Verify texture ownership or the exact versioned AUX mapping. Do not guess numeric offsets, item IDs, glint flags or durability encodings.
- Preserve label/lore types and field widths. Check missing names, plain string versus array/RawMessage lore, formatting codes, zero/max quantities, stale stacks and missing icons.
- Keep the visible tooltip/text separate from routing and numeric payloads; test marker leaks in all button states.

## Cancel, busy and errors

Official `ActionFormResponse.selection` is optional. `UserClosed` means the player closed the form; `UserBusy` is cancellation due to another UI. Neither is a successful action. `show()` may also reject/throw.

Use a bounded retry policy only if the requested UX needs it. Record attempt/time limits, a per-player active request, cancellation and player-disconnect cleanup. An unbounded loop or recursive reopen can trap the user. `system.run` scheduling alone does not guarantee that a busy UI becomes available.

## Verify the integrated result

Check ordinary forms and the chest route, slot 0/last/empty/disabled entries, every page edge, sorting/filtering while a response is pending, two rapid requests, close/busy/disconnect, and each requested input device. Static success remains separate from Bedrock input and glyph evidence.
