import { buildApp } from './app'
import { loadConfig } from './config'

const cfg = loadConfig()
let stopping = false
const shutdown = async (signal: string) => {
  if (stopping) return
  stopping = true
  app.log.info({ signal }, 'shutting down')
  await app.close()
  process.exit(0)
}
const app = await buildApp(cfg, process.env.DEV_TOOLS !== '1' ? {} : { devShutdown: () => setTimeout(() => void shutdown('dev-endpoint'), 50) })
await app.listen({ port: cfg.port ?? 8787, host: '0.0.0.0' })
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
