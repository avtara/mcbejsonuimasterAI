import { readFile } from 'node:fs/promises';

const DATA = new URL('../../data/agent-design-research.json', import.meta.url);
const fail = message => { throw new Error(`RESEARCH_DATA: ${message}`); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be nonempty text`);
}
function keys(value, allowed, label) {
  if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(`Invalid ${label} fields`);
}
function strings(value, label) {
  if (!Array.isArray(value) || !value.length || new Set(value).size !== value.length) fail(`${label} must be a unique nonempty array`);
  for (const entry of value) text(entry, label);
}
function records(value, label) {
  if (!Array.isArray(value) || !value.length) fail(`${label} must be a nonempty array`);
  const ids = new Set();
  for (const entry of value) {
    if (!record(entry) || typeof entry.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || ids.has(entry.id)) fail(`Invalid or duplicate ${label} id`);
    ids.add(entry.id);
  }
  return ids;
}
function date(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`Invalid ${label}`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(`Invalid ${label}`);
}
function https(value, label) {
  text(value, label);
  let url;
  try { url = new URL(value); } catch { fail(`Invalid ${label} URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search) fail(`Invalid ${label} URL`);
  return url;
}

// This checks the catalog's declared provenance, not a live upstream or a research claim.
export function validateResearchLibrary(db) {
  keys(db, ['schema', 'reviewedAt', 'policy', 'sources', 'topics'], 'catalog');
  if (db.schema !== 'mcbe-agent-design-research@1') fail('Unknown schema');
  date(db.reviewedAt, 'review date');
  keys(db.policy, ['context', 'reuse', 'executeSourceCode', 'runtimeVerified', 'performanceImprovementMeasured'], 'policy');
  if (db.policy.context !== 'selected-topic-only' || db.policy.reuse !== 'authored-summary' || db.policy.executeSourceCode !== false || db.policy.runtimeVerified !== false || db.policy.performanceImprovementMeasured !== false) fail('Invalid evidence boundary');
  const sourceIds = records(db.sources, 'source');
  records(db.topics, 'topic');
  const sourceUrls = new Set();
  for (const source of db.sources) {
    keys(source, ['id', 'kind', 'title', 'url', 'revision', 'doi', 'license', 'evidence', 'limits'], 'source');
    if (!['paper', 'vendor-engineering', 'open-source-skill', 'artist-tutorial', 'official-docs'].includes(source.kind)) fail('Unknown source kind');
    text(source.title, 'source title');
    const url = https(source.url, 'source');
    if (sourceUrls.has(url.href)) fail('Duplicate source URL');
    sourceUrls.add(url.href);
    keys(source.revision, ['type', 'value', 'reportedRevision'], 'revision');
    const revision = source.revision;
    if (revision.type === 'arxiv-version') {
      if (source.kind !== 'paper' || !/^\d{4}\.\d{4,5}v[1-9]\d*$/.test(revision.value) || url.hostname !== 'arxiv.org' || url.pathname !== `/html/${revision.value}` || source.doi !== `10.48550/arXiv.${revision.value.replace(/v\d+$/, '')}`) fail('Paper version/URL/DOI mismatch');
    } else if (revision.type === 'git') {
      if (source.kind !== 'open-source-skill' || !/^[a-f0-9]{40}$/.test(revision.value) || url.hostname !== 'github.com' || !/^\/[^/]+\/[^/]+\/tree\//.test(url.pathname) || url.pathname.split('/')[4] !== revision.value) fail('Git source must use an immutable commit URL');
    } else if (revision.type === 'web-observation') {
      if (['paper', 'open-source-skill'].includes(source.kind)) fail('Versioned source cannot use a web observation');
      date(revision.value, 'access date');
      if (revision.value > db.reviewedAt) fail('Access date is after review date');
    } else fail('Unknown revision type');
    if (revision.reportedRevision !== undefined && (revision.type !== 'web-observation' || !/^[a-f0-9]{40}$/.test(revision.reportedRevision))) fail('Invalid reported revision');
    if (source.kind !== 'paper' && source.doi !== undefined) fail('Unexpected DOI');
    keys(source.license, ['id', 'scope', 'reuse'], 'license');
    text(source.license.id, 'license id');
    text(source.license.scope, 'license scope');
    if (source.license.reuse !== 'reference-only') fail('Catalog does not authorize source redistribution');
    strings(source.limits, 'source limits');
    if (!Array.isArray(source.evidence) || !source.evidence.length) fail('Missing source evidence');
    const evidenceKeys = new Set();
    for (const evidence of source.evidence) {
      keys(evidence, ['url', 'locator', 'claim', 'observedSha256'], 'evidence');
      const evidenceUrl = https(evidence.url, 'evidence');
      text(evidence.locator, 'evidence locator');
      text(evidence.claim, 'evidence claim');
      if (evidenceUrl.hostname !== url.hostname) fail('Evidence origin differs from source');
      if (revision.type === 'arxiv-version' && evidenceUrl.pathname !== url.pathname) fail('Evidence paper version differs');
      if (revision.type === 'git') {
        const repository = url.pathname.split('/').slice(0, 3).join('/');
        if (!evidenceUrl.pathname.startsWith(`${repository}/blob/${revision.value}/`)) fail('Evidence commit/repository differs');
      }
      if (evidence.observedSha256 !== undefined && !/^[a-f0-9]{64}$/.test(evidence.observedSha256)) fail('Invalid observed digest');
      const key = `${evidence.url}\n${evidence.locator}`;
      if (evidenceKeys.has(key)) fail('Duplicate evidence');
      evidenceKeys.add(key);
    }
  }
  for (const topic of db.topics) {
    keys(topic, ['id', 'name', 'useWhen', 'sourceIds', 'rules', 'checks', 'limits'], 'topic');
    text(topic.name, 'topic name');
    text(topic.useWhen, 'topic useWhen');
    strings(topic.sourceIds, 'topic sources');
    if (topic.sourceIds.some(id => !sourceIds.has(id))) fail('Unknown topic source');
    records(topic.rules, 'rule');
    const used = new Set();
    for (const rule of topic.rules) {
      keys(rule, ['id', 'text', 'sourceIds'], 'rule');
      text(rule.text, 'rule text');
      strings(rule.sourceIds, 'rule sources');
      for (const id of rule.sourceIds) {
        if (!topic.sourceIds.includes(id)) fail('Rule source is outside selected topic');
        used.add(id);
      }
    }
    if (used.size !== topic.sourceIds.length) fail('Topic contains unused sources');
    strings(topic.checks, 'topic checks');
    strings(topic.limits, 'topic limits');
  }
  return db;
}

export async function loadResearchLibrary() {
  return validateResearchLibrary(JSON.parse(await readFile(DATA, 'utf8')));
}
export function researchTopics(db) {
  validateResearchLibrary(db);
  return { schema: 'mcbe-research-topics@1', topics: db.topics.map(({ id, name, useWhen }) => ({ id, name, useWhen })) };
}
export function researchContext(db, { topic } = {}) {
  validateResearchLibrary(db);
  const selected = db.topics.find(entry => entry.id === topic);
  if (!selected) throw Object.assign(new Error('Unknown research topic; run topics to list exact IDs'), { exitCode: 64 });
  return structuredClone({
    schema: 'mcbe-research-context@1', reviewedAt: db.reviewedAt,
    decisionStatus: 'authored-proposal', runtimeVerified: false, performanceImprovementMeasured: false,
    topic: selected, sources: selected.sourceIds.map(id => db.sources.find(source => source.id === id)),
    boundary: 'Selected authored summaries only; source observations and proposed checks do not prove local performance or runtime behavior.',
  });
}
export function boundedResearchJson(value, maxChars = 5000) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1000 || maxChars > 16000) throw Object.assign(new Error('max-chars must be an integer from 1000 to 16000'), { exitCode: 64 });
  const serialized = JSON.stringify(value);
  // The final CLI newline is included. Provenance, limits and rules stay together.
  if (serialized.length + 1 > maxChars) throw Object.assign(new Error(`CONTEXT_BUDGET: ${serialized.length + 1} characters required; raise --max-chars or select another topic`), { exitCode: 64 });
  return serialized;
}
