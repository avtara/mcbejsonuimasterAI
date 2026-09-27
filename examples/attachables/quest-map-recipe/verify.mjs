import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { inspectAttachableGraph } from '../../../tools/_lib/attachable-graph.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const triple = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const conditions = {
  main_first: "context.is_first_person && context.item_slot == 'main_hand'",
  off_first: "context.is_first_person && context.item_slot == 'off_hand'",
  main_third: "!context.is_first_person && context.item_slot == 'main_hand'",
  off_third: "!context.is_first_person && context.item_slot == 'off_hand'",
};

// This verifies this recipe's authored contract; it is not a general Bedrock schema.
function checkDefinitions(data) {
  const { recipe, rp, bp, geometry, animations, atlas, items, attachables, languages, renderer } = data;
  assert.equal(recipe.runtimeVerified, false);
  assert.equal(recipe.poseStatus, 'authored-calibration-starting-point');
  const ids = [rp.header.uuid, bp.header.uuid, ...rp.modules.map(m => m.uuid), ...bp.modules.map(m => m.uuid)];
  assert.equal(new Set(ids).size, 4, 'manifest UUIDs must be unique');
  assert.ok(ids.every(id => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)));
  assert.deepEqual(rp.modules.map(m => m.type), ['resources']);
  assert.deepEqual(bp.modules.map(m => m.type), ['data']);
  assert.deepEqual(bp.dependencies, [{ uuid: rp.header.uuid, version: rp.header.version }]);
  for (const manifest of [rp, bp]) {
    assert.equal(manifest.format_version, 2);
    assert.deepEqual(manifest.header.min_engine_version, recipe.minimumClient);
  }
  assert.deepEqual(languages, ['en_US', 'ko_KR']);
  assert.equal(new Set(recipe.states.map(s => s.item)).size, 2);
  const model = geometry['minecraft:geometry'][0];
  assert.equal(model.description.identifier, recipe.display.geometry);
  assert.deepEqual([model.description.texture_width, model.description.texture_height], recipe.display.textureSize);
  assert.equal(model.bones.length, 1);
  const bone = model.bones[0];
  assert.equal(bone.name, recipe.display.bone);
  assert.equal(bone.binding, 'q.item_slot_to_bone_name(context.item_slot)');
  const cube = bone.cubes[0];
  assert.deepEqual(cube.size, recipe.display.cubeSize);
  assert.ok(cube.size.every(v => v > 0), 'sample uses a thin box, not a zero-thickness plane');
  assert.deepEqual(Object.keys(cube.uv).sort(), ['down', 'east', 'north', 'south', 'up', 'west']);
  for (const face of Object.values(cube.uv)) {
    assert.equal(face.uv.length, 2);
    assert.equal(face.uv_size.length, 2);
    for (let axis = 0; axis < 2; axis++) {
      const [start, size, extent] = [face.uv[axis], face.uv_size[axis], recipe.display.textureSize[axis]];
      assert.ok(Number.isFinite(start) && Number.isFinite(size) && start >= 0 && size > 0 && start + size <= extent, 'face UV outside texture');
    }
  }
  assert.deepEqual(Object.keys(animations.animations).sort(), Object.keys(conditions).map(k => `animation.kit_demo.quest_map.${k}`).sort());
  for (const animation of Object.values(animations.animations)) {
    assert.equal(animation.loop, true);
    assert.deepEqual(Object.keys(animation.bones), [bone.name], 'animation must target an existing geometry bone');
    const pose = animation.bones[bone.name];
    assert.ok(triple(pose.position) && triple(pose.rotation));
    assert.ok(Number.isFinite(pose.scale) && pose.scale > 0, 'each exclusive branch owns a complete pose');
  }
  for (let index = 0; index < recipe.states.length; index++) {
    const state = recipe.states[index], item = items[index]['minecraft:item'];
    assert.equal(item.description.identifier, state.item);
    assert.equal(item.components['minecraft:max_stack_size'], 1);
    assert.equal(item.components['minecraft:allow_off_hand'], true);
    assert.equal(item.components['minecraft:icon'], state.item);
    assert.equal(atlas.texture_data[state.item].textures, `textures/items/quest_map_${state.id}`);
    assert.equal(item.components['minecraft:display_name'].value, `item.${state.item}.name`);
    const owner = attachables[index]['minecraft:attachable'].description;
    assert.equal(owner.identifier, `${state.item}.player`);
    assert.deepEqual(owner.item, { [state.item]: "query.is_owner_identifier_any('minecraft:player')" });
    assert.deepEqual(owner.geometry, { default: recipe.display.geometry });
    assert.deepEqual(owner.textures, { default: state.texture });
    assert.deepEqual(owner.materials, { default: 'entity_alphatest' });
    assert.deepEqual(owner.scripts.animate, Object.entries(conditions).map(([key, value]) => ({ [key]: value })));
    for (const key of Object.keys(conditions)) assert.equal(owner.animations[key], `animation.kit_demo.quest_map.${key}`);
    assert.deepEqual(owner.render_controllers, ['controller.render.kit_demo.quest_map']);
  }
  assert.deepEqual(renderer.render_controllers['controller.render.kit_demo.quest_map'], {
    geometry: 'Geometry.default', materials: [{ '*': 'Material.default' }], textures: ['Texture.default'],
  });
}

