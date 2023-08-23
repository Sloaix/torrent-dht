import { Bdecoder, Bencoder } from 'bencode'
import { concat } from 'std/bytes/concat.ts'
import Id from '~/src/id.ts'
import Node from '~/src/node.ts'
import Peer from '~/src/peer.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'

export type Message = {
  t: string // transaction id, 2 bytes string
  y: MessageType // message type, may be query, response, error
  q?: QueryType // query type, may be ping, find_node, get_peers, announce_peer
  a?: {
    id: Uint8Array // node id of the querying node
    target?: Uint8Array // target node id, only for find_node query
    info_hash?: Uint8Array // info hash, only for get_peers or announce_peer query
    implied_port?: number // 0 or 1, 0 means port is the real port, 1 means port is the implied port, only for announce_peer query
    port?: number // port of the peer, only for announce_peer query
    token?: string // token for announce_peer, only for announce_peer query
  } // arguments, only for query message
  r?: {
    id: Uint8Array // node id of the responding node
    nodes?: Uint8Array // compact node info, only for find_node response
    values?: Uint8Array[] // compact peer info, only for get_peers response
    token?: string // token for announce_peer, only for get_peers response
  } // response data, only for response message
  e?: [number, string] // error,first is the error code, second is the error message
  v?: string // version of the DHT protocol, only for response or error,  The string should be a two character client identifier registered in BEP 20 [3] followed by a two character version identifier. Not all implementations include a "v" key so clients should not assume its presence.
}

/**
 * a single character value describing the type of message
 */
export enum MessageType {
  QUERY = 'q', // query
  RESPONSE = 'r', // response
  ERROR = 'e' // error
}

/**
 * there are 4 types of request, ping, find_node, get_peers, announce_peer
 */
export enum QueryType {
  PING = 'ping', // to test whether a node is reachable
  FIND_NODE = 'find_node', // to find the closest nodes to a given target id
  GET_PEERS = 'get_peers', // to get the peers who have announced to download a torrent
  ANNOUNCE_PEER = 'announce_peer' // to add yourself to the peer list for a torrent
}

export enum ErrorType {
  GENERIC = 201, // generic error
  SERVER = 202, // server error
  PROTOCOL = 203, // protocol error, such as malformed packet, invalid arguments, or bad token
  METHOD_UNKNOWN = 204 // method unknown
}

/**
 * Message factory for generating krpc request message
 */
export default class MessageFactory {
  static #encoder = new Bencoder()
  static #decoder = new Bdecoder()
  #message: Message

  private constructor(message: Message) {
    this.#message = message
  }

  /**
   * decode the message,if the message is invalid, return undefined
   * @param message
   */
  static async decode(data: Uint8Array): Promise<Message | undefined> {
    try {
      const message = (await MessageFactory.#decoder.d(data)) as Message

      // check is the message valid
      // message must have y(type) and t(transaction id)
      if (!message || !message.y || !message.t) return undefined

      return message
    } catch (e) {
      logger.error(`[Bencode] decode message error: ${e}`)
      return undefined
    }
  }

  /**
   * encode the message to bencode
   * @returns Unit8Array of bencode
   */
  async bencode() {
    return await MessageFactory.#encoder.e(this.#message)
  }

  /**
   * krpc message for request or response
   * @returns
   */
  message() {
    return this.#message
  }

  /**
   * create a ping query message
   * @param tid transactionId of the message, 2 bytes string
   * @param nodeId hex string of node id
   * @return MessageFactory
   */
  static requestPing(tid: string, nodeId: Id): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.PING,
      a: {
        id: nodeId.bits.bytes
      }
    })
  }

  /**
   * create a find_node query message
   * @param tid transactionId of the message, 2 bytes string
   * @param nodeId current node id, commonly the local node id, hex string
   * @param targetId which node id you want to find, hex string
   * @returns MessageFactory
   */
  static requestFindNode(tid: string, nodeId: Id, targetId: Id): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.FIND_NODE,
      a: {
        id: nodeId.bits.bytes,
        target: targetId.bits.bytes
      }
    })
  }

  /**
   * create a get_peers query message
   * @param tid transactionId of the message, 2 bytes string
   * @param nodeId hex string of node id
   * @param infoHash hex string of info hash, 20 bytes string
   * @returns MessageFactory
   */
  static requestGetPeers(tid: string, nodeId: Id, infoHash: Uint8Array): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.GET_PEERS,
      a: {
        id: nodeId.bits.bytes,
        info_hash: infoHash
      }
    })
  }

  /**
   * create a announce_peer query message
   * @param tid transactionId of the message, 2 bytes string
   * @param nodeId hex string of node id
   * @param infoHash hex string of info hash, 20 bytes string
   * @param port port of the peer
   * @returns MessageFactory
   */
  static requestAnnouncePeer(tid: string, nodeId: Id, infoHash: Uint8Array, port: number): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.ANNOUNCE_PEER,
      a: {
        id: nodeId.bits.bytes,
        implied_port: 0, // 0 or 1, 0 means port is the real port, 1 means port is the implied port
        info_hash: infoHash,
        port: port
      }
    })
  }

  static responsePing(tid: string): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.RESPONSE,
      r: {
        id: RoutingTable.get().localNode.id.bits.bytes // local node id
      }
    })
  }

  static responseFindNode(tid: string, nodes: Node[]): MessageFactory {
    // convert nodes to bytes witch compact node info
    // 20 bytes node id + 4 bytes ip + 2 bytes port
    const compactNodeList = nodes.map((node) => node.toCompact())

    return new MessageFactory({
      t: tid,
      y: MessageType.RESPONSE,
      r: {
        id: RoutingTable.get().localNode.id.bits.bytes, // local node id
        nodes: concat(...compactNodeList)
      }
    })
  }

  static responseGetPeers(tid: string, peers?: Peer[], nodes?: Node[], token?: string): MessageFactory {
    const hasPeers = peers && peers.length > 0
    const hasNodes = nodes && nodes.length > 0

    if (!hasPeers && !hasNodes) {
      throw new Error('must provide peers or nodes')
    }

    if (hasNodes) {
      // convert nodes to bytes witch compact node info
      // 20 bytes node id + 4 bytes ip + 2 bytes port
      const compcatNodeList = nodes?.map((node) => node.toCompact())

      return new MessageFactory({
        t: tid,
        y: MessageType.RESPONSE,
        r: {
          id: RoutingTable.get().localNode.id.bits.bytes, // local node id
          nodes: concat(...compcatNodeList)
        }
      })
    } else {
      return new MessageFactory({
        t: tid,
        y: MessageType.RESPONSE,
        r: {
          id: RoutingTable.get().localNode.id.bits.bytes, // local node id
          token: token,
          values: peers?.map((peer) => peer.toCompact())
        }
      })
    }
  }

  static responseAnnouncePeer(tid: string): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.RESPONSE,
      r: {
        id: RoutingTable.get().localNode.id.bits.bytes // local node id
      }
    })
  }

  static responseError(tid: string, errorCode: ErrorType, errorMessage?: string): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.ERROR,
      e: [errorCode.valueOf(), errorMessage ?? '']
    })
  }
}
