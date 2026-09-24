import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

function parsePort(value, name, fallback) {
  const candidate = value ?? String(fallback)
  if (!/^[1-9]\d*$/.test(candidate)) {
    throw new Error(`${name} must be an integer from 1 to 65535`)
  }

  const port = Number(candidate)
  if (port > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535`)
  }
  return port
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    optimizeDeps: {
      include: ['@catchphrase/card-schema'],
    },
    build: {
      commonjsOptions: {
        include: [/node_modules/, /api\/src\/schema\//],
      },
    },
    server: {
      host: true,
      port: parsePort(env.VITE_DEV_PORT, 'VITE_DEV_PORT', 8000),
      strictPort: true,
    },
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Loudmouth',
          short_name: 'Loudmouth',
          display: 'standalone',
          background_color: '#f5f5f0',
          theme_color: '#2d6a4f',
          start_url: '/',
          handle_links: 'preferred',
          scope_extensions: [{ origin: 'https://loudmouth-gilt.vercel.app' }],
          icons: [
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
            // TODO: add actual PNG icons
            // { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            // { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        },
      }),
    ],
  }
})
