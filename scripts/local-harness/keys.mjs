import { generateKeyPair, exportSPKI, exportPKCS8 } from 'jose'
import fs from 'node:fs'
const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
fs.mkdirSync(new URL('./.keys/', import.meta.url), { recursive: true }); fs.writeFileSync(new URL('./.keys/pub.pem', import.meta.url), await exportSPKI(publicKey)); fs.writeFileSync(new URL('./.keys/priv.pem', import.meta.url), await exportPKCS8(privateKey))
console.log('ok')
