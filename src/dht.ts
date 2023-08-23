import Id from '~/src/id.ts'
import { KRPC } from '~/src/krpc/krpc.ts'
import LocalNode from '~/src/local_node.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'
import { NetUtil } from 'toolkit'

/**
 * the host node of the dht network
 */
export default class DHT {
  static #DEFAULT_BOOTSTRAP_NODES = [
    {
      addr: 'router.bittorrent.com',
      port: 6881
    },
    {
      addr: 'dht.transmissionbt.com',
      port: 6881
    },
    {
      addr: 'router.utorrent.com',
      port: 6881
    },
    {
      addr: 'dht.aelitis.com',
      port: 6881
    }
  ]
  #bootstrapNodes: { addr: string; port: number }[] // the bootstrap nodes
  #krpc: KRPC // the krpc protocol

  private constructor(port: number, localNode: LocalNode, bootstrapNodes: { addr: string; port: number }[]) {
    // check the port
    if (!NetUtil.isNetPort(port)) {
      throw new Error('invalid port, should be in range [0, 65535], but got ' + port)
    }

    // check the bootstrap nodes
    if (!bootstrapNodes || bootstrapNodes.length == 0) {
      throw new Error('you should provide at least one bootstrap node, or use the default bootstrap nodes')
    }

    // initilize the routing table
    logger.info('initilize the routing table')
    RoutingTable.init(localNode)

    // initilize the bootstrap nodes
    logger.info('initilize the bootstrap nodes')
    this.#bootstrapNodes = bootstrapNodes

    // initilize the krpc protocol
    logger.info('initilize the krpc protocol')
    this.#krpc = KRPC.create(port)

    // ping the bootstrap nodes
    this.pingBootstrapNodes()
  }

  /**
   * create a dht network and listen on the port
   * @param port the port to listen on
   * @param bootstrapNodes the bootstrap nodes
   * @returns
   */
  static async listen(port: number, bootstrapNodes: { addr: string; port: number }[] = DHT.#DEFAULT_BOOTSTRAP_NODES) {
    const localNdoe = await LocalNode.createLocalNode(port)

    return new DHT(port, localNdoe, bootstrapNodes)
  }

  /**
   * ping the bootstrap nodes
   */
  async pingBootstrapNodes() {
    logger.info(`start pingBootstrapNodes`)
    for (const bootstrapNode of this.#bootstrapNodes) {
      logger.info(`ping the bootstrap node ${bootstrapNode.addr}:${bootstrapNode.port}`)
      // async ping the bootstrap node
      // TODO pre resolve dns of the bootstrap node, to improve the performance
      await this.#krpc.sendPingBootrapNodesRequest(bootstrapNode)
      await this.#krpc.sendFindNodeRequest(bootstrapNode.port, bootstrapNode.addr, Id.random())
    }
  }

  async sendFindNodeRequest() {
    logger.info(`start sendFindNodeRequest`)
    // get node from bucket
    for (const bucket of RoutingTable.get().buckets || []) {
      if (bucket.isEmpty()) {
        continue
      }
      for (const node of bucket.nodes) {
        await this.#krpc.sendFindNodeRequest(node.port, node.addr, Id.random())
      }
    }
  }

  async sendGetPeersRequest(infoHash: Uint8Array) {
    logger.info(`start sendGetPeersRequest`)
    if (RoutingTable.get().nodeCount === 0) {
      logger.info(`no nodes in the routing table, skip sendGetPeersRequest`)
      return
    }
    const closestNodes = RoutingTable.get().findClosestNodes(Id.fromUnit8Array(infoHash))

    if (closestNodes.length === 0) {
      logger.info(`[no closest nodes found], sendGetPeersRequest to a random node`)
      // 随机获取一个node
      const node = RoutingTable.get().getRandomNode()
      if (node) {
        await this.#krpc.sendGetPeersRequest(node, infoHash)
        return
      }
    } else {
      logger.info(`[closest nodes found], sendGetPeersRequest to ${closestNodes.length} nodes`)
      for (const node of closestNodes) {
        await this.#krpc.sendGetPeersRequest(node, infoHash)
      }
    }
  }
}
