import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, readFile, writeFile, mkdir, link } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectAttachableGraph, boundedAttachableReport } from '../tools/_lib/attachable-graph.mjs';
import { stripJsonComments, stripJsonTrailingCommas } from '../tools/_lib/jsonc.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'attachable-graph-'));
const rp = join(temp, 'rp'), bp = join(temp, 'bp');
const write = async (root, name, value) => { const path = join(root, name); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(value)); };
const inspect = () => inspectAttachableGraph({ rp, bp });
const codes = report => report.diagnostics.map(d => d.code);
try {
  await cp(join(repo, 'examples/attachables/held-panel/rp'), rp, { recursive: true });
  await cp(join(repo, 'examples/attachables/held-panel/bp'), bp, { recursive: true });
  const original = await readFile(join(rp, 'attachables/panel.json'), 'utf8');
  const owner = JSON.parse(original), description = owner['minecraft:attachable'].description;
  let report = await inspect();
  assert.equal(report.ok, true);
  assert.equal(report.complete, false);
  assert.equal(report.runtimeVerified, false);
  assert.ok(report.edges.some(e => e.kind === 'material' && e.target === 'entity_alphatest' && e.status === 'external-unverified'));
  assert.equal(await readFile(join(rp, 'attachables/panel.json'), 'utf8'), original);
  assert.ok(report.edges.some(e => e.kind === 'animation-alias' && e.target === 'third' && e.status === 'resolved'), 'Both perspective branches are checked, not evaluated');
  assert.equal(report.perspectiveReferences.length, 2);
  assert.ok(!codes(report).includes('PERSPECTIVE_UNVERIFIED'), 'Controller-owned perspective branches are reachable');
  await assert.rejects(inspectAttachableGraph({ rp: join(temp, 'absent') }));
  await assert.rejects(inspectAttachableGraph({ rp, bp: join(temp, 'absent') }));
  const empty = join(temp, 'empty'); await mkdir(empty);
  assert.ok(codes(await inspectAttachableGraph({ rp: empty })).includes('NO_RENDER_OWNER'));
  for (const [field, target, kind] of [['textures', 'textures/misc/missing', 'texture'], ['geometry', 'geometry.absent', 'geometry'], ['animations', 'controller.animation.absent', 'animation-controller']]) {
    const bad = structuredClone(owner); bad['minecraft:attachable'].description[field].default = target;
    await write(rp, 'attachables/panel.json', bad); report = await inspect();
    assert.equal(report.ok, false); assert.ok(report.edges.some(e => e.kind === kind && e.target === target && e.status === 'unresolved'));
  }
  await write(rp, 'attachables/panel.json', owner);
  const selected = structuredClone(owner); selected['minecraft:attachable'].description.identifier = 'inspection:panel.variant'; selected['minecraft:attachable'].description.item = { 'inspection:panel': "q.is_owner_identifier_any('minecraft:player')" };
  await write(rp, 'attachables/panel.json', selected);
  assert.equal((await inspect()).ok, true, 'Explicit item map overrides attachable identifier equality');
  selected['minecraft:attachable'].description.item = { 'minecraft:elytra': '1' };
  await write(rp, 'attachables/panel.json', selected);
  report = await inspect(); assert.ok(report.edges.some(e => e.kind === 'item' && e.status === 'external-unverified' && e.target === 'minecraft:elytra'));
  await write(rp, 'attachables/panel.json', owner);
  await writeFile(join(rp, 'textures/inspection/panel.tga'), 'reference fixture, not decoded');
  assert.ok((await inspect()).edges.some(e => e.to === 'rp:file:textures/inspection/panel.tga'), 'Same-stem TGA takes precedence over PNG');
  const dotted = structuredClone(owner); dotted['minecraft:attachable'].description.textures.default = 'textures/inspection/panel.v2';
  await cp(join(rp, 'textures/inspection/panel.png'), join(rp, 'textures/inspection/panel.v2.png'));
  await write(rp, 'attachables/panel.json', dotted); assert.equal((await inspect()).ok, true);
  await write(rp, 'attachables/panel.json', owner);
  await write(rp, 'subpacks/alternative/models/duplicate.json', { 'minecraft:geometry': [{ description: { identifier: 'geometry.inspection.panel' } }] });
  report = await inspect(); assert.equal(report.ok, true); assert.ok(codes(report).includes('SUBPACKS_SKIPPED')); assert.equal(report.complete, false);
  await rm(join(rp, 'subpacks'), { recursive: true, force: true });
  const rcPath = join(rp, 'render_controllers/panel.json');
  const rc = JSON.parse(await readFile(rcPath, 'utf8'));
  const rcId = 'controller.render.inspection.panel';
  const badRc = structuredClone(rc); badRc.render_controllers[rcId].textures = ['Texture.typo'];
  await write(rp, 'render_controllers/panel.json', badRc);
  assert.ok((await inspect()).edges.some(e => e.kind === 'texture-alias' && e.status === 'unresolved'));
  const arrayRc = structuredClone(rc); arrayRc.render_controllers[rcId].geometry = 'Array.frames[q.life_time]';
  arrayRc.render_controllers[rcId].arrays = { geometries: { 'Array.frames': ['Geometry.default'] } };
  await write(rp, 'render_controllers/panel.json', arrayRc); report = await inspect();
  assert.equal(report.ok, true); assert.equal(report.complete, false);
  assert.ok(report.edges.some(e => e.kind === 'resource-array' && e.status === 'dynamic'));
  await write(rp, 'render_controllers/panel.json', rc);
  const badController = structuredClone(owner); badController['minecraft:attachable'].description.render_controllers = ['controller.render.missing'];
  await write(rp, 'attachables/panel.json', badController); assert.equal((await inspect()).ok, false);
  await write(rp, 'attachables/panel.json', owner);
  const vanilla = join(temp, 'vanilla'); await mkdir(vanilla);
  await write(vanilla, 'materials/entity.material', { materials: { version: '1.0.0', entity_alphatest: {} } });
  report = await inspectAttachableGraph({ rp, bp, vanilla }); assert.equal(report.complete, true);
  assert.ok(report.edges.some(e => e.to === 'vanilla:material:entity_alphatest'));
  const completeInspect = () => inspectAttachableGraph({ rp, bp, vanilla });
  await write(rp, 'texts/languages.json', ['en_US', 'ko_KR']);
  assert.equal((await completeInspect()).complete, true, 'The resource-pack language list has an array root');
  await write(vanilla, 'texts/languages.json', ['en_US']);
  assert.equal((await completeInspect()).complete, true, 'The same language-list contract applies to the vanilla fallback');
  await write(rp, 'manifest.json', []);
  assert.ok(codes(await completeInspect()).includes('JSON_PARSE'), 'Language-list allowance does not weaken the manifest object root');
  await rm(join(rp, 'manifest.json'));
  for (const languages of [42, ['en_US', 3]]) {
    await write(rp, 'texts/languages.json', languages);
    assert.ok(codes(await completeInspect()).includes('JSON_PARSE'));
  }
  await write(rp, 'texts/languages.json', ['en_US', 'ko_KR']);
  // Mojang bedrock-samples 46ba6ea resource_pack/textures/flipbook_textures.json
  // is a valid non-graph JSON array. Do not turn its presence into a pack error.
  await write(rp, 'textures/flipbook_textures.json', [{ flipbook_texture: 'textures/inspection/panel', atlas_tile: 'inspection_panel', ticks_per_frame: 2 }]);
  await write(bp, 'texts/languages.json', ['en_US']);
  await write(rp, 'other-tool-notes.json', [1, 2]);
  report = await completeInspect(); assert.equal(report.complete, true);
  for (const file of ['rp/textures/flipbook_textures.json', 'bp/texts/languages.json', 'rp/other-tool-notes.json']) assert.ok(report.diagnostics.some(d => d.code === 'NON_GRAPH_DOCUMENT' && d.file === file), 'Non-graph syntax parsing does not claim a pack-specific schema pass');
  for (const [root, file] of [[rp, 'manifest.json'], [rp, 'models/root.json'], [rp, 'attachables/root.json'], [rp, 'render_controllers/root.json'], [rp, 'extra.material'], [bp, 'manifest.json'], [bp, 'items/root.json'], [bp, 'entities/root.json']]) {
    for (const value of [null, []]) {
      await write(root, file, value); report = await completeInspect(); assert.equal(report.ok, false);
      assert.ok(codes(report).includes('JSON_PARSE'), 'Graph-owned definition paths still require object roots');
    }
    await rm(join(root, file));
  }
  await writeFile(join(rp, 'textures/flipbook_textures.json'), '[invalid');
  assert.ok(codes(await completeInspect()).includes('JSON_PARSE'), 'Non-graph JSON still requires valid syntax');
  await rm(join(rp, 'textures/flipbook_textures.json'));
  const stringItem = structuredClone(owner);
  stringItem['minecraft:attachable'].description.identifier = 'inspection:panel.variant';
  stringItem['minecraft:attachable'].description.item = 'inspection:panel';
  await write(rp, 'attachables/panel.json', stringItem);
  report = await completeInspect(); assert.equal(report.complete, true);
  assert.ok(report.edges.some(e => e.kind === 'item' && e.target === 'inspection:panel' && e.path.endsWith('/item') && e.status === 'resolved'));
  assert.ok(!report.edges.some(e => e.kind === 'item' && e.target === 'inspection:panel.variant'), 'Explicit string item never falls back to owner identifier');
  for (const value of [null, [], {}, '', ' ', 42]) {
    const bad = structuredClone(stringItem); bad['minecraft:attachable'].description.item = value;
    await write(rp, 'attachables/panel.json', bad); report = await completeInspect();
    assert.equal(report.ok, false); assert.equal(report.complete, false); assert.ok(codes(report).includes('ITEM_SELECTOR'));
    assert.ok(!report.edges.some(e => e.kind === 'item'), 'Invalid explicit item does not silently select the owner');
  }
  for (const expression of [null, [], {}, '']) {
    const bad = structuredClone(owner); bad['minecraft:attachable'].description.item = { 'inspection:panel': expression };
    await write(rp, 'attachables/panel.json', bad); report = await completeInspect();
    assert.equal(report.ok, false); assert.ok(codes(report).includes('ITEM_SELECTOR'));
    bad['minecraft:attachable'].description.item = { 'inspection:panel': '1' };
    bad['minecraft:attachable'].description.scripts.animate = [{ pose: expression }];
    await write(rp, 'attachables/panel.json', bad); report = await completeInspect();
    assert.equal(report.ok, false); assert.ok(codes(report).includes('REFERENCE_ENTRY'));
  }
  for (const expression of ['0', 0, false]) {
    const valid = structuredClone(owner); valid['minecraft:attachable'].description.item = { 'inspection:panel': expression };
    valid['minecraft:attachable'].description.scripts.animate = [{ pose: expression }];
    await write(rp, 'attachables/panel.json', valid); assert.equal((await completeInspect()).complete, true, 'Primitive false/zero conditions are checked as declarations, not evaluated');
  }
  await write(rp, 'attachables/panel.json', owner);
  for (const body of [null, [], 'invalid', 0]) {
    const bad = structuredClone(rc); bad.render_controllers[rcId] = body;
    await write(rp, 'render_controllers/panel.json', bad); report = await completeInspect();
    assert.equal(report.ok, false); assert.ok(codes(report).includes('DEFINITION_BODY'));
  }
  await write(rp, 'render_controllers/panel.json', rc);
  const acOriginal = JSON.parse(await readFile(join(rp, 'animation_controllers/panel.json'), 'utf8'));
  for (const body of [null, [], 'invalid', 0]) {
    await write(rp, 'animation_controllers/panel.json', { animation_controllers: { 'controller.animation.inspection.panel': { states: { default: body } } } });
    report = await completeInspect(); assert.equal(report.ok, false); assert.ok(codes(report).includes('CONTROLLER_STATE'));
  }
  await write(rp, 'animation_controllers/panel.json', { animation_controllers: { 'controller.animation.inspection.panel': { initial_state: false, states: { default: {} } } } });
  assert.ok(codes(await completeInspect()).includes('CONTROLLER_INITIAL_STATE'));
  await write(rp, 'animation_controllers/panel.json', acOriginal);
  const transitionCases = ['default', { default: null }, { default: {} }, { default: '', other: '1' }];
  for (const transition of transitionCases) {
    const bad = structuredClone(acOriginal);
    bad.animation_controllers['controller.animation.inspection.panel'].states.default.transitions = [transition];
    await write(rp, 'animation_controllers/panel.json', bad); report = await completeInspect();
    assert.equal(report.complete, false); assert.ok(codes(report).includes('REFERENCE_ENTRY'), 'Each state transition needs a target and a condition');
  }
  const ordered = structuredClone(acOriginal);
  ordered.animation_controllers['controller.animation.inspection.panel'].states.default.transitions = [{ default: 'q.life_time > 1' }, { default: '0' }];
  await write(rp, 'animation_controllers/panel.json', ordered); report = await completeInspect();
  assert.equal(report.complete, true);
  assert.deepEqual(report.edges.filter(e => e.kind === 'controller-state' && e.path.includes('/transitions/')).map(e => e.path.split('/').at(-1)), ['0', '1'], 'Transition order is preserved; conditions are not executed');
  await write(rp, 'animation_controllers/panel.json', acOriginal);
  const inspectRc = async body => {
    await write(rp, 'render_controllers/panel.json', { ...rc, render_controllers: { [rcId]: body } });
    return completeInspect();
  };
  for (const [field, value] of [['geometry', 'Texture.default'], ['textures', ['Geometry.default']], ['materials', [{ '*': 'Texture.default' }]]]) {
    report = await inspectRc({ ...rc.render_controllers[rcId], [field]: value });
    assert.equal(report.ok, false); assert.ok(codes(report).includes('RESOURCE_TYPE'), 'Resolved aliases still have resource types');
  }
  for (const [field, values] of [
    ['geometry', [null, 0, false, [], {}, '']],
    ['textures', [null, 0, false, {}, [3], [null], [['Texture.default']], ['']]],
    ['materials', [null, 0, {}, ['Material.default'], [null], [{ '*': 3 }], [{ '*': null }], [{ '*': { value: 'Material.default' } }], [{ '': 'Material.default' }]]],
  ]) for (const value of values) {
    report = await inspectRc({ ...rc.render_controllers[rcId], [field]: value });
    assert.equal(report.ok, false); assert.ok(codes(report).includes('RESOURCE_SELECTOR'), `Invalid ${field} cannot disappear from the string walker`);
  }
  report = await inspectRc({ ...rc.render_controllers[rcId], textures: 'Texture.default' });
  assert.equal(report.ok, true, 'Older official documentation includes the single-string texture form');
  assert.equal(report.complete, false, 'A legacy texture shape is scanned without a current-schema compatibility claim');
  assert.ok(report.edges.some(e => e.kind === 'texture-alias' && e.status === 'resolved'));
  report = await inspectRc({ ...rc.render_controllers[rcId], materials: [{ '*': 'Material.default', root: 'Material.default' }] });
  assert.equal(report.complete, true, 'The schema allows multiple bone mappings in one material object');
  const nestedArrays = { geometries: { 'Array.frames': ['Array.base', 'Geometry.default'], 'Array.base': ['Geometry.default'] } };
  const nestedRc = { ...rc.render_controllers[rcId], arrays: nestedArrays, geometry: 'Array.frames[q.life_time]' };
  report = await inspectRc(nestedRc); assert.equal(report.ok, true); assert.equal(report.complete, false);
  assert.ok(report.edges.some(e => e.kind === 'resource-array' && e.target === 'array.base' && e.status === 'resolved'), 'Bare nested arrays are traversed without evaluating the index');
  for (const index of ['-1', '9999']) {
    report = await inspectRc({ ...nestedRc, geometry: `Array.frames[${index}]` });
    assert.equal(report.ok, true, 'Molang array indices clamp or wrap; no out-of-bounds error is invented');
    assert.equal(report.complete, false);
  }
  report = await inspectRc({ ...nestedRc, geometry: 'Array.frames' });
  assert.equal(report.complete, false, 'A bare array in a resource selector does not prove a single resource result');
  for (const entries of [
    { 'Array.loop': ['Array.loop'] },
    { 'Array.one': ['Array.two'], 'Array.two': ['Array.one'] },
    { 'Array.parent': ['Array.one'], 'Array.one': ['Array.two'], 'Array.two': ['Array.one', 'Geometry.default'] },
  ]) {
    report = await inspectRc({ ...rc.render_controllers[rcId], arrays: { geometries: entries } });
    assert.equal(report.ok, true, 'Cycle expansion is unverified rather than an asserted engine error');
    assert.equal(report.complete, false);
    assert.ok(report.edges.some(e => e.kind === 'resource-array-cycle' && e.status === 'dynamic'), 'Even unused cyclic declarations cannot claim finite expansion');
  }
  report = await inspectRc({ ...rc.render_controllers[rcId], arrays: { geometries: { 'Array.one': ['Array.leaf'], 'Array.two': ['Array.leaf'], 'Array.leaf': ['Geometry.default'] }, textures: { 'Array.one': ['Texture.default'] } } });
  assert.equal(report.complete, true, 'Shared acyclic descendants and equal names in different resource groups are not cycles');
  for (const arrays of [
    { textures: { 'Array.frames': ['Texture.default'] } },
    { geometries: { 'Array.frames': ['Array.missing'] } },
    { geometries: { 'Array.frames': ['Array.base'] }, textures: { 'Array.base': ['Texture.default'] } }
  ]) {
    report = await inspectRc({ ...nestedRc, arrays });
    assert.equal(report.ok, false); assert.ok(report.edges.some(e => e.kind === 'resource-array' && e.status === 'unresolved'), 'Array references resolve only against their declared resource type');
  }
  report = await inspectRc({ ...nestedRc, arrays: { geometries: { 'Array.frames': ['Texture.default'] } } });
  assert.ok(codes(report).includes('RESOURCE_TYPE'));
  for (const arrays of [[], { geometries: [] }, { geometries: { 'Array.frames': 'Geometry.default' } }, { geometries: { 'Array.frames': [null] } }]) {
    report = await inspectRc({ ...nestedRc, arrays }); assert.equal(report.ok, false);
    assert.ok(codes(report).some(code => ['RESOURCE_ARRAYS', 'RESOURCE_ARRAY_MEMBERS'].includes(code)));
  }
  report = await inspectRc({ ...nestedRc, arrays: { geometries: { 'Array.frames': ['Geometry.default'], 'array.FRAMES': ['Geometry.default'] } } });
  assert.ok(codes(report).includes('RESOURCE_ARRAY_DUPLICATE'));
  report = await inspectRc({ ...rc.render_controllers[rcId], geometry: "'Texture.not_an_alias' == 'Array.not_an_array' ? Geometry.default : Geometry.default" });
  assert.equal(report.ok, true); assert.equal(report.complete, false, 'Compound result typing is outside the scanner');
  assert.ok(!report.edges.some(e => /not_an_/.test(e.target) && ['texture-alias', 'resource-array'].includes(e.kind)), 'Quoted strings are not resource references');
  report = await inspectRc({ ...rc.render_controllers[rcId], geometry: 'v.texture.not_an_alias = 1; return Geometry.default;' });
  assert.equal(report.ok, true, 'A variable struct member is not a resource alias');
  for (const expression of ["Geometry.default /* Texture.not_an_alias */", "Geometry.default // Array.not_an_array\n", "Geometry.default + 'unterminated"]) {
    report = await inspectRc({ ...rc.render_controllers[rcId], geometry: expression });
    assert.equal(report.ok, true); assert.equal(report.complete, false);
    assert.ok(report.edges.some(e => e.kind === 'molang-expression' && e.status === 'dynamic'), 'Unsupported lexical boundaries remain unverified');
  }
  await write(rp, 'render_controllers/panel.json', rc);
  const geometryOriginal = await readFile(join(rp, 'models/panel.geo.json'), 'utf8');
  const propertyGeometry = JSON.parse(stripJsonTrailingCommas(stripJsonComments(geometryOriginal)));
  propertyGeometry['minecraft:geometry'][0].bones[0].binding = "q.property('inspection:binding')";
  const client = { 'minecraft:client_entity': { description: structuredClone(description) } };
  await write(rp, 'attachables/panel.json', client);
  const propertyBp = { 'minecraft:entity': { description: { identifier: description.identifier, properties: { 'inspection:binding': { type: 'enum', values: ['root'], default: 'root', client_sync: false } } } } };
  await write(bp, 'entities/property.json', propertyBp);
  await write(rp, 'models/panel.geo.json', propertyGeometry); report = await completeInspect();
  assert.equal(report.ok, false);
  assert.ok(report.edges.some(e => e.from === 'rp:geometry:geometry.inspection.panel' && e.kind === 'entity-property' && e.status === 'unresolved'), 'Geometry bindings participate in BP client_sync checks');
  propertyBp['minecraft:entity'].description.properties['inspection:binding'].client_sync = true;
  await write(bp, 'entities/property.json', propertyBp); assert.equal((await completeInspect()).complete, true);
  client['minecraft:client_entity'].description.scripts.pre_animation = ["{\n v.binding = q.property('inspection:binding');\n v.text = 'query.property';\n}"];
  await write(rp, 'attachables/panel.json', client); report = await completeInspect();
  assert.equal(report.complete, true, 'References inside multiline brace scopes remain visible');
  client['minecraft:client_entity'].description.scripts.pre_animation = ["v.actor -> q.property('inspection:elsewhere')"];
  await write(rp, 'attachables/panel.json', client); report = await completeInspect();
  assert.equal(report.ok, true); assert.equal(report.complete, false);
  assert.ok(report.edges.some(e => e.target === 'inspection:elsewhere' && e.status === 'external-unverified'), 'An actor dereference does not incorrectly require the local BP property');
  await writeFile(join(rp, 'models/panel.geo.json'), geometryOriginal);
  await write(rp, 'attachables/panel.json', owner);
  await rm(join(bp, 'entities/property.json'));
  const materialOriginal = JSON.parse(await readFile(join(rp, 'materials/panel.material'), 'utf8'));
  for (const materials of [{ 'inspection_panel:inspection_panel': {} }, { 'inspection_panel:loop': {}, 'loop:inspection_panel': {} }]) {
    await write(rp, 'materials/panel.material', { materials }); report = await completeInspect();
    assert.equal(report.ok, false); assert.equal(report.complete, false); assert.ok(codes(report).includes('MATERIAL_CYCLE'));
  }
  await write(rp, 'materials/panel.material', materialOriginal);
  await write(vanilla, 'materials/entity.material', { materials: { 'entity_alphatest:external_base': {} } });
  report = await completeInspect(); assert.equal(report.ok, true); assert.equal(report.complete, false);
  assert.ok(report.edges.some(e => e.kind === 'material' && e.target === 'external_base' && e.status === 'external-unverified'), 'Supplied vanilla material ancestry is followed');
  await write(vanilla, 'materials/entity.material', { materials: { entity_alphatest: {} } });
  assert.equal((await completeInspect()).complete, true);
  for (const malformed of [null, [], { description: null }, { description: {} }]) {
    await write(rp, 'attachables/malformed.json', { 'minecraft:attachable': malformed });
    report = await completeInspect(); assert.equal(report.ok, false); assert.equal(report.complete, false);
    assert.ok(codes(report).some(code => ['DEFINITION_BODY', 'OWNER_IDENTIFIER'].includes(code)), 'Malformed owner marker cannot disappear beside a valid owner');
  }
  await rm(join(rp, 'attachables/malformed.json'));
  for (const malformed of [null, [], {}, { description: null }, { description: { identifier: '' } }]) {
    await write(rp, 'models/malformed.json', { 'minecraft:geometry': [malformed] });
    report = await completeInspect(); assert.equal(report.ok, false); assert.ok(codes(report).includes('GEOMETRY_DEFINITION'));
  }
  await rm(join(rp, 'models/malformed.json'));
  const legacyOwner = structuredClone(owner);
  legacyOwner['minecraft:attachable'].description.geometry.default = 'geometry.inspection.child';
  await write(rp, 'attachables/panel.json', legacyOwner);
  const legacy = { format_version: '1.8.0', 'geometry.inspection.base': { bones: [] }, 'geometry.inspection.child:geometry.inspection.base': { bones: [] } };
  await write(vanilla, 'models/entity/legacy.json', legacy);
  report = await completeInspect(); assert.equal(report.complete, true);
  assert.ok(report.nodes.some(n => n.id === 'vanilla:geometry:geometry.inspection.child'));
  assert.ok(!report.nodes.some(n => n.name === 'geometry.inspection.child:geometry.inspection.base'));
  assert.ok(report.edges.some(e => e.from === 'vanilla:geometry:geometry.inspection.child' && e.target === 'geometry.inspection.base' && e.status === 'resolved'));
  await write(vanilla, 'models/entity/legacy.json', { 'geometry.inspection.child:geometry.inspection.missing': { bones: [] } });
  report = await completeInspect(); assert.equal(report.ok, false); assert.equal(report.complete, false);
  await write(vanilla, 'models/entity/legacy.json', { 'geometry.inspection.child:geometry.inspection.base': {}, 'geometry.inspection.base:geometry.inspection.child': {} });
  report = await completeInspect(); assert.equal(report.ok, false); assert.ok(codes(report).includes('GEOMETRY_CYCLE'));
  await write(vanilla, 'models/entity/legacy.json', legacy);
  await write(rp, 'attachables/panel.json', owner);
  const player = { 'minecraft:client_entity': { description: { ...description, identifier: 'minecraft:player', enable_attachables: true } } };
  player['minecraft:client_entity'].description.geometry = { default: 'geometry.player.missing' };
  player['minecraft:client_entity'].description.scripts = { animate: ['pose'], pre_animation: ["v.state = q.property('inspection:state');"] };
  await write(rp, 'entity/player.entity.json', player);
  report = await inspect(); assert.equal(report.ok, false); assert.ok(codes(report).includes('PLAYER_OVERRIDE'));
  assert.ok(report.edges.some(e => e.from === 'rp:client-entity:minecraft:player' && e.target === 'geometry.player.missing' && e.status === 'unresolved'));
  assert.ok(report.edges.some(e => e.kind === 'entity-property' && e.target === 'inspection:state' && e.status === 'unresolved'));
  await write(bp, 'entities/player.json', { 'minecraft:entity': { description: { identifier: 'minecraft:player', properties: { 'inspection:state': { type: 'int', range: [0, 1], default: 0, client_sync: true } } } } });
  report = await inspect(); assert.ok(report.edges.some(e => e.kind === 'entity-property' && e.target === 'inspection:state' && e.status === 'resolved'));
  await write(bp, 'entities/player.json', { 'minecraft:entity': { description: { identifier: 'minecraft:player', properties: { 'inspection:state': { type: 'int', client_sync: false } } } } });
  report = await inspect(); assert.ok(report.edges.some(e => e.kind === 'entity-property' && e.status === 'unresolved'));
  const noBp = await inspectAttachableGraph({ rp }); assert.ok(noBp.edges.some(e => e.kind === 'entity-property' && e.status === 'external-unverified'));
  for (const max of [1000, 6000, 64000]) { const text = boundedAttachableReport(report, max); assert.ok(text.length + 1 <= max); assert.equal(JSON.parse(text).runtimeVerified, false); }
  const boundary = { ok: false, runtimeVerified: false, nodes: [], edges: [], diagnostics: [{ severity: 'error', code: 'EDGE', message: 'x'.repeat(1400) }] };
  const boundaryText = boundedAttachableReport(boundary, 64000);
  assert.equal(JSON.parse(boundedAttachableReport(boundary, boundaryText.length + 1)).diagnostics.length, 1);
  const newlineLimited = boundedAttachableReport(boundary, boundaryText.length);
  assert.ok(newlineLimited.length + 1 <= boundaryText.length);
  assert.equal(JSON.parse(newlineLimited).omitted.diagnostics, 1, 'Exact JSON-only fit leaves room for console.log newline');
  const priorities = { ...boundary, diagnostics: [{ severity: 'warning', code: 'WARN', message: 'w'.repeat(600) }, { severity: 'error', code: 'ERROR', message: 'e'.repeat(600) }] };
  const priorityOutput = JSON.parse(boundedAttachableReport(priorities, 1000));
  assert.equal(priorityOutput.diagnostics.length, 1);
  assert.equal(priorityOutput.diagnostics[0].code, 'ERROR', 'A warning cannot consume space before an error');
  assert.throws(() => boundedAttachableReport(report, 999));
  const cli = (...args) => spawnSync(process.execPath, [join(repo, 'tools/attachable-inspect.mjs'), '--rp', rp, '--bp', bp, '--json', ...args], { encoding: 'utf8' });
  const output = join(temp, 'report.json'); const result = cli('--report', output, '--max-chars', '1000');
  assert.equal(result.status, 1); assert.ok(result.stdout.length <= 1000); assert.ok(JSON.parse(await readFile(output, 'utf8')).nodes.length);
  assert.equal(cli('--report', output).status, 2, 'Existing full report is protected');
  const aliasPath = join(temp, 'hardlink.json'); await link(join(rp, 'attachables/panel.json'), aliasPath);
  assert.equal(cli('--report', aliasPath).status, 2, 'Input hardlink cannot be overwritten');
  assert.equal(await readFile(join(rp, 'attachables/panel.json'), 'utf8'), JSON.stringify(owner));
  assert.equal(cli('--unknown').status, 2);
  console.log('attachable-graph: static graph, JSONC, missing roots/resources/aliases, perspectives, player graph, bounds and report protection passed');
} finally { await rm(temp, { recursive: true, force: true }); }
