import { parse } from 'https://deno.land/x/dt_magnet@0.0.3/mod.ts'
import { BytesUtil } from 'toolkit'
import DHT from '~/src/dht.ts'
import InfoHashManager from '~/src/info_hash_manager.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'

const dht = await DHT.listen(63333)

setInterval(async () => {
  if (RoutingTable.get().nodeCount < 8) {
    await dht.pingBootstrapNodes()
    await dht.sendFindNodeRequest()
  }
}, 2000)

setInterval(async () => {
  const magnetLink = `magnet:?xt=urn:btih:TZRYKYVLDQP45WO66FBIMTG5LJYBTYNK&dn=ubuntu-22.04.2-live-server-amd64.iso&xl=1975971840&tr=https%3A%2F%2Ftorrent.ubuntu.com%2Fannounce`
  const parsed = parse(magnetLink)

  const infoHash = InfoHashManager.get().find(BytesUtil.bytes2HexStr(parsed!.hash))
  if (infoHash) {
    logger.info(`the peers of ${parsed?.hashString} has been found, have ${infoHash.length} peers`)
  } else {
    logger.info(`sendGetPeersRequest ${parsed?.hashString}`)
    await dht.sendGetPeersRequest(parsed!.hash)
  }
}, 20000)
