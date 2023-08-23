import Bucket from '~/src/bucket.ts'
import Id from '~/src/id.ts'
import LocalNode from '~/src/local_node.ts'
import Node from '~/src/node.ts'
import logger from '~/src/util/log.ts'
import { BitArray } from 'toolkit'

/**
 * RoutingTable contains a list of buckets, each bucket contains a list of nodes
 */
export default class RoutingTable {
  static #INSTANCE: RoutingTable
  static BUCKET_CAPACITY = 8 // the max node count in a bucket
  #localNode: LocalNode
  #buckets: Bucket[] = [] // <prefix, bucket>

  static get() {
    if (!RoutingTable.#INSTANCE) {
      throw new Error('RoutingTable has not been initialized')
    }
    return RoutingTable.#INSTANCE
  }

  private constructor(localNode: LocalNode) {
    this.#localNode = localNode
    this.initBuckets()
  }

  static init(localNode: LocalNode) {
    if (RoutingTable.#INSTANCE) {
      throw new Error('RoutingTable has been initialized')
    } else {
      RoutingTable.#INSTANCE = new RoutingTable(localNode)
    }
  }

  get localNode() {
    return this.#localNode
  }

  get buckets(): Bucket[] {
    return this.#buckets
  }

  get nodeCount() {
    let count = 0
    for (const bucket of this.#buckets.values()) {
      count += bucket.size
    }
    return count
  }

  /**
   * initialize the buckets, the number of buckets is equal to the length of the id, e.g. 160
   * after the id of local node was known, the buckets can be initialized
   *
   * e.g here is a 2-bit binary tree, if local node id 01, we can split it to 2 subtree, each bucket is subset of the subtree,
   *       *
   *    /     \
   *   1      [0]
   *  / \     /  \
   * 1   0  [1]   0
   *
   *
   * bucket-0: just a leaf node 0, no children.
   *   [0] parent is 0
   *
   * bucket-1: a full binary tree, the root is 1, the left child is 1, the right child is 0.
   *   [1] parent is none
   *  /   \
   * 1     0
   *
   */
  initBuckets() {
    this.#buckets.push(
      ...this.generateBuckets(BitArray.fromBinaryString('0'.repeat(160)), BitArray.fromBinaryString('1'.repeat(160)))
    )

    logger.info(`init ${this.#buckets.length} buckets`)
  }

  /**
   * use binary recursion to generate buckets, the bucket count is equal to the length of the id(160)
   *
   * @param start
   * @param end must be 2^x, because the bucket is a full binary tree
   * @returns
   */
  generateBuckets(start: BitArray, end: BitArray): Bucket[] {
    // [1 2 3 4] => [1 (2)] [(3) 4] => (2) is left end, (3) is right start

    const leftStart = start
    const leftEnd = BitArray.fromBigInt((start.toBigInt() + end.toBigInt() - 1n) / 2n, 160)
    const rightStart = BitArray.fromBigInt(leftEnd.toBigInt() + 1n, 160)
    const rightEnd = end

    // only left local node, stop recursion
    if (start.equals(end) && start.equals(this.#localNode.id.bits)) {
      return []
    }

    // logger.info(`local node ${localNode.id.bits.toString()}`)
    const leftBu = new Bucket(RoutingTable.BUCKET_CAPACITY, leftStart, leftEnd)
    const rightBu = new Bucket(RoutingTable.BUCKET_CAPACITY, rightStart, rightEnd)

    if (leftBu.withinRnage(this.#localNode.id)) {
      return [rightBu, ...this.generateBuckets(leftStart, leftEnd)]
    } else if (rightBu.withinRnage(this.#localNode.id)) {
      return [leftBu, ...this.generateBuckets(rightStart, rightEnd)]
    } else {
      throw new Error('local node is not in the range of the buckets')
    }
  }

  /**
   * add a node to the routing table
   * @param node
   */
  add(node: Node) {
    // logger.info(`current node count is ${this.nodeCount}, before add node ${node.id.toIntSting()}`)
    // use itrator to iterate the buckets, beacuse there may be some add or remove operation in the loop
    for (const bucket of this.#buckets.values()) {
      // if the node is within the bucket range, add the node to the bucket
      if (bucket.withinRnage(node.id)) {
        // logger.info(
        //   `node(${node.id.toIntSting()}) is in the bucket[${bucket.start.toIntString()}, ${bucket.end.toIntString()}]]`
        // )
        return bucket.add(node)
      }
    }
    return false
  }

  addNodes(nodes: Node[]) {
    for (const node of nodes) {
      this.add(node)
    }
  }

  /**
   * remove a node from the routing table
   * @param node
   */
  remove(node: Node) {
    for (const bucket of this.#buckets.values()) {
      if (bucket.withinRnage(node.id)) {
        bucket.remove(node)
        break
      }
    }
  }

  removeByNodeId(nodeId: Id) {
    for (const node of this.getAllNodes()) {
      if (node.id.equals(nodeId)) {
        this.remove(node)
        break
      }
    }
  }

  removeByIp(ip: string) {
    for (const node of this.getAllNodes()) {
      if (node.addr === ip) {
        this.remove(node)
      }
    }
  }

  removeNodes(nodes: Node[]) {
    for (const node of nodes) {
      this.remove(node)
    }
  }

  removeClosestNode(targetNode: Node) {
    const closestNodes = this.findClosestNodes(targetNode.id)

    if (!closestNodes) {
      return
    }

    this.removeNodes(closestNodes)
  }

  getRandomNode() {
    for (const bucket of this.#buckets.values()) {
      if (bucket.isEmpty()) continue
      return bucket.latest
    }
  }

  getAllNodes() {
    const nodes: Node[] = []
    for (const bucket of this.#buckets.values()) {
      if (bucket.isEmpty()) continue
      for (const node of bucket.nodes.values()) {
        nodes.push(node)
      }
    }
    return nodes
  }

  /**
   * find the closest node to the target node
   * @param targetNodeId
   * @returns the closest nodes to the target node
   */
  findClosestNodes(targetNodeId: Id, count = 8) {
    logger.info(`[findClosestNodes] total node count is ${this.nodeCount}`)

    // sort all nodes by distance to the target node
    const nodes = this.getAllNodes().sort((a, b) => {
      return a.id.bits.xor(targetNodeId.bits).lessThan(b.id.bits.xor(targetNodeId.bits)) ? -1 : 1
    })

    const MAX_NODE_COUNT = Math.min(this.nodeCount, count)

    // return the first count nodes
    return nodes.slice(0, MAX_NODE_COUNT)
  }

  updateNode(newNode: Node) {
    const old = this.findNode(newNode.id)
    if (!old) {
      return
    }
    old.update(newNode.port, newNode.addr)
  }

  /**
   * find a bucket closest to the target node
   * @param id
   */
  private findClosestBucket(nodeId: Id) {
    for (const bucket of this.#buckets.values()) {
      if (bucket.isEmpty()) continue

      if (bucket.withinRnage(nodeId)) {
        // if bucket is empty
        return bucket
      }
    }
    return undefined
  }

  findNode(nodeId: Id) {
    for (const bucket of this.#buckets.values()) {
      if (bucket.isEmpty()) continue
      for (const node of bucket.nodes.values()) {
        if (node.id.equals(nodeId)) {
          return node
        }
      }
    }
    return undefined
  }
}
