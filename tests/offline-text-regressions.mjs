import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import * as canvasMod from "@napi-rs/canvas";
import { evaluateTextFixtures, rasterTextMeasurement, selectTextTargets, validateTextCoverage } from "../tools/_lib/offline-text-eval.mjs";
import { layoutPreviewText } from "../tools/_lib/preview-engine.mjs";
import { presentText } from "../tools/_lib/text-presentation.mjs";
import { BOOK_TEXT_PRESENTATION, buildScreen, examples, irDocument, textCoverage, textFixtureCases } from "../examples/v2/_scripts/generate.mjs";

const scratch = await mkdtemp(join(tmpdir(), "mcbe-text-regressions-"));
const fixtures = JSON.parse(await readFile(new URL("../evals/fixtures/text-cases.json", import.meta.url), "utf8")).cases;
const node = { type: "label", text: "Original body", font_size: "normal", font_scale_factor: 0.9, size: [560, 100] };
const rect = { x: 0, y: 0, w: 560, h: 100, scale: 1 };
try {
  const ko = await rasterTextMeasurement(canvasMod, node, rect, fixtures.find((item) => item.id === "long_ko_130").text);
  const en = await rasterTextMeasurement(canvasMod, node, rect, fixtures.find((item) => item.id === "long_en").text);
  assert.equal(ko.fits, true);
  assert.equal(en.fits, true);
  assert.equal(en.fontPx, 9);
  assert.equal(en.fontScaleFactor, 0.9, "text must retain the configured scale");
  assert.ok(ko.pixels > 0 && en.pixels > 0, "both fixtures must produce actual ink");

  const token = fixtures.find((item) => item.id === "unbroken_token").text;
  const narrow = await rasterTextMeasurement(canvasMod, node, { ...rect, w: 40, h: 1000 }, token);
  assert.equal(narrow.fits, false, "large area cannot compensate for an unbroken token exceeding the width");
  assert.ok(narrow.measuredWidth > narrow.maxWidth);
  assert.ok(narrow.inkBounds.right > 40, "long tokens must not be squeezed into the label by fillText maxWidth");
  const short = await rasterTextMeasurement(canvasMod, node, { ...rect, w: 130, h: 8 }, fixtures.find((item) => item.id === "long_en").text);
  assert.equal(short.fits, false);
  assert.ok(short.requiredHeight > 8);
  const edgeText = "WWWW";
  const edgeProbe = await rasterTextMeasurement(canvasMod, node, rect, edgeText);
  const inside = await rasterTextMeasurement(canvasMod, node, { ...rect, w: edgeProbe.measuredWidth + 9 }, edgeText);
  const outside = await rasterTextMeasurement(canvasMod, node, { ...rect, w: edgeProbe.measuredWidth + 7 }, edgeText);
  assert.equal(inside.fits, true);
  assert.equal(outside.fits, false, "one-pixel width boundary must be measured");

  const ui = { namespace: "text_fixture", root_panel: { type: "panel", controls: [{ body: structuredClone(node) }, { title: { ...node, text: "Title", size: [1600, 500] } }] } };
  const solved = { base_resolution: [1920, 1080], rects: { __root__: { x: 0, y: 0, w: 1920, h: 1080 }, body: { x: 20, y: 20, w: 560, h: 100 }, title: { x: 20, y: 200, w: 1600, h: 500 } } };
  assert.deepEqual(selectTextTargets(ui, solved).targets.map((item) => item.id), ["body"]);
  const noBody = { namespace: "none", title: { ...node, text: "Large title" } };
  assert.equal(selectTextTargets(noBody, solved).issues[0].reason, "missing_text_target");
  assert.equal(selectTextTargets(ui, solved, ["absent"]).issues[0].reason, "ambiguous_or_missing_label");
  const duplicated = structuredClone(ui);
  duplicated.root_panel.controls.push({ body: structuredClone(node) });
  assert.equal(selectTextTargets(duplicated, solved).issues[0].reason, "ambiguous_or_missing_label");
  const before = JSON.stringify({ ui, solved });
  const result = await evaluateTextFixtures({ canvasMod, ui, uiFile: join(scratch, "source.json"), solved, fixtureCases: fixtures, profileIds: ["pc", "touch"], outputDir: scratch });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.measurements.length, 6);
  assert.equal(result.evidence.level, "offline-approximate");
  assert.equal(result.evidence.minecraftGlyphEvidence, false);
  assert.equal(result.evidence.runtimeVerified, false);
  assert.equal(JSON.stringify({ ui, solved }), before, "fixture injection must only change cloned UI");
  for (const measured of result.measurements) {
    assert.equal(measured.target, "body");
    assert.equal(measured.text, fixtures.find((item) => item.id === measured.fixture).text);
    assert.equal(measured.fontScaleFactor, 0.9);
    assert.ok((await readFile(measured.artifacts.preview)).length > 0);
    assert.ok((await readFile(measured.artifacts.textMask)).length > 0);
  }
  assert.notDeepEqual(await readFile(result.measurements[0].artifacts.preview), await readFile(result.measurements[2].artifacts.preview), "different fixture strings must change the rendered preview");
  const unsupported = await evaluateTextFixtures({ canvasMod, ui: noBody, uiFile: "unused.json", solved, fixtureCases: fixtures, profileIds: ["pc"], outputDir: scratch });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.measurements.length, 0);

  const probe = canvasMod.createCanvas(1, 1).getContext("2d");
  const hardLines = layoutPreviewText(probe, node, rect, "First line\n\nThird line\r\nLast line");
  assert.deepEqual(hardLines.lines, ["First line", "", "Third line", "Last line"]);
  const transformed = presentText(token, BOOK_TEXT_PRESENTATION);
  assert.equal(transformed.replaceAll("\n", ""), token, "presentation must retain every original token character");
  assert.ok(transformed.split("\n").every((line) => Array.from(line).length <= 16));
  assert.equal(presentText(transformed, BOOK_TEXT_PRESENTATION), transformed, "formatting must be idempotent");
  assert.equal(presentText("😀😀😀", { mode: "break-long-tokens", maxTokenCodePoints: 2 }), "😀😀\n😀", "do not split surrogate pairs");
  assert.throws(() => presentText(token, { mode: "fit" }), /unsupported/);
  const bookExample = examples.find((example) => example.id === "book_quest");
  const generatedBook = buildScreen({ ...bookExample, bodyText: token });
  const findLabel = (value, id) => {
    if (!value || typeof value !== "object") return null;
    if (value[id]?.type === "label") return value[id];
    for (const child of Object.values(value)) { const match = findLabel(child, id); if (match) return match; }
    return null;
  };
  assert.equal(findLabel(generatedBook, "quest_body").text, transformed, "real RP authoring uses the same presentation policy");
  assert.equal(irDocument({ ...bookExample, bodyText: token }).elements.find((element) => element.id === "quest_body").props.text, transformed, "IR authoring must agree with RP output");
  const bookRect = { x: 0, y: 0, w: 250 * 2 / 3, h: 100, scale: 2 / 3 };
  assert.equal((await rasterTextMeasurement(canvasMod, { ...node, font_scale_factor: 0.85 }, bookRect, token)).fits, false);
  assert.equal((await rasterTextMeasurement(canvasMod, { ...node, font_scale_factor: 0.85 }, bookRect, transformed)).fits, true);

  assert.deepEqual(fixtures, textFixtureCases(), "committed fixtures must agree with their generator");
  for (const example of examples) {
    const generatedCoverage = textCoverage(example);
    assert.deepEqual(validateTextCoverage(generatedCoverage, fixtures), [], example.id);
    const committed = JSON.parse(await readFile(new URL(`../examples/v2/${example.dir}/validation.json`, import.meta.url), "utf8"));
    assert.deepEqual(committed.textCoverage, generatedCoverage, `${example.id}: stale generated contract`);
  }
  const titleCoverage = { version: 1, scope: "static-solved-labels", hasBody: false, targets: [{ id: "title", role: "title", fixtures: ["source", "server_form_grid_title_ko"] }] };
  const titleResult = await evaluateTextFixtures({ canvasMod, ui: noBody, uiFile: "unused.json", solved, fixtureCases: fixtures, coverage: titleCoverage, profileIds: ["pc", "touch"], outputDir: scratch });
  assert.equal(titleResult.ok, true, JSON.stringify(titleResult));
  assert.equal(titleResult.measurements.length, 4, "a no-body screen must still render and measure its actual title");
  assert.ok(titleResult.measurements.every((item) => item.role === "title" && item.fixture !== "long_en"));
  const invalidRole = structuredClone(titleCoverage); invalidRole.targets[0].fixtures.push("long_en");
  assert.ok(validateTextCoverage(invalidRole, fixtures).some((issue) => issue.reason === "fixture_role_mismatch"));
  const missingStress = structuredClone(textCoverage(bookExample)); missingStress.targets.find((item) => item.role === "body").fixtures = ["source"];
  assert.equal(validateTextCoverage(missingStress, fixtures).filter((issue) => issue.reason === "missing_body_stress_fixture").length, 3);
  const incomplete = await evaluateTextFixtures({ canvasMod, ui, uiFile: "unused.json", solved, fixtureCases: fixtures, coverage: titleCoverage, profileIds: ["pc"], outputDir: scratch });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.issues.some((issue) => issue.reason === "uncovered_solved_label" && issue.target === "body"));
  console.log("Offline text regressions OK: semantic coverage, source generation parity, hard newlines, KO/EN/token raster, width/height boundaries and unchanged scale");
} finally {
  assert.ok(resolve(scratch).startsWith(resolve(tmpdir()) + sep));
  await rm(scratch, { recursive: true, force: true });
}
