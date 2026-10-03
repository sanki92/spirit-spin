import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { appendFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const LOG_DIR = resolve(__dirname, '../../.local/device-logs')

function deviceLogs(): Plugin {
  return {
    name: 'device-logs',
    configureServer(server) {
      mkdirSync(LOG_DIR, { recursive: true })
      server.middlewares.use('/__log', (req, res) => {
        let body = ''
        req.on('data', c => { body += c; if (body.length > 2e6) req.destroy() })
        req.on('end', () => {
          try {
            const day = new Date().toISOString().slice(0, 10)
            const ip = req.socket.remoteAddress ?? '?'
            const rows = (JSON.parse(body) as object[]).map(r => JSON.stringify({ at: new Date().toISOString(), ip, ...r }))
            appendFileSync(resolve(LOG_DIR, `${day}.jsonl`), rows.join(String.fromCharCode(10)) + String.fromCharCode(10))
          } catch {
            res.statusCode = 400
          }
          res.end()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [
    {
      name: 'versioned-art-cache',
      configureServer(server: { middlewares: { use(fn: (req: { url?: string }, res: { setHeader(k: string, v: string): void }, next: () => void) => void): void } }) {
        server.middlewares.use((req, res, next) => {
          if (/^\/assets\/.+\.webp\?v=/.test(req.url ?? '')) {
            const set = res.setHeader.bind(res)
            res.setHeader = (k, v) => set(k, k.toLowerCase() === 'cache-control' ? 'public, max-age=31536000, immutable' : v)
            set('Cache-Control', 'public, max-age=31536000, immutable')
          }
          next()
        })
      },
    },
    react(),
    deviceLogs(),
    ...(process.env.HTTP_ONLY ? [] : [basicSsl({ name: 'spirit-spin-dev', domains: ['*.sslip.io', 'localhost'] })]),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        id: '/',
        name: 'Spirit Spin',
        short_name: 'Spirit Spin',
        lang: 'en',
        categories: ['games', 'entertainment'],
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
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'font-css' } },
          { urlPattern: /^https:\/\/fonts\.gstatic\.com\//, handler: 'CacheFirst', options: { cacheName: 'font-files', expiration: { maxEntries: 20, maxAgeSeconds: 31536000 }, cacheableResponse: { statuses: [0, 200] } } },
          { urlPattern: /\/assets\/.*\.(webp|png|mp3|ogg|json)(\?.*)?$/, handler: 'CacheFirst', options: { cacheName: 'game-assets', expiration: { maxEntries: 600 } } },
        ],
      },
    }),
  ],
  server: { port: 5173, host: true, allowedHosts: ['.sslip.io', '.trycloudflare.com', 'localhost'], proxy: { '/v1': 'http://localhost:8787', '/healthz': 'http://localhost:8787', '/rt': { target: 'ws://localhost:8787', ws: true } } },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
} as never)
