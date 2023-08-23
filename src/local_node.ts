import Id from '~/src/id.ts'
import Node from '~/src/node.ts'
import { getIP } from '~/src/util/net.ts'

/**
 * LocalNode must be a Node, and it contains the node's routing table and file info hashs
 */
export default class LocalNode extends Node {
  constructor(id: Id, port: number, addr: string) {
    super(id, port, addr)
  }

  isActive(): boolean {
    // for local node, it is always active
    return true
  }

  /**
   * create a local node
   * @param port the port of the node
   * @returns the local node
   */
  static async createLocalNode(port: number) {
    // generate a relatively stable nodeId, through the mac address
    const idByMacAddr = await Id.createIdByMacAddr()
    const addr = await getIP()
    return new LocalNode(idByMacAddr, port, addr)
  }
}
