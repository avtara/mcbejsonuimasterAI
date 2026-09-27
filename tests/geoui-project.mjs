import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, link, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectGeoUiProject, inspectGeoUiFile, boundedGeoUiReport, writeGeoUiReport } from '../tools/_lib/geoui-project.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC5kAAAAASUVORK5CYII=';
const media = () => ({ pages: [png], plan: { cols: 1, rows: 1, perPage: 1, pages: 1, pageW: 1, pageH: 1 }, frames: 1, frameW: 1, frameH: 1, fps: 1, mediaAspect: 1 });
const image = id => ({ id, type: 'image', enabled: true, opacity: 1, blend: 'cutout', scene: -1, _src: media() });
const project = () => ({ v: 6, meta: { name: 'Original test project', ns: 'sample' }, screen: { unitsPerScreenH: 176, uiPxPerUnit: 1.364, uiAspect: 16 / 9, autoAspect: false, centerAuto: false, ruler: false }, timing: { mode: 'loop', fps: 20, duration: 5, loop: true }, triggers: { ipc: false }, build: { rpOnly: true, palette: 'rgba' }, scenes: [], layers: [image('l1')] });
const model = (id, bones = [{ name: 'root' }]) => ({ id, type: 'model', enabled: true, _model: { geoRaw: { 'minecraft:geometry': [{ description: { identifier: `geometry.${id}` }, bones }] }, animList: [], animRaw: { animations: {} }, tex: null } });
const codes = value => inspectGeoUiProject(value).diagnostics.map(d => d.code);
const change = callback => { const value = project(); callback(value); return value; };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const frozen = freeze(project()), original = JSON.stringify(frozen), good = inspectGeoUiProject(frozen);
assert.equal(good.ok, true); assert.equal(good.complete, true); assert.equal(good.runtimeVerified, false);
assert.equal(good.exportContract.scriptExpected, false); assert.equal(JSON.stringify(frozen), original);
assert.equal(good.layers[0].media, 'embedded-png-headers');
assert.equal(inspectGeoUiProject(change(p => { p.layers[0].widthPct = 0; })).ok, true);
for (const value of [null, [], 0, false]) assert.equal(inspectGeoUiProject(value).ok, false);
assert.ok(codes({ ...project(), v: 5 }).includes('PROJECT_VERSION_UNSUPPORTED'));
assert.ok(codes(change(p => { p.layers = []; })).includes('NO_EXPORTABLE_VISUAL_LAYER'));
assert.ok(codes(change(p => { p.layers.push(image('l1')); })).includes('LAYER_ID_DUPLICATE'));
assert.ok(codes(change(p => { p.layers = [image('HUD A'), image('hud-a')]; })).includes('LAYER_EXPORT_ID_COLLISION'));
assert.ok(codes(change(p => { p.layers[0].id = '__'; })).includes('LAYER_EXPORT_ID_EMPTY'));
assert.ok(codes(change(p => { delete p.layers[0]._src; })).includes('MEDIA_NOT_RESTORABLE'));
const runtimeOnly = inspectGeoUiProject(change(p => { p.layers[0].atlas = p.layers[0]._src; delete p.layers[0]._src; }));
assert.equal(runtimeOnly.ok, false); assert.ok(runtimeOnly.diagnostics.some(d => d.code === 'RUNTIME_FIELDS_IGNORED'));
assert.ok(codes(change(p => { p.layers[0]._src.pages = ['https://example.test/private.png']; })).includes('EMBEDDED_PNG_REQUIRED'));
assert.ok(codes(change(p => { p.layers[0]._src.pages = ['data:image/png;base64,@@@@']; })).includes('PNG_HEADER_INVALID'));
assert.ok(codes(change(p => { p.layers[0]._src.plan.pageW = 2; })).includes('ATLAS_PLAN_MISMATCH'));
assert.ok(codes(change(p => { const m = p.layers[0]._src; m.plan.pageW = m.frameW = 2; })).includes('PNG_ATLAS_SIZE_MISMATCH'));
assert.ok(codes(change(p => { p.layers[0]._src.plan.pages = 2; })).includes('ATLAS_PLAN_MISMATCH'));
assert.ok(codes(change(p => { p.layers[0].type = 'score'; })).includes('SCORE_ATLAS_INCOMPLETE'));
const recipe = inspectGeoUiProject(change(p => { p.layers = [{ id: 'label', type: 'text', text: { text: 'A', size: 16 } }]; }));
assert.equal(recipe.ok, true); assert.equal(recipe.complete, false); assert.ok(recipe.diagnostics.some(d => d.code === 'RECIPE_REBUILD_UNVERIFIED'));
const property = inspectGeoUiProject(change(p => { p.layers[0].scene = 0; p.build.rpOnly = true; }));
assert.equal(property.ok, true); assert.equal(property.complete, false); assert.equal(property.exportContract.propertyReads[0].declaration, 'external-bp-required');
const script = inspectGeoUiProject(change(p => { p.build.rpOnly = false; p.layers[0].scene = 0; }));
assert.equal(script.exportContract.scriptExpected, true); assert.equal(script.exportContract.propertyReads[0].declaration, 'generated-player-property');
assert.ok(codes(change(p => { p.layers[0].scene = 129; })).includes('SCENE_PROPERTY_RANGE'));
assert.ok(codes(change(p => { p.layers[0].visibleWhen = "q.property('other:show') && q.property(v.computed)"; })).includes('PROPERTY_DECLARATION_REQUIRED'));
const alpha = inspectGeoUiProject(change(p => { p.layers[0].opacity = 0.5; }));
assert.equal(alpha.layers[0].effectiveBlend, 'blend');
assert.ok(codes(change(p => { p.build.palette = 'indexed'; })).includes('INDEXED_ALPHA_LOSS'));
assert.ok(codes(change(p => { p.layers[0].keys = { rotX: [{ t: 0, v: NaN }] }; })).includes('KEY_INVALID'));
assert.ok(codes(change(p => { p.layers[0].keys = { scale: Array.from({ length: 122 }, (_, t) => ({ t, v: 1 })) }; })).includes('KEY_REDUCTION'));
assert.ok(codes(change(p => { p.layers = [model('m1', [{ name: 'r', parent: 'missing' }])]; })).includes('MODEL_PARENT_REWRITTEN'));
assert.ok(codes(change(p => { p.layers = [model('m1', [{ name: 'a', parent: 'b' }, { name: 'b', parent: 'a' }])]; })).includes('MODEL_PARENT_CYCLE'));
assert.ok(codes(change(p => { p.layers = [model('m1', [{ name: 'geoui_mroot_m1' }])]; })).includes('MODEL_GENERATED_ROOT_COLLISION'));
assert.ok(codes(change(p => { p.layers = [model('m1', [{ name: 'geoui_mroot_m1_r' }])]; p.layers[0].rotX = 15; })).includes('MODEL_GENERATED_ROOT_COLLISION'));
assert.ok(!codes(change(p => { p.layers = [model('m1', [{ name: 'geoui_mroot_m1_r' }])]; p.layers[0].rotX = 0; })).includes('MODEL_GENERATED_ROOT_COLLISION'));
assert.ok(codes(change(p => { p.layers = [model('m1')]; p.layers[0]._model.geoRaw['minecraft:geometry'].push({ bones: [] }); })).includes('MODEL_GEOMETRIES_DISCARDED'));
assert.ok(codes(change(p => { p.layers = [model('m1')]; p.layers[0]._model.animList = ['animation.missing']; })).includes('MODEL_ANIMATION_MISSING'));
assert.ok(codes(change(p => { p.layers = [model('m1'), model('m2')]; p.layers[0]._model.animRaw.animations.shared = { loop: true }; p.layers[1]._model.animRaw.animations.shared = { loop: false }; })).includes('MODEL_ANIMATION_EXPORT_COLLISION'));
assert.ok(codes(change(p => { p.layers.push({ id: 'a1', name: 'a', type: 'audio', enabled: false, _audio: { b64: 'YWJj', ext: 'wav', duration: 1 } }); })).includes('DISABLED_AUDIO_STILL_EXPORTED'));
assert.ok(codes(change(p => { p.layers.push({ id: 'a1', name: 'a', type: 'audio', _audio: { b64: 'YWJj', ext: '../x', duration: 1 } }); })).includes('AUDIO_EXTENSION_INVALID'));
assert.equal(inspectGeoUiProject(change(p => { p.layers.push({ id: 'a1', name: 'a', type: 'audio', _audio: { b64: Buffer.alloc(2 * 1024 * 1024).toString('base64'), ext: 'wav', duration: 1 } }); })).ok, true);
assert.ok(codes(change(p => { p.build.rpOnly = false; p.layers = [{ id: 'b1', type: 'bar', scoreObjective: 'one' }, { id: 'b2', type: 'bar', scoreObjective: 'two' }]; })).includes('SCORE_WRITERS_CONFLICT'));
for (const other of [{ ...image('i2'), scoreObjective: 'two' }, { ...image('b2'), type: 'bar', enabled: false, scoreObjective: 'two' }]) {
  assert.ok(codes(change(p => { p.build.rpOnly = false; p.layers = [{ ...image('b1'), type: 'bar', scoreObjective: 'one' }, other]; })).includes('SCORE_WRITERS_CONFLICT'));
}
assert.ok(!codes(change(p => { p.layers = [{ ...image('b1'), type: 'bar', scoreObjective: 'one' }, { ...image('i2'), scoreObjective: 'two' }]; })).includes('SCORE_WRITERS_CONFLICT'));
const crowded = inspectGeoUiProject(change(p => { p.layers = Array.from({ length: 80 }, (_, i) => ({ id: `missing_${i}`, type: 'image' })); }));
const bounded = boundedGeoUiReport(crowded, 2500);
assert.ok(JSON.stringify(bounded).length + 1 <= 2500); assert.equal(bounded.ok, false); assert.equal(bounded.summary.errors, crowded.summary.errors); assert.ok(bounded.omitted.diagnostics > 0);
const manyWarnings = inspectGeoUiProject(change(p => { p.layers = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, type: 'shape', keys: Object.fromEntries(Array.from({ length: 100 }, (_, n) => [`unknown${n}`, []])) })); }));
const fullDiagnostics = structuredClone(manyWarnings.diagnostics);
const compactWarnings = boundedGeoUiReport(manyWarnings, 6000);
assert.ok(JSON.stringify(compactWarnings).length + 1 <= 6000);
assert.equal(compactWarnings.omitted.diagnostics + compactWarnings.diagnostics.length, fullDiagnostics.length);
assert.deepEqual(manyWarnings.diagnostics, fullDiagnostics);
assert.deepEqual(compactWarnings.diagnostics, fullDiagnostics.slice(0, compactWarnings.diagnostics.length));
assert.throws(() => boundedGeoUiReport(good, 999), /max-chars/);

