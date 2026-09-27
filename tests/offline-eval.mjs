import assert from "node:assert/strict";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
function run(args) { return new Promise((done) => { const child = spawn(process.execPath, args, { cwd: root }); let stdout = "", stderr = ""; child.stdout.on("data", (d) => { stdout += d; }); child.stderr.on("data", (d) => { stderr += d; }); child.on("close", (code) => done({ code, stdout, stderr })); }); }
const help = await run(["tools/eval-offline.mjs", "--help"]);
assert.equal(help.code, 0); assert.match(help.stdout, /--update-goldens/); assert.match(help.stdout, /--task/);
const outputRoot = resolve(process.env.MCBEKIT_TEST_ROOT || "workspace", "offline-eval");
const evaluated = await run(["tools/eval-offline.mjs", "--json", "--report", resolve(outputRoot, "report.json")]);
if (evaluated.code !== 0) {
  const failedReport = await import("node:fs/promises").then(({ readFile }) => readFile(resolve(outputRoot, "report.json"), "utf8")).then(JSON.parse).catch(() => null);
  const failures = failedReport?.tasks.filter((task) => !task.ok).map((task) => ({
    task: task.id,
    checks: task.checks.filter((check) => !check.ok).map(({ id, details }) => {
      if (details?.measurements) return { id, issues: details.issues, measurements: details.measurements.filter((item) => !item.fits).map((item) => ({ target: item.target, fixture: item.fixture, profile: item.profile, measuredWidth: item.measuredWidth, maxWidth: item.maxWidth, requiredHeight: item.requiredHeight, available: item.available, inkFits: item.inkFits })) };
      if (details?.comparisons) return { id, policy: details.policy, comparisons: details.comparisons.filter((item) => !item.ok) };
      if (details?.diagnostics) return { id, imageRenderer: details.imageRenderer, diagnosticCount: details.diagnostics.length, diagnostics: details.diagnostics.slice(0, 8), unsupported: details.unsupported?.slice(0, 8) };
      return { id, details };
    }),
  }));
  console.error("Offline evaluation failed checks:", JSON.stringify(failures ?? { reportUnavailable: true }));
}
assert.equal(evaluated.code, 0, evaluated.stderr || evaluated.stdout);
const envelope = JSON.parse(evaluated.stdout.trim()); assert.equal(envelope.ok, true);
const report = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(resolve(outputRoot, "report.json"), "utf8")));
assert.equal(report.tasks.length, 7); assert.equal(report.ok, true);
const bodylessRoles = new Map([["daily_rewards", ["title", "day", "quantity"]], ["server_form_grid", ["title"]], ["hud_minimap", ["coordinates"]], ["casino_reels", ["title", "balance", "bet", "payline"]]]);
for (const task of report.tasks) {
  assert.ok(task.checks.find((item) => item.id === "pixelmatch_goldens")?.ok, task.id + ": original golden images must still match");
  const failures = task.checks.filter((item) => !item.ok);
  assert.deepEqual(failures, [], task.id);
  const text = task.checks.find((item) => item.id === "semantic_text_label_measurement").details;
  assert.equal(text.evidence.level, "offline-approximate");
  assert.equal(text.evidence.minecraftGlyphEvidence, false);
  assert.equal(text.evidence.runtimeVerified, false);
  assert.ok(text.measurements.length > 0 && text.measurements.every((item) => item.fits && item.pixels > 0));
  if (bodylessRoles.has(task.id)) {
    assert.deepEqual([...new Set(text.measurements.map((item) => item.role))].sort(), [...bodylessRoles.get(task.id)].sort());
    assert.ok(text.measurements.every((item) => !["long_ko_130", "long_en", "unbroken_token"].includes(item.fixture)), "body stress text cannot stand in for title/number/HUD role fixtures");
  } else {
    for (const fixture of ["long_ko_130", "long_en", "unbroken_token"]) for (const profile of ["pc", "touch"]) {
      assert.ok(text.measurements.some((item) => item.role === "body" && item.fixture === fixture && item.profile === profile));
    }
  }
  if (task.id === "book_quest") {
    const token = text.measurements.find((item) => item.target === "quest_body" && item.fixture === "unbroken_token" && item.profile === "touch");
    assert.equal(token.text.replaceAll("\n", ""), token.inputText);
    assert.ok(token.lines.length > 1 && token.measuredWidth <= token.maxWidth && token.requiredHeight <= token.available[1]);
    assert.equal(token.fontScaleFactor, 0.85);
  }
}
const live = await run(["tools/eval-live.mjs", "--task", "typography_state_gallery", "--json", "--report", resolve(outputRoot, "live.json")]);
assert.equal(live.code, 9); const liveEnvelope = JSON.parse(live.stdout.trim()); assert.equal(liveEnvelope.ok, false); const liveReport = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(resolve(outputRoot, "live.json"), "utf8"))); assert.equal(liveReport.emulation, false); assert.equal(liveReport.tasks[0].status, "runtime-unverified");
console.log("PASS offline evaluation measures seven semantic text contracts, preserves golden policy, and blocks unverified live evidence");
