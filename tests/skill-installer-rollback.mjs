import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const shell = process.platform === "win32" ? "powershell" : "pwsh";
const sandbox = await mkdtemp(resolve(tmpdir(), "mcbe-skill-rollback-"));
const names = ["mcbe-json-ui-alpha", "mcbe-resource-pack-beta"];
const harness = resolve(sandbox, "inject-failure.ps1");
let passed = 0;

function run(args) {
  return new Promise((done, reject) => {
    const child = spawn(shell, [...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []), "-NoProfile", "-NonInteractive", "-File", harness, ...args], { cwd: sandbox });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject);
    child.on("close", code => done({ code, stdout, stderr }));
  });
}

async function snapshot(root) {
  const result = {};
  async function walk(folder, prefix = "") {
    let entries;
    try { entries = await readdir(folder, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const key = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await walk(resolve(folder, entry.name), `${key}/`);
      else result[key] = (await readFile(resolve(folder, entry.name))).toString("base64");
    }
  }
  await walk(root);
  return result;
}

async function writeSkill(root, name, version) {
  const path = resolve(root, name);
  await mkdir(resolve(path, "references"), { recursive: true });
  await writeFile(resolve(path, "SKILL.md"), `---\nname: ${name}\ndescription: Fixture\n---\n${version}\n`);
  await writeFile(resolve(path, "references", "evidence.txt"), `${version} nested evidence\n`);
}

async function fixture(mode, existing = true) {
  const base = resolve(sandbox, mode);
  const checkout = resolve(base, "checkout");
  const target = resolve(base, "installed");
  await mkdir(resolve(checkout, "scripts"), { recursive: true });
  await mkdir(resolve(checkout, "data"), { recursive: true });
  await mkdir(target, { recursive: true });
  await cp(resolve(repo, "scripts/install-skills.ps1"), resolve(checkout, "scripts/install-skills.ps1"));
  await writeFile(resolve(checkout, "data/skill-topology.json"), JSON.stringify({ sourceSkills: names }));
  for (const name of names) {
    await writeSkill(resolve(checkout, "skills"), name, "source");
    if (existing) await writeSkill(target, name, mode === "prune-failure" ? "source" : "original");
  }
  await writeSkill(target, "mcbe-json-ui-obsolete-a", "unrelated original");
  if (mode === "prune-failure") await writeSkill(target, "mcbe-json-ui-obsolete-b", "second unrelated original");
  return { base, checkout, target };
}

try {
  await writeFile(harness, String.raw`param([string]$Checkout, [string]$Target, [string]$Mode)
$ErrorActionPreference = 'Stop'
function Move-Item {
    [CmdletBinding()]
    param([string]$LiteralPath, [string]$Destination)
    if ($Mode -ne 'prune-failure' -and $LiteralPath -match '[\\/]\.skill-stage-[^\\/]+[\\/]mcbe-resource-pack-beta$') { throw 'INJECTED promotion failure' }
    if ($Mode -eq 'rollback-failure' -and $LiteralPath -match '[\\/]\.skill-backup-[^\\/]+[\\/]mcbe-resource-pack-beta$') { throw 'INJECTED restoration failure' }
    if ($Mode -eq 'prune-failure' -and $LiteralPath -match '[\\/]mcbe-json-ui-obsolete-b$' -and $Destination -match '[\\/]\.skill-backup-') { throw 'INJECTED prune failure' }
    Microsoft.PowerShell.Management\Move-Item @PSBoundParameters
}
$params = @{ Apply = $true; TargetBase = $Target; ReviewedSkill = @(Get-ChildItem -LiteralPath $Target -Directory | Select-Object -ExpandProperty Name) }
if ($Mode -eq 'prune-failure') { $params.Prune = $true }
& (Join-Path $Checkout 'scripts/install-skills.ps1') @params
`);

  for (const mode of ["promotion-failure", "new-install-failure", "prune-failure"]) {
    const current = await fixture(mode, mode !== "new-install-failure");
    const before = await snapshot(current.target);
    const result = await run(["-Checkout", current.checkout, "-Target", current.target, "-Mode", mode]);
    assert.notEqual(result.code, 0, `${mode} must fail`);
    assert.match(result.stderr, /INJECTED/, result.stderr);
    assert.deepEqual(await snapshot(current.target), before, `${mode} must restore every original byte`);
    assert.equal((await readdir(current.base)).filter(name => name.startsWith(".skill-")).length, 0, `${mode} must clean recovered transaction artifacts`);
    console.log(`PASS ${mode}: originals and unrelated Skills preserved`);
    passed++;
  }

  const current = await fixture("rollback-failure");
  const originalAlpha = await snapshot(resolve(current.target, names[0]));
  const originalBeta = await snapshot(resolve(current.target, names[1]));
  const result = await run(["-Checkout", current.checkout, "-Target", current.target, "-Mode", "rollback-failure"]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Rollback incomplete/);
  assert.match(result.stderr, /preserved backup/);
  assert.deepEqual(await snapshot(resolve(current.target, names[0])), originalAlpha, "one restoration failure must not prevent the remaining rollback");
  const backups = (await readdir(current.base)).filter(name => name.startsWith(".skill-backup-"));
  assert.equal(backups.length, 1);
  assert.deepEqual(await snapshot(resolve(current.base, backups[0], names[1])), originalBeta, "failed restoration must retain the complete original backup");
  assert.equal((await readdir(current.base)).filter(name => name.startsWith(".skill-stage-")).length, 0);
  console.log("PASS restoration failure: recoverable backup retained and other Skills restored");
  passed++;
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

console.log(`Total: ${passed} installer failure scenarios passed`);