const temp = await mkdtemp(join(tmpdir(), 'geoui-project-'));
try {
  const input = join(temp, 'project.geoui.json'); await writeFile(input, JSON.stringify(project()));
  const before = await readFile(input), report = await inspectGeoUiFile(input);
  assert.deepEqual(await readFile(input), before); assert.equal(report.input.bytes, before.length);
  const output = join(temp, 'report.json'); await writeGeoUiReport(output, report);
  await assert.rejects(() => writeGeoUiReport(output, report), /EEXIST/);
  await assert.rejects(() => writeGeoUiReport(input, report), /EEXIST/);
  const hardlink = join(temp, 'hardlink.json'); await link(input, hardlink);
  await assert.rejects(() => writeGeoUiReport(hardlink, report), /EEXIST/); assert.deepEqual(await readFile(input), before);
  try {
    const linked = join(temp, 'linked.json'); await symlink(input, linked, 'file');
    assert.equal((await inspectGeoUiFile(linked)).input.sha256, report.input.sha256);
    await assert.rejects(() => writeGeoUiReport(linked, report), /EEXIST/);
  } catch (error) { if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error; }
  await assert.rejects(() => inspectGeoUiFile(temp), /regular project file/);
  const oversized = join(temp, 'oversized.json'); await writeFile(oversized, ''); await truncate(oversized, 64 * 1024 * 1024 + 1);
  await assert.rejects(() => inspectGeoUiFile(oversized), /at most 64 MiB/);
  const bad = join(temp, 'bad.json'); await writeFile(bad, '{invalid secret payload');
  await assert.rejects(() => inspectGeoUiFile(bad), /not valid native project JSON/);
  const cli = (...args) => spawnSync(process.execPath, [resolve(repo, 'tools/geoui-inspect.mjs'), ...args], { cwd: temp, encoding: 'utf8' });
  const result = cli('--input', input, '--max-chars', '3000', '--json');
  assert.equal(result.status, 0, result.stderr); assert.ok(result.stdout.length <= 3000); assert.equal(JSON.parse(result.stdout).runtimeVerified, false);
  const smallOut = join(temp, 'not-created.json'); const budget = cli('--input', input, '--max-chars', '1000', '--report', smallOut);
  assert.equal(budget.status, 2); await assert.rejects(() => readFile(smallOut), /ENOENT/);
  for (const args of [[], ['--input', input, '--input', input], ['--unknown', 'x'], ['--input', input, '--max-chars', '1e4'], ['--input', input, '--report', input]]) {
    const fail = cli(...args); assert.equal(fail.status, 2); assert.equal(fail.stdout, ''); assert.ok(fail.stderr.length <= 1000);
  }
  assert.deepEqual(await readFile(input), before);
  console.log(JSON.stringify({ ok: true, checked: 'native v6, normalized ID collisions, missing/light media, atlas/PNG headers, model loss/hierarchy/animation, state dependencies, alpha, bounded output, wx, linked input, no source mutation' }));
} finally { await rm(temp, { recursive: true, force: true }); }
