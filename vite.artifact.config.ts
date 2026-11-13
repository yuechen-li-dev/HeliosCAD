import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

/**
 * Helios as a claude.ai artifact (`npm run build:artifact`, which also swaps in the trimmed
 * runtime and writes the publish manifest). The page is one fixed document in a sandboxed frame:
 * asset paths are relative, public files are addressed from the page, the WASM runtime sits next
 * to it, and src/platform/target.ts switches on hash routes, viewer-prompted saves and no cloud UI.
 */
export default mergeConfig(base, defineConfig({
  base: './',
  plugins: [{
    // Public files (previews, branding, models) are addressed from the site root in source.
    name: 'helios-artifact-public-paths',
    transform(code, id) {
      if (!/\/src\/.*\.tsx?$/.test(id)) return;
      const next = code.replace(/(['"`])\/(previews|branding|models)\//g, '$1./$2/');
      return next === code ? undefined : { code: next, map: null };
    },
  }, {
    name: 'helios-artifact-target',
    config: () => ({ define: {
      __AETHERIS_RUNTIME_BASE__: JSON.stringify('./aetheris-runtime/'),
      __AETHERIS_WORKER_RUNTIME_BASE__: JSON.stringify('./aetheris-runtime/'),
      'import.meta.env.VITE_HELIOS_TARGET': JSON.stringify('artifact'),
    } }),
  }],
  build: { outDir: 'artifacts/local/helios-artifact/build', emptyOutDir: true, sourcemap: false },
}));
