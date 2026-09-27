import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, link } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectChestProject, boundedChestInspection } from '../tools/_lib/chest-editor-inspection.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(await readFile(join(root, 'examples/chest/minato-v2-audit.json'), 'utf8'));
const check = (value, capacity = 27) => inspectChestProject(value, { capacity });
const codes = value => check(value).diagnostics.map(item => item.code);
const edit = fn => {
  const value = structuredClone(fixture);
  fn(value.components, value);
  value.uiProject.uis[0].components = structuredClone(value.components);
  return value;
};
const slot = (id, index) => ({ id, type: 'container_item', x: 0, y: 0, width: 18, height: 18, properties: { collection_index: index } });
const initial = JSON.stringify(fixture);
assert.equal(check(fixture).ok, true);
assert.equal(check(fixture).runtimeVerified, false);
assert.equal(JSON.stringify(fixture), initial, 'Inspection must not normalize or mutate the input');
for (const index of [0, 26]) assert.equal(check(edit(c => { c[0].properties.collection_index = index; })).ok, true);
for (const [index, expected] of [['5', 'INDEX_NUMERIC_STRING'], [1.5, 'INDEX_INTEGER'], [null, 'INDEX_INTEGER'], [NaN, 'INDEX_INTEGER'], [Infinity, 'INDEX_INTEGER'], [-1, 'INDEX_CAPACITY'], [27, 'INDEX_CAPACITY']]) {
  assert.ok(codes(edit(c => { c[0].properties.collection_index = index; })).includes(expected), String(index));
}
const larger = edit(c => { c[0].properties.collection_index = 80; });
assert.equal(check(larger, 81).ok, true, 'Capacity is explicit and not restricted to 27/54');
assert.ok(check(larger, 81).diagnostics.some(d => d.code === 'NATIVE_ROUTE_CAPACITY_UNVERIFIED'));
for (const capacity of [0, -1, 1.5, NaN, Infinity, 100001, '27']) assert.throws(() => check(fixture, capacity), /capacity/);
for (const input of [null, [], 1, { ...fixture, formatVersion: '2' }]) assert.equal(check(input).ok, false);
for (const [change, expected] of [
  [c => c.push(slot(c[0].id, 1)), 'COMPONENT_ID_DUPLICATE'],
  [c => c.push(null), 'COMPONENT_OBJECT'],
  [c => { c[0].properties = null; }, 'COMPONENT_PROPERTIES'],
  [c => { c[0].type = 'script'; }, 'COMPONENT_TYPE'],
  [c => { c[0].width = 0; }, 'COMPONENT_GEOMETRY'],
  [c => { c[0].x = '1'; }, 'COMPONENT_GEOMETRY'],
  [c => { c[0].properties.tab_parent_id = 'absent'; }, 'TAB_PARENT_ORPHAN'],
  [c => { c.push(slot('other', 1)); c[0].properties.tab_parent_id = 'other'; }, 'TAB_PARENT_TYPE'],
  [c => { c[0].type = 'button'; c[0].properties = { target_collection_index: 27 }; }, 'INDEX_CAPACITY']
]) assert.ok(codes(edit(change)).includes(expected), expected);

