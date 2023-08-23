import Peer from '~/src/peer.ts'
import logger from '~/src/util/log.ts'

export default class InfoHashManager {
  static #INSTANCE = new InfoHashManager()
  #infoHashes: Map<string, Set<Peer>> = new Map()
  #tokenMap: Map<string, string> = new Map()
  #MAX_PEER_NUM_EACH_INFO_HASH = 100 // the max number of peers of a infoHash
  #MAX_INFO_HASH_NUM = 1024 * 1024 // the max number of infoHashes
  private constructor() {}

  static get() {
    return this.#INSTANCE
  }

  /**
   * get all peers of the infoHash
   * @param infoHash hex string
   * @returns
   */
  find(infoHash: string) {
    if (!this.#infoHashes.has(infoHash)) {
      logger.error(`the infoHash ${infoHash} does not exist`)
      return undefined
    }

    return Array.from(this.#infoHashes.get(infoHash)!)
  }

  findToken(infoHash: string) {
    return this.#tokenMap.get(infoHash)
  }

  addList(infoHash: string, peers: Peer[], token: string) {
    for (const peer of peers) {
      this.add(infoHash, peer, token)
    }
  }

  /**
   * add a peer to the infoHash
   * @param infoHash hex string
   * @param peer Peer
   */
  add(infoHash: string, peer: Peer, token: string) {
    if (this.#infoHashes.size >= this.#MAX_INFO_HASH_NUM) {
      logger.error(
        `the number of infoHashes exceeds the limit ${this.#MAX_INFO_HASH_NUM}, ignore ${infoHash}:${peer.addr}:${
          peer.port
        }`
      )
      return
    }

    const prevToken = this.#tokenMap.get(infoHash)

    // check token
    if (prevToken && prevToken !== token) {
      logger.error(
        `the token of ${infoHash} [${token}] is not equal to [${prevToken}], ignore ${peer.addr}:${peer.port}`
      )
      return
    }

    let peers = this.#infoHashes.get(infoHash)

    // check the number of peers
    if (peers && peers.size >= this.#MAX_PEER_NUM_EACH_INFO_HASH) {
      logger.error(
        `the number of peers of ${infoHash} exceeds the limit ${this.#MAX_PEER_NUM_EACH_INFO_HASH}, ignore ${
          peer.addr
        }:${peer.port}`
      )
      return
    }

    // create a new set if the infoHash does not exist
    if (!peers) {
      peers = new Set()
      this.#infoHashes.set(infoHash, peers)
    }

    // set token
    if (!prevToken) {
      this.#tokenMap.set(infoHash, token)
    }

    peers.add(peer)

    logger.info(`current number of infoHashes: ${this.#infoHashes.size}`)
  }

  /**
   * delete all peers of the infoHash
   * @param infoHash hex string
   */
  remove(infoHash: string) {
    if (!this.#infoHashes.has(infoHash)) {
      logger.warn(`the infoHash ${infoHash} does not exist, delete failed`)
      return
    }
    this.#infoHashes.delete(infoHash)
    this.#tokenMap.delete(infoHash)
  }
}
