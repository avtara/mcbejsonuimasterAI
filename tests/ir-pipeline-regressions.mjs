import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { applyDefaults, validateIr } from "../tools/_lib/ir.mjs";
import { solve } from "../tools/_lib/solver.mjs";
import { solveWithGo } from "../tools/_lib/go-solver.mjs";
import { compile } from "../tools/_lib/compiler.mjs";
import { PATHS } from "../tools/_lib/paths.mjs";

const scratch = await mkdtemp(join(tmpdir(), "mcbe-ir-regressions-"));
const previousGoCache = PATHS.goCache;
PATHS.goCache = join(scratch, "go-cache");
const ir = (elements, constraints = []) => ({ screen: "regression", base_resolution: [500, 400], elements, constraints });
const element = (id, pos = [0, 0], size = [100, 100], extras = {}) => ({ id, pos, size, ...extras });
const exists = async (path) => access(path).then(() => true, () => false);
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const cli = (args) => {
  const result = spawnSync(process.execPath, args, { cwd: PATHS.root, encoding: "utf8", windowsHide: true, env: { ...process.env, MCBEKIT_SOLVER: "node" } });
  assert.ifError(result.error);
  return result;
};
const pipeline = async (name, input) => {
  const dir = join(scratch, name);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "ir.yaml");
  await writeFile(path, JSON.stringify(input));
  return { dir, path, result: cli(["tools/run.mjs", path]) };
};
const wrap = (input, result) => ({ schema: "mcbe-jsonui-ai-kit/solved@1", ...applyDefaults(input), ...result });
let goChecked = 0;
const hasGo = spawnSync("go", ["version"], { encoding: "utf8", windowsHide: true }).status === 0;

