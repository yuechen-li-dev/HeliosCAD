import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { aetherisCad } from '@aetheris/cad/vite';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Plugin, WebSocketClient } from 'vite';

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

export default defineConfig({
  plugins: [aetherisCad(), react(), localTerminal()],
  server: { port: 4173, fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../Aetheris/Aetheris.Web.Runtime/telos', import.meta.url))] }, proxy: { '/api': 'http://127.0.0.1:5189' } },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true }
});
