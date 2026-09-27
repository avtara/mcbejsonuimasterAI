# Source Priority

Choose authority by claim, then record its revision. For documented property/type names use Microsoft Learn and cross-check pinned Mojang schemas/samples. For actual rendering/input use the target client and Content Log. The source groups below supply different kinds of evidence, not one unconditional ranking.

## 1. Included local packs

Use the included source packs when the task is about their implementation patterns:

- `references/source-packs/modern-cloud-ui-reference/`
- `references/source-packs/farm-ui-variants/`
- `references/source-packs/rpg-server-ui-reference/`

Reason:

- they show concrete Bedrock pack structure; current runtime compatibility still needs evidence
- they reflect the user's target workflow
- they are best for pattern reuse and reverse engineering

## 2. Official Mojang samples

Use Mojang `bedrock-samples` when you need official vanilla JSON UI structure or sample screen files.

Primary upstream:

- <https://github.com/Mojang/bedrock-samples/tree/main/resource_pack/ui>

Use this for:

- `_ui_defs.json`
- vanilla screen file names
- baseline screen structure
- official server form layout references

## 3. Bedrock Wiki

Use Bedrock Wiki for:

- rule explanations
- operator and binding behavior
- best practices
- reusable techniques

Do not treat Bedrock Wiki as a substitute for confirming current vanilla file paths.

## 4. Ztech vanilla resource pack

Use `ZtechNetwork/MCBVanillaResourcePack` as a versioned comparison mirror for vanilla asset lookup. Cross-check the actual target and official Mojang resources; it is not official authority.

Primary upstream:

- <https://github.com/ZtechNetwork/MCBVanillaResourcePack>

Use this for:

- `textures/ui/*`
- `textures/item_texture.json`
- `textures/terrain_texture.json`
- versioned vanilla `ui/*.json` comparisons

## Hard rules

- Do not invent vanilla texture paths.
- Do not treat an old note or screenshot as stronger than an upstream file tree.
- For asset verification, prefer actual target resources and pinned official Mojang evidence over handwritten lists or third-party mirrors.
- For behavior and screen rules, distinguish documented names, pinned implementation evidence, community observations and actual runtime checks. Report official-source disagreements as `unresolved-conflict`.
- Readable source is not redistribution permission. Separate code licenses from bundled Minecraft-derived art.
- For visual guidance use [the selective design library](72-design-library.md); for dated RP/BP traces see [source analysis](73-bedrock-source-review.md). Design guidance never establishes a supported JSON UI property.
