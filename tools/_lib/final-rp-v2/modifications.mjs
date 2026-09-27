const OPERATIONS = new Set(["insert_front", "insert_back", "insert_before", "insert_after", "remove", "replace", "move_front", "move_back", "move_before", "move_after", "swap"]);
const object = value => value && typeof value === "object" && !Array.isArray(value);
const controlId = entry => Object.keys(entry || {})[0]?.split("@")[0];

// Array operations follow the control_name/value and bindings where/target
// forms documented in references/external/bedrock-wiki-json-ui/json-ui-intro.md.
export function applyModifications(props, children, { resolveChildren, control, pointer = "" } = {}) {
  const unresolved = [], values = { controls: [...children], bindings: structuredClone(props.bindings || []) };
  const bindingOrigins = new Map((Array.isArray(values.bindings) ? values.bindings : []).map((entry, index) => [entry, `${pointer}/bindings/${index}`]));
  const fail = (index, operation, reason) => unresolved.push({ kind: "unresolved_modification", impact: "blocking", control, pointer: `${pointer}/modifications/${index}`, operation, reason });
  if (!Object.hasOwn(props, "modifications")) return { controls: children, unresolved };
  if (!Array.isArray(props.modifications)) {
    fail(0, null, "modifications_must_be_array");
    delete props.modifications;
    return { controls: children, unresolved };
  }
  for (const [ordinal, change] of props.modifications.entries()) {
    const operation = change?.operation, arrayName = change?.array_name || (change?.control_name ? "controls" : null);
    if (!object(change) || !OPERATIONS.has(operation)) { fail(ordinal, operation, "unsupported_operation"); continue; }
    if (!["controls", "bindings"].includes(arrayName)) { fail(ordinal, operation, "unsupported_array"); continue; }
    if (change.target_control !== undefined) { fail(ordinal, operation, "unsupported_target_control_selector"); continue; }
    const list = values[arrayName], isControls = arrayName === "controls";
    if (!Array.isArray(list)) { fail(ordinal, operation, "target_must_be_array"); continue; }
    const rawValues = change.value === undefined ? [] : Array.isArray(change.value) ? change.value : [change.value];
    const named = name => entry => entry.id === name;
    const predicate = query => entry => object(query) && Object.keys(query).length > 0 && Object.entries(query).every(([key, value]) => JSON.stringify(entry[key]) === JSON.stringify(value));
    function find(predicateValue, description) {
      const matches = list.map((item, index) => predicateValue(item) ? index : -1).filter(index => index >= 0);
      if (matches.length !== 1) { fail(ordinal, operation, `${description}_${matches.length ? "ambiguous" : "not_found"}`); return -1; }
      return matches[0];
    }
    let target = -1;
    if (!["insert_front", "insert_back"].includes(operation)) {
      const selector = isControls
        ? change.control_name ? named(change.control_name) : ["move_front", "move_back"].includes(operation) && rawValues.length === 1 ? named(controlId(rawValues[0])) : null
        : object(change.where) ? predicate(change.where) : null;
      if (!selector) { fail(ordinal, operation, "target_selector_required"); continue; }
      target = find(selector, "target");
      if (target < 0) continue;
    }
    let additions = [];
    if (operation.startsWith("insert_") || operation === "replace") {
      if (!rawValues.length || !rawValues.every(object) || (isControls && rawValues.some(value => Object.keys(value).length !== 1 || !object(Object.values(value)[0])))) { fail(ordinal, operation, "invalid_value"); continue; }
      additions = isControls ? resolveChildren(rawValues, ordinal) : structuredClone(rawValues);
      if (!isControls) additions.forEach((entry, index) => bindingOrigins.set(entry, `${pointer}/modifications/${ordinal}/value${Array.isArray(change.value) ? `/${index}` : ""}`));
      if (isControls) {
        const names = list.filter((_, index) => operation !== "replace" || index !== target).map(item => item.id);
        if (additions.some(item => { const duplicate = names.includes(item.id); names.push(item.id); return duplicate; })) { fail(ordinal, operation, "duplicate_control"); continue; }
      }
    }
    if (operation === "insert_front") list.unshift(...additions);
    else if (operation === "insert_back") list.push(...additions);
    else if (operation === "insert_before") list.splice(target, 0, ...additions);
    else if (operation === "insert_after") list.splice(target + 1, 0, ...additions);
    else if (operation === "remove") list.splice(target, 1);
    else if (operation === "replace") list.splice(target, 1, ...additions);
    else if (operation === "move_front") list.unshift(...list.splice(target, 1));
    else if (operation === "move_back") list.push(...list.splice(target, 1));
    else {
      const selector = isControls && rawValues.length === 1 ? named(controlId(rawValues[0])) : !isControls && object(change.target) ? predicate(change.target) : null;
      if (!selector) { fail(ordinal, operation, "source_selector_required"); continue; }
      const source = find(selector, "source");
      if (source < 0 || source === target) continue;
      if (operation === "swap") [list[target], list[source]] = [list[source], list[target]];
      else {
        const [item] = list.splice(source, 1), adjustedTarget = target - (source < target ? 1 : 0);
        list.splice(adjustedTarget + (operation === "move_after" ? 1 : 0), 0, item);
      }
    }
  }
  if (Object.hasOwn(props, "bindings") || props.modifications.some(change => change?.array_name === "bindings")) props.bindings = values.bindings;
  delete props.modifications;
  return { controls: values.controls, bindingOrigins: Array.isArray(values.bindings) ? values.bindings.map(entry => bindingOrigins.get(entry)) : [], unresolved };
}
