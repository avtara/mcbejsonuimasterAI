import { createHash } from 'node:crypto';
import { readFile, stat, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const GEOUI_SOURCE = Object.freeze({
  id: 'au12jp-geoui-studio', revision: '7fe110f22385b1a44ea8ba01c2a6817b888b6893',
  url: 'https://github.com/Au12jp/GeouiStudio/blob/7fe110f22385b1a44ea8ba01c2a6817b888b6893/index.html',
  sha256: 'f8e6e0832efff2a58bf5b22a2cea9a67a34a8be894ee448dc9231b58a129d075', license: 'Apache-2.0',
});
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const integer = value => Number.isSafeInteger(value);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const types = new Set(['image', 'video', 'text', 'shape', 'score', 'bar', 'model', 'audio']);
const channels = new Set(['x', 'y', 'scale', 'rotX', 'rotY', 'rotZ', 'opacity']);
const cleanId = value => value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
const generatedKeys = ['gen', 'seek', 'playing', 'scene', 'aspect', 'scale', 'cx', 'cy', 'ox', 'oy', 'alpha', 'v0', 'v1', 'v2', 'v3'];
const pointer = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_LAYERS = 2048;

function decodeBase64(value) {
  if (typeof value !== 'string' || !value.length || value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) return null;
  const padding = value.indexOf('=');
  if (padding !== -1 && (padding < value.length - 2 || !/^={1,2}$/.test(value.slice(padding)))) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes : null;
}

export function inspectGeoUiProject(project) {
  const diagnostics = [], layers = [], propertyReads = new Map();
  let incomplete = false;
  const add = (severity, code, path, message, lineStart, lineEnd = lineStart, unresolved = false) => {
    diagnostics.push({ severity, code, path, message, sourceLines: [lineStart, lineEnd] });
    if (unresolved || severity === 'error') incomplete = true;
  };
  const error = (code, path, message, first, last) => add('error', code, path, message, first, last);
  const warn = (code, path, message, first, last, unresolved = false) => add('warning', code, path, message, first, last, unresolved);
  const requireNumber = (object, key, path, predicate = finite) => {
    if (object[key] !== undefined && !predicate(object[key])) error('INVALID_NUMBER', `${path}/${key}`, 'Expected a finite number within the supported range; the inspector does not coerce or repair it.', 1645);
  };
  const readProperty = (name, path, producer) => {
    if (!propertyReads.has(name)) propertyReads.set(name, { name, paths: [], producers: [] });
    const item = propertyReads.get(name); item.paths.push(path);
    if (producer && !item.producers.includes(producer)) item.producers.push(producer);
  };
  let namespace = null, rpOnly = false, needScript = false, scenes = [];
  if (!record(project)) error('PROJECT_OBJECT_REQUIRED', '', 'Expected a native .geoui.json project object.', 11361, 11367);
  else if (project.v !== 6) error('PROJECT_VERSION_UNSUPPORTED', '/v', 'This inspector supports saved project v6 only. Older imports can rescale coordinates by 20.25; inspect a separately saved v6 copy.', 11228, 11271);
  else if (!Array.isArray(project.layers) || project.layers.length > MAX_LAYERS) error('LAYERS_INVALID', '/layers', `Expected an array of at most ${MAX_LAYERS} layers (inspector resource limit).`, 11235, 11237);
  else {
    for (const key of ['meta', 'screen', 'timing', 'build', 'triggers']) if (project[key] !== undefined && !record(project[key])) error('PROJECT_SECTION_INVALID', `/${key}`, 'Expected an object.', 11228, 11235);
    const meta = record(project.meta) ? project.meta : {}, screen = record(project.screen) ? project.screen : {};
    const timing = record(project.timing) ? project.timing : {}, build = record(project.build) ? project.build : {};
    const triggers = record(project.triggers) ? project.triggers : {};
    const rawNamespace = meta.ns ?? 'geoui';
    if (typeof rawNamespace !== 'string' || !/^[a-z][a-z0-9_]{0,23}$/.test(rawNamespace) || rawNamespace === 'minecraft') error('NAMESPACE_REWRITTEN_ON_LOAD', '/meta/ns', 'Use a non-minecraft lowercase namespace of 1..24 characters; the editor otherwise rewrites it on load/export.', 11212, 11218);
    else namespace = rawNamespace;
    if (project.scenes !== undefined && !Array.isArray(project.scenes)) error('SCENES_INVALID', '/scenes', 'Expected a scene array; scene references are array indices, not object IDs.', 2495, 2498);
    scenes = Array.isArray(project.scenes) ? project.scenes : [];
    if (scenes.length > 129) error('SCENE_PROPERTY_RANGE', '/scenes', 'The pinned export declares scene -1..128; scenes above index 128 cannot be selected by that property.', 2415);
    const sceneIndex = (value, path) => {
      if (value !== undefined && value !== null && (!integer(value) || value < -1 || value > 128)) error('SCENE_PROPERTY_RANGE', path, 'Expected an integer scene index from -1 to 128.', 1962, 2415);
    };
    sceneIndex(project.startScene, '/startScene');
    for (const [index, scene] of scenes.entries()) {
      const p = `/scenes/${index}`;
      if (!record(scene)) { error('SCENE_INVALID', p, 'Expected a scene object.', 2495, 2498); continue; }
      for (const key of ['duration', 'delay']) requireNumber(scene, key, p, v => finite(v) && v >= 0);
      if (scene.chain) {
        const next = scene.next === undefined || scene.next === null || scene.next === '' ? index + 1 : scene.next;
        if (!integer(next) || next < 0 || next >= scenes.length) warn('SCENE_CHAIN_STOPS', `${p}/next`, 'The target scene does not exist; finish() will not continue this chain.', 3218);
      }
    }
    for (const key of ['unitsPerScreenH', 'uiPxPerUnit', 'uiAspect']) requireNumber(screen, key, '/screen', positive);
    for (const key of ['fps', 'duration']) requireNumber(timing, key, '/timing', positive);
    if (timing.mode !== undefined && !['loop', 'script'].includes(timing.mode)) error('TIMING_MODE_UNKNOWN', '/timing/mode', 'Expected loop or script.', 1883, 1893);
    if (build.rpOnly !== undefined && typeof build.rpOnly !== 'boolean') error('RP_ONLY_INVALID', '/build/rpOnly', 'Expected a boolean.', 1870);
    rpOnly = build.rpOnly === true;
    if (build.palette !== undefined && !['auto', 'rgba', 'rgb', 'indexed'].includes(build.palette)) warn('PALETTE_MODE_UNKNOWN', '/build/palette', 'Palette mode is not recognized by this inspector.', 1144, 1179, true);
    if (build.palette === 'indexed') warn('INDEXED_ALPHA_LOSS', '/build/palette', 'Pinned indexed export keeps one transparent palette entry; partial alpha requires an RGBA-preserving export.', 1144, 1179);
    if (project.maxDim !== undefined && (!integer(project.maxDim) || project.maxDim < 1)) error('ATLAS_LIMIT_INVALID', '/maxDim', 'Expected a positive integer atlas planning dimension.', 1844, 1849);
    const ids = new Map(), exportIds = new Map(), audioIds = new Map(), animationDefinitions = new Map(), propertyWriters = new Map(), writerCandidates = [];
    for (const [index, layer] of project.layers.entries()) {
      const p = `/layers/${index}`;
      if (!record(layer)) { error('LAYER_INVALID', p, 'Expected a layer object.', 11288, 11289); continue; }
      const enabled = layer.enabled !== false;
      const item = { path: p, id: typeof layer.id === 'string' ? layer.id.slice(0, 120) : null, type: typeof layer.type === 'string' ? layer.type.slice(0, 40) : null, enabled, media: 'unresolved' };
      layers.push(item);
      if (typeof layer.id !== 'string' || !layer.id.length || layer.id.length > 120) error('LAYER_ID_INVALID', `${p}/id`, 'Expected a nonempty layer ID of at most 120 characters (inspector limit).', 4424, 4429);
      else {
        if (ids.has(layer.id)) error('LAYER_ID_DUPLICATE', `${p}/id`, `Layer ID also appears at ${ids.get(layer.id)}.`, 4450);
        ids.set(layer.id, `${p}/id`);
        item.exportId = cleanId(layer.id);
        if (!item.exportId) error('LAYER_EXPORT_ID_EMPTY', `${p}/id`, 'The ID becomes empty during export normalization; fallback IDs differ between model preparation and generation.', 1644, 1928);
        if (enabled && layer.type !== 'audio' && item.exportId) {
          if (exportIds.has(item.exportId)) error('LAYER_EXPORT_ID_COLLISION', `${p}/id`, `Export names collide with ${exportIds.get(item.exportId)} after lowercase/punctuation normalization.`, 1928, 1973);
          exportIds.set(item.exportId, `${p}/id`);
        }
      }
      if (!types.has(layer.type)) { error('LAYER_TYPE_UNKNOWN', `${p}/type`, 'Unknown native layer type.', 4414, 4422); continue; }
      if (['src', 'audio', 'model', 'atlas'].some(key => layer[key] !== undefined)) warn('RUNTIME_FIELDS_IGNORED', p, 'Saved v6 media uses _src/_audio/_model. In-memory src/audio/model and generator atlas fields are not restored as saved media by this inspector.', 11237, 11250, true);
      if (layer.enabled !== undefined && typeof layer.enabled !== 'boolean') error('LAYER_ENABLED_INVALID', `${p}/enabled`, 'Expected a boolean.', 1867);
      sceneIndex(layer.scene, `${p}/scene`);
      if (layer.parent !== undefined || layer.parentId !== undefined) warn('LAYER_PARENT_NOT_EXPORTED', p, 'Layer order controls depth; parent/parentId is not an exported layer hierarchy. Model bone parents are checked separately.', 1926, 1934);
      for (const key of ['x', 'y', 'z', 'rotX', 'rotY', 'rotZ', 'padX', 'padY', 'startTime']) requireNumber(layer, key, p);
      for (const key of ['heightPct', 'scale', 'speed', 'modelScale', 'maxValue']) requireNumber(layer, key, p, positive);
      if (layer.widthPct !== undefined && layer.widthPct !== null && layer.widthPct !== '') requireNumber(layer, 'widthPct', p, v => finite(v) && v >= 0);
      if (layer.endTime !== undefined && layer.endTime !== null && layer.endTime !== '') {
        requireNumber(layer, 'endTime', p, v => finite(v) && v >= 0);
        if (finite(layer.endTime) && finite(layer.startTime) && layer.endTime < layer.startTime) error('LAYER_TIME_REVERSED', `${p}/endTime`, 'End time precedes start time.', 1964, 1965);
      }
      requireNumber(layer, 'opacity', p, v => finite(v) && v >= 0 && v <= 1);
      if (layer.blend !== undefined && !['cutout', 'blend', 'add'].includes(layer.blend)) error('BLEND_UNKNOWN', `${p}/blend`, 'Expected cutout, blend or add.', 1924);
      item.effectiveBlend = (layer.opacity < 1 || layer.keys?.opacity?.length) && (!layer.blend || layer.blend === 'cutout') ? 'blend' : layer.blend ?? 'cutout';
      if (layer.keys !== undefined && !record(layer.keys)) error('KEYS_INVALID', `${p}/keys`, 'Expected animation channels.', 4442, 4445);
      for (const [channel, keys] of Object.entries(record(layer.keys) ? layer.keys : {})) {
        const kp = `${p}/keys/${pointer(channel)}`;
        if (!channels.has(channel)) { warn('KEY_CHANNEL_NOT_EXPORTED', kp, 'This channel is not consumed by the pinned transform generator.', 1939, 1945, true); continue; }
        if (!Array.isArray(keys) || keys.length > 10000) { error('KEYS_INVALID', kp, 'Expected at most 10000 keys (inspector resource limit).', 1826, 1828); continue; }
        const times = new Set();
        for (const [i, key] of keys.entries()) {
          if (!record(key) || !finite(key.t) || !finite(key.v)) { error('KEY_INVALID', `${kp}/${i}`, 'Key t and v must be finite numbers.', 1828); continue; }
          if (times.has(key.t)) warn('KEY_TIME_DUPLICATE', `${kp}/${i}/t`, 'Multiple keys share a time; review the intended step/ordering before export.', 1828, 1838);
          times.add(key.t);
        }
        if (keys.length > 121) warn('KEY_REDUCTION', kp, 'The pinned generator may thin channels exceeding 120 segments; compare the exported motion.', 1769, 1804);
      }
      if (layer.type === 'audio') {
        const audioId = cleanId(String(layer.name || `track${audioIds.size}`)) || `track${audioIds.size}`;
        if (audioIds.has(audioId)) error('AUDIO_EXPORT_ID_COLLISION', `${p}/name`, `Sound names collide with ${audioIds.get(audioId)} after export normalization.`, 11674, 11678);
        audioIds.set(audioId, `${p}/name`);
        if (!record(layer._audio) || !decodeBase64(layer._audio.b64)) error('AUDIO_NOT_RESTORABLE', `${p}/_audio`, 'Embedded audio bytes are absent or malformed; settings-only saving drops imported audio.', 11247, 11302);
        else {
          item.media = 'embedded-audio-unplayed';
          if (!['wav', 'ogg', 'fsb'].includes(layer._audio.ext)) error('AUDIO_EXTENSION_INVALID', `${p}/_audio/ext`, 'Unsupported or unsafe sound extension.', 2176);
          requireNumber(layer._audio, 'duration', `${p}/_audio`, positive);
        }
        if (!enabled) warn('DISABLED_AUDIO_STILL_EXPORTED', `${p}/enabled`, 'buildAddon collects audio with bytes without filtering enabled; disabling the editor layer does not omit the track.', 11674, 11678);
      } else if (layer.type === 'model') {
        if (layer.fx?.model) { item.media = 'generated-model-recipe-unverified'; warn('RECIPE_REBUILD_UNVERIFIED', `${p}/fx`, 'Model effects rebuild during restore; the inspector does not execute that generator.', 11306, 11308, true); }
        else if (!record(layer._model?.geoRaw)) error('MODEL_NOT_RESTORABLE', `${p}/_model`, 'A non-generated model needs embedded _model.geoRaw; model data is saved even in settings-only projects.', 11248, 11250);
        else {
          item.media = 'embedded-model';
          inspectModel(layer._model, p, item, layer.rotX, error, warn);
          for (const [name, definition] of Object.entries(record(layer._model.animRaw?.animations) ? layer._model.animRaw.animations : {})) {
            const digest = sha256(JSON.stringify(definition)), previous = animationDefinitions.get(name);
            if (previous && previous.digest !== digest) error('MODEL_ANIMATION_EXPORT_COLLISION', `${p}/_model/animRaw/animations/${pointer(name)}`, `A different animation with the same ID is exported by ${previous.path}; the last model overwrites it.`, 11652);
            animationDefinitions.set(name, { digest, path: p });
          }
        }
      } else if (layer._src !== undefined) {
        item.media = inspectAtlas(layer._src, `${p}/_src`, error, warn) ? 'embedded-png-headers' : 'invalid-embedded-media';
        if (layer.type === 'score' && item.media === 'embedded-png-headers' && (layer._src.frames < 11 || layer._src.pages.length !== 1)) error('SCORE_ATLAS_INCOMPLETE', `${p}/_src`, 'Score export uses only page 0 and samples digits 0..9 plus blank 10; all eleven frames must fit that page.', 2032, 2047);
      } else if (['text', 'shape', 'score', 'bar'].includes(layer.type) || record(layer.design) || record(layer.fx)) {
        item.media = 'recipe-rebuild-unverified';
        warn('RECIPE_REBUILD_UNVERIFIED', p, 'The editor regenerates media from the recipe. Fonts, pixels and generated dimensions require a separate export/visual check.', 11309, 11315, true);
      } else error('MEDIA_NOT_RESTORABLE', `${p}/_src`, 'Imported image/video media is absent. Restore cannot recover a settings-only file without a rebuild recipe.', 11309, 11315);
      if (layer.type !== 'audio' && layer.scoreObjective && !['unresolved', 'invalid-embedded-media'].includes(item.media)) writerCandidates.push({ layer, path: p });
      if (enabled && layer.type !== 'audio') {
        if (layer.scene >= 0 && namespace) readProperty(`${namespace}:scene`, `${p}/scene`, 'scene command/IPC');
        if (['score', 'bar'].includes(layer.type) || layer.playMode === 'score') {
          const name = layer.scoreProp || (namespace ? `${namespace}:v0` : null);
          if (typeof name !== 'string' || !/^[a-z0-9_]+:[a-z0-9_]+$/.test(name)) error('SCORE_PROPERTY_INVALID', `${p}/scoreProp`, 'Expected a literal namespace:property identifier.', 2027, 2053);
          else {
            readProperty(name, `${p}/scoreProp`, layer.scoreObjective ? 'scoreboard sync' : 'external producer required');
          }
        }
        if (layer.visibleWhen) {
          if (typeof layer.visibleWhen !== 'string') error('VISIBLE_EXPRESSION_INVALID', `${p}/visibleWhen`, 'Expected a Molang expression string.', 1963);
          else {
            const re = /\b(?:q|query)\.property\(\s*(['"])([^'"]+)\1\s*\)/g;
            for (const match of layer.visibleWhen.matchAll(re)) readProperty(match[2], `${p}/visibleWhen`, 'external expression producer');
            warn('MOLANG_UNVERIFIED', `${p}/visibleWhen`, 'Literal property reads are listed; expression syntax and runtime values are not evaluated.', 1963, 1963, true);
          }
        }
      }
    }
    needScript = !rpOnly && (timing.mode === 'script' || scenes.length > 0 || project.layers.some(l => record(l) && ((l.enabled !== false && (l.scene >= 0 || ['score', 'bar'].includes(l.type) || l.playMode === 'score')) || (l.type === 'audio' && l._audio))) || screen.autoAspect !== false || screen.ruler !== false || screen.centerAuto !== false || triggers.ipc !== false);
    if (needScript) for (const { layer, path } of writerCandidates) {
      const name = layer.scoreProp || (namespace ? `${namespace}:v0` : null);
      if (typeof name !== 'string' || !/^[a-z0-9_]+:[a-z0-9_]+$/.test(name) || typeof layer.scoreObjective !== 'string') { error('SCORE_WRITER_INVALID', `${path}/scoreObjective`, 'Scoreboard sync needs a literal property identifier and objective string.', 2504); continue; }
      const previous = propertyWriters.get(name);
      if (previous !== undefined && previous !== layer.scoreObjective) error('SCORE_WRITERS_CONFLICT', `${path}/scoreObjective`, 'Different score objectives write the same property. The script includes non-score and disabled visual layers too.', 2504, 3263);
      propertyWriters.set(name, layer.scoreObjective);
      readProperty(name, `${path}/scoreObjective`, 'scoreboard sync read/write');
    }
    for (const prop of propertyReads.values()) {
      const generated = namespace && generatedKeys.some(key => prop.name === `${namespace}:${key}`);
      prop.declaration = rpOnly ? 'external-bp-required' : generated ? 'generated-player-property' : 'external-bp-required';
      if (prop.declaration !== 'generated-player-property') warn('PROPERTY_DECLARATION_REQUIRED', prop.paths[0], 'The pinned export does not declare this property in its output. Integrate and verify a client-synchronized player property in the owning BP.', 2412, 2428, true);
      if (prop.producers.includes('external producer required')) warn('PROPERTY_PRODUCER_REQUIRED', prop.paths[0], 'No scoreboard objective is assigned; name and verify the external producer rather than treating a default value as live state.', 2504, 3263, true);
    }
    if (rpOnly && (timing.mode === 'script' || project.layers.some(l => record(l) && l.type === 'audio' && l._audio))) warn('RP_ONLY_SCRIPT_FEATURES', '/build/rpOnly', 'RP-only suppresses the BP/script. Script timing becomes lifetime timing and embedded sound files do not receive the scripted playback schedule.', 1870, 1904, true);
    if (!layers.some(l => l.enabled && l.type !== 'audio' && !['unresolved', 'invalid-embedded-media'].includes(l.media))) error('NO_EXPORTABLE_VISUAL_LAYER', '/layers', 'No enabled visual layer with restorable media or a rebuild recipe was found.', 1867, 11655);
  }
  const summary = { layers: layers.length, enabledVisualLayers: layers.filter(l => l.enabled && l.type !== 'audio').length, propertyReads: propertyReads.size, errors: diagnostics.filter(d => d.severity === 'error').length, warnings: diagnostics.filter(d => d.severity === 'warning').length };
  return { schema: 'mcbe-geoui-project-inspection@1', ok: summary.errors === 0, complete: !incomplete, evidenceLevel: 'static-project', runtimeVerified: false,
    format: 'GeouiStudio saved project v6', sourceEvidence: GEOUI_SOURCE, summary,
    exportContract: { namespace, mode: rpOnly ? 'resource-pack-only' : 'resource-and-behavior-pack', modeBasis: 'saved settings; selected mcpack/mcworld export can override rpOnly', scriptExpected: needScript, sceneAddressing: 'array-index', visualInputOwner: 'not supplied by geometry; use explicit JSON UI/BP input', propertyReads: [...propertyReads.values()],
      overrides: ['ui/hud_screen.json:hud_content', 'entity/player.entity.json', ...(!rpOnly ? ['entities/player.json'] : [])],
      lifecycle: needScript ? 'Pinned play() changes the camera; finish() and disconnect cleanup need separate lifecycle review. Prior camera ownership is not restored by a project inspection.' : 'Lifetime-driven rendering; screen coverage and reload behavior require the target client.' },
    layers, diagnostics, limitations: ['No upstream JavaScript, recipes, commands, Molang or media are executed.', 'PNG signatures and dimensions are checked, not image decoding, alpha pixels or texture appearance.', 'This checks declared project/export contracts, not produced files, pack stacking, input behavior or Bedrock compatibility.'] };
}

function inspectAtlas(media, path, error, warn) {
  if (!record(media) || !record(media.plan) || !Array.isArray(media.pages) || !media.pages.length || media.pages.length > 4096) { error('ATLAS_STRUCTURE_INVALID', path, 'Expected embedded pages and their atlas plan (at most 4096 pages).', 11240, 11244); return false; }
  const plan = media.plan, fields = ['cols', 'rows', 'perPage', 'pages', 'pageW', 'pageH'];
  if (fields.some(k => !integer(plan[k]) || plan[k] <= 0) || ['frames', 'frameW', 'frameH'].some(k => !integer(media[k]) || media[k] <= 0)) { error('ATLAS_DIMENSIONS_INVALID', path, 'Atlas counts and dimensions must be positive safe integers.', 1844, 1849); return false; }
  let valid = true;
  if (plan.perPage !== plan.cols * plan.rows || plan.pageW !== plan.cols * media.frameW || plan.pageH !== plan.rows * media.frameH || plan.pages !== Math.ceil(media.frames / plan.perPage) || media.pages.length !== plan.pages) { error('ATLAS_PLAN_MISMATCH', `${path}/plan`, 'Frame dimensions, grid capacity, page count and embedded pages disagree.', 1844, 1849); valid = false; }
  if (!positive(media.fps) || !positive(media.mediaAspect)) { error('ATLAS_TIMING_OR_ASPECT_INVALID', path, 'Expected positive numeric fps and mediaAspect.', 4652, 4657); valid = false; }
  for (const [i, url] of media.pages.entries()) {
    if (typeof url !== 'string' || !url.startsWith('data:image/png;base64,')) { error('EMBEDDED_PNG_REQUIRED', `${path}/pages/${i}`, 'Only embedded PNG data URLs are inspected. Remote/file URLs are never fetched.', 11242, 11294); valid = false; continue; }
    const data = decodeBase64(url.slice(22));
    if (!data || data.length < 33 || !data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || data.readUInt32BE(8) !== 13 || data.toString('ascii', 12, 16) !== 'IHDR') { error('PNG_HEADER_INVALID', `${path}/pages/${i}`, 'Invalid PNG base64/signature/IHDR; image pixels are not decoded.', 11292, 11300); valid = false; continue; }
    if (data.readUInt32BE(16) !== plan.pageW || data.readUInt32BE(20) !== plan.pageH) { error('PNG_ATLAS_SIZE_MISMATCH', `${path}/pages/${i}`, 'Embedded PNG dimensions differ from the saved atlas plan; failed/missing restore pages can shift all subsequent UV page indices.', 11292, 11300); valid = false; }
  }
  if (plan.pageW > 2048 || plan.pageH > 2048) warn('LARGE_ATLAS_DEVICE_CHECK', `${path}/plan`, 'Atlas exceeds the editor warning threshold of 2048. This is a tool warning, not a universal engine limit.', 10290, 10291);
  return valid;
}

function inspectModel(model, path, item, rotX, error, warn) {
  const list = model.geoRaw['minecraft:geometry'];
  if (!Array.isArray(list) || !list.length || !record(list[0])) { error('MODEL_GEOMETRY_MISSING', `${path}/_model/geoRaw`, 'The pinned importer requires a minecraft:geometry array.', 3532, 3534); return; }
  if (list.length > 1) error('MODEL_GEOMETRIES_DISCARDED', `${path}/_model/geoRaw/minecraft:geometry`, 'The pinned exporter keeps only the first geometry. Select/split intentionally before exporting.', 3534, 3568);
  const bones = list[0].bones;
  if (!Array.isArray(bones) || bones.length > 10000) { error('MODEL_BONES_INVALID', `${path}/_model/geoRaw`, 'Expected at most 10000 bones (inspector limit).', 3541); return; }
  const names = new Map();
  const reserved = new Set([`geoui_mroot_${item.exportId}`]);
  if (finite(rotX) && rotX !== 0) reserved.add(`geoui_mroot_${item.exportId}_r`);
  for (const [i, bone] of bones.entries()) {
    if (!record(bone) || typeof bone.name !== 'string' || !bone.name) { error('MODEL_BONE_INVALID', `${path}/_model/geoRaw/minecraft:geometry/0/bones/${i}`, 'Bone name is required.', 3555, 3566); continue; }
    if (names.has(bone.name)) error('MODEL_BONE_DUPLICATE', `${path}/_model/geoRaw/minecraft:geometry/0/bones/${i}/name`, 'Duplicate bone names make parent and animation targets ambiguous.', 3555, 3566);
    if (reserved.has(bone.name)) error('MODEL_GENERATED_ROOT_COLLISION', `${path}/_model/geoRaw/minecraft:geometry/0/bones/${i}/name`, 'This imported bone name collides with a root inserted by the exporter, creating duplicate or self-parented bones.', 3540, 3566);
    names.set(bone.name, bone);
  }
  const visited = new Set();
  for (const [name, bone] of names) {
    if (bone.parent && !names.has(bone.parent)) error('MODEL_PARENT_REWRITTEN', `${path}/_model/geoRaw`, 'A missing bone parent is silently detached/reparented by the pinned exporter.', 3555, 3566);
    const chain = new Set(); let current = name;
    while (current && names.has(current) && !visited.has(current)) {
      if (chain.has(current)) { error('MODEL_PARENT_CYCLE', `${path}/_model/geoRaw`, 'Bone parent cycle prevents a valid hierarchy.', 3555, 3566); break; }
      chain.add(current); current = names.get(current).parent;
    }
    for (const member of chain) visited.add(member);
  }
  item.modelBones = bones.length;
  if (!model.tex) warn('MODEL_WHITE_TEXTURE_FALLBACK', `${path}/_model/tex`, 'No embedded model texture; export falls back to a white texture unless a generated palette supplies it.', 11647);
  else if (!decodeBase64(model.tex)) error('MODEL_TEXTURE_BASE64_INVALID', `${path}/_model/tex`, 'Embedded model texture is not valid base64.', 11303, 11304);
  if (model.animList !== undefined) {
    if (!Array.isArray(model.animList) || model.animList.some(id => typeof id !== 'string')) error('MODEL_ANIMATION_LIST_INVALID', `${path}/_model/animList`, 'Expected animation identifier strings.', 11649, 11652);
    else for (const id of model.animList) if (!record(model.animRaw?.animations?.[id])) error('MODEL_ANIMATION_MISSING', `${path}/_model/animList`, 'Selected model animation has no embedded definition.', 11649, 11652);
  }
}

export async function inspectGeoUiFile(input) {
  if (typeof input !== 'string' || !input) throw new Error('--input is required');
  const path = await realpath(resolve(input)), info = await stat(path);
  if (!info.isFile() || info.size > MAX_INPUT_BYTES) throw new Error('Input must be a regular project file of at most 64 MiB (inspector limit)');
  const bytes = await readFile(path);
  if (bytes.length > MAX_INPUT_BYTES) throw new Error('Input exceeds 64 MiB');
  let project;
  try { project = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error('Input is not valid native project JSON'); }
  return { ...inspectGeoUiProject(project), input: { path, bytes: bytes.length, sha256: sha256(bytes) } };
}

export function boundedGeoUiReport(report, maxChars = 6000) {
  if (!integer(maxChars) || maxChars < 1000 || maxChars > 64000) throw new Error('max-chars must be an integer from 1000 to 64000');
  const out = structuredClone(report);
  out.diagnostics.sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
  out.omitted = { layers: 0, diagnostics: 0, propertyReads: 0 };
  const length = () => JSON.stringify(out).length + 1;
  const trim = (owner, key) => {
    if (length() <= maxChars || !owner[key].length) return;
    const all = owner[key];
    const keep = count => { owner[key] = all.slice(0, count); out.omitted[key] = all.length - count; };
    keep(0);
    if (length() > maxChars) return;
    let low = 0, high = all.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2); keep(middle);
      if (length() <= maxChars) low = middle; else high = middle - 1;
    }
    keep(low);
  };
  trim(out, 'layers');
  trim(out.exportContract, 'propertyReads');
  trim(out, 'diagnostics');
  if (length() > maxChars) throw new Error('Output budget is too small for provenance and boundaries; increase --max-chars');
  return out;
}

export async function writeGeoUiReport(path, report) {
  // Exclusive creation preserves originals, including symlink/hardlink aliases.
  await writeFile(resolve(path), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
}
