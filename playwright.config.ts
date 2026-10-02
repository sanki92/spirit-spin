import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    baseURL: process.env.E2E_URL ?? 'http://localhost:5174',
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
    trace: 'retain-on-failure',
  },
})
