import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { layoutTree } from "../tools/_lib/final-rp-v2/layout-engine.mjs";
import { layoutResolvedTree } from "../tools/_lib/final-rp-resolver.mjs";
import { indexResourcePack } from "../tools/_lib/final-rp-v2/rp-index.mjs";
import { resolveControl, resolveRoute } from "../tools/_lib/final-rp-v2/resolver.mjs";
import { applyModifications } from "../tools/_lib/final-rp-v2/modifications.mjs";
import { validateUiFile } from "../tools/_lib/ui-validator.mjs";
import { renderScreen, resolveScreen, measureText, validateStateTextures } from "../tools/_lib/final-rp-engine.mjs";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const root = await mkdtemp(join(process.env.MCBEKIT_TEST_ROOT || tmpdir(), "final-rp-review-"));
const vanilla = join(root, "vanilla"), target = join(root, "target"), outputDir = join(root, "out");
for (const directory of [join(vanilla, "ui"), join(vanilla, "font"), join(target, "ui")]) await mkdir(directory, { recursive: true });
const json = (path, value) => writeFile(path, JSON.stringify(value));
const icon = offset => ({ type: "image", texture: "textures/ui/White", size: [8, 8], anchor_from: "top_left", anchor_to: "top_left", offset });
await json(join(vanilla, "font", "font_metadata.json"), {});
await writeFile(join(vanilla, "font", "default8.png"), PNG.sync.write(new PNG({ width: 128, height: 128 })));
await json(join(vanilla, "ui", "_ui_defs.json"), { ui_defs: ["ui/base.json", "ui/routes.json"] });
await json(join(vanilla, "ui", "routes.json"), { namespace: "server_form", main_screen_content: { type: "panel", controls: [] } });
await json(join(vanilla, "ui", "base.json"), { namespace: "review",
  base: { type: "panel", size: [100, 80], controls: [{ original: icon([4, 4]) }, { group: { type: "panel", size: [100, 80], controls: [{ old: icon([16, 4]) }] } }] },
  screen: { type: "panel", size: [100, 80], controls: [{ original: icon([4, 4]) }, { group: { type: "panel", size: [100, 80], controls: [{ old: icon([16, 4]) }] } }] },
  "inherited@review.base": {},
  "plain_derived@review.base": {},
  reordered: { type: "panel", controls: [{ first: icon([4, 4]) }, { second: icon([16, 4]) }] },
  binding_order: { type: "panel", bindings: [{ binding_name: "#a" }, { binding_name: "#b" }] },
  cross_file: { type: "panel", controls: [{ original: icon([4, 4]) }] },
  bad: { type: "panel", size: [100, 80], controls: [{ existing: icon([4, 4]) }] },
});
await json(join(target, "ui", "_ui_defs.json"), { ui_defs: ["ui/base.json", "ui/routes.json", "ui/patch.json"] });
await json(join(target, "ui", "patch.json"), { namespace: "review", cross_file: { modifications: [{ array_name: "controls", operation: "insert_back", value: [{ added: icon([28, 4]) }] }] } });
await json(join(target, "ui", "routes.json"), { namespace: "server_form", main_screen_content: { modifications: [{ array_name: "controls", operation: "insert_back", value: [{ route: { type: "panel", "$form_type": "review:", "$factory_control_ids": { long_form: "review.screen" } } }] }] } });
await json(join(target, "ui", "base.json"), { namespace: "review",
  screen: { controls: [{ group: { modifications: [{ control_name: "old", operation: "remove" }, { array_name: "controls", operation: "insert_back", value: [{ fresh: icon([16, 4]) }] }] } }], modifications: [{ array_name: "controls", operation: "insert_back", value: [{ added: icon([28, 4]) }] }] },
  bad: { modifications: [{ array_name: "controls", operation: "unknown", value: [] }] },
  inherited: { modifications: [{ array_name: "controls", operation: "insert_back", value: [{ added: icon([28, 4]) }] }] },
  blank: { type: "panel", size: [100, 80] },
  fixed_text: { type: "label", size: [80, 12], text: "fixture" },
  intrinsic_text: { type: "label", size: ["default", 12], text: "fixture" },
  malformed: { type: "panel", controls: [{ original: icon([4, 4]) }], modifications: [null] },
  reordered: { controls: [{ second: { offset: [5, 6] } }], modifications: [{ control_name: "first", operation: "remove" }] },
  binding_order: { modifications: [{ array_name: "bindings", operation: "remove", where: { binding_name: "#a" } }, { array_name: "bindings", operation: "insert_front", value: { binding_name: "#c" } }] },
  absent: { modifications: [{ array_name: "controls", operation: "insert_back", value: [{ added: icon([4, 4]) }] }] },
});

