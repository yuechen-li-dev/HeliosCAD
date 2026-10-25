import { readFile, readdir, mkdir, cp, writeFile, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

// Installed package texts plus NuGet's declared license files/expressions. Build tools
// are identified separately; this intentionally over-includes notices, never payloads.
export async function collectNotices(root, bundle, leviathan) {
  const output = join(bundle, 'licenses'); await mkdir(output, { recursive: true });
  const notices = [], visited = new Set(), licenseTexts = new Map();
  const inherited = process.env.HELIOS_FRONTEND_NOTICES;
  if (inherited) {
    await cp(join(inherited, 'licenses'), output, { recursive: true });
    notices.push(await readFile(join(inherited, 'THIRD-PARTY-NOTICES.txt'), 'utf8'));
  }
  async function collect(directory, identity, metadata = '') {
    const target = join(output, identity.replace(/[^\w.-]/g, '_')); await mkdir(target, { recursive: true });
    const names = (await readdir(directory)).filter(name => /^(license|licence|copying|notice|third.?party.?notices|ofl)([.-]|$)/i.test(name));
    for (const name of names) if ((await stat(join(directory, name))).isFile()) await cp(join(directory, name), join(target, name));
    notices.push(`${identity}: ${metadata}`);
    return target;
  }
  async function visit(directory) {
    const metadata = JSON.parse(await readFile(join(directory, 'package.json')));
    const identity = `${metadata.name}@${metadata.version}`;
    if (visited.has(identity)) return; visited.add(identity);
    const target = await collect(directory, `npm-${identity}`, metadata.license ?? 'see package metadata');
    await writeFile(join(target, 'package.json'), JSON.stringify({ name: metadata.name, version: metadata.version, license: metadata.license, repository: metadata.repository }, null, 2));
    const require = createRequire(join(directory, 'package.json'));
    for (const name of Object.keys(metadata.dependencies ?? {})) {
      let path;
      // Inspect package metadata directly: CSS-only packages may export neither
      // package.json nor a JavaScript entry point.
      for (const modules of require.resolve.paths(name) ?? []) {
        const candidate = join(modules, name, 'package.json');
        try { if (JSON.parse(await readFile(candidate)).name === name) { path = candidate; break; } } catch {}
      }
      if (!path) throw Error(`Cannot locate notices for ${name}`);
      await visit(dirname(path));
    }
  }
  if (!inherited) await visit(root);
  for (const project of [join(leviathan, 'src/Leviathan.Server'), ...(!inherited ? [resolve(root, '../Aetheris/Aetheris.Web.Runtime')] : [])]) {
    const assets = JSON.parse(await readFile(join(project, 'obj/project.assets.json')));
    for (const [identity, library] of Object.entries(assets.libraries)) {
      if (library.type !== 'package' || visited.has(identity)) continue; visited.add(identity);
      let directory;
      for (const folder of Object.keys(assets.packageFolders)) {
        try { const candidate = join(folder, library.path); await stat(candidate); directory = candidate; break; } catch {}
      }
      if (!directory) throw Error(`NuGet notice source missing: ${identity}`);
      const nuspec = (await readdir(directory)).find(name => name.endsWith('.nuspec'));
      const metadata = nuspec ? await readFile(join(directory, nuspec), 'utf8') : '';
      const target = await collect(directory, `nuget-${identity}`, metadata.match(/<license[^>]*>(.*?)<\/license>/s)?.[1] ?? 'see nuspec');
      if (nuspec) await cp(join(directory, nuspec), join(target, nuspec));
      const file = metadata.match(/<license type="file">(.*?)<\/license>/s)?.[1];
      if (file) await cp(join(directory, file), join(target, 'DECLARED-LICENSE.txt'));
      const expression = metadata.match(/<license type="expression">(.*?)<\/license>/s)?.[1];
      if (expression) {
        if (!licenseTexts.has(expression)) {
          const response = await fetch(`https://licenses.nuget.org/${encodeURIComponent(expression)}`);
          if (!response.ok) throw Error(`Could not obtain declared NuGet license for ${identity}`);
          licenseTexts.set(expression, await response.text());
        }
        await writeFile(join(target, 'DECLARED-LICENSE.html'), licenseTexts.get(expression));
      }
    }
  }
  // Self-contained .NET publishes these framework notices beside its native runtime.
  await writeFile(join(bundle, 'THIRD-PARTY-NOTICES.txt'), 'Helios dependency notices\n\n' + notices.sort().join('\n') + '\n\nFull installed license texts/metadata: licenses/\n.NET runtime license and third-party notices are also included in this directory.\n');
}
