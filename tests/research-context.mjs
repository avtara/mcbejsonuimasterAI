import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadResearchLibrary, validateResearchLibrary, researchTopics, researchContext, boundedResearchJson } from '../tools/_lib/research-context.mjs';

const db = await loadResearchLibrary();
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
freeze(db);
const before = JSON.stringify(db);
assert.equal(db.sources.length, 8);
assert.deepEqual(researchTopics(db).topics.map(t => t.id), ['skill-evaluation', 'context-selection', 'pixel-craft', 'asset-export', 'game-ui-input']);
const sizes = {};
for (const topic of db.topics) {
  const output = researchContext(db, { topic: topic.id });
  assert.deepEqual(output.sources.map(s => s.id), topic.sourceIds, 'Only selected provenance is included, in declared order');
  assert.deepEqual(output.topic, topic);
  assert.equal(output.runtimeVerified, false);
  assert.equal(output.performanceImprovementMeasured, false);
  assert.equal(output.decisionStatus, 'authored-proposal');
  assert.ok(!Object.hasOwn(output, 'styles') && !Object.hasOwn(output, 'methods') && !Object.hasOwn(output, 'tools'));
  assert.deepEqual(JSON.parse(boundedResearchJson(output)), output);
  sizes[topic.id] = boundedResearchJson(output).length + 1;
  assert.throws(() => boundedResearchJson(output, 1000), /CONTEXT_BUDGET/, 'Provenance and rules are never silently truncated');
  output.topic.rules[0].text = 'Caller change';
  assert.equal(JSON.stringify(db), before, 'Returned cards are independent of the frozen catalog');
}
const sample = researchContext(db, { topic: 'context-selection' });
const exact = JSON.stringify(sample).length + 1;
assert.equal(boundedResearchJson(sample, exact).length + 1, exact);
assert.throws(() => boundedResearchJson(sample, exact - 1), /CONTEXT_BUDGET/);
for (const budget of [null, '5000', 999, 16001, 5000.5, NaN, Infinity]) assert.throws(() => boundedResearchJson(sample, budget), /max-chars/);
for (const topic of [undefined, null, '', 'unknown', 'pixel', 'PIXEL-CRAFT', ['pixel-craft'], {}]) assert.throws(() => researchContext(db, { topic }), /Unknown research topic/);
const openai = db.sources.find(s => s.id === 'openai-skill-creator-review');
assert.ok(openai.evidence.some(e => e.url.includes('/quick_validate.py#L15-L91')), 'Inspected validator is identified, not treated as a performance evaluation');
assert.equal(db.sources.find(s => s.id === 'saint11-pixel-author').license.id, 'NOASSERTION', 'Repository artwork license is not extended to blog text');

