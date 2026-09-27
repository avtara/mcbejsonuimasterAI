# Static attachable graph fixture

`held-panel` is independently authored inspection data, not an installable addon. It deliberately omits manifests, usable geometry cubes and a runtime test. The one-pixel texture only establishes a file reference.

```sh
node tools/attachable-inspect.mjs --rp examples/attachables/held-panel/rp --bp examples/attachables/held-panel/bp --json
```

Expected: no structural errors; `entity_alphatest` remains external-unverified without source material definitions. The controller contains first/third-person conditions, but this proves neither their engine evaluation nor item placement. `runtimeVerified` is always false.
