import { isDeepStrictEqual } from 'node:util';

// Independently authored inspection of the pinned Minato format-2 data contract.
// No upstream script is imported or evaluated; this is not a JSON UI runtime validator.
export const CHEST_PROJECT_LIMITS = Object.freeze({ capacity: 100000, uis: 512, components: 20000 });
const slotTypes = new Set(['container_item', 'container_item_with_picture', 'progress_bar', 'on_off_item', 'pot', 'container_type']);
const componentTypes = new Set([...slotTypes, 'tab', 'dynamic_grid', 'button', 'image', 'label', 'close_button']);
const textureKeys = new Set(['texture', 'picture', 'dialogBackground', 'default_texture', 'hover_texture', 'pressed_texture', 'image_texture', 'slot_background_texture', 'slot_selected_texture', 'slot_highlight_texture', 'scroll_indent_image_texture', 'scrollbar_box_image_texture', 'scroll_background_image_texture']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
// The editor stores ordinary number-input properties as strings, then consumes Number().
// Keep source indices strict: their next-index calculation separately concatenates strings.
const numericProperty = value => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
const own = (value, key) => Object.hasOwn(value, key);
const savedComponents = value => Array.isArray(value) ? value.map(component => {
  if (!object(component)) return component;
  // buildFromEditor deliberately omits zIndex from the top-level clean copy.
  const { zIndex, ...saved } = component;
  return saved;
}) : value;
const sameComponents = (a, b) => isDeepStrictEqual(savedComponents(a), savedComponents(b));

export function inspectChestProject(input, { capacity } = {}) {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > CHEST_PROJECT_LIMITS.capacity) {
    throw new Error(`capacity must be an integer from 1 to ${CHEST_PROJECT_LIMITS.capacity} (inspector resource bound, not an engine limit)`);
  }
  const diagnostics = [];
  const summary = { capacity, uis: 0, components: 0, indexedComponents: 0, dynamicGrids: 0, errors: 0, warnings: 0, infos: 0 };
  const add = (severity, code, path, message) => {
    diagnostics.push({ severity, code, path, message });
    summary[{ error: 'errors', warning: 'warnings', info: 'infos' }[severity]]++;
  };
  const finish = () => ({ schema: 'mcbe-chest-project-inspection@1', ok: summary.errors === 0, runtimeVerified: false,
    evidenceLevel: 'static-editor-project', formatVersion: object(input) && input.formatVersion === 2 ? 2 : null,
    transport: 'native-container', source: { id: 'minato-web-apps-chest-ui-editor', revision: 'dcc7932fceea828131053fb067e1f91503e36b21' }, summary, diagnostics });
  if (!object(input)) { add('error', 'PROJECT_OBJECT', '$', 'Expected a project object.'); return finish(); }
  if (input.formatVersion !== 2) { add('error', 'FORMAT_UNSUPPORTED', '$.formatVersion', 'Only the pinned formatVersion 2 is supported.'); return finish(); }
  const images = object(input.uploadedImages) ? input.uploadedImages : {};
  if (own(input, 'uploadedImages') && input.uploadedImages !== null && !object(input.uploadedImages)) add('error', 'UPLOADED_IMAGES_OBJECT', '$.uploadedImages', 'uploadedImages must be an object keyed by user_uploaded: identifiers.');
  function textures(properties, path) {
    if (!object(properties)) return;
    for (const key of textureKeys) {
      if (!own(properties, key)) continue;
      const value = properties[key];
      if (typeof value !== 'string') { add('error', 'TEXTURE_STRING', `${path}.${key}`, 'Texture references must be strings.'); continue; }
      if (!value.startsWith('user_uploaded:')) continue;
      const image = own(images, value) ? images[value] : undefined;
      if (!object(image) || typeof image.data !== 'string' || !image.data.length) {
        const embeddedMap = object(input.uploadedImages);
        add(embeddedMap ? 'error' : 'warning', embeddedMap ? 'UPLOADED_TEXTURE_MISSING' : 'UPLOADED_TEXTURE_UNRESOLVED', `${path}.${key}`, embeddedMap
          ? 'Referenced uploadedImages entry is missing or has no image data.'
          : 'No uploadedImages map is embedded. ZIP metadata omits it by design; inspect external texture files before concluding they are missing.');
      }
    }
  }
  function index(value, path) {
    if (typeof value === 'string' && /^\d+$/.test(value)) { add('error', 'INDEX_NUMERIC_STRING', path, 'Use a numeric integer. The source next-index calculation can concatenate string indices.'); return; }
    if (!Number.isSafeInteger(value)) { add('error', 'INDEX_INTEGER', path, 'Collection indices must be numeric safe integers.'); return; }
    if (value < 0 || value >= capacity) add('error', 'INDEX_CAPACITY', path, 'Index is outside the explicitly supplied container capacity.');
  }
  function components(items, path) {
    if (!Array.isArray(items)) { add('error', 'COMPONENTS_ARRAY', path, 'Expected a components array.'); return; }
    if (summary.components + items.length > CHEST_PROJECT_LIMITS.components) { add('error', 'COMPONENT_LIMIT', path, 'Project exceeds the inspector component resource bound; this list was not inspected.'); return; }
    summary.components += items.length;
    const ids = new Map();
    const parents = new Map();
    const toggleNames = new Set();
    let rootLabels = 0;
    for (const [i, component] of items.entries()) {
      const at = `${path}[${i}]`;
      if (!object(component)) { add('error', 'COMPONENT_OBJECT', at, 'Each component must be an object.'); continue; }
      if (typeof component.id !== 'string' || !component.id) add('error', 'COMPONENT_ID', `${at}.id`, 'A component needs a nonempty string id.');
      else if (ids.has(component.id)) add('error', 'COMPONENT_ID_DUPLICATE', `${at}.id`, 'Component id duplicates another component in this UI.');
      else ids.set(component.id, { component, at });
      if (!componentTypes.has(component.type)) add('error', 'COMPONENT_TYPE', `${at}.type`, 'Unknown component type for the pinned editor format.');
      for (const key of ['x', 'y', 'width', 'height']) {
        if (!finite(component[key]) || (['width', 'height'].includes(key) && component[key] <= 0)) add('error', 'COMPONENT_GEOMETRY', `${at}.${key}`, 'Coordinates must be finite numbers and dimensions must be positive.');
      }
      const props = component.properties;
      if (!object(props)) { add('error', 'COMPONENT_PROPERTIES', `${at}.properties`, 'Expected a properties object.'); continue; }
      if (component.type === 'label' && !props.tab_parent_id && ++rootLabels > 1) add('error', 'GENERATED_LABEL_NAME_COLLISION', at, 'Pinned exporter names every root label "name", so this label collides with an earlier root label.');
      textures(props, `${at}.properties`);
      if (slotTypes.has(component.type)) { summary.indexedComponents++; index(props.collection_index, `${at}.properties.collection_index`); }
      if (component.type === 'button') { summary.indexedComponents++; index(props.target_collection_index, `${at}.properties.target_collection_index`); }
      if (component.type === 'tab') {
        const toggleIndex = own(props, 'toggle_index') ? numericProperty(props.toggle_index) : 1;
        if (!Number.isSafeInteger(toggleIndex) || toggleIndex < 1) add('error', 'TAB_TOGGLE_INDEX', `${at}.properties.toggle_index`, 'Tab toggle index must represent a positive safe integer.');
        // Pinned export uses one group and `toggle${Number(value) || 1}` for every tab.
        const toggleName = `toggle${toggleIndex || 1}`;
        if (toggleNames.has(toggleName)) add('error', 'TAB_TOGGLE_NAME_COLLISION', `${at}.properties.toggle_index`, 'Two tabs export the same toggle name and selection index, so their pages share a visibility source.');
        toggleNames.add(toggleName);
      }
      if (own(props, 'tab_parent_id') && props.tab_parent_id !== '' && props.tab_parent_id !== null) {
        if (typeof props.tab_parent_id !== 'string') add('error', 'TAB_PARENT_ID', `${at}.properties.tab_parent_id`, 'Tab parent id must be a string.');
        else if (typeof component.id === 'string') parents.set(component.id, { parent: props.tab_parent_id, at });
      }
      if (component.type === 'dynamic_grid') {
        summary.dynamicGrids++;
        add('warning', 'DYNAMIC_GRID_PREVIEW_ONLY', at, 'preview_slots and content_height do not establish exported slot count or scroll extent. Export inherits container_items; runtime capacity and scrolling remain unverified.');
        for (const [key, fallback] of [['slot_width', 18], ['slot_height', 18], ['content_height', 180]]) {
          const value = own(props, key) ? numericProperty(props[key]) : fallback;
          if (!finite(value) || value <= 0) add('error', 'GRID_DIMENSION', `${at}.properties.${key}`, 'Grid dimensions must be positive finite numbers.');
        }
        const previewSlots = numericProperty(props.preview_slots);
        if (own(props, 'preview_slots') && (!Number.isSafeInteger(previewSlots) || previewSlots < 0 || previewSlots > CHEST_PROJECT_LIMITS.capacity)) add('error', 'GRID_PREVIEW_SLOTS', `${at}.properties.preview_slots`, 'Preview slot count must be a bounded nonnegative integer. It is not the container capacity.');
        const scroll = own(props, 'scroll_size_width') ? numericProperty(props.scroll_size_width) : 8;
        const slot = own(props, 'slot_width') ? numericProperty(props.slot_width) : 18;
        if (!finite(scroll) || scroll < 0) add('error', 'SCROLL_WIDTH', `${at}.properties.scroll_size_width`, 'Scroll width must be a nonnegative finite number.');
        else if (finite(component.width) && component.width - scroll <= 0) add('error', 'SCROLL_NO_CONTENT_WIDTH', `${at}.width`, 'Width minus scroll_size_width leaves no positive content width.');
        else if (finite(component.width) && finite(slot) && slot > component.width - scroll) add('warning', 'GRID_SLOT_WIDER_THAN_VIEWPORT', at, 'One slot is wider than the available content viewport.');
      }
    }
    for (const { parent, at } of parents.values()) {
      if (!ids.has(parent)) add('error', 'TAB_PARENT_ORPHAN', `${at}.properties.tab_parent_id`, 'Tab parent does not exist in the same UI.');
      else if (ids.get(parent).component.type !== 'tab') add('error', 'TAB_PARENT_TYPE', `${at}.properties.tab_parent_id`, 'tab_parent_id must reference a tab component.');
    }
    // Iterative traversal avoids a stack overflow on hostile or very deep JSON data.
    const checked = new Set();
    for (const id of parents.keys()) {
      const chain = new Set();
      let current = id;
      while (parents.has(current) && !checked.has(current)) {
        if (chain.has(current)) { add('error', 'TAB_PARENT_CYCLE', `${parents.get(current).at}.properties.tab_parent_id`, 'Tab parent references form a cycle.'); break; }
        chain.add(current); current = parents.get(current).parent;
      }
      for (const member of chain) checked.add(member);
    }
  }
  textures(input.settings, '$.settings');
  if (own(input, 'settings') && input.settings !== null && !object(input.settings)) add('error', 'SETTINGS_OBJECT', '$.settings', 'settings must be an object.');
  components(input.components, '$.components');
  const project = input.uiProject;
  if (!object(project) || !Array.isArray(project.uis) || !project.uis.length) {
    add('error', 'UI_PROJECT_RESTORE_LOSS', '$.uiProject', 'A complete format-2 project needs uiProject.uis and activeId. Missing routes cause default-UI restoration; legacy top-level uis is not a complete format-2 contract.');
    return finish();
  }
  if (project.uis.length > CHEST_PROJECT_LIMITS.uis) { add('error', 'UI_LIMIT', '$.uiProject.uis', 'Too many UIs for the inspector resource bound.'); return finish(); }
  summary.uis = project.uis.length;
  const uiIds = new Map();
  const triggers = new Set();
  for (const [i, ui] of project.uis.entries()) {
    const at = `$.uiProject.uis[${i}]`;
    if (!object(ui)) { add('error', 'UI_OBJECT', at, 'Each UI must be an object.'); continue; }
    if (typeof ui.id !== 'string' || !ui.id) add('error', 'UI_ID', `${at}.id`, 'UI id must be a nonempty string.');
    else if (uiIds.has(ui.id)) add('error', 'UI_ID_DUPLICATE', `${at}.id`, 'UI id duplicates another route.');
    else uiIds.set(ui.id, ui);
    const trigger = own(ui, 'triggerTitle') ? ui.triggerTitle : ui.title;
    if (typeof trigger !== 'string') add('error', 'TRIGGER_STRING', `${at}.triggerTitle`, 'Title trigger must be a string.');
    else if (trigger.length === 0) add('warning', 'TRIGGER_EMPTY', `${at}.triggerTitle`, 'An empty trigger targets an empty container title; confirm this is intentional.');
    if (typeof trigger === 'string') {
      if (triggers.has(trigger)) add('error', 'TRIGGER_DUPLICATE', `${at}.triggerTitle`, 'Duplicate exact trigger titles compete for the same native route.');
      triggers.add(trigger);
    }
    for (const key of ['title', 'newTitle']) if (own(ui, key) && typeof ui[key] !== 'string') add('error', 'TITLE_STRING', `${at}.${key}`, 'Display titles must be strings.');
    if (!object(ui.settings)) add('error', 'SETTINGS_OBJECT', `${at}.settings`, 'Each UI needs a settings object.');
    textures(ui.settings, `${at}.settings`);
    // Active components are inspected once when the two serialized copies match.
    if (ui.id !== project.activeId || !sameComponents(ui.components, input.components)) components(ui.components, `${at}.components`);
  }
  if (typeof project.activeId !== 'string' || !uiIds.has(project.activeId)) add('error', 'ACTIVE_UI_UNKNOWN', '$.uiProject.activeId', 'activeId does not identify a declared UI; the source silently chooses its first UI.');
  else {
    const active = uiIds.get(project.activeId);
    if (!sameComponents(active.components, input.components)) add('warning', 'ACTIVE_COMPONENTS_DRIFT', '$.components', 'Top-level components differ from active UI components; source restoration replaces the top-level copy.');
    if (own(input, 'settings') && !isDeepStrictEqual(active.settings, input.settings)) add('warning', 'ACTIVE_SETTINGS_DRIFT', '$.settings', 'Top-level settings differ from the active UI settings.');
  }
  if (capacity !== 27) add('warning', 'NATIVE_ROUTE_CAPACITY_UNVERIFIED', '$', 'Pinned export modifies small_chest_screen with a default size of 27. The supplied capacity needs a matching native host/route; larger artwork does not establish that host.');
  add('info', 'RUNTIME_UNVERIFIED', '$', 'Static data inspection only: no RP export, texture rendering, item movement, input or Bedrock runtime was executed.');
  return finish();
}

export function boundedChestInspection(report, maxChars = 6000) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1000 || maxChars > 64000) throw new Error('max-chars must be an integer from 1000 to 64000');
  const ranked = [...report.diagnostics].sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.severity] - { error: 0, warning: 1, info: 2 }[b.severity]));
  const out = { ...report, diagnostics: [], omittedDiagnostics: ranked.length };
  for (const item of ranked) {
    out.diagnostics.push(item); out.omittedDiagnostics--;
    if (JSON.stringify(out).length > maxChars) { out.diagnostics.pop(); out.omittedDiagnostics++; break; }
  }
  return JSON.stringify(out);
}
