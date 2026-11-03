import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { marked } from 'marked';

// Ship an offline snapshot, not a dependency on a developer's sibling checkout.
const root = fileURLToPath(new URL('../', import.meta.url));
const upstream = resolve(root, '../Aetheris');
const pages = {}, files = {}, queue = [], seen = new Set();
const slash = value => value.replaceAll('\\', '/');
const allowed = id => id.startsWith('docs/public/') || id.startsWith('fixtures/');
async function walk(directory) {
  for (const entry of await readdir(resolve(upstream, directory), { withFileTypes: true })) {
    const id = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await walk(id);
    else if (id.endsWith('.md')) queue.push(id);
  }
}
await walk('docs/public');
for (let index = 0; index < queue.length; index++) {
  const id = queue[index];
  if (seen.has(id) || !allowed(id)) continue;
  seen.add(id);
  const path = resolve(upstream, id);
  let info;
  try { info = await stat(path); } catch { continue; }
  if (info.isDirectory()) {
    const children = (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    const markdown = `# ${id.split('/').at(-1)} examples\n\n` + children.filter(e => e.isDirectory() || /\.(md|firmament|firmasm)$/.test(e.name)).map(e => `- [${e.name}](${e.name}${e.isDirectory() ? '/' : ''})`).join('\n');
    pages[id + '/'] = { title: `${id.split('/').at(-1)} examples`, markdown, section: 'Cookbook' };
    for (const child of children) if (child.isDirectory() || /\.(md|firmament|firmasm)$/.test(child.name)) queue.push(id + '/' + child.name);
    continue;
  }
  if (/\.(png|svg|jpg|jpeg|webp)$/.test(id)) {
    const mime = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extname(id)];
    files[id] = { mediaType: mime, data: `data:${mime};base64,${(await readFile(path)).toString('base64')}` };
    continue;
  }
  if (!/\.(md|firmament|firmasm|json|yaml|concept)$/.test(id)) continue;
  const text = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
  if (!id.endsWith('.md')) { files[id] = { mediaType: 'text/plain', data: text }; continue; }
  const title = text.match(/^#\s+(.+)$/m)?.[1] ?? id.split('/').at(-1);
  const section = id.startsWith('fixtures/') ? 'Cookbook' : id.includes('/learn/') ? 'Tutorials' : id.includes('/reference/') ? 'Language & reference' : id.includes('/experimental/') ? 'Experimental' : id.includes('/firmament/') ? 'Modeling guides' : id.includes('/web-sdk/') || id.includes('/forge/') ? 'SDK & integration' : 'Aetheris guides';
  pages[id] = { title, markdown: text, section };
  marked.walkTokens(marked.lexer(text), token => {
    if ((token.type !== 'link' && token.type !== 'image') || !token.href || /^[a-z]+:|^#/i.test(token.href)) return;
    const href = decodeURI(token.href.split(/[?#]/)[0]);
    const linked = slash(relative(upstream, resolve(path, '..', href)));
    if (allowed(linked)) queue.push(linked);
  });
}
// Helios-specific workflow documentation joins the same browser.
for (const name of (await readdir(resolve(root, 'docs/public'))).filter(n => n.endsWith('.md'))) {
  const markdown = (await readFile(resolve(root, 'docs/public', name), 'utf8')).replaceAll('\r\n', '\n');
  pages[`helios/${name}`] = { title: markdown.match(/^#\s+(.+)$/m)?.[1] ?? name, markdown, section: 'Using Helios' };
}
const ordered = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
const content = { pages: ordered(pages), files: ordered(files) };
const digest = createHash('sha256').update(JSON.stringify(content)).digest('hex');
const output = JSON.stringify({ digest, upstreamRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim(), ...content });
const destination = resolve(root, 'src/learn/content.json');
if (process.argv.includes('--check')) {
  const previous = JSON.parse(await readFile(destination, 'utf8'));
  if (previous.digest !== digest) throw new Error('Learning content is stale. Run npm run docs:sync.');
} else { await mkdir(resolve(root, 'src/learn'), { recursive: true }); await writeFile(destination, output + '\n'); }
console.log(`Firmament learning: ${Object.keys(pages).length} pages, ${Object.keys(files).length} bundled files; ${digest.slice(0, 12)}`);
