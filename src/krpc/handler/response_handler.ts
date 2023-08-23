import { BytesUtil } from 'toolkit'
import Id from '~/src/id.ts'
import InfoHashManager from '~/src/info_hash_manager.ts'
import { MessageHandler } from '~/src/krpc/krpc.ts'
import Sender from '~/src/krpc/sender.ts'
import TranscationManager, { Request } from '~/src/krpc/transcation_manager.ts'
import { Message, MessageType, QueryType } from '~/src/message_factory.ts'
import Node from '~/src/node.ts'
import Peer from '~/src/peer.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'
import { COMPAT_ADDR_V4_LEN, COMPAT_NODE_LEN } from '~/src/util/net.ts'

export default class ResponseHandler implements MessageHandler {
  #sender!: Sender

  // tell the dispatcher this handler only handle response message
  getHandleMessageType(): MessageType {
    return MessageType.RESPONSE
  }

  /**
   * handle the response message
   * @param response the response message
   * @param addr the address of the response message sender
   * @param port the port of the response message sender
   * @param sender the sender of the response message
   * @returns
   */
  async handle(response: Message, addr: string, port: number, sender: Sender): Promise<void> {
    if (!this.#sender) {
      this.#sender = sender
    }

    const { t: tid, r: data, q: type } = response

    // check tid is valid
    if (!TranscationManager.get().isValid(tid)) {
      logger.warn(`[${tid}}]received a invalid tid: ${tid}, drop the message, which from ${addr}:${port}`)
      return
    }

    // check response node id

    if (!Id.isValidId(data?.id)) {
      logger.warn(`[${tid}}]response without node id or invalid, drop the message, which from ${addr}:${port}`)
      return
    }

    const responseNodeId = data?.id!

    // get the request message from transcation,if not exist, drop the message, because the message is not requested by this node
    const request = TranscationManager.get().getData(tid)

    // finish the transcation
    TranscationManager.get().finish(response.t)

    if (!request) {
      logger.warn(
        `[${tid}}]received a response which is not requested by this node, drop the message, which from ${addr}:${port}`
      )
      return
    }

    const respNode = new Node(Id.fromUnit8Array(responseNodeId), port, addr)

    // by the request message query type to handle the response
    switch (request.type) {
      case QueryType.PING: {
        this.handlePingResponse(request, response, respNode, tid)
        break
      }
      case QueryType.FIND_NODE: {
        this.handleFindNodeResponse(request, response, respNode, tid)
        break
      }
      case QueryType.GET_PEERS: {
        this.handleGetPeersResponse(request, response, respNode, tid)
        break
      }
      case QueryType.ANNOUNCE_PEER: {
        this.handleAnnouncePeerResponse(request, response, respNode, tid)
        break
      }
      default:
        logger.error(`unknown query type: ${type}`)
    }
  }

  private handlePingResponse(request: Request, response: Message, respNode: Node, tid: string) {
    logger.info(`[<======RESPONSE-PING-${tid}] received from ${respNode.addr}:${respNode.port}`)

    // add the node into the routing table
    if (!RoutingTable.get().add(respNode)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }
  }

  private handleFindNodeResponse(request: Request, response: Message, respNode: Node, tid: string) {
    logger.info(`[<======RESPONSE-FIND_NODE-${tid}] received from ${respNode.addr}:${respNode.port}`)

    const nodesBytes = response.r?.nodes

    // must have nodes
    if (!nodesBytes) {
      logger.error(`[${tid}] invalid nodes bytes: ${nodesBytes}`)
      return
    }

    // check nodes bytes length
    if (nodesBytes.length % COMPAT_NODE_LEN != 0) {
      logger.error(
        `[${tid}] invalid nodes bytes: ${nodesBytes}, because the length is not a multiple of ${COMPAT_NODE_LEN}`
      )
      return
    }

    // chunk the nodes bytes to node bytes list
    const nodesBytesList: Uint8Array[] = BytesUtil.chunkBytes(nodesBytes, COMPAT_NODE_LEN)

    for (const nodeBytes of nodesBytesList) {
      const node = Node.fromCompact(nodeBytes)
      if (!RoutingTable.get().add(node)) {
        logger.error(`[${tid}] insert node ${node} to routing table failed`)
      }
    }

    // update the response node
    if (!RoutingTable.get().add(respNode)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }
  }

  private async handleGetPeersResponse(request: Request, response: Message, respNode: Node, tid: string) {
    logger.info(`[<======RESPONSE-GET_PEERS-${tid}] received from ${respNode.addr}:${respNode.port}`)
    // get infoHash from reqeust message
    const infoHash = request.infoHash

    // check info hash length
    if (!infoHash) {
      logger.error(`[${tid}] cached info hash is not exist`)
      return
    }

    // token is a short binary string, always exsits
    const token = response.t
    // there are two types of response, one is nodes, the other is values
    // nodes means the response node don't have peers which have the info hash, so it return the closer nodes
    const nodesBytes = response.r?.nodes
    // values means the response node have peers which have the info hash,and values is a list of compact address of peers
    const peersBytesList = response.r?.values

    if (!token) {
      logger.error(`[${tid}] invalid token: ${token}`)
      return
    }

    // check peerBytes
    if (peersBytesList && peersBytesList.some((bytes) => bytes.length !== COMPAT_ADDR_V4_LEN)) {
      logger.error(`[${tid}] invalid peer bytes: ${peersBytesList}`)
      return
    }

    if (peersBytesList) {
      const peers: Peer[] = []

      for (const bytes of peersBytesList) {
        try {
          const peer = Peer.fromCompact(bytes)
          peers.push(peer)
        } catch (e) {
          logger.error(`[${tid}] invalid peer bytes: ${bytes}`)
        }
      }

      logger.info(
        `[${tid}] received ${peersBytesList.length} peers for info hash: ${BytesUtil.bytes2HexStr(
          infoHash
        )},peers is ${peers}`
      )

      if (peers.length <= 0) {
        logger.info(`[${tid}] no peers found`)
        return
      }

      // store the peers associated with the token and info hash
      InfoHashManager.get().addList(BytesUtil.bytes2HexStr(infoHash), peers, token)
    } else if (nodesBytes) {
      logger.info(
        `[${tid}] received ${nodesBytes.length / COMPAT_NODE_LEN} nodes for info hash: ${BytesUtil.bytes2HexStr(
          infoHash
        )}`
      )

      const nodesBytesList: Uint8Array[] = BytesUtil.chunkBytes(nodesBytes, COMPAT_NODE_LEN)

      for (const nodeBytes of nodesBytesList) {
        const node = Node.fromCompact(nodeBytes)

        // send get peers request to the node
        await this.#sender.sendGetPeersRequest(node, infoHash)
      }
    } else {
      logger.error(`[${tid}] invalid response: ${JSON.stringify(response)}`)
      return
    }

    // update the response node
    if (!RoutingTable.get().add(respNode)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }
  }

  private handleAnnouncePeerResponse(request: Request, response: Message, respNode: Node, tid: string) {
    logger.info(`[<======RESPONSE-ANNOUNCE_PEER-${tid}] received from ${respNode.addr}:${respNode.port}`)

    // update the response node
    if (!RoutingTable.get().add(respNode)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }
  }
}