// Microsoft UI element reference: from is the parent anchor; to is the child's.
for (const [from, to, expected] of [["center", "top_left", [50, 40]], ["top_left", "bottom_right", [-20, -10]], ["bottom_right", "center", [90, 75]]]) {
  for (const layout of [layoutTree, layoutResolvedTree]) {
    const result = layout({ id: "anchor", props: { type: "panel", size: [20, 10], anchor_from: from, anchor_to: to }, controls: [] }, { viewport: [100, 80] });
    assert.deepEqual([result.nodes[0].rect.x, result.nodes[0].rect.y], expected);
  }
}

const index = await indexResourcePack(target, { overlays: [vanilla] });
const tree = resolveControl(index, "review.screen");
assert.deepEqual(tree.unresolved, []);
assert.equal(tree.tree.props.type, "panel", "modification must retain the same-file lower-pack type");
assert.deepEqual(tree.tree.controls.map(child => child.id), ["original", "group", "added"]);
assert.deepEqual(tree.tree.controls.find(child => child.id === "group").controls.map(child => child.id), ["fresh"], "nested remove must not be undone when merging the child override");
assert.ok(Object.values(tree.tree.controls[0].provenance).some(source => source.file === join(vanilla, "ui", "base.json")), "retained controls keep their lower-pack evidence");
assert.ok(Object.values(tree.tree.controls[2].provenance).some(source => source.file === join(target, "ui", "base.json") && source.sourcePointer.startsWith("/screen/modifications/0/value/0/added")), "inserted controls point to their modification source");
assert.ok(resolveControl(index, "review.absent").unresolved.some(item => item.reason === "base_control_not_found"));
assert.ok(resolveControl(index, "review.cross_file").unresolved.some(item => item.reason === "cross_file_modification_unsupported"));
assert.ok(resolveControl(index, "review.inherited").unresolved.some(item => item.reason === "inherited_array_modification_unsupported"));
assert.ok(resolveControl(index, "review.malformed").unresolved.some(item => item.reason === "unsupported_operation"), "malformed modifications produce diagnostics instead of throwing");
assert.equal(resolveRoute(index, { title: "review: menu" }).route?.target, "review.screen", "title routing includes modification-inserted routes");
const reordered = resolveControl(index, "review.reordered").tree.controls[0];
assert.equal(reordered.id, "second");
assert.equal(reordered.pointer, "/controls/0");
assert.equal(reordered.provenance["/controls/0/texture"].file, join(vanilla, "ui", "base.json"));
assert.equal(reordered.provenance["/controls/0/texture"].sourcePointer, "/reordered/controls/1/second/texture");
assert.equal(reordered.provenance["/controls/0/offset/0"].file, join(target, "ui", "base.json"));
assert.equal(reordered.provenance["/controls/0/offset/0"].sourcePointer, "/reordered/controls/0/second/offset/0");
assert.equal(tree.tree.controls[2].provenance["/controls/2/texture"].sourcePointer, "/screen/modifications/0/value/0/added/texture");
assert.equal(resolveControl(index, "review.plain_derived").tree.provenance["/type"].sourcePointer, "/base/type", "inherited property origins use the resolved path and retain the original definition");
const bindingOrigins = resolveControl(index, "review.binding_order").tree;
assert.deepEqual(bindingOrigins.props.bindings.map(item => item.binding_name), ["#c", "#b"]);
assert.equal(bindingOrigins.provenance["/bindings/0/binding_name"].file, join(target, "ui", "base.json"));
assert.equal(bindingOrigins.provenance["/bindings/0/binding_name"].sourcePointer, "/binding_order/modifications/1/value/binding_name");
assert.equal(bindingOrigins.provenance["/bindings/1/binding_name"].file, join(vanilla, "ui", "base.json"));
assert.equal(bindingOrigins.provenance["/bindings/1/binding_name"].sourcePointer, "/binding_order/bindings/1/binding_name");

