import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    basicSsl({ name: 'spirit-spin-dev', domains: ['*.sslip.io', 'localhost'] }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Spirit Spin',
        short_name: 'Spirit Spin',
        description: 'Rip your phone. Summon your spirit. Battle your friends.',
        theme_color: '#0a0f24',
        background_color: '#0a0f24',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        runtimeCaching: [
          { urlPattern: /\/assets\/.*\.(webp|png|mp3|ogg|json)$/, handler: 'CacheFirst', options: { cacheName: 'game-assets', expiration: { maxEntries: 600 } } },
        ],
      },
    }),
  ],
  server: { port: 5173, host: true, allowedHosts: ['.sslip.io', '.trycloudflare.com', 'localhost'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
} as never)