try {
  const invalidCases = [
    ["reserved-root", ir([element("root_panel"), element("sibling", [200, 0])]), /reserved element id/],
    ["reserved-namespace", ir([element("namespace")]), /reserved element id/],
    ["duplicate", ir([element("item"), element("item", [200, 0])]), /duplicate element id/],
  ];
  for (const [name, input, message] of invalidCases) {
    const validation = await validateIr(input);
    assert.equal(validation.ok, false, name);
    assert.match(validation.errors[0].message, message);
    assert.throws(() => solve(applyDefaults(input)), message);
    assert.throws(() => compile({ elements: input.elements }), message);
    const run = await pipeline(name, input);
    assert.equal(run.result.status, 5, run.result.stdout + run.result.stderr);
    assert.equal(await exists(join(run.dir, "ui.json")), false);
    const direct = cli(["tools/solve.mjs", run.path, join(run.dir, "direct.json")]);
    assert.equal(direct.status, 5, name + ": standalone solve must reject invalid IDs");
    if (hasGo) { assert.throws(() => solveWithGo(applyDefaults(input)), message); goChecked++; }
  }

  const move = ir([
    element("panel"),
    element("child", [10, 10], [20, 20], { parent: "panel" }),
    element("grandchild", [-2, -3], [6, 4], { parent: "child", anchor: "bottom_right" }),
    element("reference", [200, 0]),
  ], [{ op: "align_x", ids: ["reference", "panel"] }]);
  const moved = solve(applyDefaults(move));
  assert.equal(moved.converged, true);
  assert.deepEqual(moved.rects.child, { x: 210, y: 10, w: 20, h: 20 });
  assert.deepEqual(moved.rects.grandchild, { x: 222, y: 23, w: 6, h: 4 });
  assert.deepEqual(compile(wrap(move, moved)).child.offset, [10, 10]);
  const pipelineMove = await pipeline("parent-move", move);
  assert.equal(pipelineMove.result.status, 0, pipelineMove.result.stdout + pipelineMove.result.stderr);
  assert.equal((await readJson(join(pipelineMove.dir, "report.json"))).warnings.length, 0);

  const anchors = ["top_left", "top_middle", "top_right", "left_middle", "center", "right_middle", "bottom_left", "bottom_middle", "bottom_right"];
  const resize = ir([
    element("panel", [20, 20]), element("reference", [200, 100], [200, 180]),
    ...anchors.map((anchor) => element(anchor, [0, 0], [20, 20], { parent: "panel", anchor })),
  ], [{ op: "same_size", ids: ["reference", "panel"] }, { op: "align_x", ids: ["reference", "panel"] }, { op: "align_y", ids: ["reference", "panel"] }]);
  const resized = solve(applyDefaults(resize));
  assert.equal(resized.converged, true);
  for (const [index, anchor] of anchors.entries()) {
    assert.deepEqual(resized.rects[anchor], { x: 200 + (index % 3) * 90, y: 100 + Math.floor(index / 3) * 80, w: 20, h: 20 }, anchor);
    assert.deepEqual(compile(wrap(resize, resized))[anchor].offset, [0, 0], anchor);
  }

  const explicit = structuredClone(move);
  explicit.constraints.unshift({ op: "edge_offset", a: "child.left", b: "reference.left", delta: 8 });
  const pinned = solve(applyDefaults(explicit));
  assert.equal(pinned.converged, true);
  assert.equal(pinned.rects.child.x, 208);
  assert.equal(pinned.rects.grandchild.x, 220);
  assert.deepEqual(compile(wrap(explicit, pinned)).child.offset, [8, 10]);

  const mutationCases = [
    ["center", [element("panel"), element("reference", [100, 0])], [{ op: "center_group_x", ids: ["panel", "reference"] }], 150],
    ["symmetry", [element("panel", [20, 0]), element("reference", [300, 0])], [{ op: "symmetric_x", ids: ["panel", "reference"] }], 60],
    ["gap", [element("first"), element("panel", [250, 0]), element("last", [400, 0], [50, 100])], [{ op: "equal_gap_x", ids: ["first", "panel", "last"], gap: 10 }], 110],
    ["edge", [element("panel"), element("reference", [200, 0])], [{ op: "edge_offset", a: "panel.left", b: "reference.left", delta: 8 }], 208],
  ];
  const parityCases = [move, resize, explicit];
  for (const [name, elements, constraints, expectedX] of mutationCases) {
    const input = ir([...elements, element("child", [10, 10], [20, 20], { parent: "panel" })], constraints);
    const result = solve(applyDefaults(input));
    assert.equal(result.converged, true, name);
    assert.equal(result.rects.panel.x, expectedX, name);
    assert.equal(result.rects.child.x, expectedX + 10, name);
    parityCases.push(input);
  }

  const conflict = ir([element("a", [10, 10], [20, 20]), element("b", [100, 10], [20, 20])], [
    { op: "edge_eq", a: "b.left", b: "a.left" },
    { op: "edge_offset", a: "b.left", b: "a.left", delta: 30 },
  ]);
  const runConflict = await pipeline("conflict", conflict);
  assert.equal(runConflict.result.status, 7, runConflict.result.stdout + runConflict.result.stderr);
  const failedSolved = await readJson(join(runConflict.dir, "solved.json"));
  const failedReport = await readJson(join(runConflict.dir, "report.json"));
  assert.equal(failedSolved.converged, false);
  assert.equal(failedReport.ok, false);
  assert.match(failedReport.errors[0].message, /did not converge/);
  assert.equal(await exists(join(runConflict.dir, "ui.json")), false);
  assert.throws(() => compile(failedSolved), /unconverged/);
  const rejectedCompile = cli(["tools/compile.mjs", join(runConflict.dir, "solved.json"), join(runConflict.dir, "ui.json")]);
  assert.notEqual(rejectedCompile.status, 0);
  const validator = cli(["tools/validate.mjs", join(pipelineMove.dir, "ui.json"), join(runConflict.dir, "solved.json"), "--report", join(runConflict.dir, "standalone-report.json")]);
  assert.equal(validator.status, 9, validator.stdout + validator.stderr);
  assert.equal((await readJson(join(runConflict.dir, "standalone-report.json"))).ok, false);
  const previousUi = await readFile(join(pipelineMove.dir, "ui.json"), "utf8");
  await writeFile(pipelineMove.path, JSON.stringify(conflict));
  assert.equal(cli(["tools/run.mjs", pipelineMove.path]).status, 7);
  assert.equal((await readJson(join(pipelineMove.dir, "report.json"))).ok, false, "a failed rerun must replace the previous success report");
  assert.equal(await readFile(join(pipelineMove.dir, "ui.json"), "utf8"), previousUi, "a failed solve must not overwrite the last compiled UI");
  parityCases.push(conflict);

  if (hasGo) {
    for (const input of parityCases) {
      const normalized = applyDefaults(input);
      const node = solve(normalized);
      const go = solveWithGo(normalized);
      assert.deepEqual(go, node, "Go and Node results must agree for hierarchy and failure cases");
      goChecked++;
    }
  }
  console.log("IR pipeline regressions OK; Go cases=" + goChecked + (hasGo ? "" : " (Go unavailable; parity skipped)"));
} finally {
  PATHS.goCache = previousGoCache;
  assert.ok(resolve(scratch).startsWith(resolve(tmpdir()) + sep), "cleanup must stay inside the OS temporary directory");
  await rm(scratch, { recursive: true, force: true });
}
