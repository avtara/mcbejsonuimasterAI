---
name: mcbe-resource-pack-rendering
description: Design and diagnose Minecraft Bedrock material, transparency, outline and PBR texture-set behavior for resource packs, attachables and GeoUI. Use for render appearance and graphics-mode compatibility; use the asset graph owner for missing geometry or animation links.
---

# MCBE Resource Pack Rendering

Choose the actual rendering path before editing appearance: JSON UI texture/control, entity/attachable material, block material instance, or PBR texture set. Their similarly named settings are not interchangeable.

- Alpha, material aliases or custom `.material`: [Materials](references/materials.md).
- Border, silhouette or glow-like outline: [Outlines](references/outlines.md).
- Classic/Vibrant Visuals/RTX and texture maps: [Texture sets](references/texture-sets.md).

Record the intended client, graphics mode, asset graph, reference image and viewing conditions. Use one palette role and texel-density rule across an asset family; inspect transparency over both light and dark game backgrounds. Use the visual-design/texture-design specialist for UI composition or original pixel artwork.

With this checkout, `node tools/material-audit.mjs --rp <RP> --mode classic --json` checks material inheritance and texture-set structure. Select `vibrant` or `rtx` only when that is the actual target. `--report NEW_FILE` keeps full diagnostics while stdout remains bounded. It does not decode images, execute shaders or prove outlines in-game. Use `attachable-inspect` for the connected asset graph.

Confirm the rendered result and fresh Content Log in each requested graphics mode. A shader key present in an old source is not evidence that the current client uses it. Research-only tasks can report the source-supported recommendation and pending client checks.
