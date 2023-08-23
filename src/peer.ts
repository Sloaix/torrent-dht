import { NetUtil } from 'toolkit'
import { extractCompactAddr, isAddr, packageCompactAddr } from '~/src/util/net.ts'

/**
 * Peer represents a peer in the network, it contains the peer's ip address and port
 */
export default class Peer {
  #addrType!: string // the type of the address
  #addr!: string // the address of the peer,maybe domain or ipv4 or ipv6
  #port!: number // port number

  /**
   * create a new peer
   * @param port the port number, must be in the range of 0 to 65535
   * @param addr the address of the peer, maybe domain or ipv4 or ipv6
   */
  constructor(port: number, addr: string) {
    this.addr = addr
    this.port = port
  }

  /**
   * create a new peer from compact peer info,4 bytes for ipv4, 2 bytes for port
   * @param compactPeerInfo
   */
  static fromCompact(compactPeerInfo: Uint8Array) {
    const { port, addr } = extractCompactAddr(compactPeerInfo)
    return new Peer(port, addr)
  }

  private parseAddrType(addr: string) {
    let type: 'ipv4' | 'domain'
    if (NetUtil.isIPv4Str(addr)) {
      type = 'ipv4'
    } else if (NetUtil.isDomain(addr)) {
      type = 'domain'
    } else {
      throw new Error('invalid address: ' + addr)
    }

    return type
  }

  set addr(addr: string) {
    if (!isAddr(addr)) throw new Error('invalid address: ' + addr)
    this.#addr = addr
    this.#addrType = this.parseAddrType(addr)
  }

  get addr() {
    return this.#addr
  }

  get addrType() {
    return this.#addrType
  }

  set port(port: number) {
    if (!NetUtil.isNetPort(port)) throw new Error(`port must be in the range of 0 to 65535, but got ${port}`)
    this.#port = port
  }

  get port() {
    return this.#port
  }

  update(port: number, addr: string) {
    this.port = port
    this.addr = addr
  }

  toString() {
    return `{port: ${this.port}, addr: ${this.addr}}`
  }

  toCompact() {
    return packageCompactAddr(this.#addr, this.port)
  }
}
