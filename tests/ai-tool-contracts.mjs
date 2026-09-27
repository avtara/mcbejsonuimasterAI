import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { loadProfiles, loadRegistry, validateProfiles } from "../tools/_lib/ai-contracts.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const REPO = resolve(here, "..");
const NODE = process.execPath;
const OUT = resolve(process.env.MCBEKIT_REPO_TEST_ROOT || resolve(REPO, "workspace"), "ai-tool-contracts");
const failures = [];
let passed = 0;

function run(args) {
  return new Promise((done) => {
    const child = spawn(NODE, args, { cwd: REPO });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => done({ code, stdout, stderr }));
  });
}

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    process.stdout.write(`PASS ${name}${detail ? ` ${detail}` : ""}\n`);
  } else {
    failures.push({ name, detail });
    process.stdout.write(`FAIL ${name}${detail ? ` ${detail}` : ""}\n`);
  }
}

function json(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function semanticHash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

async function main() {
  await rm(OUT, { recursive: true, force: true });

  for (const script of ["tool-list", "tool-describe", "skill-context", "skill-doctor", "prompt-build", "prompt-lint"]) {
    const result = await run([`tools/${script}.mjs`, "--help"]);
    check(`${script}:help`, result.code === 0 && /Usage:/.test(result.stdout), `code=${result.code}`);
  }

  const listed = await run(["tools/tool-list.mjs", "--status", "implemented", "--json"]);
  const listResult = json(listed.stdout);
  check("tool-list:json", listed.code === 0 && listResult?.ok === true && listResult.tools.every((tool) => tool.status === "implemented"));
  check("tool-list:availability", listResult?.tools.find((tool) => tool.id === "prompt.build")?.available === true);

  const described = await run(["tools/tool-describe.mjs", "preview.texture", "--json"]);
  const description = json(described.stdout);
  check("tool-describe:contract", described.code === 0 && description?.tool?.inputs?.length && description?.tool?.outputs?.length && description?.tool?.failures?.length && description?.tool?.evidenceProduced?.length);
  const unknown = await run(["tools/tool-describe.mjs", "missing.tool", "--json"]);
  check("tool-describe:unknown", unknown.code === 4);

  const context = await run(["tools/skill-context.mjs", "mcbe-json-ui-visual-design", "--json"]);
  const contextResult = json(context.stdout);
  check("skill-context:workflow", context.code === 0 && contextResult?.tools?.[0]?.selection?.id === "design.search");
  check("skill-context:legacy-semantic-hash", semanticHash(contextResult) === "50439350f115a5f6f787880ac5744964ae170e11d4d804819502759446005e51");

  check("skill-context:opt-in-absent-by-default", !contextResult.workflow.includes("design.library") && !contextResult.tools.some((entry) => entry.selection.id === "design.library"));
  for (const need of ["style-selection", "game-ui-design", "external-design-skill", "pixel-art-method"]) {
    const selected = await run(["tools/skill-context.mjs", "mcbe-json-ui-visual-design", "--needs", need, "--json"]);
    const value = json(selected.stdout);
    check("skill-context:minimal-need:" + need, selected.code === 0 && JSON.stringify(value?.workflow) === JSON.stringify(["design.library"]) && value?.tools?.length === 1 && value.tools[0].selection.id === "design.library");
  }
  for (const skill of ["mcbe-json-ui-texture-design", "mcbe-json-ui-research", "mcbe-json-ui-samples"]) {
    const selected = await run(["tools/skill-context.mjs", skill, "--needs", "pixel-art-method", "--compact", "--json"]);
    const value = json(selected.stdout);
    check("pixel-method:selective-routing:" + skill, selected.code === 0 && JSON.stringify(value?.workflow) === JSON.stringify(["design.library"]) && value?.tools?.length === 1);
  }
  const compactDesign = await run(["tools/skill-context.mjs", "mcbe-json-ui-visual-design", "--needs", "style-selection,game-ui-design", "--compact", "--json"]);
  for(const [need,id] of [["chest-research","design.library"],["chest-project","chest.project"],["chest-contract","chest.contract"]]) {
    const selected=await run(["tools/skill-context.mjs","mcbe-json-ui-chest-gui","--needs",need,"--compact","--json"]);
    const value=json(selected.stdout);
    check("chest-context:one-tool:"+need,selected.code===0 && value?.tools?.length===1 && value.tools[0].id===id && JSON.stringify(value.workflow)===JSON.stringify([id]));
  }
  const compactDesignValue = json(compactDesign.stdout);
  for(const [skill,need,id] of [["mcbe-geo-ui","asset-graph","attachable.inspect"],["mcbe-resource-pack-rendering","render-materials","material.audit"],["mcbe-json-ui-samples","asset-learning","asset.learn"],["mcbe-json-ui-research","research-context","research.context"]]) {
    const selected=await run(["tools/skill-context.mjs",skill,"--needs",need,"--compact","--json"]);
    const value=json(selected.stdout);
    check("pack-context:one-tool:"+need,selected.code===0 && value?.tools?.length===1 && value.tools[0].id===id && JSON.stringify(value.workflow)===JSON.stringify([id]));
  }
  check("skill-context:mapped-union-deduplicated", compactDesign.code === 0 && JSON.stringify(compactDesignValue?.workflow) === JSON.stringify(["design.library"]) && compactDesignValue?.tools?.length === 1);
  const unrelated = await run(["tools/skill-context.mjs", "mcbe-json-ui-visual-design", "--needs", "syntax-only", "--json"]);
  check("skill-context:unrelated-need-keeps-legacy", unrelated.code === 0 && semanticHash(json(unrelated.stdout)) === semanticHash(contextResult));
  const mixed = await run(["tools/skill-context.mjs", "mcbe-json-ui-visual-design", "--needs", "style-selection,geometry", "--json"]);
  const mixedValue = json(mixed.stdout);
  check("skill-context:mixed-needs-preserve-existing-tools", mixed.code === 0 && mixedValue?.workflow?.includes("design.library") && contextResult.workflow.every((id) => mixedValue.tools.some((entry) => entry.selection.id === id)));
  const explicit = await run(["tools/skill-context.mjs", "mcbe-json-ui-visual-design", "--tool", "design.library", "--needs", "syntax-only", "--json"]);
  check("skill-context:explicit-tool-opt-in", explicit.code === 0 && json(explicit.stdout)?.tool?.selection?.id === "design.library");
  const research = await run(["tools/skill-context.mjs", "mcbe-json-ui-research", "--json"]);
  const researchValue = json(research.stdout);
  check("skill-context:research-default-excludes-new-tools", research.code === 0 && ["design.library", "design.sources"].every((id) => !researchValue.workflow.includes(id) && !researchValue.tools.some((entry) => entry.selection.id === id)));
  const sourceNeed = await run(["tools/skill-context.mjs", "mcbe-json-ui-research", "--needs", "source-download", "--json"]);
  const sourceValue = json(sourceNeed.stdout);
  check("skill-context:source-need-opt-in", sourceNeed.code === 0 && sourceValue?.tools?.some((entry) => entry.selection.id === "design.sources") && !sourceValue.tools.some((entry) => entry.selection.id === "design.library"));
  const existingNeed = await run(["tools/skill-context.mjs", "mcbe-json-ui-master", "--needs", "public-release", "--json"]);
  check("skill-context:existing-need-filter-preserved", existingNeed.code === 0 && JSON.stringify(json(existingNeed.stdout)?.tools?.map((entry) => entry.selection.id)) === JSON.stringify(["skill.route", "skill.doctor", "skill.context", "public.audit"]));

  const { registry } = await loadRegistry();
  const profiles = await loadProfiles();
  const visualIndex = profiles.profiles.findIndex((entry) => entry.skill === "mcbe-json-ui-visual-design");
  for (const [name, ids] of [["unknown", ["missing.tool"]], ["unselected", ["tools.list"]], ["empty", []], ["not-array", "design.library"]]) {
    const invalid = structuredClone(profiles);
    invalid.profiles[visualIndex].contextByNeed["style-selection"] = ids;
    const result = await validateProfiles(invalid, registry);
    check("skill-profiles:need-map-rejects-" + name, !result.ok && result.errors.some((issue) => issue.path.includes("contextByNeed")));
  }
  const invalidOptIn = structuredClone(profiles);
  invalidOptIn.profiles[visualIndex].toolSelections[0].optIn = "true";
  const invalidOptInResult = await validateProfiles(invalidOptIn, registry);
  check("skill-profiles:opt-in-boolean", !invalidOptInResult.ok && invalidOptInResult.errors.some((issue) => issue.path.endsWith("/optIn")));

  const doctor = await run(["tools/skill-doctor.mjs", "mcbe-json-ui-visual-design", "--probe", "--json"]);
  const doctorResult = json(doctor.stdout);
  check("skill-doctor:profile", doctor.code === 0 && doctorResult?.ok === true && doctorResult.skills?.[0]?.present === true && doctorResult.probed === true, doctor.stderr.trim());

  const asset = await run(["tools/tool-describe.mjs", "asset.search", "--json"]);
  const assetResult = json(asset.stdout);
  check("asset-search:safe-contract", asset.code === 0
    && assetResult?.availability?.available === true
    && assetResult.tool.unsupportedBehavior.some((item) => item.includes("--absolute"))
    && assetResult.tool.unsupportedBehavior.some((item) => item.includes("redistribution")));

  const finalRp = await run(["tools/tool-describe.mjs", "final-rp.mcp", "--json"]);
  const finalRpResult = json(finalRp.stdout);
  check("final-rp:mcp-contract", finalRp.code === 0
    && finalRpResult?.availability?.available === true
    && finalRpResult.tool.preconditions.some((item) => item.includes("vanilla/font"))
    && finalRpResult.tool.unsupportedBehavior.some((item) => item.includes("CAPABILITY_UNAVAILABLE"))
    && finalRpResult.tool.unsupportedBehavior.some((item) => item.includes("pixel-accuracy")));

  const finalContext = await run(["tools/skill-context.mjs", "mcbe-json-ui-final-rp-inspection", "--json"]);
  const finalContextResult = json(finalContext.stdout);
  check("final-rp:skill-profile", finalContext.code === 0
    && finalContextResult?.tools?.some((item) => item.selection?.id === "final-rp.mcp")
    && finalContextResult?.tools?.some((item) => item.selection?.id === "upstream.compat" && item.selection.required === true)
    && finalContextResult?.boundaries?.some((item) => item.includes("External editor")));

  const upstream = await run(["tools/tool-describe.mjs", "upstream.compat", "--json"]);
  const upstreamResult = json(upstream.stdout);
  check("upstream:fixture-boundary", upstream.code === 0
    && upstreamResult?.availability?.available === true
    && upstreamResult.tool.preconditions.some((item) => item.includes("pending-local"))
    && upstreamResult.tool.unsupportedBehavior.some((item) => item.includes("not a pass")));

  const valid = "tests/fixtures/ai-tools/task-envelope.valid.yaml";
  const built = await run([
    "tools/prompt-build.mjs", valid,
    "--output", resolve(OUT, "prompt.md"),
    "--report", resolve(OUT, "build-report.json"),
    "--json",
  ]);
  const buildResult = json(built.stdout);
  check("prompt-build:valid", built.code === 0 && buildResult?.ok === true && /## Measured evidence/.test(buildResult?.prompt || ""), built.stderr.trim());
  const report = json(await readFile(resolve(OUT, "build-report.json"), "utf8"));
  check("prompt-build:report", report?.schema === "mcbe-jsonui-ai-kit/prompt-build@1" && report?.envelopeId === "compact_form_grid");

  const lintEnvelope = await run(["tools/prompt-lint.mjs", valid, "--json"]);
  check("prompt-lint:envelope", lintEnvelope.code === 0 && json(lintEnvelope.stdout)?.kind === "task-envelope");
  const lintPrompt = await run(["tools/prompt-lint.mjs", resolve(OUT, "prompt.md"), "--json"]);
  check("prompt-lint:markdown", lintPrompt.code === 0 && json(lintPrompt.stdout)?.kind === "markdown");

  const invalidEnvelope = await run(["tools/prompt-lint.mjs", "tests/fixtures/ai-tools/task-envelope.invalid.yaml", "--json"]);
  const invalidResult = json(invalidEnvelope.stdout);
  check("prompt-lint:invalid-envelope", invalidEnvelope.code === 5 && invalidResult?.errors?.length >= 3);
  const invalidPrompt = await run(["tools/prompt-lint.mjs", "tests/fixtures/ai-tools/prompt.invalid.md", "--json"]);
  check("prompt-lint:invalid-markdown", invalidPrompt.code === 5 && json(invalidPrompt.stdout)?.errors?.length >= 3);

  await rm(OUT, { recursive: true, force: true });
  process.stdout.write(`\nTotal: ${passed} passed, ${failures.length} failed\n`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
