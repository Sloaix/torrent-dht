import { QueryType } from '~/src/message_factory.ts'
import logger from '~/src/util/log.ts'

export type Request = {
  type: QueryType
  addr: string
  port: number
  infoHash?: Uint8Array // only for get_peers query and announce_peer query
}

/**
 * TranscationManager
 * @description handle krpc transcation
 */
export default class TranscationManager<T> {
  static #INSTANCE = new TranscationManager<Request>()
  #EXPIRED_TIME = 1000 * 60 * 60 * 24 // 5 minutes, the borrowed tid will be returned to pool after 5 minutes
  #CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  #ID_COUNT_MAX = this.#CHARS.length ^ 2 // max tid count
  #ID_COUNT_HALF = this.#ID_COUNT_MAX / 2 // half of max tid count
  #tidPool!: Set<string> // tid pool
  #expiredTime: number // expired time of a tid
  #transcations = new Map<
    string, // tid
    {
      expiredAt: number // expired time of the tid
      data?: T // attached data
    }
  >()

  /**
   * create a transcation manager
   * @param expredTime the expired time of a transcation
   */
  private constructor(expredTime?: number) {
    this.#expiredTime = expredTime || this.#EXPIRED_TIME
    this.initIdPool()
  }

  static get() {
    return TranscationManager.#INSTANCE
  }

  /**
   * create a new transcation
   * @returns tid of the transcation
   */
  create(data?: T) {
    const tid = this.borrowTid()
    const expiredAt = Date.now() + this.#expiredTime
    this.#transcations.set(tid, {
      expiredAt,
      data
    })
    return tid
  }

  /**
   * get data from a transcation
   * @param tid
   * @returns
   */
  getData(tid: string): T | undefined {
    if (!this.isValid(tid)) {
      logger.warn(`tid ${tid} is not valid, can not get data`)
      return
    }

    return this.#transcations.get(tid)?.data
  }

  /**
   * finish a transcation
   * @param tid
   */
  finish(tid: string) {
    if (!this.isValid(tid)) {
      logger.warn(`tid ${tid} is not valid, can not finish`)
      return
    }

    // delete transcation, and return tid to pool
    this.putbackTid(tid)
  }

  private initIdPool() {
    const collection = new Set<string>()
    for (let i = 0; i < this.#CHARS.length; i++) {
      for (let j = 0; j < this.#CHARS.length; j++) {
        const tid = this.#CHARS[i] + this.#CHARS[j]
        collection.add(tid)
      }
    }

    // shuffle the tid in pool
    const array = [...collection]
    for (let i = 0; i < array.length; i++) {
      const j = Math.floor(Math.random() * array.length)
      const temp = array[i]
      array[i] = array[j]
      array[j] = temp
    }

    this.#tidPool = new Set<string>(array)
  }

  private borrowTid(): string {
    // if broowed tid count is more than half of max tid count, clear expired tid
    // note: only expired tid will be returned to pool
    if (this.#transcations.size > this.#ID_COUNT_HALF) {
      this.clearExpiredTid()
    }

    // if borrowed tid count is more than max tid count, force return some tid
    if (this.#transcations.size >= this.#ID_COUNT_MAX) {
      this.forcePutback()
    }

    const tid = this.#tidPool.values().next().value
    this.#tidPool.delete(tid)
    return tid
  }

  /**
   * force put back half tid from borrowed to pool
   * the put back rule is the tid which is borrowed earliest will be returned
   */
  private forcePutback() {
    // return count is half of borrowed tid count
    const returnCount = this.#transcations.size / 2

    // sort borrowed tid by expired time
    const sortedTids = [...this.#transcations.entries()].sort((a, b) => a[1].expiredAt - b[1].expiredAt)

    // return the first returnCount tid to pool
    for (let i = 0; i < returnCount; i++) {
      const tid = sortedTids[i][0]
      this.putbackTid(tid)
    }
  }

  /**
   * put back a borrowed tid to pool
   * note that only borrowed tid can be put backed to pool
   * @param tid
   * @returns
   */
  private putbackTid(tid: string) {
    if (!this.#transcations.has(tid)) {
      logger.warn(`tid ${tid} is not borrowed, can not return`)
      return
    }
    this.#transcations.delete(tid)
    this.#tidPool.add(tid)
  }

  /**
   * clear expired tid in borrowed
   */
  private clearExpiredTid() {
    const expiredTids = [...this.#transcations.entries()].filter(([tid, _]) => this.isExpiredTid(tid))
    for (const [tid, _] of expiredTids) {
      this.putbackTid(tid)
    }
  }

  /**
   * check if a tid is expired
   * @param tid
   * @returns
   */
  private isExpiredTid(tid: string): boolean {
    // if is not a borrowed tid, return false
    if (!this.#transcations.has(tid)) return false
    return this.#transcations.get(tid)?.expiredAt! < Date.now()
  }

  /**
   * check if a transaction is valid
   * @param tid
   * @returns true if the tid is valid
   */
  isValid(tid: string): boolean {
    return this.#transcations.has(tid) && !this.isExpiredTid(tid)
  }
}
