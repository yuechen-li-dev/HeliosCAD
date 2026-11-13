import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

/** The claude.ai artifact preview: relative asset paths, hash routes, the runtime next to the page. */
export default mergeConfig(base, defineConfig({
  base: './',
  plugins: [{
    // Public files (previews, branding, models) are addressed from the site root; the preview page is not at one.
    name: 'helios-artifact-public-paths',
    transform(code, id) {
      if (!/\/src\/.*\.tsx?$/.test(id)) return;
      const next = code.replace(/(['"`])\/(previews|branding|models)\//g, '$1./$2/');
      return next === code ? undefined : { code: next, map: null };
    },
  }, {
    name: 'helios-artifact-runtime-base',
    config: () => ({ define: {
      __AETHERIS_RUNTIME_BASE__: JSON.stringify('./aetheris-runtime/'),
      __AETHERIS_WORKER_RUNTIME_BASE__: JSON.stringify('./aetheris-runtime/'),
      'import.meta.env.VITE_HASH_ROUTES': JSON.stringify('true'),
    } }),
  }],
  build: { outDir: 'artifacts/local/artifact-preview', emptyOutDir: true },
}));
