import { inspectGeoUiFile, boundedGeoUiReport, writeGeoUiReport } from './_lib/geoui-project.mjs';

const usage = 'Usage: node tools/geoui-inspect.mjs --input PROJECT.geoui.json [--max-chars 1000..64000] [--report NEW_FILE] [--json]\nRead-only native GeouiStudio v6 project inspection. Default stdout budget 6000 characters including newline. No source execution, remote media fetching, installation, export or runtime claim. Full report uses exclusive creation. Exit: 0 no structural errors, 1 structural errors, 2 arguments/read/write/budget error; check complete and runtimeVerified separately.';
async function main() {
  const args = process.argv.slice(2), options = {};
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return; }
  for (let i = 0; i < args.length; i++) {
    const key = args[i].slice(2);
    if (!args[i].startsWith('--') || !['input', 'max-chars', 'report', 'json'].includes(key) || Object.hasOwn(options, key)) throw new Error('Unknown or duplicate option');
    if (key === 'json') { options[key] = true; continue; }
    const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('Missing option value'); options[key] = value;
  }
  if (options['max-chars'] !== undefined && !/^\d+$/.test(options['max-chars'])) throw new Error('max-chars must be a decimal integer');
  const maxChars = options['max-chars'] === undefined ? 6000 : Number(options['max-chars']);
  if (!Number.isSafeInteger(maxChars) || maxChars < 1000 || maxChars > 64000) throw new Error('max-chars must be an integer from 1000 to 64000');
  const report = await inspectGeoUiFile(options.input);
  const out = boundedGeoUiReport(report, maxChars);
  if (options.report) await writeGeoUiReport(options.report, report);
  console.log(JSON.stringify(out)); if (!report.ok) process.exitCode = 1;
}
main().catch(error => {
  const out = { ok: false, runtimeVerified: false, error: error.code === 'EEXIST' ? 'Report already exists; nothing was overwritten' : String(error.message).slice(0, 600) };
  while (JSON.stringify(out).length + 1 > 1000) out.error = out.error.slice(0, Math.floor(out.error.length / 2));
  console.error(JSON.stringify(out)); process.exitCode = 2;
});
