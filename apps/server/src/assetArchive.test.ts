import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from './app'
import { archiveBuild } from './assetArchive'

const base = mkdtempSync(join(tmpdir(), 'archive-'))
afterAll(() => rmSync(base, { recursive: true, force: true }))

function build(name: string, files: string[]): string {
  const dist = join(base, name)
  mkdirSync(join(dist, 'assets'), { recursive: true })
  writeFileSync(join(dist, 'index.html'), `<html>${name}</html>`)
  for (const f of files) writeFileSync(join(dist, 'assets', f), `/* ${name} ${f} */`)
  return dist
}

const serve = (staticDir: string, assetArchiveDir: string) =>
  buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null, staticDir, assetArchiveDir })

describe('old app versions keep working after a deploy', () => {
  it('serves the previous build’s code files after the next build replaced them', async () => {
    const archive = join(base, 'archive')
    const a = await serve(build('a', ['TopViewer-CxSZVNcr.js', 'index-OldOld12.css']), archive)
    await a.close()
    const b = await serve(build('b', ['TopViewer-jAIoFZ8_.js']), archive)
    const old = await b.inject({ method: 'GET', url: '/assets/TopViewer-CxSZVNcr.js' })
    expect(old.statusCode).toBe(200)
    expect(old.body).toContain('a TopViewer-CxSZVNcr.js')
    expect(old.headers['cache-control']).toContain('immutable')
    expect((await b.inject({ method: 'GET', url: '/assets/TopViewer-jAIoFZ8_.js' })).body).toContain('b TopViewer')
    expect((await b.inject({ method: 'GET', url: '/' })).body).toContain('<html>b</html>')
    const missing = await b.inject({ method: 'GET', url: '/assets/TopViewer-Missing0.js' })
    expect(missing.statusCode).toBe(404)
    expect(missing.headers['cache-control']).toBe('no-store')
    await b.close()
  }, 60_000)

  it('drops archived files a month after their build was replaced, never the live build', () => {
    const archive = join(base, 'archive2')
    archiveBuild(build('c', ['Old-AAAAAAAA.js', 'Live-BBBBBBBB.js']), archive)
    const longAgo = new Date(Date.now() - 40 * 86400_000)
    for (const f of ['Old-AAAAAAAA.js', 'Live-BBBBBBBB.js']) utimesSync(join(archive, 'assets', f), longAgo, longAgo)
    const r = archiveBuild(build('d', ['Live-BBBBBBBB.js']), archive)
    expect(r.pruned).toBe(1)
    expect(existsSync(join(archive, 'assets', 'Old-AAAAAAAA.js'))).toBe(false)
    expect(existsSync(join(archive, 'assets', 'Live-BBBBBBBB.js'))).toBe(true)
  })
})
