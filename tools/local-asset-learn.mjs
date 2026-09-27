import { readFile } from 'node:fs/promises';
import { learnLocalAssets, localAssetContext, localAssetEvidence, writeLocalLearningCatalog } from './_lib/local-asset-learning.mjs';

const usage = 'Usage: node tools/local-asset-learn.mjs scan --root DIR --out workspace/NAME/catalog.json [--limit N] [--cache FILE] [--concurrency 1..12] --json\n       node tools/local-asset-learn.mjs context --catalog FILE --need ui|geometry|attachable|material|texture-state|nine-slice|entity|animation|render-controller [--role form|inventory|hud|wearable|entity|generic] [--limit 0..10] [--max-chars 1000..16000] --json\n       node tools/local-asset-learn.mjs evidence --catalog FILE --id asset-HASH [--limit 0..50] [--max-chars 1000..16000] --json\nFull eligible text scan by default; --limit explicitly samples. Source files are read-only. No image decoding, source rebuild or runtime execution. Full private catalogs may only be newly created under workspace. Context excludes raw source names and paths. Evidence returns one private source path after a current hash check.';
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return; }
  const command = args.shift(), keys = command === 'scan' ? ['root', 'out', 'limit', 'cache', 'concurrency'] : command === 'context' ? ['catalog', 'need', 'role', 'limit', 'max-chars'] : command === 'evidence' ? ['catalog', 'id', 'limit', 'max-chars'] : null;
  if (!keys) throw new Error('Command must be scan, context or evidence');
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].startsWith('--') ? args[i].slice(2) : '';
    if (![...keys, 'json'].includes(key) || Object.hasOwn(options, key)) throw new Error('Unknown or duplicate option');
    if (key === 'json') { options[key] = true; continue; }
    const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('Missing option value'); options[key] = value;
  }
  for (const key of ['limit', 'concurrency', 'max-chars']) if (options[key] !== undefined) { if (!/^\d+$/.test(options[key])) throw new Error(`${key} must be an integer`); options[key] = Number(options[key]); }
  if (command === 'scan') {
    if (!options.root || !options.out) throw new Error('scan requires --root and --out');
    const catalog = await learnLocalAssets(options);
    await writeLocalLearningCatalog(options.out, catalog);
    const ok = ['readErrors', 'parseErrors', 'indexHashMismatches', 'incompleteDiscovery', 'invalidIndexRecords'].every(key => catalog.coverage[key] === 0);
    console.log(JSON.stringify({ ok, scanCompleted: true, runtimeVerified: false, coverage: catalog.coverage, featureCounts: catalog.featureCounts, linkCounts: catalog.linkCounts }));
    if (!ok) process.exitCode = 1;
  } else if (command === 'context') {
    if (!options.catalog || !options.need) throw new Error('context requires --catalog and --need');
    const catalog = JSON.parse(await readFile(options.catalog, 'utf8'));
    console.log(JSON.stringify(localAssetContext(catalog, { ...options, maxChars: options['max-chars'] })));
  } else {
    if (!options.catalog || !options.id) throw new Error('evidence requires --catalog and --id');
    const catalog = JSON.parse(await readFile(options.catalog, 'utf8'));
    console.log(JSON.stringify(await localAssetEvidence(catalog, { ...options, maxChars: options['max-chars'] })));
  }
}
main().catch(error => {
  const result = { ok: false, error: error.code === 'EEXIST' ? 'Output exists; nothing was overwritten' : String(error.message).slice(0, 300) };
  while (JSON.stringify(result).length > 999) result.error = result.error.slice(0, -1);
  console.error(JSON.stringify(result)); process.exitCode = 2;
});
