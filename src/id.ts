import { BitArray, BytesUtil, NetUtil } from 'toolkit'
import { randomSha1, sha1 } from '~/src/util/hash.ts'

/**
 * node's id or infohash, 20 bytes sha1 hash
 */
export default class Id {
  static readonly BYTES_LENGTH = 20 // max size of the id in bytes
  static readonly BIT_LENGTH = Id.BYTES_LENGTH * 8 // max size of the id in bits
  #value: BitArray // the value of the id

  /**
   * @param value the value of the id, default is a random sha1 hash
   */
  private constructor(value: BitArray) {
    if (value.bytes.length !== Id.BYTES_LENGTH)
      throw new Error(`id length must be ${Id.BYTES_LENGTH}, but got ${value.length}`)
    this.#value = value
  }

  static isValidId(id?: Uint8Array) {
    return id && id.length === Id.BYTES_LENGTH
  }

  static fromUnit8Array(bytes: Uint8Array) {
    return new Id(BitArray.fromUnit8Array(bytes))
  }

  static random() {
    return Id.fromUnit8Array(randomSha1())
  }

  /**
   * get the value of the id
   */
  get bits() {
    return this.#value
  }

  /**
   * compare this id with the other id
   * @param other
   * @returns
   */
  equals(other: Id): boolean {
    return this.#value.equals(other.#value)
  }

  /**
   * hex string
   */
  toString() {
    return BytesUtil.bytes2HexStr(this.#value.bytes)
  }

  toIntSting() {
    return this.#value.toBigInt().toString()
  }

  toBinaryString() {
    return this.#value.toString()
  }

  /**
   * create a id by the mac address
   * @returns
   */
  static async createIdByMacAddr() {
    const macAddrs = await NetUtil.getMacAddr()
    if (!macAddrs || macAddrs.length === 0) {
      throw new Error('cannot get the mac address')
    }
    return Id.fromUnit8Array(sha1(new TextEncoder().encode(macAddrs[0])))
  }
}
