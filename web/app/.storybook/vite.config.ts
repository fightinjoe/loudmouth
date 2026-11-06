import { defineConfig, normalizePath } from 'vite';
import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

const source = (relative: string): string =>
  normalizePath(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)));
const storage = source('js/storage-config.ts');
const speech = source('js/tts.ts');

function isolatedBoundaries(): Plugin {
  return {
    name: 'catchphrase-storybook-boundaries',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      if (id === 'storybook:actual/tts') return `${speech}?storybook-actual`;
      if (id.includes('?storybook-actual')) return null;
      if (!/(?:^|\/)(?:storage-config|tts)(?:\.ts)?(?:\?.*)?$/.test(id)) return null;
      const resolved = await this.resolve(id, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const canonical = normalizePath(resolved.id).split('?')[0];
      if (canonical === storage) return source('stories/support/storage-config.ts');
      if (canonical === speech) return source('stories/support/speech.ts');
      return null;
    },
  };
}

export default defineConfig({
  envDir: false,
  plugins: [isolatedBoundaries()],
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__storybook_api__') },
  optimizeDeps: { include: ['@catchphrase/card-schema'], force: true },
  build: { commonjsOptions: { include: [/node_modules/, /api\/src\/schema\//] } },
});
