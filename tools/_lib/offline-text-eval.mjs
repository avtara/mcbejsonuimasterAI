import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PREVIEW_PROFILES, drawPreviewText, layoutPreviewText, renderProfile, transformRect } from "./preview-engine.mjs";
import { presentText } from "./text-presentation.mjs";

const BODY_FIXTURES = ["long_ko_130", "long_en", "unbroken_token"];
const ROLES = new Set(["body", "title", "caption", "day", "quantity", "coordinates", "balance", "bet", "payline", "instructions"]);

export function validateTextCoverage(coverage, fixtureCases) {
  const issues = [], ids = new Set();
  if (coverage?.version !== 1 || coverage?.scope !== "static-solved-labels" || !Array.isArray(coverage?.targets) || !coverage.targets.length || typeof coverage?.hasBody !== "boolean") {
    return [{ reason: "invalid_text_coverage", message: "Declare version 1 static-solved-labels coverage, hasBody, and semantic targets." }];
  }
  if (!Array.isArray(fixtureCases) || fixtureCases.some((fixture) => !fixture || typeof fixture.id !== "string")) {
    return [{ reason: "invalid_text_fixture_catalog" }];
  }
  const fixtureIds = new Set();
  for (const fixture of fixtureCases) {
    if (fixtureIds.has(fixture.id)) issues.push({ reason: "duplicate_text_fixture", fixture: fixture.id });
    fixtureIds.add(fixture.id);
  }
  for (const target of coverage.targets) {
    if (typeof target?.id !== "string" || !target.id || ids.has(target.id)) issues.push({ reason: "invalid_or_duplicate_text_target", target: target?.id });
    ids.add(target?.id);
    if (!ROLES.has(target?.role)) issues.push({ reason: "invalid_text_role", target: target?.id, role: target?.role });
    if (!Array.isArray(target?.fixtures) || !target.fixtures.length) { issues.push({ reason: "missing_role_fixtures", target: target?.id }); continue; }
    if (new Set(target.fixtures).size !== target.fixtures.length) issues.push({ reason: "duplicate_target_fixture", target: target.id });
    if (!target.fixtures.includes("source")) issues.push({ reason: "missing_source_text_fixture", target: target.id });
    if (target.role === "body") for (const id of BODY_FIXTURES) if (!target.fixtures.includes(id)) issues.push({ reason: "missing_body_stress_fixture", target: target.id, fixture: id });
    for (const id of target.fixtures.filter((id) => id !== "source")) {
      const fixture = fixtureCases.find((item) => item.id === id);
      if (!fixture || typeof fixture.text !== "string" || !fixture.text.trim()) issues.push({ reason: "missing_text_fixture", target: target.id, fixture: id });
      else if (!fixture.roles?.includes(target.role)) issues.push({ reason: "fixture_role_mismatch", target: target.id, fixture: id, role: target.role });
    }
    try { presentText("probe", target.presentation); } catch { issues.push({ reason: "invalid_text_presentation", target: target.id }); }
    if (target.presentation?.mode === "break-long-tokens" && target.role !== "body") issues.push({ reason: "presentation_role_mismatch", target: target.id });
  }
  if (coverage.hasBody !== coverage.targets.some((target) => target?.role === "body")) issues.push({ reason: "body_coverage_mismatch" });
  return issues;
}

export const TEXT_EVIDENCE = {
  level: "offline-approximate",
  font: "system sans-serif",
  minecraftGlyphEvidence: false,
  runtimeVerified: false,
  policy: "Measure and rasterize at the preview's configured label scale; do not reduce font scale or horizontally fit long tokens.",
};

function labelsIn(value, path = [], output = []) {
  if (!value || typeof value !== "object") return output;
  if (value.type === "label") {
    const key = String(path.at(-1) || "");
    output.push({ id: key.split("@")[0].split(".").pop(), node: value, path });
  }
  for (const [key, child] of Object.entries(value)) if (child && typeof child === "object") labelsIn(child, [...path, key], output);
  return output;
}

export function selectTextTargets(ui, solved, requestedIds) {
  const labels = labelsIn(ui);
  const ids = requestedIds ?? labels.filter((label) => /(^|_)(body|description)$/.test(label.id)).map((label) => label.id);
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string")) {
    return { targets: [], issues: [{ reason: "missing_text_target", message: "Declare validation.textTargets as label IDs or provide a body/description label. A title, number, or arbitrary largest label cannot stand in for body text." }] };
  }
  const targets = [], issues = [];
  for (const id of new Set(ids)) {
    const matches = labels.filter((label) => label.id === id);
    if (matches.length !== 1) { issues.push({ target: id, reason: "ambiguous_or_missing_label", matches: matches.length }); continue; }
    if (!solved.rects?.[id]) { issues.push({ target: id, reason: "missing_solved_rect" }); continue; }
    if (matches[0].node.visible === false) { issues.push({ target: id, reason: "hidden_text_target" }); continue; }
    targets.push(matches[0]);
  }
  return { targets, issues };
}

