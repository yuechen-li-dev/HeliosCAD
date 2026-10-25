import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { existsSync, realpathSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { aetherisCad } from '@aetheris/cad/vite';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Plugin, WebSocketClient } from 'vite';

/** Monaco also vendors an older sanitizer internally. Resolve that one import
 * to the patched dependency; changing only npm's dependency tree leaves it live. */
function patchedMonacoSanitizer(): Plugin {
  const sanitizer = fileURLToPath(new URL('./node_modules/dompurify/dist/purify.es.mjs', import.meta.url));
  return {
    name: 'helios-monaco-sanitizer', enforce: 'pre',
    resolveId(source, importer) {
      if (source === './dompurify/dompurify.js' && importer?.replaceAll('\\', '/').endsWith('/monaco-editor/esm/vs/base/browser/domSanitize.js')) return sanitizer;
    },
    generateBundle() {
      const modules = [...this.getModuleIds()].map(id => id.replaceAll('\\', '/'));
      if (modules.some(id => id.endsWith('/monaco-editor/esm/vs/base/browser/dompurify/dompurify.js')))
        this.error('The browser bundle still contains Monaco\'s obsolete vendored sanitizer.');
      if (!modules.some(id => id.endsWith('/dompurify/dist/purify.es.mjs')))
        this.error('The patched editor sanitizer was not included in the browser bundle.');
    },
  };
}

/** A developer-only shell. Vite's HMR socket is used so production has no command endpoint. */
function localTerminal(): Plugin {
  return {
    name: 'helios-local-terminal',
    apply: 'serve',
    configureServer(server) {
      const sessions = new Map<WebSocketClient, ChildProcessWithoutNullStreams>();
      const stop = (client: WebSocketClient) => {
        const process = sessions.get(client);
        if (process) { sessions.delete(client); process.kill(); }
      };
      server.ws.on('helios:terminal-start', (_payload, client) => {
        stop(client);
        const address = (client.socket as unknown as { _socket?: { remoteAddress?: string } })._socket?.remoteAddress;
        if (!address || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) {
          client.send('helios:terminal-output', { text: 'Local terminal requires a loopback browser connection.\n' });
          return;
        }
        const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/sh';
        const args = process.platform === 'win32' ? ['-NoLogo', '-NoProfile', '-NoExit'] : ['-i'];
        const child = spawn(shell, args, { cwd: server.config.root, stdio: 'pipe', windowsHide: true });
        sessions.set(client, child);
        client.send('helios:terminal-output', { text: `${shell} · ${server.config.root}\n` });
        child.stdout.on('data', chunk => client.send('helios:terminal-output', { text: String(chunk) }));
        child.stderr.on('data', chunk => client.send('helios:terminal-output', { text: String(chunk) }));
        child.on('error', error => client.send('helios:terminal-output', { text: `${error.message}\n` }));
        child.on('exit', () => { if (sessions.get(client) === child) sessions.delete(client); });
        client.socket.on('close', () => stop(client));
      });
      server.ws.on('helios:terminal-input', (payload: { text?: string }, client) => {
        const child = sessions.get(client);
        if (child && typeof payload?.text === 'string' && payload.text.length <= 4096) child.stdin.write(payload.text);
      });
      server.ws.on('helios:terminal-stop', (_payload, client) => stop(client));
      server.httpServer?.on('close', () => { for (const client of sessions.keys()) stop(client); });
    },
  };
}

/** The linked telos package, as Vite sees it after resolving symlinks (a symlinked checkout would otherwise 403 its shaders). */
function telosRoot() {
  const linked = fileURLToPath(new URL('../Aetheris/Aetheris.Web.Runtime/telos', import.meta.url));
  return existsSync(linked) ? realpathSync(linked) : linked;
}

export default defineConfig({
  plugins: [aetherisCad(), patchedMonacoSanitizer(), react(), localTerminal()],
  server: { port: 4173, watch: { ignored: ['**/artifacts/**', '**/test-results/**'] }, fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), telosRoot()] }, proxy: { '/api': { target: process.env.HELIOS_API_URL ?? 'http://127.0.0.1:5189', ws: true } } },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true }
});
