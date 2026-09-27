import { readdir, readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, join, extname, isAbsolute } from 'node:path';
import { stripJsonComments, stripJsonTrailingCommas } from './jsonc.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
// Check the JSON shape only; primitive conditions are never evaluated here.
const condition = value => text(value) || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean';
const norm = value => value.replaceAll('\\', '/');
const pointer = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
const limits = { files: 50000, jsonBytes: 8 * 1024 * 1024, totalBytes: 256 * 1024 * 1024, edges: 100000 };

/** Read-only RP graph. Expression evaluation and Bedrock rendering are intentionally absent. */
export async function inspectAttachableGraph({ rp, bp, vanilla } = {}) {
  if (typeof rp !== 'string' || !rp) throw new Error('--rp is required');
  const roots = [];
  for (const [pack, root] of [['rp', rp], ['bp', bp], ['vanilla', vanilla]]) {
    if (root === undefined) continue;
    if (typeof root !== 'string' || !root || !(await lstat(root)).isDirectory()) throw new Error(`${pack} must be an existing directory`);
    roots.push({ pack, root: await realpath(root) });
  }
  if (new Set(roots.map(r => process.platform === 'win32' ? r.root.toLowerCase() : r.root)).size !== roots.length) throw new Error('RP, BP and vanilla roots must be distinct');
  const nodes = [], edges = [], diagnostics = [], owners = [], documents = [], perspectiveReferences = [];
  const registry = new Map(), assetFiles = new Map();
  let fileCount = 0, totalBytes = 0;
  const add = (severity, code, file, path, message) => diagnostics.push({ severity, code, file, path, message });
  const node = (pack, file, kind, name, value, path) => {
    const id = `${pack}:${kind}:${name}`, record = { id, pack, kind, name, file, path, value };
    if (registry.has(id)) add('error', 'DUPLICATE_IDENTIFIER', `${pack}/${file}`, path, `Duplicate ${kind} identifier: ${name}`);
    else { registry.set(id, record); nodes.push({ id, pack, kind, name, file, path }); }
    return record;
  };
  for (const { pack, root } of roots) {
    const pending = [root];
    while (pending.length) {
      const directory = pending.pop();
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = join(directory, entry.name), file = norm(relative(root, full));
        if (++fileCount > limits.files) throw new Error('File resource limit exceeded');
        if (entry.isSymbolicLink()) { add('warning', 'SYMLINK_SKIPPED', `${pack}/${file}`, '', 'Symlink was not followed; graph coverage is incomplete.'); continue; }
        if (entry.isDirectory() && file === 'subpacks') { add('warning', 'SUBPACKS_SKIPPED', `${pack}/${file}`, '', 'Subpack alternatives were not merged into the base pack. Select and inspect the installed variant separately.'); continue; }
        if (entry.isDirectory()) { pending.push(full); continue; }
        if (!entry.isFile()) continue;
        assetFiles.set(`${pack}:${file}`, true);
        if (!['.json', '.jsonc', '.material'].includes(extname(file).toLowerCase())) continue;
        const size = (await lstat(full)).size;
        if (size > limits.jsonBytes || (totalBytes += size) > limits.totalBytes) throw new Error('JSON resource limit exceeded');
        let doc;
        try {
          const data = await readFile(full, 'utf8');
          if (Buffer.byteLength(data) > limits.jsonBytes) throw new Error('File grew beyond resource limit');
          doc = JSON.parse(stripJsonTrailingCommas(stripJsonComments(data.replace(/^\uFEFF/, ''))));
          if (!object(doc)) throw new Error('Root must be an object');
        } catch (error) { add('error', 'JSON_PARSE', `${pack}/${file}`, '', String(error.message).slice(0, 180)); continue; }
        documents.push({ pack, file, doc });
        if (pack === 'bp') {
          const item = doc['minecraft:item']?.description;
          if (typeof item?.identifier === 'string') node(pack, file, 'item', item.identifier, doc['minecraft:item'], '/minecraft:item');
          const entity = doc['minecraft:entity']?.description;
          if (typeof entity?.identifier === 'string') {
            node(pack, file, 'entity', entity.identifier, entity, '/minecraft:entity/description');
            for (const [key, value] of Object.entries(object(entity.properties) ? entity.properties : {})) node(pack, file, 'entity-property', `${entity.identifier}#${key}`, value, `/minecraft:entity/description/properties/${pointer(key)}`);
          }
          continue;
        }
        if (doc['minecraft:geometry'] !== undefined && !Array.isArray(doc['minecraft:geometry'])) add('error', 'GEOMETRY_ARRAY', `${pack}/${file}`, '/minecraft:geometry', 'Expected a geometry array');
        for (const [i, geo] of (Array.isArray(doc['minecraft:geometry']) ? doc['minecraft:geometry'] : []).entries()) {
          if (!object(geo) || !object(geo.description) || !text(geo.description.identifier)) add('error', 'GEOMETRY_DEFINITION', `${pack}/${file}`, `/minecraft:geometry/${i}`, 'Geometry requires an object description and nonempty identifier');
          else node(pack, file, 'geometry', geo.description.identifier, geo, `/minecraft:geometry/${i}`);
        }
        // Legacy geometry stores child:parent in the top-level key. Only links are
        // resolved; inherited bones, reset and inflate are not merged or rendered.
        for (const [name, value] of Object.entries(doc)) if (name.startsWith('geometry.')) {
          const parts = name.split(':');
          if (!object(value) || parts.length > 2 || parts.some(part => !text(part))) { add('error', 'GEOMETRY_DEFINITION', `${pack}/${file}`, `/${pointer(name)}`, 'Legacy geometry requires an object body and child or child:parent key'); continue; }
          const record = node(pack, file, 'geometry', parts[0], value, `/${pointer(name)}`);
          record.inheritedFrom = parts[1];
        }
        for (const [key, kind] of [['animations', 'animation'], ['animation_controllers', 'animation-controller'], ['render_controllers', 'render-controller'], ['materials', 'material']]) {
          if (doc[key] !== undefined && !object(doc[key])) { add('error', 'DEFINITION_MAP', `${pack}/${file}`, `/${key}`, `${key} must be an object`); continue; }
          for (const [name, value] of Object.entries(doc[key] || {})) {
            if (key === 'materials' && name === 'version') continue;
            if (!text(name) || !object(value)) { add('error', 'DEFINITION_BODY', `${pack}/${file}`, `/${key}/${pointer(name)}`, `${kind} requires a nonempty name and object body`); continue; }
            if (kind === 'material' && (name.split(':').length > 2 || name.split(':').some(part => !text(part)))) { add('error', 'MATERIAL_INHERITANCE', `${pack}/${file}`, `/${key}/${pointer(name)}`, 'Expected material or material:parent'); continue; }
            const actual = kind === 'material' ? name.split(':')[0] : name;
            node(pack, file, kind, actual, value, `/${key}/${pointer(name)}`);
          }
        }
        for (const [key, kind] of [['minecraft:attachable', 'attachable'], ['minecraft:client_entity', 'client-entity']]) {
          if (!Object.hasOwn(doc, key)) continue;
          if (!object(doc[key])) { add('error', 'DEFINITION_BODY', `${pack}/${file}`, `/${key}`, 'Render owner must have an object body'); continue; }
          const description = doc[key].description;
          if (!object(description) || !text(description.identifier)) { add('error', 'OWNER_IDENTIFIER', `${pack}/${file}`, `/${key}/description`, 'Expected a description with a nonempty identifier'); continue; }
          const record = node(pack, file, kind, description.identifier, description, `/${key}/description`);
          if (pack === 'rp') owners.push(record);
        }
      }
    }
  }
  const lookup = (kind, name) => registry.get(`rp:${kind}:${name}`) || registry.get(`vanilla:${kind}:${name}`);
  const edge = (from, kind, target, path, status, to, message) => {
    if (edges.length >= limits.edges) throw new Error('Edge resource limit exceeded');
    edges.push({ from: from.id, kind, target, path, status, ...(to ? { to: to.id || to } : {}) });
    if (status !== 'resolved') add(status === 'unresolved' ? 'error' : 'warning', status === 'dynamic' ? 'DYNAMIC_REFERENCE' : status === 'external-unverified' ? 'EXTERNAL_UNVERIFIED' : 'UNRESOLVED_REFERENCE', `${from.pack}/${from.file}`, path, message || `${kind}: ${String(target).slice(0, 160)}`);
    return to;
  };
  const resource = (from, kind, target, path) => {
    if (typeof target !== 'string' || !target) return edge(from, kind, target, path, 'unresolved', null, 'Resource reference must be a nonempty string');
    if (/[?$;()\[\]]/.test(target)) return edge(from, kind, target, path, 'dynamic', null, 'Expression resource selection requires runtime evaluation');
    if (kind === 'texture') {
      const clean = norm(target);
      if (isAbsolute(clean) || /^[a-z]:/i.test(clean) || clean.split('/').some(v => v === '..' || v === '')) return edge(from, kind, target, path, 'unresolved', null, 'Texture path must stay within a pack');
      const candidates = ['.tga', '.png', '.jpg', '.jpeg'].includes(extname(clean).toLowerCase()) ? [clean] : ['.tga', '.png', '.jpg', '.jpeg'].map(extension => clean + extension);
      for (const pack of ['rp', 'vanilla']) for (const file of candidates) if (assetFiles.has(`${pack}:${file}`)) return edge(from, kind, target, path, 'resolved', `${pack}:file:${file}`);
      return edge(from, kind, target, path, 'unresolved', null, 'Texture file was not found in RP or supplied vanilla root');
    }
    const found = lookup(kind, target);
    if (found) return edge(from, kind, target, path, 'resolved', found);
    // Built-in materials are often supplied by the engine, outside a resource-pack mirror.
    return edge(from, kind, target, path, kind === 'material' ? 'external-unverified' : 'unresolved', null, kind === 'material' ? `Material ${target} has no definition in the supplied sources; built-in availability is unverified` : undefined);
  };
  for (const owner of owners) {
    const d = owner.value, maps = {};
    const propertySeen = new Set();
    const properties = (from, value, path) => {
      const pending = [[value, path]];
      while (pending.length) {
        const [current, at] = pending.pop();
        if (Array.isArray(current) || object(current)) { for (const [k, child] of Object.entries(current)) pending.push([child, `${at}/${pointer(k)}`]); continue; }
        if (typeof current !== 'string') continue;
        let remaining = current;
        for (const match of current.matchAll(/\b(?:q|query)\.property\s*\(\s*(['"])([^'"]+)\1\s*\)/gi)) {
          remaining = remaining.replace(match[0], '');
          const key = match[2], identity = `${from.id}:${at}:${key}`;
          if (propertySeen.has(identity)) continue; propertySeen.add(identity);
          const target = owner.kind === 'client-entity' ? registry.get(`bp:entity-property:${owner.name}#${key}`) : undefined;
          if (target) {
            edge(from, 'entity-property', key, at, target.value?.client_sync === true ? 'resolved' : 'unresolved', target.value?.client_sync === true ? target : null, 'RP property requires client_sync:true on the matching BP entity property');
          } else {
            const unresolved = bp && owner.kind === 'client-entity' && !key.startsWith('minecraft:');
            edge(from, 'entity-property', key, at, unresolved ? 'unresolved' : 'external-unverified', null, unresolved ? `Property ${key} is absent on BP entity ${owner.name}` : 'Property source/owner is unavailable in supplied inputs');
          }
        }
        if (/\b(?:q|query)\.property\s*\(/i.test(remaining)) edge(from, 'entity-property', remaining.slice(0, 160), at, 'dynamic', null, 'Property name is computed; no key was inferred');
      }
    };
    properties(owner, d, owner.path);
    for (const [property, kind] of [['geometry', 'geometry'], ['textures', 'texture'], ['materials', 'material'], ['animations', 'animation']]) {
      if (d[property] !== undefined && !object(d[property])) add('error', 'ALIAS_MAP', `${owner.pack}/${owner.file}`, `${owner.path}/${property}`, `${property} must be an object`);
      maps[kind] = object(d[property]) ? d[property] : {};
      for (const [alias, target] of Object.entries(maps[kind])) {
        const actual = kind === 'animation' && typeof target === 'string' && target.startsWith('controller.animation.') ? 'animation-controller' : kind;
        resource(owner, actual, target, `${owner.path}/${property}/${pointer(alias)}`);
        if (kind === 'animation' && typeof target === 'string') { const animation = lookup(actual, target); if (animation) properties(animation, animation.value, animation.path); }
      }
    }
    const alias = (from, kind, name, path) => {
      const key = Object.keys(maps[kind] || {}).find(key => key.toLowerCase() === String(name).toLowerCase());
      if (key === undefined) { edge(from, `${kind}-alias`, name, path, 'unresolved', null, `Missing ${kind} alias ${name} in owner ${owner.name}`); return; }
      edge(from, `${kind}-alias`, name, path, 'resolved', owner);
      return maps[kind][key];
    };
    if (owner.kind === 'attachable') {
      const itemIds = [];
      if (d.item === undefined) itemIds.push(owner.name);
      else if (text(d.item)) itemIds.push(d.item);
      else if (object(d.item) && Object.keys(d.item).length) {
        for (const [itemId, expression] of Object.entries(d.item)) {
          if (!text(itemId) || !condition(expression)) add('error', 'ITEM_SELECTOR', `rp/${owner.file}`, `${owner.path}/item/${pointer(itemId)}`, 'Item selector requires a nonempty identifier and primitive condition');
          else itemIds.push(itemId);
        }
      } else add('error', 'ITEM_SELECTOR', `rp/${owner.file}`, owner.path + '/item', 'Explicit item must be a nonempty identifier or condition map');
      for (const itemId of itemIds) {
        const item = registry.get(`bp:item:${itemId}`);
        const missingCustom = bp && !itemId.startsWith('minecraft:');
        const itemPath = d.item === undefined ? '/identifier' : object(d.item) ? `/item/${pointer(itemId)}` : '/item';
        edge(owner, 'item', itemId, owner.path + itemPath, item ? 'resolved' : missingCustom ? 'unresolved' : 'external-unverified', item, missingCustom ? 'No matching BP item in supplied BP' : 'Item declaration is outside supplied BP; built-in availability is unverified');
      }
    }
    if (owner.kind === 'client-entity' && owner.name === 'minecraft:player') {
      add('warning', 'PLAYER_OVERRIDE', `rp/${owner.file}`, owner.path, 'Player client entity ownership requires a version-matched merge and final pack-order runtime verification');
      if (d.enable_attachables !== true) add('warning', 'ATTACHABLES_ENABLE_UNVERIFIED', `rp/${owner.file}`, owner.path + '/enable_attachables', 'Player override does not explicitly enable attachables');
    }
    const queue = [], visited = new Set();
    const animationRef = (from, name, path) => {
      const target = alias(from, 'animation', name, path);
      if (typeof target === 'string' && target.startsWith('controller.animation.')) { const found = lookup('animation-controller', target); if (found) queue.push(found); }
    };
    const conditionalList = (list, from, path, cb) => {
      if (list === undefined) return;
      if (!Array.isArray(list)) { add('error', 'REFERENCE_LIST', `${from.pack}/${from.file}`, path, 'Expected a list of strings or single-key condition objects'); return; }
      list.forEach((entry, i) => {
        if (text(entry)) cb(entry, `${path}/${i}`);
        else if (object(entry) && Object.keys(entry).length === 1) {
          const [name, expression] = Object.entries(entry)[0];
          if (!text(name) || !condition(expression)) { add('error', 'REFERENCE_ENTRY', `${from.pack}/${from.file}`, `${path}/${i}`, 'Expected a nonempty reference with a primitive condition'); return; }
          if (typeof expression === 'string' && /(?:context|c|variable|v)\.is_first_person/.test(expression)) perspectiveReferences.push({ owner: owner.id, file: `${from.pack}/${from.file}`, path: `${path}/${i}`, expression });
          cb(name, `${path}/${i}`);
        }
        else add('error', 'REFERENCE_ENTRY', `${from.pack}/${from.file}`, `${path}/${i}`, 'Expected a string or single-key condition object');
      });
    };
    conditionalList(d.scripts?.animate, owner, owner.path + '/scripts/animate', (name, path) => animationRef(owner, name, path));
    for (const target of Object.values(maps.animation)) { const ac = typeof target === 'string' && lookup('animation-controller', target); if (ac) queue.push(ac); }
    while (queue.length) {
      const ac = queue.pop(); if (visited.has(ac.id)) continue; visited.add(ac.id);
      const states = ac.value?.states;
      if (!object(states)) { add('error', 'CONTROLLER_STATES', `${ac.pack}/${ac.file}`, ac.path, 'Animation controller must define states'); continue; }
      const initial = ac.value.initial_state === undefined ? 'default' : ac.value.initial_state;
      if (!text(initial)) add('error', 'CONTROLLER_INITIAL_STATE', `${ac.pack}/${ac.file}`, ac.path + '/initial_state', 'Initial state must be a nonempty name');
      if (!Object.hasOwn(states, initial)) edge(ac, 'controller-state', initial, ac.path + '/initial_state', 'unresolved');
      for (const [state, value] of Object.entries(states)) {
        const path = `${ac.path}/states/${pointer(state)}`;
        if (!text(state) || !object(value)) { add('error', 'CONTROLLER_STATE', `${ac.pack}/${ac.file}`, path, 'State requires a nonempty name and object body'); continue; }
        conditionalList(value.animations, ac, path + '/animations', (name, p) => animationRef(ac, name, p));
        conditionalList(value.transitions, ac, path + '/transitions', (name, p) => edge(ac, 'controller-state', name, p, Object.hasOwn(states, name) ? 'resolved' : 'unresolved', Object.hasOwn(states, name) ? ac : null));
      }
    }
    if (owner.kind === 'attachable' && !perspectiveReferences.some(reference => reference.owner === owner.id)) add('warning', 'PERSPECTIVE_UNVERIFIED', `rp/${owner.file}`, owner.path + '/scripts/animate', 'No first-person query was found in reachable animation conditions. Verify whether shared poses are intentional.');
    conditionalList(d.render_controllers, owner, owner.path + '/render_controllers', (name, path) => {
      const rc = resource(owner, 'render-controller', name, path); if (!rc?.value) return;
      properties(rc, rc.value, rc.path);
      const strings = (value, p, fn) => {
        const pending = [[value, p]];
        while (pending.length) { const [v, at] = pending.pop(); if (typeof v === 'string') fn(v, at); else if (Array.isArray(v) || object(v)) for (const [k, child] of Object.entries(v)) pending.push([child, `${at}/${pointer(k)}`]); }
      };
      strings(rc.value, rc.path, (expression, at) => {
        for (const match of expression.matchAll(/\b(geometry|texture|material)\.([a-z0-9_]+)/gi)) alias(rc, match[1].toLowerCase(), match[2], at);
        for (const match of expression.matchAll(/\barray\.([a-z0-9_]+)\s*\[/gi)) {
          const arrayName = `array.${match[1]}`;
          const found = Object.values(rc.value.arrays || {}).some(group => object(group) && Object.keys(group).some(k => k.toLowerCase() === arrayName.toLowerCase()));
          edge(rc, 'resource-array', arrayName, at, found ? 'dynamic' : 'unresolved', null, found ? 'Declared array members were checked; selected index remains runtime-dependent' : 'Referenced controller array is not declared');
        }
      });
    });
  }
  // Check RP inheritance plus referenced vanilla ancestors, without merging bodies.
  const inheritance = (kind, parentOf) => {
    const queue = [...registry.values()].filter(record => record.pack === 'rp' && record.kind === kind);
    for (const reference of edges) if (reference.kind === kind && reference.to && registry.has(reference.to)) queue.push(registry.get(reference.to));
    const parents = new Map(), seen = new Set();
    while (queue.length) {
      const record = queue.pop();
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      const parent = parentOf(record);
      if (parent !== undefined) {
        const target = resource(record, kind, parent, record.path);
        if (target) { parents.set(record.id, target.id); queue.push(target); }
      }
    }
    const checked = new Set();
    for (const id of seen) {
      const chain = new Set(); let current = id;
      while (current && !checked.has(current)) {
        if (chain.has(current)) {
          const record = registry.get(current);
          add('error', `${kind.toUpperCase()}_CYCLE`, `${record.pack}/${record.file}`, record.path, `${kind} inheritance is cyclic`);
          break;
        }
        chain.add(current); current = parents.get(current);
      }
      for (const visited of chain) checked.add(visited);
    }
  };
  inheritance('material', record => {
    const name = record.path.split('/').at(-1).replaceAll('~1', '/').replaceAll('~0', '~');
    return name.includes(':') ? name.slice(name.indexOf(':') + 1) : undefined;
  });
  inheritance('geometry', record => record.inheritedFrom);
  if (!owners.length) add('error', 'NO_RENDER_OWNER', 'rp', '', 'No attachable or client entity was found; an empty pack cannot establish a render graph');
  add('info', 'RUNTIME_UNVERIFIED', 'rp', '', 'Static references only. Texture bytes, shader support, Molang execution, geometry placement, input, networking and Bedrock rendering were not verified.');
  const summary = { files: fileCount, parsedDocuments: documents.length, owners: owners.length, nodes: nodes.length, edges: edges.length };
  for (const status of ['resolved', 'unresolved', 'external-unverified', 'dynamic']) summary[status] = edges.filter(e => e.status === status).length;
  for (const severity of ['error', 'warning', 'info']) summary[severity + 's'] = diagnostics.filter(d => d.severity === severity).length;
  summary.perspectiveReferences = perspectiveReferences.length;
  return { schema: 'mcbe-attachable-graph@1', ok: summary.errors === 0, complete: summary.errors === 0 && summary['external-unverified'] === 0 && summary.dynamic === 0 && !diagnostics.some(d => ['SYMLINK_SKIPPED', 'SUBPACKS_SKIPPED'].includes(d.code)), evidenceLevel: 'static-resource-graph', runtimeVerified: false, summary, nodes, edges, perspectiveReferences, diagnostics };
}

export function boundedAttachableReport(report, maxChars = 6000) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1000 || maxChars > 64000) throw new Error('max-chars must be an integer from 1000 to 64000');
  const { nodes, edges, diagnostics, perspectiveReferences = [], ...base } = report;
  const result = { ...base, diagnostics: [], omitted: { nodes: nodes.length, edges: edges.length, perspectiveReferences: perspectiveReferences.length, diagnostics: diagnostics.length } };
  const order = { error: 0, warning: 1, info: 2 };
  for (const item of [...diagnostics].sort((a, b) => order[a.severity] - order[b.severity])) {
    result.diagnostics.push(item); result.omitted.diagnostics--;
    if (JSON.stringify(result).length + 1 > maxChars) { result.diagnostics.pop(); result.omitted.diagnostics++; }
  }
  return JSON.stringify(result);
}
