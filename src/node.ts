import Id from '~/src/id.ts'
import Peer from '~/src/peer.ts'
import { extractCompactNode, packageCompactNode } from '~/src/util/net.ts'

/**
 * Node must be a Peer, and it contains the node's id, routing table and file info hashs
 */
export default class Node extends Peer {
  readonly ACTIVE_RANGE = 5 * 60 * 1000 // 5 minutes
  #id: Id // 20 bytes sha1 hash
  #activedAt!: number // the last active time of the node

  constructor(id: Id, port: number, addr: string) {
    super(port, addr)
    this.#id = id
    this.#activedAt = Date.now()
  }

  updateActivedAt() {
    this.#activedAt = Date.now()
  }

  get activedAt() {
    return this.#activedAt
  }

  isActive() {
    return Date.now() - this.#activedAt < this.ACTIVE_RANGE
  }

  get id() {
    return this.#id
  }

  update(port: number, addr: string): void {
    super.update(port, addr)
    this.updateActivedAt()
  }

  toString() {
    return `{id: ${this.#id.toString()}, port: ${this.port}, addr: ${this.addr}}`
  }

  toCompact() {
    return packageCompactNode(this.#id, this.addr, this.port)
  }

  static fromCompact(bytes: Uint8Array) {
    const { id, port, addr } = extractCompactNode(bytes)

    return new Node(id, port, addr)
  }
}
