import { BitArray } from 'toolkit'
import Node from '~/src/node.ts'
import logger from '~/src/util/log.ts'
import Id from '~/src/id.ts'

export default class Bucket {
  #nodes: Node[] = []
  #capacity: number // the capacity of the bucket
  #updatedAt = Date.now()
  #start: BitArray // the lower limit of the bucket
  #end: BitArray // the upper limit of the bucket

  /**
   * Bucket is a sorted list of nodes
   * @param capacity the capacity of the bucket default is 8
   */
  constructor(capacity: number = 8, start: BitArray, end: BitArray) {
    // check capacity
    if (capacity <= 0) {
      throw new Error('bucket capacity must be greater than 0')
    }

    // check start and end, sometimes start and end are same, when the bucket contains local node, and the start and end also equal to local node id
    if (start.greaterThan(end)) {
      throw new Error(`start must be less than end, start is ${start.toString()}, end is ${end.toString()}`)
    }

    // start and end bit length must be same, and equal to 160
    if (start.length !== end.length || start.length !== 160) {
      throw new Error(
        `start and end bit length must be same, and equal to 160, start length is ${start.length}, end length is ${end.length}`
      )
    }

    this.#capacity = capacity
    this.#start = start
    this.#end = end
  }

  get start() {
    return this.#start
  }

  get end() {
    return this.#end
  }

  /**
   * get the size of the bucket
   */
  get size() {
    return this.#nodes.length
  }

  /**
   * get the capacity of the bucket
   */
  get updatedAt() {
    return this.#updatedAt
  }

  /**
   * get oldest node in the bucket
   */
  get oldest() {
    if (this.#nodes.length === 0) {
      return undefined
    }

    // the oldest node is the last node in the bucket
    return this.#nodes[this.#nodes.length - 1]
  }

  get latest() {
    if (this.#nodes.length === 0) {
      return undefined
    }

    // the latest node is the first node in the bucket
    return this.#nodes[0]
  }

  /**
   * check the node is in the interval of the bucket
   * e.g. bucket interval is [0000, 1111], node is 0011, return true
   * @param id
   */
  withinRnage(id: Id) {
    return id.bits.greaterThanOrEqual(this.#start) && id.bits.lessThanOrEqual(this.#end)
  }

  /**
   * add a node to the bucket, return true if the node is added, otherwise return false
   * if the node is already in the bucket, just update the last active time
   * if the bucket is full, remove a oldest node, and add the new node to top of the bucket
   *
   * @param node the node to be added
   * @returns true if the node is added, otherwise return false
   */
  add(node: Node): boolean {
    this.#updatedAt = Date.now()

    const old = this.#nodes.find((n) => n.id === node.id)

    // if the node is already in the bucket, update the last active time
    if (old) {
      old.update(node.port, node.addr)
      logger.warn(`node ${node.id.toString()} is already in the bucket,just update the last active time`)
      return false
    }

    // if the bucket is full, remove a inactive node
    if (this.isFull()) {
      this.remove(this.oldest!)
    }

    // add the node to the bucket
    node.updateActivedAt()

    // add to the start of the array
    this.#nodes.unshift(node)

    return true
  }

  /**
   * check the bucket is full
   * @returns
   */
  isFull() {
    return this.#nodes.length >= this.#capacity
  }

  isEmpty() {
    return this.#nodes.length === 0
  }

  /**
   * remove a node, return true if the node is removed, otherwise return false if the node is not in the bucket
   * @param node
   */
  remove(node: Node) {
    this.#updatedAt = Date.now()

    for (let i = 0; i < this.#nodes.length; i++) {
      if (this.#nodes[i].id === node.id) {
        // remove the node
        this.#nodes.splice(i, 1)
        return true
      }
    }

    return false
  }

  /**
   * obtain latest nodes from the bucket
   * @param count the count of the nodes to be obtained, max is bucket capacity
   * @returns the nodes
   */
  obtainNodes(count = 8): Node[] {
    const maxCount = Math.min(count, this.#nodes.length)
    return this.#nodes.slice(0, maxCount)
  }

  get nodes(): Node[] {
    return this.#nodes
  }

  cloestNodes(targetNodeId: Id, count: number) {
    const maxCount = Math.min(count, this.#nodes.length)

    // sort the nodes by the distance to the target node
    return this.#nodes
      .sort((a, b) => {
        return a.id.bits.xor(targetNodeId.bits).lessThan(b.id.bits.xor(targetNodeId.bits)) ? -1 : 1
      })
      .slice(0, maxCount)
  }

  toString() {
    return `Bucket-filled(${this.size})-remained(${this.#capacity - this.size}):[${this.#nodes
      .map((node) => node.toString())
      .join(', ')}]`
  }
}