try {
  const recipe = await json('recipe.json');
  const data = {
    recipe, rp: await json('rp/manifest.json'), bp: await json('bp/manifest.json'),
    geometry: await json('rp/models/entity/quest_map.geo.json'),
    animations: await json('rp/animations/quest_map.animation.json'),
    atlas: await json('rp/textures/item_texture.json'),
    renderer: await json('rp/render_controllers/quest_map.json'),
    languages: await json('rp/texts/languages.json'),
    items: await Promise.all(recipe.states.map(s => json(`bp/items/quest_map_${s.id}.json`))),
    attachables: await Promise.all(recipe.states.map(s => json(`rp/attachables/quest_map_${s.id}.json`))),
  };
  checkDefinitions(data);
  const pixels = [];
  for (const state of recipe.states) {
    for (const [path, size] of [[state.texture, recipe.display.textureSize], [data.atlas.texture_data[state.item].textures, recipe.display.iconSize]]) {
      const png = PNG.sync.read(await readFile(resolve(root, 'rp', `${path}.png`)));
      assert.deepEqual([png.width, png.height], size);
      const alpha = Array.from(png.data).filter((_, i) => i % 4 === 3);
      assert.ok(alpha.includes(0) && alpha.includes(255), 'texture must contain real transparency and visible pixels');
      if (path === state.texture) pixels.push(png.data);
    }
    for (const language of data.languages) {
      const lines = (await readFile(resolve(root, `rp/texts/${language}.lang`), 'utf8')).split(/\r?\n/);
      assert.equal(lines.filter(line => line.startsWith(`item.${state.item}.name=`)).length, 1, 'each display name needs one translation');
    }
  }
  assert.notDeepEqual(pixels[0], pixels[1], 'states must have different visible texture data');
  const negativeCases = [
    copy => { copy.bp.dependencies[0].uuid = copy.bp.header.uuid; },
    copy => { const pose = Object.values(copy.animations.animations)[0].bones; pose.missing_bone = pose.quest_map_root; delete pose.quest_map_root; },
    copy => { copy.geometry['minecraft:geometry'][0].bones[0].cubes[0].uv.north.uv_size[0] = 49; },
    copy => { copy.attachables[0]['minecraft:attachable'].description.scripts.animate[1].off_first = conditions.main_first; },
  ];
  for (const mutate of negativeCases) { const copy = structuredClone(data); mutate(copy); assert.throws(() => checkDefinitions(copy)); }
  const graph = await inspectAttachableGraph({ rp: resolve(root, 'rp'), bp: resolve(root, 'bp') });
  assert.equal(graph.ok, true, JSON.stringify(graph.diagnostics.filter(d => d.severity === 'error')));
  assert.equal(graph.runtimeVerified, false);
  const gaps = graph.edges.filter(e => e.status !== 'resolved');
  assert.equal(gaps.length, 2);
  assert.ok(gaps.every(e => e.status === 'external-unverified' && e.kind === 'material' && e.target === 'entity_alphatest'));
  assert.equal(graph.complete, false, 'engine material definitions were not supplied');
  console.log(JSON.stringify({ ok: true, evidenceLevel: 'static-recipe-contract', runtimeVerified: false, states: 2, poseBranches: 4, textures: 4, negativeCases: negativeCases.length, graph: graph.summary, remaining: ['entity_alphatest engine definition and shader behavior', 'pose calibration, input adapter and lifecycle in the target client'] }));
} catch (error) {
  console.error(`Quest map recipe verification failed: ${String(error.message).slice(0, 1500)}`);
  process.exitCode = 1;
}