export async function rasterTextMeasurement(canvasMod, node, rect, text, outputPath) {
  const probe = canvasMod.createCanvas(1, 1).getContext("2d");
  const layout = layoutPreviewText(probe, node, rect, text);
  const marginX = Math.ceil(Math.max(16, layout.fontPx * 2, layout.measuredWidth + 8 - rect.w));
  const marginY = Math.ceil(Math.max(16, layout.fontPx * 2, layout.requiredHeight - rect.h));
  const width = Math.ceil(rect.w + marginX * 2);
  const height = Math.ceil(rect.h + marginY * 2);
  // Center the label in the mask so overflow on every edge stays observable.
  const mask = canvasMod.createCanvas(width, height);
  const maskRect = { ...rect, x: (width - rect.w) / 2, y: (height - rect.h) / 2 };
  const ctx = mask.getContext("2d");
  drawPreviewText(ctx, { ...node, color: [1, 1, 1, 1] }, maskRect, layout, { clip: false });
  const { data } = ctx.getImageData(0, 0, width, height);
  let left = width, top = height, right = -1, bottom = -1, pixels = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 0) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1); pixels++;
  }
  const bounds = pixels ? { left: left - maskRect.x, top: top - maskRect.y, right: right - maskRect.x, bottom: bottom - maskRect.y } : null;
  const inkFits = !!bounds && bounds.left >= 0 && bounds.top >= 0 && bounds.right <= rect.w && bounds.bottom <= rect.h;
  if (outputPath) await writeFile(outputPath, await mask.encode("png"));
  return { ...layout, available: [rect.w, rect.h], pixels, inkBounds: bounds, inkFits, fits: inkFits && layout.measuredWidth <= layout.maxWidth && layout.requiredHeight <= rect.h };
}

export async function evaluateTextFixtures({ canvasMod, ui, uiFile, solved, fixtureCases, profileIds, outputDir, targetIds, coverage }) {
  const contractIssues = coverage ? validateTextCoverage(coverage, fixtureCases) : [];
  if (contractIssues.length) return { ok: false, evidence: TEXT_EVIDENCE, issues: contractIssues, measurements: [] };
  const selection = selectTextTargets(ui, solved, coverage ? coverage.targets.map((target) => target.id) : targetIds);
  const issues = [...selection.issues], measurements = [];
  if (coverage) for (const label of labelsIn(ui).filter((label) => solved.rects?.[label.id])) {
    const declared = coverage.targets.find((target) => target.id === label.id);
    if (!declared) issues.push({ reason: "uncovered_solved_label", target: label.id });
    else if (/(^|_)(body|description)$/.test(label.id) && declared.role !== "body") issues.push({ reason: "body_role_mismatch", target: label.id });
  }
  if (!coverage) for (const id of BODY_FIXTURES) {
    const item = fixtureCases.find((fixture) => fixture.id === id);
    if (!item || typeof item.text !== "string" || !item.text.trim()) issues.push({ reason: "missing_text_fixture", fixture: id });
  }
  if (!canvasMod) issues.push({ reason: "text_renderer_unavailable" });
  if (issues.length) return { ok: false, evidence: TEXT_EVIDENCE, issues, measurements };
  await mkdir(outputDir, { recursive: true });
  const flat = { baseW: solved.base_resolution[0], baseH: solved.base_resolution[1], rects: Object.entries(solved.rects).filter(([id]) => id !== "__root__" && id !== "__screen__").map(([id, rect]) => ({ id, ...rect })) };
  for (const target of selection.targets) {
    const declared = coverage?.targets.find((item) => item.id === target.id);
    const cases = (declared?.fixtures ?? BODY_FIXTURES).map((id) => id === "source" ? { id, locale: "source", text: String(target.node.text ?? "") } : fixtureCases.find((item) => item.id === id));
    for (const fixture of cases) for (const profileId of new Set(profileIds)) {
      const profile = PREVIEW_PROFILES[profileId];
      if (!profile) { issues.push({ reason: "unknown_text_profile", profile: profileId }); continue; }
      const clone = structuredClone(ui);
      let label = clone;
      for (const key of target.path) label = label[key];
      label.text = presentText(fixture.text, declared?.presentation);
      const stem = [target.id, fixture.id, profileId].join("-").replace(/[^a-zA-Z0-9_-]/g, "_");
      const previewPath = join(outputDir, stem + ".png"), maskPath = join(outputDir, stem + "-text.png");
      const diagnostics = await renderProfile({ canvasMod, ui: clone, uiFile, flat, profile, state: "default", outputPath: previewPath });
      const rect = transformRect(solved.rects[target.id], solved.base_resolution, profile.viewport);
      const measurement = await rasterTextMeasurement(canvasMod, label, rect, label.text, maskPath);
      const targetDiagnostics = diagnostics.filter((item) => item.control === target.id);
      measurements.push({ target: target.id, role: declared?.role ?? "body", sourcePath: target.path, fixture: fixture.id, locale: fixture.locale, profile: profileId, inputText: fixture.text, presentation: declared?.presentation ?? { mode: "identity" }, ...measurement, fits: measurement.fits && targetDiagnostics.length === 0, diagnostics: targetDiagnostics, artifacts: { preview: previewPath, textMask: maskPath } });
    }
  }
  return { ok: issues.length === 0 && measurements.length > 0 && measurements.every((item) => item.fits), evidence: TEXT_EVIDENCE, issues, measurements };
}
