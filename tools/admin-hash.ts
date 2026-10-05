import { randomBytes } from 'node:crypto'
import { hashAdminPassword } from '../apps/server/src/admin'

const password = process.env.ADMIN_PASSWORD
if (!password || password.length < 12) throw new Error('set ADMIN_PASSWORD (12+ chars) in the environment')
console.log(hashAdminPassword(password, randomBytes(16).toString('hex')))
