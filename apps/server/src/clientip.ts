import { BlockList, isIPv4, isIPv6 } from 'node:net'

const CLOUDFLARE_V4 = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22']
const CLOUDFLARE_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32']

const edges = new BlockList()
for (const c of CLOUDFLARE_V4) { const [net, bits] = c.split('/'); edges.addSubnet(net!, Number(bits), 'ipv4') }
for (const c of CLOUDFLARE_V6) { const [net, bits] = c.split('/'); edges.addSubnet(net!, Number(bits), 'ipv6') }

const plain = (ip: string) => ip.replace(/^::ffff:/, '')

export function fromCloudflare(ip: string): boolean {
  const p = plain(ip)
  return isIPv4(p) ? edges.check(p, 'ipv4') : isIPv6(p) ? edges.check(p, 'ipv6') : false
}

export function clientIp(req: { ip: string; headers: Record<string, string | string[] | undefined> }): string {
  const h = req.headers['cf-connecting-ip']
  const v = typeof h === 'string' ? h.trim() : ''
  return v && (isIPv4(v) || isIPv6(v)) && fromCloudflare(req.ip) ? v : req.ip
}
