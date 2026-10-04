import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA, type ManifestOptions } from 'vite-plugin-pwa'

const LOG_DIR = resolve(__dirname, '../../.local/device-logs')

const MANIFEST: Partial<ManifestOptions> = {
  id: '/',
  name: 'Spirit Spin',
  short_name: 'Spirit Spin',
  lang: 'en',
  categories: ['games', 'entertainment'],
  description: 'Rip your phone to launch your top, summon your spirit beast and battle your friends.',
  theme_color: '#0a0f24',
  background_color: '#0a0f24',
  display: 'standalone',
  orientation: 'portrait',
  start_url: '/',
  scope: '/',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  shortcuts: [
    { name: 'Spirit Tower', short_name: 'Tower', url: '/?go=tower', icons: [{ src: '/icons/shortcuts/tower.png', sizes: '192x192', type: 'image/png' }] },
    { name: 'Garage', short_name: 'Garage', url: '/?go=garage', icons: [{ src: '/icons/shortcuts/garage.png', sizes: '192x192', type: 'image/png' }] },
    { name: 'Live battle', short_name: 'Live', url: '/?go=friends', icons: [{ src: '/icons/shortcuts/live.png', sizes: '192x192', type: 'image/png' }] },
  ],
  screenshots: [
    { src: '/screenshots/home.webp', sizes: '1082x2202', type: 'image/webp', form_factor: 'narrow', label: 'Your spirit beast and the Story Tower' },
    { src: '/screenshots/garage.webp', sizes: '1082x2202', type: 'image/webp', form_factor: 'narrow', label: 'Build and upgrade your top in 3D' },
    { src: '/screenshots/tower.webp', sizes: '1082x2202', type: 'image/webp', form_factor: 'narrow', label: 'Climb 50 floors and beat the bosses' },
    { src: '/screenshots/result.webp', sizes: '1082x2202', type: 'image/webp', form_factor: 'narrow', label: 'Rewards after every battle' },
  ],
}

function devPwa(): Plugin {
  return {
    name: 'dev-pwa',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(JSON.stringify(MANIFEST))
      })
    },
    transformIndexHtml(html) {
      const icon = readFileSync(resolve(__dirname, 'public/apple-touch-icon.png')).toString('base64')
      return html
        .replace('<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />', `<link rel="apple-touch-icon" href="data:image/png;base64,${icon}" />`)
        .replace('</head>', '    <link rel="manifest" href="/manifest.webmanifest" />\n  </head>')
    },
  }
}

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
    devPwa(),
    ...(process.env.HTTP_ONLY ? [] : [basicSsl({ name: 'spirit-spin-dev', domains: ['*.sslip.io', 'localhost'] })]),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/shortcuts/*.png', 'favicon.ico', 'favicon-32.png', 'favicon-16.png', 'og-image.jpg', 'apple-touch-icon.png'],
      manifest: MANIFEST,
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: ['**/__*.html', '**/devices.html'],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'font-css' } },
          { urlPattern: /^https:\/\/fonts\.gstatic\.com\//, handler: 'CacheFirst', options: { cacheName: 'font-files', expiration: { maxEntries: 20, maxAgeSeconds: 31536000 }, cacheableResponse: { statuses: [0, 200] } } },
          { urlPattern: /\/assets\/.*\.(webp|png|mp3|ogg|json)(\?.*)?$/, handler: 'CacheFirst', options: { cacheName: 'game-assets', expiration: { maxEntries: 600 } } },
        ],
      },
    }),
  ],
  server: { port: 5173, host: true, allowedHosts: ['.sslip.io', '.trycloudflare.com', 'localhost'], proxy: { '/v1': 'http://localhost:8787', '/healthz': 'http://localhost:8787', '/rt': { target: process.env.RT_TARGET ?? 'ws://localhost:8787', ws: true } } },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
} as never)
