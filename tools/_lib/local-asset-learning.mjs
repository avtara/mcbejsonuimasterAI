import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, extname, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripJsonComments, stripJsonTrailingCommas } from './jsonc.mjs';

export const LEARNING_VERSION = 'mcbe-local-asset-learning@1';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const excludedParts = new Set(['.git', 'node_modules', 'workspace', 'generated', 'dist', 'build', '.next', '.cache', 'cache']);
const needs = ['ui', 'geometry', 'attachable', 'material', 'texture-state', 'nine-slice', 'entity', 'animation', 'render-controller'];
const roles = ['form', 'inventory', 'hud', 'wearable', 'entity', 'generic'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const slash = value => value.replaceAll('\\', '/');
const inside = (root, path) => { const rel = relative(root, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`); };
const excluded = path => slash(path).split('/').some(part => excludedParts.has(part.toLowerCase()));
const count = (map, key) => { map[key] = (map[key] ?? 0) + 1; };
const pathKey = (source, path) => `${source}\0${path.toLowerCase()}`;
const safePath = (root, subpath) => {
  if (typeof subpath !== 'string' || isAbsolute(subpath) || slash(subpath).split('/').some(p => p === '..' || p === '.' || !p)) throw new Error('Unsafe indexed relative path');
  const target = resolve(root, subpath);
  if (!inside(root, target)) throw new Error('Indexed path escapes its source');
  return target;
};
const json = bytes => JSON.parse(stripJsonTrailingCommas(stripJsonComments(bytes.toString('utf8').replace(/^\uFEFF/, ''))));

async function parallel(items, action, concurrency = 8) {
  let next = 0;
  const result = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next++; result[index] = await action(items[index], index); }
  }));
  return result;
}

// Read-only discovery supplements the old index, whose extension allowlist omits .material.
async function materialFiles(root) {
  const pending = [root], found = [];
  while (pending.length) {
    const dir = pending.pop();
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if (item.isSymbolicLink() || excludedParts.has(item.name.toLowerCase())) continue;
      const path = resolve(dir, item.name);
      if (item.isDirectory()) pending.push(path);
      else if (item.isFile() && extname(item.name).toLowerCase() === '.material') found.push(slash(relative(root, path)));
    }
  }
  return found.sort();
}

// Content determines the type; directory names only locate existing indexed candidates.
export function extractLocalAssetFacts(document) {
  const features = new Set(), foundRoles = new Set(), facts = {}, definitions = [], references = [];
  const ref = (kind, target) => { if (typeof target === 'string' && target) references.push({ kind, target }); };
  const def = (kind, id) => { if (typeof id === 'string' && id) definitions.push({ kind, id }); };
  if (!record(document)) return { features: [], roles: ['generic'], facts, definitions, references };
  if (typeof document.namespace === 'string') {
    features.add('ui'); facts.controlTypes = {}; facts.stateProperties = {}; facts.bindings = 0; facts.collections = 0;
    for (const [name, value] of Object.entries(document)) if (record(value)) def('ui', `${document.namespace}.${name.split('@')[0]}`);
    const stack = [document];
    const knownTypes = new Set(['panel', 'stack_panel', 'collection_panel', 'grid', 'button', 'toggle', 'image', 'label', 'custom', 'screen', 'edit_box', 'scroll_view', 'slider']);
    while (stack.length) {
      const value = stack.pop();
      if (!record(value) && !Array.isArray(value)) continue;
      for (const [key, child] of Object.entries(value)) {
        if (record(child) || Array.isArray(child)) stack.push(child);
        if (key.includes('@')) ref('ui', key.slice(key.indexOf('@') + 1));
        if (key === 'type' && typeof child === 'string') count(facts.controlTypes, knownTypes.has(child) ? child : 'other');
        if (['default_control', 'hover_control', 'pressed_control', 'locked_control', 'focus_control'].includes(key)) { count(facts.stateProperties, key); features.add('texture-state'); }
        if (key === 'bindings' && Array.isArray(child)) facts.bindings += child.length;
        if (key === 'collection_name' && typeof child === 'string') { facts.collections++; if (child === 'form_buttons' || child === 'custom_form') foundRoles.add('form'); if (child === 'container_items') foundRoles.add('inventory'); }
        if (key === 'binding_name' && typeof child === 'string' && /^#hud_/.test(child)) foundRoles.add('hud');
        if (typeof child === 'string' && (key === 'texture' || /texture(?:\|default)?$/.test(key))) ref('texture', child);
      }
    }
  }
  if (Object.hasOwn(document, 'nineslice_size') || Object.hasOwn(document, 'base_size')) {
    features.add('nine-slice');
    const shape = value => Array.isArray(value) ? `array-${value.length}` : typeof value;
    facts.nineSliceShape = shape(document.nineslice_size); facts.baseSizeShape = shape(document.base_size);
    if (Array.isArray(document.base_size) && document.base_size.length === 2 && document.base_size.every(v => typeof v === 'number' && Number.isFinite(v))) facts.baseSize = document.base_size;
  }
  const geometries = Array.isArray(document['minecraft:geometry']) ? document['minecraft:geometry'].filter(record).map(geometry => ({ geometry, parent: null })) : [];
  for (const [name, value] of Object.entries(document)) if (name.startsWith('geometry.') && record(value)) {
    const colon = name.indexOf(':');
    geometries.push({ geometry: { ...value, description: { identifier: colon < 0 ? name : name.slice(0, colon) } }, parent: colon < 0 ? null : name.slice(colon + 1) });
  }
  if (geometries.length) {
    features.add('geometry'); facts.geometries = geometries.length; facts.bones = 0; facts.cubes = 0; facts.perFaceUvCubes = 0; facts.flatCubes = 0; facts.missingBoneParents = 0; facts.inheritedGeometries = 0;
    for (const { geometry, parent } of geometries) {
      def('geometry', geometry.description?.identifier);
      if (parent) { ref('geometry', parent); facts.inheritedGeometries++; }
      const bones = Array.isArray(geometry.bones) ? geometry.bones.filter(record) : [], names = new Set(bones.map(b => b.name));
      facts.bones += bones.length;
      for (const bone of bones) {
        // Inherited definitions may get their parent bones from a base; this extractor does not merge them.
        if (!parent && bone.parent && !names.has(bone.parent)) facts.missingBoneParents++;
        for (const cube of Array.isArray(bone.cubes) ? bone.cubes : []) { facts.cubes++; if (record(cube?.uv)) facts.perFaceUvCubes++; if (Array.isArray(cube?.size) && cube.size.includes(0)) facts.flatCubes++; }
      }
    }
  }
  for (const [key, feature, role] of [['minecraft:attachable', 'attachable', 'wearable'], ['minecraft:client_entity', 'entity', 'entity']]) {
    const description = document[key]?.description;
    if (!record(description)) continue;
    features.add(feature); foundRoles.add(role); def(feature, description.identifier);
    for (const kind of ['geometry', 'materials', 'textures', 'animations']) {
      const names = { materials: 'material', textures: 'texture', animations: 'animation' };
      for (const value of Object.values(record(description[kind]) ? description[kind] : {})) ref(kind === 'animations' && typeof value === 'string' && value.startsWith('controller.animation.') ? 'animation-controller' : names[kind] ?? kind, value);
      facts[`${kind}Aliases`] = Object.keys(record(description[kind]) ? description[kind] : {}).length;
    }
    for (const controller of Array.isArray(description.render_controllers) ? description.render_controllers : []) { if (typeof controller === 'string') ref('render-controller', controller); else if (record(controller)) Object.keys(controller).forEach(name => ref('render-controller', name)); }
    for (const controller of Array.isArray(description.animation_controllers) ? description.animation_controllers : []) { if (typeof controller === 'string') ref('animation-controller', controller); else if (record(controller)) Object.values(controller).forEach(name => ref('animation-controller', name)); }
    facts.hasScripts = record(description.scripts);
  }
  for (const [key, feature, kind] of [['render_controllers', 'render-controller', 'render-controller'], ['animations', 'animation', 'animation'], ['animation_controllers', 'animation', 'animation-controller']]) {
    if (!record(document[key])) continue;
    features.add(feature); facts[`${key}Definitions`] = Object.keys(document[key]).length;
    Object.keys(document[key]).forEach(id => def(kind, id));
  }
  if (record(document.materials)) {
    const materials = Object.entries(document.materials).filter(([key, value]) => key !== 'version' && record(value));
    if (materials.length) {
      features.add('material'); facts.materialDefinitions = materials.length; facts.inheritedMaterials = 0; facts.explicitStates = 0;
      for (const [name, value] of materials) {
        const colon = name.indexOf(':'); def('material', colon < 0 ? name : name.slice(0, colon));
        if (colon >= 0) { ref('material', name.slice(colon + 1)); facts.inheritedMaterials++; }
        for (const key of ['states', '+states', '-states']) if (Array.isArray(value[key])) facts.explicitStates += value[key].length;
      }
    }
  }
  const uniqueRefs = [...new Map(references.map(r => [`${r.kind}\0${r.target}`, r])).values()];
  return { features: [...features].sort(), roles: foundRoles.size ? [...foundRoles].sort() : ['generic'], facts, definitions, references: uniqueRefs,
    resourcePackManifest: record(document.header) && typeof document.header.uuid === 'string' && Array.isArray(document.modules) && document.modules.some(m => m?.type === 'resources') };
}

function validCachedExtraction(entry) {
  const value = entry?.extraction;
  const kinds = [...needs, 'animation-controller'];
  return entry?.status === 'verified' && /^[a-f0-9]{64}$/.test(entry.sha256) && record(value)
    && entry.extractionSha256 === sha(JSON.stringify(value))
    && Array.isArray(value.features) && value.features.every(f => needs.includes(f))
    && Array.isArray(value.roles) && value.roles.every(r => roles.includes(r)) && record(value.facts)
    && Array.isArray(value.definitions) && value.definitions.every(d => record(d) && kinds.includes(d.kind) && typeof d.id === 'string')
    && Array.isArray(value.references) && value.references.every(r => record(r) && [...kinds, 'texture'].includes(r.kind) && typeof r.target === 'string');
}

function ownerFor(source, path, manifests) {
  const pack = (manifests.get(source) ?? []).find(prefix => path.startsWith(prefix)) ?? null;
  const suffix = pack === null ? '' : path.slice(pack.length), subpack = /^subpacks\/([^/]+)\//.exec(suffix)?.[1] ?? null;
  return { pack, subpack };
}

export async function learnLocalAssets({ root, limit, cache, concurrency = 8, onProgress = () => {} }) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) throw new Error('concurrency must be 1..12');
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000)) throw new Error('limit must be 1..100000; omit it for full coverage');
  const libraryRoot = await realpath(resolve(root));
  const [indexBytes, configBytes] = await Promise.all([readFile(resolve(libraryRoot, 'indexes/assets.json')), readFile(resolve(libraryRoot, 'config/sources.json'))]);
  const index = JSON.parse(indexBytes), config = JSON.parse(configBytes);
  if (!Array.isArray(index.assets) || !Array.isArray(config)) throw new Error('Expected assets.json assets array and sources.json source array');
  const coverage = { indexedRecords: index.assets.length, excludedRecords: 0, invalidIndexRecords: 0, eligibleTextFiles: 0, discoveredMaterials: 0, selectedFiles: 0, inspectedFiles: 0, hashVerifiedFiles: 0, indexHashMismatches: 0, parseErrors: 0, readErrors: 0, reusedExtractions: 0, learnedFiles: 0, incompleteDiscovery: 0 };
  const sources = new Map();
  for (const item of config) {
    if (!record(item) || typeof item.id !== 'string' || typeof item.path !== 'string' || sources.has(item.id)) throw new Error('Invalid or duplicate source configuration');
    let sourceRoot = null;
    try { sourceRoot = await realpath(item.path); } catch {}
    sources.set(item.id, { id: item.id, neutralId: `source-${sha(item.id).slice(0, 12)}`, kind: item.kind ?? 'unknown', root: sourceRoot, configuredPath: item.path,
    excluded: item.id === 'master-reference' || (sourceRoot && relative(sourceRoot, ROOT) === ''), licenseStatus: 'unverified-source-specific', indexedRecords: 0, indexedCategories: {}, eligibleTextFiles: 0, discoveredMaterials: 0, inspectedFiles: 0, learnedFiles: 0, featureCounts: {} });
  }
  const candidates = [], manifests = new Map(), indexedPaths = new Map();
  for (const item of index.assets) {
    const source = sources.get(item?.sourceId);
    if (!source || typeof item.sourceRelativePath !== 'string') { coverage.invalidIndexRecords++; continue; }
    source.indexedRecords++; count(source.indexedCategories, typeof item.category === 'string' ? item.category : 'unknown');
    if (source.excluded || excluded(item.sourceRelativePath)) { coverage.excludedRecords++; continue; }
    let absolutePath;
    try { absolutePath = safePath(source.root ?? source.configuredPath, item.sourceRelativePath); } catch { coverage.invalidIndexRecords++; continue; }
    const rel = slash(item.sourceRelativePath);
    indexedPaths.set(pathKey(source.id, rel), item);
    if (!['.json', '.jsonc', '.material'].includes(extname(rel).toLowerCase())) continue;
    source.eligibleTextFiles++; candidates.push({ sourceId: source.id, sourceRelativePath: rel, path: absolutePath, indexedSha256: item.sha256, bytes: item.bytes, origin: 'asset-index' });
  }
  for (const source of sources.values()) {
    if (source.excluded || !source.root) continue;
    try {
      for (const rel of await materialFiles(source.root)) {
        if (indexedPaths.has(pathKey(source.id, rel))) continue;
        candidates.push({ sourceId: source.id, sourceRelativePath: rel, path: resolve(source.root, rel), indexedSha256: null, origin: 'material-extension-discovery' });
        source.eligibleTextFiles++; source.discoveredMaterials++; coverage.discoveredMaterials++;
      }
    } catch { coverage.incompleteDiscovery++; }
  }
  coverage.eligibleTextFiles = candidates.length;
  // Explicit sample mode interleaves sources; default processes every eligible text file.
  const groups = [...sources.keys()].map(id => candidates.filter(c => c.sourceId === id).sort((a, b) => a.sourceRelativePath.localeCompare(b.sourceRelativePath)));
  const ordered = [];
  for (let i = 0; groups.some(g => i < g.length); i++) for (const group of groups) if (group[i]) ordered.push(group[i]);
  const selected = limit === undefined ? ordered : ordered.slice(0, limit); coverage.selectedFiles = selected.length;
  const extractionCache = new Map();
  const extractorSha256 = sha(await readFile(fileURLToPath(import.meta.url)));
  if (cache) {
    const cached = JSON.parse(await readFile(cache, 'utf8'));
    if (cached.schema !== LEARNING_VERSION) throw new Error('Unsupported learning cache');
    if (cached.inputs?.extractorSha256 === extractorSha256) for (const entry of Array.isArray(cached.entries) ? cached.entries : []) if (validCachedExtraction(entry)) extractionCache.set(entry.sha256, entry.extraction);
  }
  const cacheKeys = new Set(extractionCache.keys());
  const entries = await parallel(selected, async candidate => {
    const source = sources.get(candidate.sourceId), entry = { ...candidate, neutralId: '', status: 'unread', owner: ownerFor(source.id, candidate.sourceRelativePath, manifests) };
    try {
      if (!source.root) throw new Error('Source is unavailable');
      const actual = await realpath(candidate.path);
      if (!inside(source.root, actual)) throw new Error('Evidence resolves outside its configured source');
      const bytes = await readFile(actual); entry.bytes = bytes.length; entry.sha256 = sha(bytes); entry.neutralId = `asset-${entry.sha256.slice(0, 20)}`;
      coverage.inspectedFiles++; source.inspectedFiles++;
      if (candidate.indexedSha256 !== null && candidate.indexedSha256 !== entry.sha256) { entry.status = 'index-hash-mismatch'; coverage.indexHashMismatches++; return entry; }
      coverage.hashVerifiedFiles++;
      let extraction = extractionCache.get(entry.sha256);
      if (extraction) { coverage.reusedExtractions++; entry.cacheReuse = cacheKeys.has(entry.sha256) ? 'prior-catalog-after-current-hash-check' : 'same-scan-content-hash'; }
      else { extraction = extractLocalAssetFacts(json(bytes)); extractionCache.set(entry.sha256, extraction); }
      entry.extraction = extraction; entry.extractionSha256 = sha(JSON.stringify(extraction)); entry.status = 'verified';
      if (extraction.features.length) { coverage.learnedFiles++; source.learnedFiles++; extraction.features.forEach(kind => count(source.featureCounts, kind)); }
    } catch (error) {
      entry.status = error instanceof SyntaxError ? 'parse-error' : 'read-error';
      coverage[entry.status === 'parse-error' ? 'parseErrors' : 'readErrors']++;
    } finally { if ((coverage.inspectedFiles + coverage.readErrors) % 1000 === 0) onProgress({ inspectedFiles: coverage.inspectedFiles, selectedFiles: selected.length }); }
    return entry;
  }, concurrency);
  // Pack boundaries come from parsed current resource manifests, never a filename alone.
  for (const entry of entries) if (entry.status === 'verified' && entry.extraction.resourcePackManifest && /(^|\/)manifest\.json$/i.test(entry.sourceRelativePath)) {
    const prefix = entry.sourceRelativePath.slice(0, -'manifest.json'.length);
    if (!manifests.has(entry.sourceId)) manifests.set(entry.sourceId, []);
    manifests.get(entry.sourceId).push(prefix);
  }
  for (const prefixes of manifests.values()) prefixes.sort((a, b) => b.length - a.length);
  for (const entry of entries) entry.owner = ownerFor(entry.sourceId, entry.sourceRelativePath, manifests);
  const definitions = new Map();
  for (const entry of entries) if (entry.status === 'verified' && entry.owner.pack !== null) for (const definition of entry.extraction.definitions) {
    const key = JSON.stringify([entry.sourceId, entry.owner.pack, entry.owner.subpack, definition.kind, definition.id]);
    if (!definitions.has(key)) definitions.set(key, []); definitions.get(key).push(entry);
  }
  for (const entry of entries) {
    if (entry.status !== 'verified') continue;
    entry.links = [];
    for (const reference of entry.extraction.references) {
      let targets = [], status = 'unresolved-local';
      if (/^[#$]/.test(reference.target) || reference.target.includes('(')) status = 'dynamic';
      else if (entry.owner.pack === null) status = 'unresolved-owner';
      else if (reference.kind === 'texture') {
        const scopes = entry.owner.subpack ? [`${entry.owner.pack}subpacks/${entry.owner.subpack}/`, entry.owner.pack] : [entry.owner.pack];
        for (const prefix of scopes) {
          targets = ['.png', '.tga', '.jpg', '.jpeg', ''].map(extension => indexedPaths.get(pathKey(entry.sourceId, `${prefix}${reference.target}${extension}`))).filter(Boolean);
          if (targets.length) break;
        }
        if (targets.length) status = 'indexed-target-unverified';
      } else {
        const scopes = entry.owner.subpack ? [entry.owner.subpack, null] : [null];
        for (const subpack of scopes) {
          targets = definitions.get(JSON.stringify([entry.sourceId, entry.owner.pack, subpack, reference.kind, reference.target])) ?? [];
          if (targets.length) break;
        }
        if (targets.length) status = targets.length === 1 ? 'resolved-current-text' : 'ambiguous-current-text';
      }
      entry.links.push({ ...reference, status, targets: targets.map(target => ({ sourceRelativePath: target.sourceRelativePath, sha256: target.sha256 })) });
    }
    if (entry.extraction.features.includes('nine-slice')) {
      const stem = entry.sourceRelativePath.replace(/\.jsonc?$/i, '');
      const image = indexedPaths.get(pathKey(entry.sourceId, `${stem}.png`));
      entry.links.push({ kind: 'sidecar-image', status: image ? 'indexed-target-unverified' : 'unresolved-local', targets: image ? [{ sourceRelativePath: image.sourceRelativePath, sha256: image.sha256 }] : [] });
    }
  }
  const featureCounts = {}, linkCounts = {};
  for (const entry of entries) { for (const feature of entry.extraction?.features ?? []) count(featureCounts, feature); for (const link of entry.links ?? []) count(linkCounts, link.status); }
  return { schema: LEARNING_VERSION, generatedAt: new Date().toISOString(), privateLocalOnly: true, runtimeVerified: false, libraryRoot,
    inputs: { assetIndexSha256: sha(indexBytes), sourceConfigSha256: sha(configBytes), extractorSha256, assetIndexGeneratedAt: index.generatedAt ?? null },
    coverage: { ...coverage, mode: limit === undefined ? 'full-eligible-text' : 'explicit-sample', unselectedFiles: candidates.length - selected.length }, featureCounts, linkCounts,
    limitations: ['Original path/name categories are candidate metadata, not content types.', 'Texture targets are index evidence until their current file hash is checked; no image was decoded.', 'Pack boundaries require a parsed current resource manifest; missing or unsampled manifests leave ownership unresolved.', 'Legacy geometry child:parent keys produce definition/inheritance edges; bone overrides are not merged or validated.', 'Unresolved references may need vanilla dependencies or another active pack. They are not automatically runtime errors.', 'Local source licensing is not inferred; raw provenance and payload identifiers remain private.', 'Only indexed text and discovered .material files are covered; binary data, BP behavior and Bedrock runtime are not validated.'], sources: [...sources.values()], entries };
}

const rules = {
  ui: ['Keep namespace/control ownership and collection ownership explicit.', 'Resolve the registered UI entry before treating a file as an active screen.'],
  geometry: ['Match a geometry identifier within the owning pack and selected subpack.', 'Preserve the bone hierarchy and per-face UV structure; names alone do not establish purpose.'],
  attachable: ['Trace description aliases through geometry, materials, textures and render controllers.', 'Item identity and attachable visibility require separate BP/client evidence.'],
  material: ['Resolve custom material inheritance in the same pack before relying on vanilla bases.', 'Material states and alpha behavior require target-client rendering evidence.'],
  'texture-state': ['Verify default, hover and pressed controls share the intended input and geometry.', 'A referenced state texture is not proof of click or focus behavior.'],
  'nine-slice': ['Keep same-stem image and metadata together and check base size against the image.', 'Scaling behavior is not established by filenames or catalog inclusion.'],
  entity: ['Keep geometry, render-controller and material aliases within their owning entity description.'],
  animation: ['Resolve animation/controller identifiers and transitions against their actual definitions.'],
  'render-controller': ['Resolve controller identifiers from the owning attachable/entity; evaluate aliases and conditions in context.']
};

// Context is a separate allowlist projection: private catalog fields are never forwarded.
function neutralFacts(input) {
  const output = {};
  const numericKeys = ['bindings', 'collections', 'geometries', 'inheritedGeometries', 'bones', 'cubes', 'perFaceUvCubes', 'flatCubes', 'missingBoneParents', 'geometryAliases', 'materialsAliases', 'texturesAliases', 'animationsAliases', 'render_controllersDefinitions', 'animationsDefinitions', 'animation_controllersDefinitions', 'materialDefinitions', 'inheritedMaterials', 'explicitStates'];
  for (const key of numericKeys) if (Number.isSafeInteger(input?.[key]) && input[key] >= 0) output[key] = input[key];
  for (const key of ['nineSliceShape', 'baseSizeShape']) if (/^(number|string|undefined|object|boolean|array-\d+)$/.test(input?.[key])) output[key] = input[key];
  if (Array.isArray(input?.baseSize) && input.baseSize.length === 2 && input.baseSize.every(n => typeof n === 'number' && Number.isFinite(n))) output.baseSize = input.baseSize;
  if (typeof input?.hasScripts === 'boolean') output.hasScripts = input.hasScripts;
  for (const [group, keys] of [['controlTypes', ['panel', 'stack_panel', 'collection_panel', 'grid', 'button', 'toggle', 'image', 'label', 'custom', 'screen', 'edit_box', 'scroll_view', 'slider', 'other']], ['stateProperties', ['default_control', 'hover_control', 'pressed_control', 'locked_control', 'focus_control']]]) {
    if (!record(input?.[group])) continue;
    output[group] = {};
    for (const key of keys) if (Number.isSafeInteger(input[group][key]) && input[group][key] >= 0) output[group][key] = input[group][key];
  }
  return output;
}

export function localAssetContext(catalog, { need, role, limit = 3, maxChars = 6000 } = {}) {
  if (catalog?.schema !== LEARNING_VERSION || catalog.privateLocalOnly !== true) throw new Error('Unsupported learning catalog');
  if (!needs.includes(need)) throw new Error(`need must be one of: ${needs.join(', ')}`);
  if (role !== undefined && !roles.includes(role)) throw new Error(`role must be one of: ${roles.join(', ')}`);
  if (!Number.isInteger(limit) || limit < 0 || limit > 10) throw new Error('limit must be 0..10');
  if (!Number.isInteger(maxChars) || maxChars < 1000 || maxChars > 16000) throw new Error('max-chars must be 1000..16000');
  if (!Array.isArray(catalog.entries) || !record(catalog.coverage)) throw new Error('Invalid learning catalog structure');
  const matching = catalog.entries.filter(e => e?.status === 'verified' && /^[a-f0-9]{64}$/.test(e.sha256) && Array.isArray(e.extraction?.features) && e.extraction.features.includes(need) && Array.isArray(e.extraction.roles) && (!role || e.extraction.roles.includes(role)));
  const unique = [...new Map(matching.map(e => [e.sha256, e])).values()];
  const cards = unique.slice(0, limit).map(entry => {
    const links = {}; for (const link of Array.isArray(entry.links) ? entry.links : []) if (['dynamic', 'unresolved-owner', 'unresolved-local', 'indexed-target-unverified', 'resolved-current-text', 'ambiguous-current-text'].includes(link?.status)) count(links, link.status);
    return { id: `asset-${entry.sha256.slice(0, 20)}`, sha256: entry.sha256, bytes: Number.isSafeInteger(entry.bytes) ? entry.bytes : null, features: entry.extraction.features.filter(f => needs.includes(f)), roles: entry.extraction.roles.filter(r => roles.includes(r)), facts: neutralFacts(entry.extraction.facts), links, evidence: 'current-text-sha256-verified-at-scan', runtimeVerified: false };
  });
  const coverage = {};
  for (const key of ['indexedRecords', 'excludedRecords', 'invalidIndexRecords', 'eligibleTextFiles', 'discoveredMaterials', 'selectedFiles', 'inspectedFiles', 'hashVerifiedFiles', 'indexHashMismatches', 'parseErrors', 'readErrors', 'reusedExtractions', 'learnedFiles', 'incompleteDiscovery', 'unselectedFiles']) if (Number.isSafeInteger(catalog.coverage[key]) && catalog.coverage[key] >= 0) coverage[key] = catalog.coverage[key];
  coverage.mode = ['full-eligible-text', 'explicit-sample'].includes(catalog.coverage.mode) ? catalog.coverage.mode : 'unknown';
  const output = { schema: 'mcbe-local-asset-context@1', need, ...(role ? { role } : {}), runtimeVerified: false, redistribution: 'neutral-derived-metadata-only', coverage,
    matchingFiles: matching.length, matchingUniqueHashes: unique.length, cards, omittedCards: unique.length - cards.length, rules: rules[need], limitations: ['No raw paths, source names, identifiers or source content are included.', 'Local source permissions remain unverified; these patterns do not grant asset reuse rights.', 'The catalog is a scan snapshot; current file hashes must be checked again before reuse.'] };
  while (JSON.stringify(output).length + 1 > maxChars && output.cards.length) { output.cards.pop(); output.omittedCards++; }
  if (JSON.stringify(output).length + 1 > maxChars) throw new Error('Output budget is too small for coverage and boundaries; increase max-chars');
  return output;
}

export async function localAssetEvidence(catalog, { id, limit = 8, maxChars = 6000 } = {}) {
  if (catalog?.schema !== LEARNING_VERSION || catalog.privateLocalOnly !== true || !Array.isArray(catalog.entries) || !Array.isArray(catalog.sources)) throw new Error('Unsupported learning catalog');
  if (!/^asset-[a-f0-9]{20}$/.test(id)) throw new Error('id must be a neutral asset ID from context');
  if (!Number.isInteger(limit) || limit < 0 || limit > 50) throw new Error('limit must be 0..50');
  if (!Number.isInteger(maxChars) || maxChars < 1000 || maxChars > 16000) throw new Error('max-chars must be 1000..16000');
  const matches = catalog.entries.filter(e => e?.status === 'verified' && /^[a-f0-9]{64}$/.test(e.sha256) && `asset-${e.sha256.slice(0, 20)}` === id);
  if (!matches.length) throw new Error('Evidence ID was not found');
  if (new Set(matches.map(e => e.sha256)).size !== 1) throw new Error('Neutral ID is ambiguous; use a fresh catalog');
  // Context deduplicates by content hash and retains the last occurrence.
  const entry = matches.at(-1), source = catalog.sources.find(s => s.id === entry.sourceId);
  if (!source?.root || source.excluded || !record(entry.extraction) || !record(entry.owner)) throw new Error('Evidence provenance is unavailable');
  const sourceRoot = await realpath(source.root);
  const verify = async item => {
    const path = await realpath(safePath(sourceRoot, item.sourceRelativePath));
    if (!inside(sourceRoot, path)) throw new Error('Evidence resolves outside its registered source');
    const bytes = await readFile(path);
    if (sha(bytes) !== item.sha256) throw new Error('Evidence is stale; current file hash does not match the catalog');
    return { path, sha256: item.sha256, bytes: bytes.length };
  };
  const current = await verify(entry);
  let manifest = null;
  if (entry.owner.pack !== null) {
    if (typeof entry.owner.pack !== 'string' || !entry.sourceRelativePath.startsWith(entry.owner.pack)) throw new Error('Invalid evidence pack boundary');
    const owner = catalog.entries.find(e => e.sourceId === entry.sourceId && e.sourceRelativePath === `${entry.owner.pack}manifest.json` && e.status === 'verified' && e.extraction?.resourcePackManifest === true);
    if (!owner) throw new Error('Evidence manifest is unavailable');
    manifest = await verify(owner);
  }
  const allLinks = Array.isArray(entry.links) ? entry.links : [];
  const links = allLinks.slice(0, limit).map(link => ({ kind: link.kind, target: link.target, statusAtScan: link.status,
    targets: Array.isArray(link.targets) ? link.targets.slice(0, 3) : [], omittedTargets: Math.max(0, (link.targets?.length ?? 0) - 3) }));
  const result = { schema: 'mcbe-local-asset-evidence@1', privacy: 'local-only', id, runtimeVerified: false,
    evidence: 'selected-source-current-sha256-verified', manifestVerification: manifest ? 'current-sha256-verified' : 'unresolved-owner', ...current, sourceId: entry.sourceId,
    owner: { ...entry.owner, manifest }, duplicateContentOccurrences: matches.length, omittedOccurrences: matches.length - 1,
    facts: neutralFacts(entry.extraction.facts), links, omittedLinks: allLinks.length - links.length,
    limitations: ['Private source paths and reference identifiers must not be copied into public output.', 'Linked targets are scan evidence and have not been rechecked by this command.', 'Current hashes establish provenance only, not license permission, schema validity or runtime behavior.'] };
  while (JSON.stringify(result).length + 1 > maxChars && result.links.length) { result.links.pop(); result.omittedLinks++; }
  if (JSON.stringify(result).length + 1 > maxChars) throw new Error('Output budget is too small for evidence and boundaries; increase max-chars');
  return result;
}

export async function writeLocalLearningCatalog(outputPath, catalog, { workspace = resolve(ROOT, 'workspace') } = {}) {
  const base = await realpath(workspace), output = resolve(outputPath);
  if (!inside(base, output) || output === base) throw new Error('Private learning output must stay under the repository workspace');
  let ancestor = dirname(output);
  while (true) { try { ancestor = await realpath(ancestor); break; } catch (error) { if (error.code !== 'ENOENT') throw error; const parent = dirname(ancestor); if (parent === ancestor) throw error; ancestor = parent; } }
  if (!inside(base, ancestor)) throw new Error('Private output parent escapes the workspace through a symlink');
  await mkdir(dirname(output), { recursive: true });
  if (!inside(base, await realpath(dirname(output)))) throw new Error('Private output parent escapes workspace');
  await writeFile(output, `${JSON.stringify(catalog)}\n`, { flag: 'wx' });
}