// Operations use public documentation selectors, not generated expected snapshots.
const list = ["a", "b", "c"].map(id => ({ id }));
function modify(modifications, children = list) {
  return applyModifications({ modifications }, children, { control: "test", resolveChildren: entries => entries.map(entry => ({ id: Object.keys(entry)[0] })) });
}
assert.deepEqual(modify([{ control_name: "b", operation: "insert_before", value: { x: {} } }, { control_name: "c", operation: "replace", value: { y: {} } }, { control_name: "a", operation: "remove" }]).controls.map(item => item.id), ["x", "b", "y"]);
assert.deepEqual(modify([{ control_name: "c", operation: "move_front" }, { control_name: "c", operation: "move_back" }, { control_name: "c", operation: "move_after", value: { a: {} } }, { control_name: "b", operation: "swap", value: { a: {} } }]).controls.map(item => item.id), ["a", "c", "b"]);
for (const [operation, anchor, source, expected] of [["move_before", "a", "c", ["c", "a", "b"]], ["move_before", "c", "a", ["b", "a", "c"]], ["move_after", "a", "c", ["a", "c", "b"]], ["move_after", "c", "a", ["b", "c", "a"]]]) {
  assert.deepEqual(modify([{ control_name: anchor, operation, value: { [source]: {} } }]).controls.map(item => item.id), expected);
}
assert.ok(modify([{ control_name: "missing", operation: "remove" }]).unresolved.some(item => item.reason === "target_not_found"));
assert.ok(modify([{ array_name: "controls", operation: "not_supported", value: [] }]).unresolved.some(item => item.reason === "unsupported_operation"));
const bindingProps = { bindings: [{ binding_name: "#a" }, { binding_name: "#b" }], modifications: [{ array_name: "bindings", operation: "replace", where: { binding_name: "#a" }, value: { binding_name: "#c" } }, { array_name: "bindings", operation: "remove", where: { binding_name: "#b" } }] };
assert.deepEqual(applyModifications(bindingProps, [], { control: "bindings" }).unresolved, []);
assert.deepEqual(bindingProps.bindings, [{ binding_name: "#c" }]);
const bindingOrder = { bindings: ["#a", "#b", "#c"].map(binding_name => ({ binding_name })), modifications: [{ array_name: "bindings", operation: "move_after", where: { binding_name: "#c" }, target: { binding_name: "#a" } }, { array_name: "bindings", operation: "swap", where: { binding_name: "#b" }, target: { binding_name: "#a" } }] };
assert.deepEqual(applyModifications(bindingOrder, []).unresolved, []);
assert.deepEqual(bindingOrder.bindings.map(item => item.binding_name), ["#a", "#c", "#b"]);
assert.ok(applyModifications({ bindings: [{ binding_name: "#same" }, { binding_name: "#same" }], modifications: [{ array_name: "bindings", operation: "remove", where: { binding_name: "#same" } }] }, []).unresolved.some(item => item.reason === "target_ambiguous"));

const invalidPatch = { namespace: "invalid", base: icon([0, 0]), screen: { type: "panel", controls: [], modifications: [
  { array_name: "controls", operation: "insert_back", value: [{ "bad@invalid.base": { anchor_from: "wrong", invented_property: true } }] },
  { array_name: "bindings", operation: "insert_back", value: [{ binding_type: "made_up" }] },
] } };
const patchIssues = await validateUiFile(invalidPatch, "ui/invalid.json");
for (const fragment of ["Unknown property", "Invalid anchor_from", "Invalid binding_type"]) assert.ok(patchIssues.some(item => item.message.includes(fragment) && item.path.includes("modifications[")), fragment);
const invalidPack = join(root, "invalid-patch");
await mkdir(join(invalidPack, "ui"), { recursive: true });
await json(join(invalidPack, "ui", "_ui_defs.json"), { ui_defs: ["ui/screen.json"] });
await json(join(invalidPack, "ui", "screen.json"), invalidPatch);
const invalidReport = await resolveScreen({ rpRoot: invalidPack, vanillaRoot: vanilla, control: "invalid.screen" });
assert.equal(invalidReport.ok, false, "invalid inserted controls cannot pass the public resolver");
assert.ok(invalidReport.unresolved.some(item => item.kind === "invalid_ui_property" && item.message.includes("invented_property")));

const args = { rpRoot: target, vanillaRoot: vanilla, outputDir, viewport: [100, 80] };
const rendered = await renderScreen({ ...args, control: "review.screen" });
assert.equal(rendered.ok, true, JSON.stringify(rendered));
assert.equal(rendered.outputAlpha.pixels, 3 * 8 * 8, "both the retained and inserted controls must draw");
assert.equal((await renderScreen({ ...args, fixture: { title: "review: menu" } })).ok, true, "the default title-routed render uses the composed definition");
const bad = await renderScreen({ ...args, control: "review.bad" });
assert.equal(bad.ok, false);
assert.ok(bad.unresolved.some(item => item.kind === "unresolved_modification" && item.impact === "blocking"));
const blank = await renderScreen({ ...args, control: "review.blank" });
assert.equal(blank.ok, false);
assert.ok(blank.validation.issues.some(item => item.kind === "EMPTY_RENDER_OUTPUT"));
assert.equal((await validateStateTextures({ ...args, control: "review.blank" })).ok, false, "identical failed state renders are not visual evidence");