for (const [label, mutate] of [
  ['unknown schema', d => { d.schema = 'other'; }],
  ['invalid review date', d => { d.reviewedAt = '2026-02-30'; }],
  ['default full load', d => { d.policy.context = 'all'; }],
  ['runtime claim', d => { d.policy.runtimeVerified = true; }],
  ['performance claim', d => { d.policy.performanceImprovementMeasured = true; }],
  ['execute source', d => { d.policy.executeSourceCode = true; }],
  ['duplicate source', d => { d.sources.push(d.sources[0]); }],
  ['duplicate topic', d => { d.topics.push(d.topics[0]); }],
  ['missing license', d => { delete d.sources[0].license; }],
  ['missing license scope', d => { d.sources[0].license.scope = ''; }],
  ['redistribution claim', d => { d.sources[0].license.reuse = 'copy-source'; }],
  ['wrong paper version', d => { d.sources[0].revision.value = '2602.12670v2'; }],
  ['wrong DOI', d => { d.sources[0].doi = '10.0000/other'; }],
  ['missing evidence', d => { d.sources[0].evidence = []; }],
  ['malformed evidence', d => { d.sources[0].evidence[0] = null; }],
  ['empty claim', d => { d.sources[0].evidence[0].claim = ''; }],
  ['source origin substitution', d => { d.sources[0].evidence[0].url = 'https://example.com'; }],
  ['digest shape', d => { d.sources[0].evidence[0].observedSha256 = 'bad'; }],
  ['duplicate evidence', d => { d.sources[0].evidence.push(d.sources[0].evidence[0]); }],
  ['insecure URL', d => { d.sources[0].url = d.sources[0].url.replace('https:', 'http:'); }],
  ['credential URL', d => { d.sources[0].url = d.sources[0].url.replace('https://', 'https://user:secret@'); }],
  ['source code payload', d => { d.sources[0].sourceCode = 'unrequested text'; }],
  ['missing limits', d => { d.sources[0].limits = []; }],
  ['unknown source kind', d => { d.sources[0].kind = 'runtime-proof'; }],
  ['unknown rule source', d => { d.topics[0].rules[0].sourceIds = ['missing']; }],
  ['unknown topic source', d => { d.topics[0].sourceIds.push('missing'); }],
  ['unused source', d => { d.topics[0].sourceIds.push('saint11-pixel-author'); }],
  ['duplicate rule', d => { d.topics[0].rules.push(d.topics[0].rules[0]); }],
  ['no checks', d => { d.topics[0].checks = []; }],
  ['string rules', d => { d.topics[0].rules = 'missing'; }],
  ['branch pin', d => { d.sources.find(s => s.id === 'openai-skill-creator-review').revision.value = 'main'; }],
  ['different repository evidence', d => { const s = d.sources.find(s => s.id === 'openai-skill-creator-review'); s.evidence[0].url = s.evidence[0].url.replace('/openai/skills/', '/other/skills/'); }],
  ['observation pretending paper pin', d => { d.sources[0].revision = { type: 'web-observation', value: d.reviewedAt }; }],
  ['future access', d => { d.sources.find(s => s.kind === 'vendor-engineering').revision.value = '2027-01-01'; }],
]) {
  const changed = structuredClone(db);
  mutate(changed);
  assert.throws(() => validateResearchLibrary(changed), /RESEARCH_DATA:/, label);
}
for (const malformed of [null, [], {}, { schema: db.schema }]) assert.throws(() => validateResearchLibrary(malformed));
assert.equal(JSON.stringify(db), before);

const cliPath = fileURLToPath(new URL('../tools/research-context.mjs', import.meta.url));
const cli = args => spawnSync(process.execPath, [cliPath, ...args], { cwd: tmpdir(), encoding: 'utf8', timeout: 15000 });
const index = cli(['topics', '--json']);
assert.equal(index.status, 0, index.stderr);
assert.deepEqual(JSON.parse(index.stdout), researchTopics(db));
assert.ok(index.stdout.length <= 1200);
for (const topic of db.topics) {
  const result = cli(['context', '--topic', topic.id, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), researchContext(db, { topic: topic.id }));
  assert.ok(result.stdout.length <= 5000);
  assert.equal(result.stderr, '');
}
for (const args of [
  ['context'], ['context', '--topic', 'missing'], ['context', '--topic', 'pixel-craft', '--topic', 'asset-export'],
  ['context', '--topic'], ['topics', '--topic', 'pixel-craft'], ['context', '--topic', 'pixel-craft', '--max-chars', '1000'],
  ['context', '--topic', 'pixel-craft', '--max-chars', 'Infinity'], ['context', '--topic', 'pixel-craft', '--max-chars', '1e3'],
  ['unknown'], ['topics', '--json', '--json'], ['--help', '--unknown'],
  ['context', `--${'long'.repeat(5000)}`], ['context', '--topic', 'x'.repeat(20000)],
]) {
  const result = cli(args);
  assert.equal(result.status, 64, result.stderr);
  assert.equal(result.stdout, '', 'Failure must not emit a partial context');
  assert.ok(result.stderr.length <= 1000, 'Diagnostic, escaping and newline stay bounded');
  assert.equal(JSON.parse(result.stderr).ok, false);
}
assert.equal(cli(['--help']).status, 0);
console.log(JSON.stringify({ ok: true, sources: db.sources.length, topics: db.topics.length, chars: sizes, scope: 'deterministic-contract-only; no measured model gain or Bedrock runtime' }));
