import Id from '~/src/id.ts'
import ErrorResponseHandler from '~/src/krpc/handler/error_handler.ts'
import RequestHandler from '~/src/krpc/handler/request_handler.ts'
import ResponseHandler from '~/src/krpc/handler/response_handler.ts'
import Sender from '~/src/krpc/sender.ts'
import TranscationManager from '~/src/krpc/transcation_manager.ts'
import MessageFactory, { Message, MessageType, QueryType } from '~/src/message_factory.ts'
import Node from '~/src/node.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'
import { NetUtil } from 'toolkit'

export interface MessageHandler {
  /**
   * get the message type, then the dispatcher will call the handle() method
   */
  getHandleMessageType(): MessageType

  handle(message: Message, address: string, port: number, client: Sender): Promise<void>
}

/**
 * KRPC protocol implementation for DHT
 */
export class KRPC implements Sender {
  #port: number
  #udp: Deno.DatagramConn
  #messageHandlers: MessageHandler[] = [new ResponseHandler(), new RequestHandler(), new ErrorResponseHandler()]

  private constructor(port: number) {
    this.#port = port

    // initilize the a udp listener and sender
    this.#udp = Deno.listenDatagram({
      port: this.#port,
      transport: 'udp',
      hostname: '0.0.0.0' // listen on all interfaces
    })

    // async handle response
    this.handlePacket()
  }
  /**
   * create a KRPC instance
   * @param port
   * @returns
   */
  static create(port: number) {
    if (!NetUtil.isNetPort(port)) throw new Error('invalid port, should be in range [0, 65535], but got ' + port)
    return new KRPC(port)
  }

  /**
   * dispatch message to the corresponding handler
   * @param message the message to dispatch
   * @param address the address of the node
   * @param port the port of the node
   */
  async dispatchMessage(message: Message, address: string, port: number) {
    for (const handler of this.#messageHandlers) {
      if (handler.getHandleMessageType() !== message.y) {
        continue
      }

      // if the handler can handle the message, call the handle() method
      await handler.handle(message, address, port, this)
    }
  }

  /**
   * handle udp packet
   */
  async handlePacket() {
    for await (const packet of this.#udp) {
      // unpack the packet
      const [data, addr] = packet as [Uint8Array, Deno.NetAddr]
      const address = addr.hostname
      const port = addr.port
      const message = await MessageFactory.decode(data)

      if (!message) {
        // write bytes to local
        logger.error(`[<======UDP-handlePacket] decode data failed: ${data}, from ${address}:${port}`)

        // remove the node from routing table
        logger.info(`[<======UDP-handlePacket]  remove node ${address}:${port} from routing table`)
        RoutingTable.get().removeByIp(address)
        continue
      }

      if (typeof message.t !== 'string') {
        // decode tid from unit8array to string
        message.t = new TextDecoder().decode(message.t)
      }

      const tid = message.t

      try {
        logger.info(`╔============================= HANDLE MESSAFGE START ===========================╗${tid}`)
        await this.dispatchMessage(message, address, port)
        logger.info(`╚============================= HANDLE MESSAFGE END   ===========================╝${tid}\n`)
      } catch (e) {
        logger.error(`[<======UDP-handlePacket] dispatch message failed: ${e}`)
      }
    }
  }

  /**
   * // TODO handle timeout request
   * send a message to a node
   * @param port port of the node
   * @param addr address of the node
   * @param messageFc the message to send
   */
  async sendMessage(port: number, addr: string, messageFc: MessageFactory) {
    const bencodeMessage = await messageFc.bencode()

    try {
      await this.#udp.send(bencodeMessage, {
        transport: 'udp',
        hostname: addr,
        port: port
      })
      // logger.info(`[======>SEND] send message to ${addr}:${port} success: (${JSON.stringify(message)}`)
    } catch (e) {
      logger.error(`[======>SEND] send message to ${addr}:${port} failed`, e)
    }
  }

  /**
   * send a ping query to the node
   *
   * request:
   * ping Query = {"t":"aa", "y":"q", "q":"ping", "a":{"id":"<hex string>"}}
   * the id is local node id
   *
   * response:
   * Response = {"t":"aa", "y":"r", "r": {"id":"<hex string>"}}
   * the id is the node which response the ping query
   *
   * @param targetNode which node to ask
   * @param nodeId the node id of the local node
   *
   */
  async sendPingRequest(targetNode: Node) {
    const tid = TranscationManager.get().create({
      type: QueryType.PING,
      addr: targetNode.addr,
      port: targetNode.port
    })

    const messageFC = MessageFactory.requestPing(tid, RoutingTable.get().localNode.id)

    // send the message
    await this.sendMessage(targetNode.port, targetNode.addr, messageFC)
  }

  /**
   * send a find_node query to the node
   *
   * find_node Query = {"t":"aa", "y":"q", "q":"find_node", "a": {"id":"<hex string>", "target":"<hex string>"}}
   * "id" containing the node ID of the querying node, and "target" containing the ID of the node sought by the queryer.
   *
   * Response = {"t":"aa", "y":"r", "r": {"id":"<hex string>", "nodes": "<hex string>"}}
   *
   * @param port
   * @param addr
   */
  async sendFindNodeRequest(port: number, addr: string, targetId: Id) {
    const tid = TranscationManager.get().create({
      type: QueryType.FIND_NODE,
      addr: addr,
      port: port
    })

    const messageFC = MessageFactory.requestFindNode(tid, RoutingTable.get().localNode.id, targetId)
    await this.sendMessage(port, addr, messageFC)
  }

  /**
   * send a get_peers query to target node to get peers of the file
   *
   * @param targetNode which node to get peers from, the node must be in the routing table
   * @param infoHash the info hash of the file
   */
  async sendGetPeersRequest(targetNode: Node, infoHash: Uint8Array) {
    const tid = TranscationManager.get().create({
      type: QueryType.GET_PEERS,
      infoHash: infoHash,
      addr: targetNode.addr,
      port: targetNode.port
    })
    const messageFC = MessageFactory.requestGetPeers(tid, RoutingTable.get().localNode.id, infoHash)
    await this.sendMessage(targetNode.port, targetNode.addr, messageFC)
  }

  /**
   * send a announce_peer query to target node to announce the peer, means tell the node that I have the file
   *
   * get_peers Query = {"t":"aa", "y":"q", "q":"get_peers", "a": {"id":"<hex string>", "info_hash":"<hex string>"}}
   * Response with closest nodes = {"t":"aa", "y":"r", "r": {"id":"<hex string>", "token":"<token>", "nodes": "<hex string>"}}
   *
   * @param targetNode which node to announce to, the node must be in the routing table
   * @param infoHash the info hash of the file
   * @param token the token of the node
   */
  async sendAnnouncePeerRequest(targetNode: Node, infoHash: Uint8Array) {
    const tid = TranscationManager.get().create({
      type: QueryType.ANNOUNCE_PEER,
      infoHash: infoHash,
      addr: targetNode.addr,
      port: targetNode.port
    })
    const messageFC = MessageFactory.requestAnnouncePeer(tid, RoutingTable.get().localNode.id, infoHash, this.#port)
    await this.sendMessage(targetNode.port, targetNode.addr, messageFC)
  }

  /**
   * same as ping, but send to a specific port and addr, because for bootstrap node, we don't know the node id
   * @param bootstrapNode {addr: string, port: number}
   */
  async sendPingBootrapNodesRequest({ addr, port }: { addr: string; port: number }) {
    const tid = TranscationManager.get().create({
      type: QueryType.PING,
      addr: addr,
      port: port
    })
    const messageFC = MessageFactory.requestPing(tid, RoutingTable.get().localNode.id)
    await this.sendMessage(port, addr, messageFC)
  }
}