const cycle = edit(c => {
  c.splice(0, c.length, { ...slot('a', 0), type: 'tab', properties: { tab_parent_id: 'b' } }, { ...slot('b', 1), type: 'tab', properties: { tab_parent_id: 'a' } });
});
assert.ok(codes(cycle).includes('TAB_PARENT_CYCLE'));
const tabs = edit(c => { c.push({ ...slot('tab', 0), type: 'tab', properties: {} }); c[0].properties.tab_parent_id = 'tab'; });
assert.equal(check(tabs).ok, true);
const withTabs = indices => edit(c => c.push(...indices.map((toggle_index, i) => ({ ...slot(`tab-${i}`, 0), type: 'tab', properties: { toggle_index, toggle_group_name: `group-${i}` } }))));
assert.equal(check(withTabs([1, '2'])).ok, true, 'The editor saves numeric input strings');
for (const indices of [[1, 1], [1, '1'], [1, 0]]) assert.ok(codes(withTabs(indices)).includes('TAB_TOGGLE_NAME_COLLISION'), `Exported toggle name collision: ${indices}`);
for (const index of [0, -1, 1.5, '', null, true, 'invalid']) assert.ok(codes(withTabs([index])).includes('TAB_TOGGLE_INDEX'));
const labels = edit(c => { c.push({ ...slot('label-a', 0), type: 'label', properties: { text: 'A' } }, { ...slot('label-b', 0), type: 'label', properties: { text: 'B' } }); });
assert.ok(codes(labels).includes('GENERATED_LABEL_NAME_COLLISION'));

const texture = edit(c => { c[0].properties.slot_background_texture = 'user_uploaded:independent'; });
assert.ok(codes(texture).includes('UPLOADED_TEXTURE_MISSING'));
delete texture.uploadedImages;
assert.equal(check(texture).ok, true, 'ZIP metadata without embedded images cannot establish missing external files');
assert.ok(codes(texture).includes('UPLOADED_TEXTURE_UNRESOLVED'));
texture.uploadedImages = { 'user_uploaded:independent': { data: 'data:image/png;base64,AA==', type: 'image/png', originalName: 'independent.png' } };
assert.equal(check(texture).ok, true, 'Presence only; pixel validity is outside this inspector');

const grid = edit(c => c.push({ ...slot('grid', 0), type: 'dynamic_grid', width: 162, height: 54, properties: { slot_width: 18, slot_height: 18, scroll_size_width: 8, preview_slots: 999, content_height: 180 } }));
assert.equal(check(grid).ok, true, 'Preview slot count is not a source index or capacity claim');
assert.ok(codes(grid).includes('DYNAMIC_GRID_PREVIEW_ONLY'));
const savedGrid = structuredClone(grid);
savedGrid.components[1].properties = { slot_width: '18', slot_height: '18', content_height: '180', preview_slots: '27', scroll_size_width: '8' };
savedGrid.uiProject.uis[0].components = structuredClone(savedGrid.components);
const savedGridBefore = JSON.stringify(savedGrid);
assert.equal(check(savedGrid).ok, true, 'Number-input values saved by the upstream editor are valid numeric strings');
assert.equal(JSON.stringify(savedGrid), savedGridBefore, 'Numeric interpretation must not rewrite saved properties');
for (const [key, value, code] of [['slot_width', 'bad', 'GRID_DIMENSION'], ['slot_height', '-1', 'GRID_DIMENSION'], ['content_height', null, 'GRID_DIMENSION'], ['preview_slots', '2.5', 'GRID_PREVIEW_SLOTS'], ['scroll_size_width', '-1', 'SCROLL_WIDTH'], ['scroll_size_width', '162', 'SCROLL_NO_CONTENT_WIDTH']]) {
  const invalid = structuredClone(savedGrid); invalid.components[1].properties[key] = value; invalid.uiProject.uis[0].components = structuredClone(invalid.components);
  assert.ok(codes(invalid).includes(code), `${key}: ${value}`);
}
for (const width of [0, -1, 8]) {
  const invalid = structuredClone(grid); invalid.components[1].width = width; invalid.uiProject.uis[0].components = structuredClone(invalid.components);
  assert.ok(codes(invalid).includes('SCROLL_NO_CONTENT_WIDTH'));
}

