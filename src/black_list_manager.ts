export default class BlackListManager {
  #banIpList: Set<string> = new Set()

  isBaned(ip: string): boolean {
    return this.#banIpList.has(ip)
  }

  ban(ip: string) {
    this.#banIpList.add(ip)
  }
}
