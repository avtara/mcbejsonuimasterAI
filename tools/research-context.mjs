import { parseOptions } from './_lib/design-library.mjs';
import { loadResearchLibrary, researchTopics, researchContext, boundedResearchJson } from './_lib/research-context.mjs';

const usage = 'Usage: node tools/research-context.mjs topics [--json] | context --topic ID [--max-chars 1000..16000] [--json]\nDefault limit: 5000 characters including newline. Output is always compact JSON. Reads one local catalog; no downloads, source execution, installation or performance claim. Exit: 0 success, 64 arguments/topic/budget, 1 catalog/read failure.';
async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0]?.startsWith('--') ? 'topics' : (argv.shift() ?? 'topics');
  if (!['topics', 'context'].includes(command)) throw Object.assign(new Error('Unknown command; use topics or context'), { exitCode: 64 });
  let options;
  try {
    options = parseOptions(argv, command === 'context' ? ['topic', 'max-chars'] : [], ['json', 'help']);
  } catch (error) { throw Object.assign(error, { exitCode: 64 }); }
  if (options.help) { console.log(usage); return; }
  if (command === 'context' && !options.topic) throw Object.assign(new Error('--topic is required'), { exitCode: 64 });
  if (options['max-chars'] !== undefined && !/^\d+$/.test(options['max-chars'])) throw Object.assign(new Error('max-chars must be a decimal integer'), { exitCode: 64 });
  const maxChars = options['max-chars'] === undefined ? 5000 : Number(options['max-chars']);
  boundedResearchJson({}, maxChars);
  const db = await loadResearchLibrary();
  const output = command === 'topics' ? researchTopics(db) : researchContext(db, options);
  console.log(boundedResearchJson(output, maxChars));
}
main().catch(error => {
  const output = { ok: false, error: String(error.message).slice(0, 900) };
  while (JSON.stringify(output).length > 999) output.error = output.error.slice(0, Math.floor(output.error.length / 2));
  console.error(JSON.stringify(output));
  process.exitCode = error.exitCode ?? 1;
});