const fontlessVanilla = join(root, "fontless-vanilla");
await mkdir(join(fontlessVanilla, "ui"), { recursive: true });
await json(join(fontlessVanilla, "ui", "_ui_defs.json"), { ui_defs: [] });
const fontlessArgs = { ...args, vanillaRoot: fontlessVanilla, control: "review.fixed_text" };
const fixedStructure = await resolveScreen(fontlessArgs);
assert.equal(fixedStructure.ok, true, "explicit dimensions can be inspected without font assets");
assert.equal(fixedStructure.renderPreparation.ok, false);
assert.ok(fixedStructure.renderPreparation.unresolved.some(item => item.kind === "FONT_UNAVAILABLE"));
const fixedRender = await renderScreen(fontlessArgs);
assert.equal(fixedRender.ok, false, "structure resolution must not waive font rendering requirements");
assert.ok(fixedRender.unresolved.some(item => item.kind === "FONT_UNAVAILABLE"));
const intrinsicStructure = await resolveScreen({ ...fontlessArgs, control: "review.intrinsic_text" });
assert.equal(intrinsicStructure.ok, false, "default dimensions still require font measurements");
assert.ok(intrinsicStructure.unresolved.some(item => item.reason === "intrinsic_label_size_requires_font"));
assert.equal((await measureText({ ...fontlessArgs, text: "fixture" })).ok, false);

const globalsTarget = join(root, "globals-target"), globalsVanilla = join(root, "globals-vanilla");
for (const pack of [globalsTarget, globalsVanilla]) {
  await mkdir(join(pack, "ui"), { recursive: true });
  await json(join(pack, "ui", "_ui_defs.json"), { ui_defs: pack === globalsTarget ? ["ui/screen.json"] : [] });
}
await json(join(globalsTarget, "ui", "screen.json"), { namespace: "globals", screen: { type: "panel", "$target_width|default": 10, "$overlay_height|default": 20, size: ["$target_width", "$overlay_height"] } });
const globalsArgs = { rpRoot: globalsTarget, vanillaRoot: globalsVanilla, control: "globals.screen" };
const geometry = async () => { const report = await resolveScreen(globalsArgs); assert.equal(report.ok, true); return [report.layout.nodes[0].rect.w, report.layout.nodes[0].rect.h]; };
assert.deepEqual(await geometry(), [10, 20]);
await json(join(globalsTarget, "ui", "_global_variables.json"), { "$target_width": 99 });
assert.deepEqual(await geometry(), [99, 20], "creating target globals invalidates the cached index");
await json(join(globalsVanilla, "ui", "_global_variables.json"), { "$overlay_height": 47 });
assert.deepEqual(await geometry(), [99, 47], "creating overlay globals invalidates both overlay and merged indexes");
await json(join(globalsTarget, "ui", "_global_variables.json"), { "$target_width": 55 });
await json(join(globalsVanilla, "ui", "_global_variables.json"), { "$overlay_height": 39 });
assert.deepEqual(await geometry(), [55, 39], "edits to existing global files invalidate the cache");

function cli(control) {
  const result = spawnSync(process.execPath, ["tools/final-rp-render.mjs", target, control, "--vanilla-root", vanilla, "--viewport", "100x80", "--output-dir", join(root, "cli")], { cwd: repo, encoding: "utf8", windowsHide: true });
  assert.equal(result.error, undefined);
  return { code: result.status, report: JSON.parse(result.stdout), stderr: result.stderr };
}
const passed = cli("review.screen");
assert.equal(passed.code, 0, passed.stderr);
assert.equal(passed.report.ok, true);
assert.equal(passed.report.summary.engine, "final-rp-v2");
const artifact = JSON.parse(await readFile(passed.report.summary.report, "utf8"));
assert.equal(artifact.outputAlpha.pixels, 3 * 8 * 8);
for (const control of ["review.bad", "review.blank", "review.cross_file", "review.inherited", "review.malformed"]) {
  const failed = cli(control);
  assert.notEqual(failed.code, 0);
  assert.equal(failed.report.ok, false);
  assert.equal(failed.report.status, "failed");
}
console.log("final-rp-review-regressions: ok");