const loss = structuredClone(fixture); delete loss.uiProject;
assert.ok(codes(loss).includes('UI_PROJECT_RESTORE_LOSS'));
const unknown = structuredClone(fixture); unknown.uiProject.activeId = 'unknown';
assert.ok(codes(unknown).includes('ACTIVE_UI_UNKNOWN'));
const drift = structuredClone(fixture); drift.uiProject.uis[0].components[0].x = 10;
assert.ok(codes(drift).includes('ACTIVE_COMPONENTS_DRIFT'));
const normalSave = structuredClone(fixture); normalSave.uiProject.uis[0].components[0].zIndex = 7;
assert.ok(!codes(normalSave).includes('ACTIVE_COMPONENTS_DRIFT'), 'Normal clean-components serialization omits zIndex');
const second = structuredClone(fixture.uiProject.uis[0]); second.id = 'second'; second.triggerTitle += ' extra';
const multi = structuredClone(fixture); multi.uiProject.uis.push(second);
assert.equal(check(multi).ok, true, 'Native trigger matching is exact; substring overlap is valid');
second.triggerTitle = fixture.uiProject.uis[0].triggerTitle;
assert.ok(codes(multi).includes('TRIGGER_DUPLICATE'));
second.triggerTitle = ''; assert.ok(codes(multi).includes('TRIGGER_EMPTY'));
second.id = fixture.uiProject.activeId; assert.ok(codes(multi).includes('UI_ID_DUPLICATE'));

const many = edit(c => { c.splice(0, c.length, ...Array.from({ length: 250 }, (_, i) => slot(`bad-${i}`, 27 + i))); });
const full = check(many);
const compact = boundedChestInspection(full, 1000);
assert.ok(compact.length <= 1000);
assert.ok(JSON.parse(compact).omittedDiagnostics > 0);
assert.equal(JSON.parse(compact).summary.errors, 250);
for (const size of [0, 999, 64001, 1.2]) assert.throws(() => boundedChestInspection(full, size), /max-chars/);

const temporary = await mkdtemp(join(tmpdir(), 'mcbe-chest-project-'));
const cli = (...args) => spawnSync(process.execPath, [join(root, 'tools/chest-project.mjs'), ...args], { encoding: 'utf8', cwd: root });
try {
  const input = join(temporary, 'input.json');
  await writeFile(input, JSON.stringify(many));
  const before = await readFile(input);
  const report = join(temporary, 'report.json');
  const run = cli('--input', input, '--capacity', '27', '--max-chars', '1000', '--report', report, '--json');
  assert.equal(run.status, 1, run.stderr);
  assert.ok(run.stdout.trim().length <= 1000);
  assert.equal(JSON.parse(await readFile(report, 'utf8')).diagnostics.length, full.diagnostics.length);
  assert.deepEqual(await readFile(input), before);
  for (const output of [input, report]) assert.equal(cli('--input', input, '--capacity', '27', '--report', output, '--json').status, 2);
  const alias = join(temporary, 'alias.json'); await link(input, alias);
  assert.equal(cli('--input', input, '--capacity', '27', '--report', alias, '--json').status, 2);
  assert.deepEqual(await readFile(input), before, 'Existing file and hardlink report targets cannot overwrite input');
  for (const extra of [['--mystery'], ['--capacity', '54'], ['--json', '--json'], ['extra'], ['--report'], ['--max-chars', '1e3']]) {
    assert.equal(cli('--input', input, '--capacity', '27', ...extra).status, 2, extra.join(' '));
  }
  await writeFile(join(temporary, 'bad.json'), '{');
  assert.equal(cli('--input', join(temporary, 'bad.json'), '--capacity', '27').status, 2);
  for (const option of [`--${'x'.repeat(18000)}`, `--${'\t'.repeat(400)}`]) {
    const invalid = cli(option, '--max-chars', '1000', '--json');
    assert.equal(invalid.status, 2);
    assert.ok(invalid.stderr.length <= 1000, 'Errors must respect their diagnostic budget, including JSON escaping');
    assert.equal(JSON.parse(invalid.stderr).ok, false);
  }
  assert.equal(cli('--input', resolve(root, 'examples/chest/minato-v2-audit.json'), '--capacity', '54', '--json').status, 0);
  assert.match(cli('--help').stdout, /^Usage:/);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, suite: 'chest-project', runtimeVerified: false }));
