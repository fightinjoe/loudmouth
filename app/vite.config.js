import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
})
