import { BytesUtil } from 'toolkit'
import { crypto, toHashString } from 'std/crypto/mod.ts'
import { encodeHex } from 'std/encoding/hex.ts'
/**
 * get a sha1 hash, return hex string
 * @param data data to hash
 * @returns unit8array of sha1 hash
 */
export function sha1(data: Uint8Array): Uint8Array {
  const hash = crypto.subtle.digestSync('SHA-1', data)
  return new Uint8Array(hash)
}

/**
 * get a random sha1 hash, return hex string
 * @returns unit8array of sha1 hash
 */
export function randomSha1(): Uint8Array {
  return sha1(crypto.getRandomValues(new Uint8Array(20)))
}

/**
 * get a sha1 hash, return hex string
 * @param data data to hash
 * @returns hex string e.g. 'a9993e364706816aba3e25717850c26c9cd0d89d'
 */
export function sha1String(data: Uint8Array): string {
  return encodeHex(sha1(data))
}

/**
 * get a random sha1 hash, return hex string
 * @returns hex string e.g. 'a9993e364706816aba3e25717850c26c9cd0d89d'
 */
export function randomSha1String(): string {
  return sha1String(crypto.getRandomValues(new Uint8Array(20)))
}
