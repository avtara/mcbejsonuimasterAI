import { writeFile } from 'node:fs/promises';
import { inspectAttachableGraph, boundedAttachableReport } from './_lib/attachable-graph.mjs';

const usage = 'Usage: node tools/attachable-inspect.mjs --rp DIR [--bp DIR] [--vanilla DIR] [--max-chars 1000..64000] [--report NEW_FILE] --json\nRead-only JSONC attachable/client-entity graph; texture contents and runtime are unverified. Existing reports are never overwritten.';
async function main() {
  const args = process.argv.slice(2), options = {};
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return; }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!['--rp', '--bp', '--vanilla', '--max-chars', '--report', '--json'].includes(arg)) throw new Error('Unknown argument: ' + arg.slice(0, 60));
    if (Object.hasOwn(options, arg)) throw new Error('Duplicate argument: ' + arg);
    if (arg === '--json') options[arg] = true;
    else { const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('Missing value for ' + arg); options[arg] = value; }
  }
  const max = options['--max-chars'] === undefined ? 6000 : Number(options['--max-chars']);
  boundedAttachableReport({ nodes: [], edges: [], diagnostics: [] }, max);
  const report = await inspectAttachableGraph({ rp: options['--rp'], bp: options['--bp'], vanilla: options['--vanilla'] });
  const compact = boundedAttachableReport(report, max);
  if (options['--report']) await writeFile(options['--report'], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(compact);
  process.exitCode = report.ok ? 0 : 1;
}
main().catch(error => {
  const output = { ok: false, runtimeVerified: false, error: error.code === 'EEXIST' ? 'Report already exists; nothing was overwritten' : String(error.message).slice(0, 350) };
  while (JSON.stringify(output).length > 999) output.error = output.error.slice(0, Math.floor(output.error.length / 2));
  console.error(JSON.stringify(output)); process.exitCode = 2;
});
