import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectChestProject, boundedChestInspection } from './_lib/chest-editor-inspection.mjs';

const usage = 'Usage: node tools/chest-project.mjs --input FILE --capacity N [--max-chars 1000..64000] [--report NEW_FILE] --json\nRead-only Minato format-2 project inspection. capacity is an explicit native host capacity, not a 27/54 engine limit. JSON stdout defaults to 6000 characters with omitted counts. Optional full report is created exclusively; existing files are never overwritten. No upstream scripts, ZIP imports, exports or runtime execution.';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return; }
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (!['--input', '--capacity', '--max-chars', '--report', '--json'].includes(name)) throw new Error(`Unknown option: ${name.slice(0, 80)}`);
    if (Object.hasOwn(opts, name)) throw new Error(`Duplicate option: ${name}`);
    if (name === '--json') { opts[name] = true; continue; }
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    opts[name] = value;
  }
  if (!opts['--input'] || !opts['--capacity']) throw new Error('--input and --capacity are required');
  const integer = (value, name) => { if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer`); return Number(value); };
  const capacity = integer(opts['--capacity'], 'capacity');
  const maxChars = opts['--max-chars'] === undefined ? 6000 : integer(opts['--max-chars'], 'max-chars');
  // Validate numeric options before reading an arbitrary input path.
  inspectChestProject(null, { capacity });
  boundedChestInspection({ diagnostics: [] }, maxChars);
  const inputPath = resolve(opts['--input']);
  const size = await stat(inputPath);
  if (!size.isFile() || size.size > 16 * 1024 * 1024) throw new Error('Input must be a JSON file no larger than 16 MiB');
  const raw = await readFile(inputPath, 'utf8');
  if (Buffer.byteLength(raw) > 16 * 1024 * 1024) throw new Error('Input exceeds 16 MiB');
  let input;
  try { input = JSON.parse(raw); } catch { throw new Error('Input is not valid JSON'); }
  const report = inspectChestProject(input, { capacity });
  if (opts['--report']) {
    const outputPath = resolve(opts['--report']);
    if (outputPath === inputPath) throw new Error('Report must not overwrite the input');
    // wx rejects existing regular files, hard links and symlinks, including aliases of input.
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(boundedChestInspection(report, maxChars));
  process.exitCode = report.ok ? 0 : 1;
}
main().catch(error => {
  const output = { ok: false, runtimeVerified: false, error: error.code === 'EEXIST' ? 'Report already exists; nothing was overwritten' : String(error.message).slice(0, 400) };
  // Bound the serialized diagnostic, including escape expansion and its newline.
  while (JSON.stringify(output).length > 999) output.error = output.error.slice(0, Math.floor(output.error.length / 2));
  console.error(JSON.stringify(output)); process.exitCode = 2;
});
