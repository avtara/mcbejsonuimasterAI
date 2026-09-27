# Minato editor project audit

Use the saved JSON as data. Keep it and the original textures before changing anything. The reviewed source is Minato-mba/web-apps at `dcc7932fceea828131053fb067e1f91503e36b21`; no license was found in the reviewed repository root or editor subtree. Its code, generated templates and images are analysis inputs, not bundled implementation assets.

## Inspect narrowly

1. Read only `design-library.mjs chest --topic project-roundtrip` or the selected source record. Fetch pinned files through `design-source-sync` only when source inspection is needed; never execute upstream project code to parse a save.
2. Determine the intended native collection capacity from the target container. Run `node tools/chest-project.mjs --input project.json --capacity 27 --json`, replacing 27 with that verified value.
3. Follow diagnostic JSON paths back to the original input. Use `--report workspace/chest/project-report.json` for full detail if stdout is insufficient. Do not silently coerce indices, truncate components or regenerate texture keys.
4. When authoring a reusable layout, write a neutral `mcbe-chest-contract@1` alongside the editor project and run `chest-contract`. A project audit and an authored contract cover different inputs.

## What must survive a round trip

- `formatVersion`, screen IDs, active screen and all inactive screens.
- Exact trigger/display titles, per-screen settings, components, positions, dimensions, properties, ordering and tab parents.
- Stable custom image keys, references from every screen/settings field, byte format, alpha and original dimensions.
- In exported RP: `_ui_defs`, screen override, generated control names, referenced textures and any same-stem nine-slice metadata.

Review save→load and export→import separately. In this source they use different paths. The editor's validator accepts version 2 plus a top-level component array; that does not validate nested screens, indices or resource references. The fallback loader also passes dimensions/properties to a constructor that accepts only type/x/y.

The actual script entry order matters: `scripts/components.js` defines the loaded image manager; the separate `scripts/imageManager.js` has different behavior. Do not infer ZIP image restoration from an implementation the page does not load.

## Browser and runtime evidence

The source's preview may substitute generic slots/images and hide missing assets behind placeholders. Several Dynamic Grid fields are explicitly “Preview Only.” Record which facts were observed in the browser and which were inferred from source. A browser timeout or unavailable ZIP test stays unverified.

After fixing a project, compare reloaded JSON and exported dependency references, then resolve the final RP and test the target Bedrock chest screen. An inspector pass does not establish successful ZIP round-trip, working buttons, title conditions or item movement.
